/**
 * Idempotent WalletAccount bootstrap for verified CUSTOMER users.
 * Creates a zero-balance USD wallet when missing. Never credits, debits,
 * or touches payment / eSIM / partner flows.
 */
import "server-only";

import { Prisma, Role, WalletCurrency } from "@prisma/client";
import { prisma } from "@/app/lib/db";

export type EnsureCustomerWalletResult = {
  walletId: string;
  created: boolean;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Ensure a verified CUSTOMER has a WalletAccount (balance 0).
 * Returns null when the user is missing, deleted, non-CUSTOMER, or unverified.
 */
export async function ensureCustomerWalletAccount(
  userId: string
): Promise<EnsureCustomerWalletResult | null> {
  const id = (userId ?? "").trim();
  if (!id || id.length > 64) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      emailVerifiedAt: true,
    },
  });

  if (
    !user ||
    user.deletedAt ||
    user.role !== Role.CUSTOMER ||
    !user.emailVerifiedAt
  ) {
    return null;
  }

  const existing = await prisma.walletAccount.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (existing) {
    return { walletId: existing.id, created: false };
  }

  try {
    const created = await prisma.walletAccount.create({
      data: {
        userId: user.id,
        currency: WalletCurrency.USD,
        balanceCents: 0,
        version: 0,
      },
      select: { id: true },
    });
    return { walletId: created.id, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const again = await prisma.walletAccount.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!again) throw error;
    return { walletId: again.id, created: false };
  }
}
