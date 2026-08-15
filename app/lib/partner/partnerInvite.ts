import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/db";
import { Role } from "@prisma/client";

/** Email invite link lifetime. */
export const PARTNER_INVITE_TTL_MS = 30 * 60 * 1000;
/** HttpOnly setup-session cookie lifetime after URL exchange. */
export const PARTNER_INVITE_SETUP_TTL_MS = 15 * 60 * 1000;

export const PARTNER_INVITE_SETUP_COOKIE = "mapesim_partner_invite_setup";

export const PARTNER_INVITE_INVALID_MESSAGE =
  "This setup link is invalid or has expired.";

function hashOpaqueToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

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

export function buildPartnerInviteSetupUrl(rawToken: string): string {
  const base =
    process.env.APP_BASE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://localhost:3000";
  const origin = base.replace(/\/$/, "");
  const url = new URL("/partner/setup-password", origin);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

/**
 * Atomically invalidate unused invite + setup tokens, mint a new invite.
 * Returns raw token for email only — never log or audit it.
 */
export async function mintPartnerInviteToken(userId: string): Promise<{
  rawToken: string;
  inviteId: string;
  expiresAt: Date;
}> {
  const now = new Date();
  const rawToken = mintRawToken();
  const tokenHash = hashOpaqueToken(rawToken);
  const expiresAt = new Date(now.getTime() + PARTNER_INVITE_TTL_MS);

  const invite = await prisma.$transaction(async (tx) => {
    await tx.partnerInviteSetupToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.partnerInviteToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
    return tx.partnerInviteToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
      select: { id: true },
    });
  });

  return { rawToken, inviteId: invite.id, expiresAt };
}

async function loadEligibleInviteUser(userId: string): Promise<{
  id: string;
  email: string;
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      deletedAt: true,
      partnerProfile: { select: { disabledAt: true } },
    },
  });

  if (!user) return null;
  if (user.role !== Role.PARTNER) return null;
  if (user.deletedAt) return null;
  if (user.passwordHash) return null;
  if (!user.partnerProfile) return null;
  if (user.partnerProfile.disabledAt) return null;
  return { id: user.id, email: user.email };
}

/**
 * DB-only invite URL exchange (testable without Next cookies).
 * Consumes PartnerInviteToken and creates exactly one PartnerInviteSetupToken.
 */
export async function exchangePartnerInviteTokenInDb(rawToken: string): Promise<
  | { ok: true; setupRaw: string; userId: string; inviteId: string; setupTokenId: string }
  | { ok: false; error: string }
> {
  const trimmed = rawToken.trim();
  if (!trimmed || trimmed.length > 128) {
    return { ok: false, error: PARTNER_INVITE_INVALID_MESSAGE };
  }

  const tokenHash = hashOpaqueToken(trimmed);
  const now = new Date();
  const setupRaw = mintRawToken();
  const setupHash = hashOpaqueToken(setupRaw);
  const setupExpires = new Date(now.getTime() + PARTNER_INVITE_SETUP_TTL_MS);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invite = await tx.partnerInviteToken.findFirst({
        where: {
          tokenHash,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true, userId: true, tokenHash: true },
      });

      if (!invite || !safeEqualHex(invite.tokenHash, tokenHash)) {
        throw new Error("partner_invite_exchange_invalid");
      }

      const user = await tx.user.findUnique({
        where: { id: invite.userId },
        select: {
          id: true,
          role: true,
          passwordHash: true,
          deletedAt: true,
          partnerProfile: { select: { disabledAt: true } },
        },
      });

      if (
        !user ||
        user.role !== Role.PARTNER ||
        user.deletedAt ||
        user.passwordHash ||
        !user.partnerProfile ||
        user.partnerProfile.disabledAt
      ) {
        throw new Error("partner_invite_exchange_ineligible");
      }

      const consumed = await tx.partnerInviteToken.updateMany({
        where: {
          id: invite.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new Error("partner_invite_exchange_race");
      }

      await tx.partnerInviteSetupToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });

      const setup = await tx.partnerInviteSetupToken.create({
        data: {
          userId: user.id,
          inviteId: invite.id,
          tokenHash: setupHash,
          expiresAt: setupExpires,
        },
        select: { id: true },
      });

      return {
        userId: user.id,
        inviteId: invite.id,
        setupTokenId: setup.id,
      };
    });

    return {
      ok: true,
      setupRaw,
      userId: result.userId,
      inviteId: result.inviteId,
      setupTokenId: result.setupTokenId,
    };
  } catch {
    return { ok: false, error: PARTNER_INVITE_INVALID_MESSAGE };
  }
}

/**
 * Validate email invite token and exchange for HttpOnly setup cookie.
 * Invite URL is one-time: consumed atomically at successful exchange.
 */
export async function exchangePartnerInviteToken(rawToken: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const exchanged = await exchangePartnerInviteTokenInDb(rawToken);
  if (!exchanged.ok) {
    return { ok: false, error: exchanged.error };
  }

  const jar = await cookies();
  jar.set(PARTNER_INVITE_SETUP_COOKIE, exchanged.setupRaw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/partner/setup-password",
    maxAge: Math.floor(PARTNER_INVITE_SETUP_TTL_MS / 1000),
  });

  return { ok: true };
}

export async function clearPartnerInviteSetupCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(PARTNER_INVITE_SETUP_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/partner/setup-password",
    maxAge: 0,
  });
}

/**
 * Peek setup session without consuming — for form rendering.
 * Invite is already consumed at exchange; setup token alone authorizes the form.
 */
export async function getPartnerInviteSetupUser(): Promise<{
  userId: string;
  email: string;
  inviteId: string;
  setupTokenId: string;
} | null> {
  const jar = await cookies();
  const raw = jar.get(PARTNER_INVITE_SETUP_COOKIE)?.value?.trim() || "";
  if (!raw) return null;

  return getPartnerInviteSetupUserFromRaw(raw);
}

/** Resolve setup session from raw cookie secret (testable without Next cookies). */
export async function getPartnerInviteSetupUserFromRaw(rawToken: string): Promise<{
  userId: string;
  email: string;
  inviteId: string;
  setupTokenId: string;
} | null> {
  const trimmed = rawToken.trim();
  if (!trimmed) return null;

  const tokenHash = hashOpaqueToken(trimmed);
  const now = new Date();
  const record = await prisma.partnerInviteSetupToken.findFirst({
    where: {
      tokenHash,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      inviteId: true,
      userId: true,
      tokenHash: true,
      user: { select: { email: true } },
    },
  });

  if (!record || !safeEqualHex(record.tokenHash, tokenHash)) return null;

  const eligible = await loadEligibleInviteUser(record.userId);
  if (!eligible) return null;

  return {
    userId: record.userId,
    email: record.user.email,
    inviteId: record.inviteId,
    setupTokenId: record.id,
  };
}
