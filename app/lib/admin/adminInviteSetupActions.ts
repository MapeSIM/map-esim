"use server";

import { redirect } from "next/navigation";
import type { AuthActionState } from "@/app/lib/auth/actions";
import { hashPassword, validateAdminPassword } from "@/app/lib/auth/password";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { getRequestIpKey } from "@/app/lib/auth/requestMeta";
import { sendPasswordChangedEmail } from "@/app/lib/email/sendSecurityNoticeEmail";
import {
  ADMIN_INVITE_INVALID_MESSAGE,
  completeAdminInvitePasswordSetupInDb,
  peekAdminInviteSetupToken,
} from "@/app/lib/admin/adminInviteSetup";

export async function completeAdminPasswordSetupAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const rawToken = String(formData.get("token") || "");
  const ip = await getRequestIpKey();

  const emailLimit = consumeRateLimit({
    key: `admin-setup-password:${ip}`,
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  const ipLimit = consumeRateLimit({
    key: `admin-setup-password-ip:${ip}`,
    limit: 24,
    windowMs: 60 * 60 * 1000,
  });
  if (!emailLimit.ok || !ipLimit.ok) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const peeked = await peekAdminInviteSetupToken(rawToken);
  if (!peeked.ok) {
    return { ok: false, error: ADMIN_INVITE_INVALID_MESSAGE };
  }

  if (password !== confirmPassword) {
    return {
      ok: false,
      error: "Passwords do not match.",
      fieldErrors: { confirmPassword: "Passwords do not match." },
    };
  }

  const policy = validateAdminPassword(password, peeked.email);
  if (!policy.ok) {
    return {
      ok: false,
      error: policy.message,
      fieldErrors: { password: policy.message },
    };
  }

  const passwordHash = await hashPassword(password);
  const completed = await completeAdminInvitePasswordSetupInDb({
    rawToken,
    passwordHash,
  });
  if (!completed.ok) {
    return { ok: false, error: ADMIN_INVITE_INVALID_MESSAGE };
  }

  await sendPasswordChangedEmail(completed.email);

  redirect("/signin?reset=1");
}
