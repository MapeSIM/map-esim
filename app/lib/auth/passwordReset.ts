import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/db";

const RESET_TTL_MS = 60 * 60 * 1000;

export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(rawToken);

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  return rawToken;
}

export async function consumePasswordResetToken(rawToken: string): Promise<{
  ok: true;
  userId: string;
} | { ok: false }> {
  const tokenHash = hashResetToken(rawToken.trim());
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!record) return { ok: false };

  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { ok: true, userId: record.userId };
}
