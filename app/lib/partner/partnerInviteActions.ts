"use server";

import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import type { AuthActionState } from "@/app/lib/auth/actions";
import { hashPassword, validatePassword } from "@/app/lib/auth/password";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { getRequestIpKey } from "@/app/lib/auth/requestMeta";
import { prisma } from "@/app/lib/db";
import { sendPasswordChangedEmail } from "@/app/lib/email/sendSecurityNoticeEmail";
import {
  PARTNER_INVITE_INVALID_MESSAGE,
  clearPartnerInviteSetupCookie,
  getPartnerInviteSetupUser,
} from "@/app/lib/partner/partnerInvite";
import { PARTNER_PASSWORD_SETUP_COMPLETED_AUDIT } from "@/app/lib/partner/partners";

export async function completePartnerPasswordSetupAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const ip = await getRequestIpKey();

  const emailLimit = consumeRateLimit({
    key: `partner-setup-password:${ip}`,
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  const ipLimit = consumeRateLimit({
    key: `partner-setup-password-ip:${ip}`,
    limit: 24,
    windowMs: 60 * 60 * 1000,
  });
  if (!emailLimit.ok || !ipLimit.ok) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const setupUser = await getPartnerInviteSetupUser();
  if (!setupUser) {
    return { ok: false, error: PARTNER_INVITE_INVALID_MESSAGE };
  }

  if (password !== confirmPassword) {
    return {
      ok: false,
      error: "Passwords do not match.",
      fieldErrors: { confirmPassword: "Passwords do not match." },
    };
  }

  const policy = validatePassword(password, setupUser.email);
  if (!policy.ok) {
    return {
      ok: false,
      error: policy.message,
      fieldErrors: { password: policy.message },
    };
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: setupUser.userId },
        select: {
          id: true,
          email: true,
          role: true,
          passwordHash: true,
          deletedAt: true,
          partnerProfile: { select: { id: true, disabledAt: true } },
        },
      });

      if (
        !dbUser ||
        dbUser.role !== Role.PARTNER ||
        dbUser.deletedAt ||
        dbUser.passwordHash ||
        !dbUser.partnerProfile ||
        dbUser.partnerProfile.disabledAt
      ) {
        throw new Error("partner_invite_ineligible");
      }

      const setup = await tx.partnerInviteSetupToken.updateMany({
        where: {
          id: setupUser.setupTokenId,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (setup.count !== 1) {
        throw new Error("partner_invite_setup_consume_miss");
      }

      // Invite was already consumed at URL exchange; supersede leftover sessions only.
      await tx.partnerInviteSetupToken.updateMany({
        where: { userId: dbUser.id, consumedAt: null },
        data: { consumedAt: now },
      });

      await tx.user.update({
        where: { id: dbUser.id },
        data: {
          passwordHash,
          credentialsChangedAt: now,
        },
      });

      await tx.session.deleteMany({ where: { userId: dbUser.id } });

      await tx.auditLog.create({
        data: {
          actorUserId: dbUser.id,
          action: PARTNER_PASSWORD_SETUP_COMPLETED_AUDIT,
          targetType: "User",
          targetId: dbUser.id,
          metadata: {
            method: "invite_setup_link",
            partnerId: dbUser.partnerProfile.id,
          },
        },
      });
    });
  } catch {
    await clearPartnerInviteSetupCookie();
    return { ok: false, error: PARTNER_INVITE_INVALID_MESSAGE };
  }

  await clearPartnerInviteSetupCookie();

  const email = setupUser.email;
  await sendPasswordChangedEmail(email);

  redirect("/signin?partnerSetup=1");
}
