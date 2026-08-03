"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { isValidEmailFormat, normalizeEmail } from "@/app/lib/auth/email";
import {
  hashPassword,
  isPasswordValid,
  validatePassword,
  verifyPassword,
} from "@/app/lib/auth/password";
import {
  issueEmailOtp,
  OtpPurpose,
  verifyEmailOtp,
} from "@/app/lib/auth/otp";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { resolvePostSignInPath } from "@/app/lib/auth/redirects";
import { getRequestIpKey } from "@/app/lib/auth/requestMeta";
import {
  consumeResetAuthorization,
  getResetAuthorizationUser,
  issueResetAuthorization,
} from "@/app/lib/auth/resetAuth";
import { getSessionUser } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import { softDeleteCustomerAccount } from "@/app/lib/auth/accountDeletion";
import {
  isSignupConsentAccepted,
  LEGAL_CONSENT_ERROR,
  signupConsentRecord,
} from "@/app/lib/auth/signupConsent";
import { sendOtpEmail } from "@/app/lib/email/sendOtpEmail";
import {
  sendAccountDeletedEmail,
  sendPasswordChangedEmail,
} from "@/app/lib/email/sendSecurityNoticeEmail";

const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(80),
    email: z.string().email("Enter a valid email"),
    password: z.string(),
    confirmPassword: z.string(),
    termsAccepted: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.termsAccepted) {
      ctx.addIssue({
        code: "custom",
        path: ["terms"],
        message: LEGAL_CONSENT_ERROR,
      });
    }
    if (!isPasswordValid(data.password, data.email)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Please meet all password requirements.",
      });
    }
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

export type AuthActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

async function rateLimitPair(
  emailKey: string,
  ipKey: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const emailLimit = consumeRateLimit({ key: emailKey, limit, windowMs });
  const ipLimit = consumeRateLimit({ key: ipKey, limit: limit * 3, windowMs });
  return emailLimit.ok && ipLimit.ok;
}

export async function signupAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const ip = await getRequestIpKey();
  const emailHint = String(formData.get("email") || "").toLowerCase();
  const allowed = await rateLimitPair(
    `signup:${emailHint}`,
    `signup-ip:${ip}`,
    5,
    60 * 60 * 1000
  );
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const consentAccepted = isSignupConsentAccepted(formData.get("terms"));
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    termsAccepted: consentAccepted,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] || "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    const consentError = fieldErrors.terms;
    return {
      ok: false,
      fieldErrors,
      error: consentError || "Please fix the highlighted fields.",
    };
  }

  // Consent must be valid before any User create or OTP issue.
  if (!consentAccepted) {
    return {
      ok: false,
      fieldErrors: { terms: LEGAL_CONSENT_ERROR },
      error: LEGAL_CONSENT_ERROR,
    };
  }

  const email = normalizeEmail(parsed.data.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "Unable to create an account with that email." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const consent = signupConsentRecord();
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name.trim(),
      email,
      passwordHash,
      role: "CUSTOMER",
      emailVerifiedAt: null,
      ...consent,
    },
    select: {
      id: true,
      email: true,
      termsAcceptedAt: true,
      termsVersion: true,
      privacyAcknowledgedAt: true,
      privacyVersion: true,
      legalConsentSource: true,
    },
  });

  const issued = await issueEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    force: true,
  });

  if (issued.ok) {
    await sendOtpEmail({
      kind: "signup",
      to: user.email,
      code: issued.code,
    });
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "user.signup",
    targetType: "User",
    targetId: user.id,
    metadata: {
      email: user.email,
      verification: "otp_pending",
      consentSource: user.legalConsentSource,
      termsVersion: user.termsVersion,
      privacyVersion: user.privacyVersion,
    },
  });

  redirect(`/verify-email?email=${encodeURIComponent(user.email)}`);
}

export async function signinAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const emailRaw = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const remember = formData.get("remember") === "on";
  const rawCallbackUrl = String(formData.get("callbackUrl") || "");
  const ip = await getRequestIpKey();

  if (!isValidEmailFormat(emailRaw) || !password) {
    return { ok: false, error: "Invalid email or password." };
  }

  const email = normalizeEmail(emailRaw);
  const allowed = await rateLimitPair(
    `signin-action:${email}`,
    `signin-ip:${ip}`,
    10,
    15 * 60 * 1000
  );
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      passwordHash: true,
      emailVerifiedAt: true,
      deletedAt: true,
    },
  });

  if (!user?.passwordHash || user.deletedAt) {
    return { ok: false, error: "Invalid email or password." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { ok: false, error: "Invalid email or password." };
  }

  if (!user.emailVerifiedAt) {
    redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  const role = user.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
  const redirectTo = resolvePostSignInPath(role, rawCallbackUrl);

  try {
    await signIn("credentials", {
      email,
      password,
      remember: remember ? "1" : "0",
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "Invalid email or password." };
    }
    throw error;
  }

  return { ok: true };
}

export async function verifyEmailOtpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const code = String(formData.get("otp") || "").trim();
  const ip = await getRequestIpKey();

  const allowed = await rateLimitPair(
    `verify-email:${email}`,
    `verify-email-ip:${ip}`,
    20,
    60 * 60 * 1000
  );
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  if (!isValidEmailFormat(email)) {
    return { ok: false, error: "Enter a valid email and verification code." };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });

  if (!user) {
    return { ok: false, error: "Invalid or expired verification code." };
  }

  if (user.emailVerifiedAt) {
    redirect("/signin?verified=1");
  }

  const verified = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    code,
  });

  if (!verified.ok) {
    if (verified.reason === "locked") {
      return {
        ok: false,
        error: "Too many incorrect codes. Request a new code and try again.",
      };
    }
    if (verified.reason === "expired") {
      return {
        ok: false,
        error: "This code has expired. Request a new code and try again.",
      };
    }
    return { ok: false, error: "Invalid or expired verification code." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "user.email_verified",
    targetType: "User",
    targetId: user.id,
  });

  redirect("/signin?verified=1");
}

export async function resendSignupOtpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const ip = await getRequestIpKey();

  const allowed = await rateLimitPair(
    `resend-signup:${email}`,
    `resend-signup-ip:${ip}`,
    8,
    60 * 60 * 1000
  );
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const genericOk = {
    ok: true,
    error: "If an account needs verification, a new code has been sent.",
  } as const;

  if (!isValidEmailFormat(email)) {
    return { ...genericOk };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, emailVerifiedAt: true },
  });

  if (!user || user.emailVerifiedAt) {
    return { ...genericOk };
  }

  const issued = await issueEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
  });

  if (!issued.ok) {
    return {
      ok: false,
      error: `Please wait ${issued.retryAfterSec} seconds before requesting another code.`,
    };
  }

  await sendOtpEmail({
    kind: "signup",
    to: user.email,
    code: issued.code,
  });

  return {
    ok: true,
    error: "If an account needs verification, a new code has been sent.",
  };
}

export async function forgotPasswordAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const emailRaw = String(formData.get("email") || "");
  const email = normalizeEmail(emailRaw);
  const ip = await getRequestIpKey();

  const allowed = await rateLimitPair(
    `forgot:${email || "unknown"}`,
    `forgot-ip:${ip}`,
    5,
    60 * 60 * 1000
  );
  if (!allowed) {
    redirect(
      `/verify-reset-code?email=${encodeURIComponent(email || emailRaw)}`
    );
  }

  if (isValidEmailFormat(email)) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, deletedAt: true },
    });

    // Deleted accounts must not receive password-reset OTPs.
    if (user && !user.deletedAt) {
      const issued = await issueEmailOtp({
        userId: user.id,
        purpose: OtpPurpose.PASSWORD_RESET,
        force: true,
      });

      if (issued.ok) {
        await sendOtpEmail({
          kind: "password_reset",
          to: user.email,
          code: issued.code,
        });
      }

      await writeAuditLog({
        actorUserId: user.id,
        action: "user.password_reset_requested",
        targetType: "User",
        targetId: user.id,
        metadata: { channel: "otp" },
      });
    }
  }

  // Always the same next step (no enumeration via divergent UX).
  redirect(`/verify-reset-code?email=${encodeURIComponent(email || emailRaw)}`);
}

export async function verifyResetOtpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const code = String(formData.get("otp") || "").trim();
  const ip = await getRequestIpKey();

  const allowed = await rateLimitPair(
    `verify-reset:${email}`,
    `verify-reset-ip:${ip}`,
    20,
    60 * 60 * 1000
  );
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  if (!isValidEmailFormat(email)) {
    return { ok: false, error: "Invalid or expired verification code." };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, deletedAt: true },
  });

  if (!user || user.deletedAt) {
    return { ok: false, error: "Invalid or expired verification code." };
  }

  const verified = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.PASSWORD_RESET,
    code,
  });

  if (!verified.ok) {
    if (verified.reason === "locked") {
      return {
        ok: false,
        error: "Too many incorrect codes. Request a new code and try again.",
      };
    }
    if (verified.reason === "expired") {
      return {
        ok: false,
        error: "This code has expired. Request a new code and try again.",
      };
    }
    return { ok: false, error: "Invalid or expired verification code." };
  }

  await issueResetAuthorization(user.id);
  redirect("/reset-password");
}

export async function resendResetOtpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const ip = await getRequestIpKey();

  const allowed = await rateLimitPair(
    `resend-reset:${email}`,
    `resend-reset-ip:${ip}`,
    8,
    60 * 60 * 1000
  );
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const genericOk = {
    ok: true,
    error:
      "If an account exists for this email, a verification code has been sent.",
  } as const;

  if (!isValidEmailFormat(email)) {
    return { ...genericOk };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, deletedAt: true },
  });

  if (!user || user.deletedAt) {
    return { ...genericOk };
  }

  const issued = await issueEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.PASSWORD_RESET,
  });

  if (!issued.ok) {
    return {
      ok: false,
      error: `Please wait ${issued.retryAfterSec} seconds before requesting another code.`,
    };
  }

  await sendOtpEmail({
    kind: "password_reset",
    to: user.email,
    code: issued.code,
  });

  return { ...genericOk };
}

export async function resetPasswordAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const ip = await getRequestIpKey();

  const allowed = await rateLimitPair(
    `reset-password:${ip}`,
    `reset-password-ip:${ip}`,
    8,
    60 * 60 * 1000
  );
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const authUser = await getResetAuthorizationUser();
  if (!authUser) {
    return {
      ok: false,
      error:
        "Your reset session has expired. Request a new verification code.",
    };
  }

  const policy = validatePassword(password, authUser.email);
  if (!policy.ok) {
    return {
      ok: false,
      fieldErrors: { password: policy.message },
      error: policy.message,
    };
  }
  if (password !== confirmPassword) {
    return {
      ok: false,
      fieldErrors: { confirmPassword: "Passwords do not match." },
      error: "Passwords do not match.",
    };
  }

  const consumed = await consumeResetAuthorization();
  if (!consumed.ok) {
    return {
      ok: false,
      error:
        "Your reset session has expired. Request a new verification code.",
    };
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  const user = await prisma.user.update({
    where: { id: consumed.userId },
    data: {
      passwordHash,
      credentialsChangedAt: now,
    },
    select: { id: true, role: true, email: true },
  });

  // Clear Auth.js adapter sessions if any exist.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  await writeAuditLog({
    actorUserId: user.id,
    action:
      user.role === "ADMIN"
        ? "admin.password_reset_completed"
        : "user.password_reset_completed",
    targetType: "User",
    targetId: user.id,
    metadata: { method: "otp" },
  });

  // Best-effort security notice — never blocks password reset.
  await sendPasswordChangedEmail(user.email);

  redirect("/signin?reset=1");
}

export async function changePasswordAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const currentPassword = String(formData.get("currentPassword") || "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const ip = await getRequestIpKey();

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { ok: false, error: "Please sign in again." };
  }

  const allowed = await rateLimitPair(
    `change-password:${sessionUser.id}`,
    `change-password-ip:${ip}`,
    8,
    60 * 60 * 1000
  );
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, email: true, passwordHash: true, role: true },
  });
  if (!dbUser?.passwordHash) {
    return { ok: false, error: "Unable to update password." };
  }

  const currentOk = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!currentOk) {
    return {
      ok: false,
      fieldErrors: { currentPassword: "Current password is incorrect." },
      error: "Current password is incorrect.",
    };
  }

  const policy = validatePassword(password, dbUser.email);
  if (!policy.ok) {
    return {
      ok: false,
      fieldErrors: { password: policy.message },
      error: policy.message,
    };
  }
  if (password !== confirmPassword) {
    return {
      ok: false,
      fieldErrors: { confirmPassword: "Passwords do not match." },
      error: "Passwords do not match.",
    };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: dbUser.id },
    data: {
      passwordHash,
      credentialsChangedAt: new Date(),
    },
  });
  await prisma.session.deleteMany({ where: { userId: dbUser.id } });

  await writeAuditLog({
    actorUserId: dbUser.id,
    action: "user.password_changed",
    targetType: "User",
    targetId: dbUser.id,
  });
  await sendPasswordChangedEmail(dbUser.email);

  return { ok: true, error: "Password updated successfully." };
}

export async function requestAccountDeletionOtpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const currentPassword = String(formData.get("currentPassword") || "");
  const ip = await getRequestIpKey();

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { ok: false, error: "Please sign in again." };
  }
  if (sessionUser.role !== "CUSTOMER") {
    return {
      ok: false,
      error: "Admin accounts cannot use customer account deletion.",
    };
  }

  const allowed = await rateLimitPair(
    `delete-otp:${sessionUser.id}`,
    `delete-otp-ip:${ip}`,
    5,
    60 * 60 * 1000
  );
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      emailVerifiedAt: true,
      deletedAt: true,
    },
  });

  if (!dbUser || dbUser.deletedAt || dbUser.id !== sessionUser.id) {
    return { ok: false, error: "Unable to continue account deletion." };
  }
  if (dbUser.role !== "CUSTOMER") {
    return {
      ok: false,
      error: "Admin accounts cannot use customer account deletion.",
    };
  }
  if (!dbUser.emailVerifiedAt) {
    return {
      ok: false,
      error: "Verify your email before deleting your account.",
    };
  }
  if (!currentPassword) {
    return {
      ok: false,
      fieldErrors: { currentPassword: "Enter your current password." },
      error: "Enter your current password.",
    };
  }

  const passwordOk = await verifyPassword(
    currentPassword,
    dbUser.passwordHash
  );
  if (!passwordOk) {
    return {
      ok: false,
      fieldErrors: { currentPassword: "Current password is incorrect." },
      error: "Current password is incorrect.",
    };
  }

  const issued = await issueEmailOtp({
    userId: dbUser.id,
    purpose: OtpPurpose.ACCOUNT_DELETION,
  });

  if (!issued.ok) {
    if (issued.reason === "cooldown") {
      return {
        ok: false,
        error: `Please wait ${issued.retryAfterSec}s before requesting another code.`,
      };
    }
    return { ok: false, error: "Unable to send verification code right now." };
  }

  const sent = await sendOtpEmail({
    kind: "account_deletion",
    to: dbUser.email,
    code: issued.code,
  });

  if (!sent.ok) {
    return {
      ok: false,
      error: "Unable to send verification code right now. Try again shortly.",
    };
  }

  await writeAuditLog({
    actorUserId: dbUser.id,
    action: "user.account_deletion_otp_requested",
    targetType: "User",
    targetId: dbUser.id,
    metadata: { channel: "otp" },
  });

  return {
    ok: true,
    error: "A verification code has been sent to your email.",
  };
}

export async function deleteAccountAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const currentPassword = String(formData.get("currentPassword") || "");
  const otp = String(formData.get("otp") || "").trim();
  const confirmation = String(formData.get("confirmation") || "").trim();
  const acknowledged = formData.get("acknowledge") === "on";
  const ip = await getRequestIpKey();

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { ok: false, error: "Please sign in again." };
  }
  if (sessionUser.role !== "CUSTOMER") {
    return {
      ok: false,
      error: "Admin accounts cannot use customer account deletion.",
    };
  }

  const allowed = await rateLimitPair(
    `delete-account:${sessionUser.id}`,
    `delete-account-ip:${ip}`,
    8,
    60 * 60 * 1000
  );
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  if (!acknowledged) {
    return {
      ok: false,
      error: "Confirm that you understand this action cannot be undone.",
    };
  }
  if (confirmation !== "DELETE") {
    return {
      ok: false,
      fieldErrors: { confirmation: "Type DELETE to confirm." },
      error: "Type DELETE exactly to confirm account deletion.",
    };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      emailVerifiedAt: true,
      deletedAt: true,
    },
  });

  if (!dbUser || dbUser.deletedAt || dbUser.id !== sessionUser.id) {
    return { ok: false, error: "Unable to delete this account." };
  }
  if (dbUser.role !== "CUSTOMER") {
    return {
      ok: false,
      error: "Admin accounts cannot use customer account deletion.",
    };
  }
  if (!dbUser.emailVerifiedAt) {
    return {
      ok: false,
      error: "Verify your email before deleting your account.",
    };
  }

  const passwordOk = await verifyPassword(
    currentPassword,
    dbUser.passwordHash
  );
  if (!passwordOk) {
    return {
      ok: false,
      fieldErrors: { currentPassword: "Current password is incorrect." },
      error: "Current password is incorrect.",
    };
  }

  const otpResult = await verifyEmailOtp({
    userId: dbUser.id,
    purpose: OtpPurpose.ACCOUNT_DELETION,
    code: otp,
  });
  if (!otpResult.ok) {
    const message =
      otpResult.reason === "expired"
        ? "Verification code expired. Request a new code."
        : otpResult.reason === "used"
          ? "Verification code already used. Request a new code."
          : otpResult.reason === "locked"
            ? "Too many incorrect codes. Request a new code."
            : otpResult.reason === "format"
              ? "Enter the 6-digit verification code."
              : "Invalid verification code.";
    return {
      ok: false,
      fieldErrors: { otp: message },
      error: message,
    };
  }

  // Capture deliverable address before anonymization — never log it.
  const notifyEmail = dbUser.email;

  const deleted = await softDeleteCustomerAccount({ userId: dbUser.id });
  if (!deleted.ok) {
    return { ok: false, error: "Unable to delete this account." };
  }

  await writeAuditLog({
    actorUserId: dbUser.id,
    action: "user.account_deleted",
    targetType: "User",
    targetId: dbUser.id,
    metadata: { method: "self_service", role: "CUSTOMER" },
  });

  // Best-effort notice to the original verified inbox.
  await sendAccountDeletedEmail(notifyEmail);

  await signOut({ redirectTo: "/signin?deleted=1" });
  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
