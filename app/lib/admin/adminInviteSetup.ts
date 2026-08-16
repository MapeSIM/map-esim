import { randomBytes, timingSafeEqual } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  ADMIN_INVITE_INVALID_MESSAGE,
  ADMIN_PASSWORD_SETUP_COMPLETED_AUDIT,
  adminInviteSetupExpiresAt,
  hashAdminInviteSetupToken,
  isAdminInviteSetupLive,
} from "@/app/lib/admin/adminInviteSetupShared";

export {
  ADMIN_INVITE_INVALID_MESSAGE,
  ADMIN_INVITE_SETUP_TTL_MS,
  ADMIN_PASSWORD_SETUP_COMPLETED_AUDIT,
  adminInviteSetupExpiresAt,
  hashAdminInviteSetupToken,
  isAdminInviteSetupLive,
} from "@/app/lib/admin/adminInviteSetupShared";

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function mintRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function buildAdminInviteSetupUrl(rawToken: string): string {
  const base =
    process.env.APP_BASE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://localhost:3000";
  const origin = base.replace(/\/$/, "");
  const url = new URL("/admin-setup-password", origin);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

/**
 * Atomically invalidate unused Admin setup tokens and mint a new hashed token.
 * Returns raw token for email only — never log or audit it.
 */
export async function mintAdminInviteSetupToken(
  userId: string,
  now = new Date()
): Promise<{
  rawToken: string;
  tokenId: string;
  expiresAt: Date;
}> {
  const rawToken = mintRawToken();
  const tokenHash = hashAdminInviteSetupToken(rawToken);
  const expiresAt = adminInviteSetupExpiresAt(now);

  const created = await prisma.$transaction(async (tx) => {
    await tx.adminInviteSetupToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
    return tx.adminInviteSetupToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
      select: { id: true },
    });
  });

  return { rawToken, tokenId: created.id, expiresAt };
}

export type AdminInviteSetupPeek =
  | { ok: true; userId: string; email: string; tokenId: string }
  | { ok: false; error: string };

/**
 * Validate a setup link without consuming it. Same generic error for all failures.
 */
export async function peekAdminInviteSetupToken(
  rawToken: string,
  now = new Date()
): Promise<AdminInviteSetupPeek> {
  const trimmed = rawToken.trim();
  if (!trimmed || trimmed.length > 128) {
    return { ok: false, error: ADMIN_INVITE_INVALID_MESSAGE };
  }

  const tokenHash = hashAdminInviteSetupToken(trimmed);
  const record = await prisma.adminInviteSetupToken.findFirst({
    where: {
      tokenHash,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      tokenHash: true,
      expiresAt: true,
      consumedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          passwordHash: true,
          deletedAt: true,
          adminDisabledAt: true,
          emailVerifiedAt: true,
        },
      },
    },
  });

  if (!record || !safeEqualHex(record.tokenHash, tokenHash)) {
    return { ok: false, error: ADMIN_INVITE_INVALID_MESSAGE };
  }
  if (
    !isAdminInviteSetupLive({
      expiresAt: record.expiresAt,
      consumedAt: record.consumedAt,
      now,
    })
  ) {
    return { ok: false, error: ADMIN_INVITE_INVALID_MESSAGE };
  }

  const user = record.user;
  if (
    user.role !== Role.ADMIN ||
    user.deletedAt ||
    user.adminDisabledAt ||
    user.passwordHash
  ) {
    return { ok: false, error: ADMIN_INVITE_INVALID_MESSAGE };
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email,
    tokenId: record.id,
  };
}

/**
 * Consume a valid unused setup token and set the Admin password in one transaction.
 * Same generic failure for invalid, expired, reused, or ineligible accounts.
 */
export async function completeAdminInvitePasswordSetupInDb(options: {
  rawToken: string;
  passwordHash: string;
  now?: Date;
}): Promise<{ ok: true; userId: string; email: string } | { ok: false }> {
  const now = options.now ?? new Date();
  const peeked = await peekAdminInviteSetupToken(options.rawToken, now);
  if (!peeked.ok) return { ok: false };

  const tokenHash = hashAdminInviteSetupToken(options.rawToken.trim());

  try {
    await prisma.$transaction(async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: peeked.userId },
        select: {
          id: true,
          role: true,
          passwordHash: true,
          deletedAt: true,
          adminDisabledAt: true,
        },
      });

      if (
        !dbUser ||
        dbUser.role !== Role.ADMIN ||
        dbUser.deletedAt ||
        dbUser.adminDisabledAt ||
        dbUser.passwordHash
      ) {
        throw new Error("admin_invite_ineligible");
      }

      const consumed = await tx.adminInviteSetupToken.updateMany({
        where: {
          id: peeked.tokenId,
          tokenHash,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new Error("admin_invite_setup_consume_miss");
      }

      await tx.adminInviteSetupToken.updateMany({
        where: { userId: dbUser.id, consumedAt: null },
        data: { consumedAt: now },
      });

      await tx.user.update({
        where: { id: dbUser.id },
        data: {
          passwordHash: options.passwordHash,
          credentialsChangedAt: now,
        },
      });

      await tx.session.deleteMany({ where: { userId: dbUser.id } });

      await tx.auditLog.create({
        data: {
          actorUserId: dbUser.id,
          action: ADMIN_PASSWORD_SETUP_COMPLETED_AUDIT,
          targetType: "user",
          targetId: dbUser.id,
          metadata: {
            method: "invite_setup_link",
          },
        },
      });
    });
  } catch {
    return { ok: false };
  }

  return { ok: true, userId: peeked.userId, email: peeked.email };
}
