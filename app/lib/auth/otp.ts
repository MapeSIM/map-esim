import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { OtpPurpose } from "@prisma/client";
import { prisma } from "@/app/lib/db";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const RESET_AUTH_TTL_MS = 15 * 60 * 1000;
export const RESET_AUTH_COOKIE = "mapesim_reset_auth";

const otpCodeSchema = /^[0-9]{6}$/;

function otpPepper(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.ORDER_ACCESS_SECRET ||
    "mapesim-otp-dev-pepper"
  );
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(code: string): string {
  return createHmac("sha256", otpPepper()).update(code.trim()).digest("hex");
}

export function isValidOtpFormat(code: string): boolean {
  return otpCodeSchema.test(code.trim());
}

function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export async function invalidateOtps(
  userId: string,
  purpose: OtpPurpose
): Promise<void> {
  await prisma.emailOtp.updateMany({
    where: {
      userId,
      purpose,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });
}

export type IssueOtpResult =
  | {
      ok: true;
      /** Plain code for email delivery only — never log or return to clients. */
      code: string;
      resent: boolean;
    }
  | { ok: false; reason: "cooldown" | "rate_limited"; retryAfterSec: number };

/**
 * Invalidate prior unused OTPs for this purpose, create a hashed OTP, return plain code for sending.
 */
export async function issueEmailOtp(options: {
  userId: string;
  purpose: OtpPurpose;
  force?: boolean;
}): Promise<IssueOtpResult> {
  const existing = await prisma.emailOtp.findFirst({
    where: {
      userId: options.userId,
      purpose: options.purpose,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing && !options.force) {
    const elapsed = Date.now() - existing.lastSentAt.getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        reason: "cooldown",
        retryAfterSec: Math.max(
          1,
          Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000)
        ),
      };
    }
  }

  await invalidateOtps(options.userId, options.purpose);

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const now = new Date();

  await prisma.emailOtp.create({
    data: {
      userId: options.userId,
      purpose: options.purpose,
      codeHash,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      lastSentAt: now,
    },
  });

  return { ok: true, code, resent: Boolean(existing) };
}

export type VerifyOtpResult =
  | { ok: true; userId: string; otpId: string }
  | {
      ok: false;
      reason:
        | "invalid"
        | "expired"
        | "used"
        | "locked"
        | "format"
        | "not_found";
    };

export async function verifyEmailOtp(options: {
  userId: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<VerifyOtpResult> {
  if (!isValidOtpFormat(options.code)) {
    return { ok: false, reason: "format" };
  }

  const record = await prisma.emailOtp.findFirst({
    where: {
      userId: options.userId,
      purpose: options.purpose,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { ok: false, reason: "not_found" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "locked" };
  }

  const candidateHash = hashOtpCode(options.code);
  const match = hashesEqual(candidateHash, record.codeHash);

  if (!match) {
    const updated = await prisma.emailOtp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (updated.attempts >= OTP_MAX_ATTEMPTS) {
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "invalid" };
  }

  await prisma.emailOtp.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { ok: true, userId: record.userId, otpId: record.id };
}

export { OtpPurpose };
