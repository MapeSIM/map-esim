import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/db";
import {
  RESET_AUTH_COOKIE,
  RESET_AUTH_TTL_MS,
  invalidateOtps,
  OtpPurpose,
} from "@/app/lib/auth/otp";

function hashResetAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function issueResetAuthorization(userId: string): Promise<void> {
  // One active reset authorization at a time.
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashResetAuthToken(rawToken);

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_AUTH_TTL_MS),
    },
  });

  const jar = await cookies();
  jar.set(RESET_AUTH_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(RESET_AUTH_TTL_MS / 1000),
  });
}

export async function clearResetAuthorizationCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(RESET_AUTH_COOKIE);
}

export async function consumeResetAuthorization(): Promise<
  { ok: true; userId: string } | { ok: false }
> {
  const jar = await cookies();
  const rawToken = jar.get(RESET_AUTH_COOKIE)?.value?.trim() || "";
  if (!rawToken) return { ok: false };

  const tokenHash = hashResetAuthToken(rawToken);
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!record) {
    await clearResetAuthorizationCookie();
    return { ok: false };
  }

  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  await invalidateOtps(record.userId, OtpPurpose.PASSWORD_RESET);
  await clearResetAuthorizationCookie();

  return { ok: true, userId: record.userId };
}

export async function hasResetAuthorization(): Promise<boolean> {
  const user = await getResetAuthorizationUser();
  return Boolean(user);
}

/** Peek reset auth without consuming — for password policy / email checks. */
export async function getResetAuthorizationUser(): Promise<{
  userId: string;
  email: string;
} | null> {
  const jar = await cookies();
  const rawToken = jar.get(RESET_AUTH_COOKIE)?.value?.trim() || "";
  if (!rawToken) return null;

  const tokenHash = hashResetAuthToken(rawToken);
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      userId: true,
      user: { select: { email: true } },
    },
  });

  if (!record?.user?.email) return null;
  return { userId: record.userId, email: record.user.email };
}
