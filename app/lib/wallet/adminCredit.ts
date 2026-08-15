import "server-only";

import {
  Prisma,
  Role,
  WalletCurrency,
  WalletDirection,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";

export const ADMIN_MANUAL_CREDIT_REFERENCE_TYPE = "ADMIN_MANUAL_CREDIT";
export const ADMIN_WALLET_CREDIT_AUDIT_ACTION = "wallet.admin_credit_completed";

export type AdminWalletCreditInput = {
  adminUserId: string;
  customerUserId: string;
  amountCents: number;
  reason: string;
  internalReference: string | null;
  idempotencyKey: string;
};

export type AdminWalletCreditResult = {
  duplicate: boolean;
  customerUserId: string;
  transactionId: string;
  amountCents: number;
  amountLabel: string;
  balanceCents: number;
  balanceLabel: string;
  currency: "USD";
};

export class AdminWalletCreditError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "CUSTOMER_UNAVAILABLE"
    | "INVALID_AMOUNT"
    | "INVALID_IDEMPOTENCY"
    | "UNAVAILABLE";

  constructor(
    code: AdminWalletCreditError["code"],
    message: string
  ) {
    super(message);
    this.code = code;
    this.name = "AdminWalletCreditError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function loadExistingCreditResult(
  idempotencyKey: string,
  customerUserId: string
): Promise<AdminWalletCreditResult | null> {
  const existing = await prisma.walletTransaction.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      amountCents: true,
      balanceAfterCents: true,
      type: true,
      direction: true,
      status: true,
      wallet: {
        select: {
          userId: true,
          balanceCents: true,
        },
      },
    },
  });

  if (
    !existing ||
    existing.wallet.userId !== customerUserId ||
    existing.type !== WalletTransactionType.ADMIN_CREDIT ||
    existing.direction !== WalletDirection.CREDIT ||
    existing.status !== WalletTransactionStatus.COMPLETED
  ) {
    return null;
  }

  const amountCents = existing.amountCents;
  const balanceCents =
    typeof existing.balanceAfterCents === "number" &&
    existing.balanceAfterCents >= 0
      ? existing.balanceAfterCents
      : existing.wallet.balanceCents;

  return {
    duplicate: true,
    customerUserId,
    transactionId: existing.id,
    amountCents,
    amountLabel: formatUsdCents(amountCents),
    balanceCents,
    balanceLabel: formatUsdCents(balanceCents),
    currency: "USD",
  };
}

/**
 * Atomically credit a CUSTOMER wallet (ADMIN_CREDIT).
 * Creates WalletAccount only on the first successful credit.
 * Duplicate idempotencyKey returns the original completed result.
 */
export async function creditCustomerWalletByAdmin(
  input: AdminWalletCreditInput
): Promise<AdminWalletCreditResult> {
  const adminUserId = input.adminUserId.trim();
  const customerUserId = input.customerUserId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const reason = input.reason.trim();
  const internalReference = input.internalReference?.trim() || null;
  const amountCents = input.amountCents;

  if (!adminUserId || adminUserId.length > 64) {
    throw new AdminWalletCreditError("FORBIDDEN", "Not authorized.");
  }
  if (!customerUserId || customerUserId.length > 64) {
    throw new AdminWalletCreditError(
      "CUSTOMER_UNAVAILABLE",
      "Customer is unavailable."
    );
  }
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new AdminWalletCreditError(
      "INVALID_IDEMPOTENCY",
      "This credit request could not be processed. Please reload and try again."
    );
  }
  if (
    !Number.isInteger(amountCents) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    throw new AdminWalletCreditError(
      "INVALID_AMOUNT",
      "Enter a valid USD amount."
    );
  }

  const prior = await loadExistingCreditResult(idempotencyKey, customerUserId);
  if (prior) return prior;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingTx = await tx.walletTransaction.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          amountCents: true,
          balanceAfterCents: true,
          type: true,
          direction: true,
          status: true,
          wallet: {
            select: { userId: true, balanceCents: true },
          },
        },
      });

      if (existingTx) {
        if (
          existingTx.wallet.userId !== customerUserId ||
          existingTx.type !== WalletTransactionType.ADMIN_CREDIT
        ) {
          throw new AdminWalletCreditError(
            "INVALID_IDEMPOTENCY",
            "This credit request could not be processed. Please reload and try again."
          );
        }
        const balanceCents =
          typeof existingTx.balanceAfterCents === "number" &&
          existingTx.balanceAfterCents >= 0
            ? existingTx.balanceAfterCents
            : existingTx.wallet.balanceCents;
        return {
          duplicate: true,
          customerUserId,
          transactionId: existingTx.id,
          amountCents: existingTx.amountCents,
          amountLabel: formatUsdCents(existingTx.amountCents),
          balanceCents,
          balanceLabel: formatUsdCents(balanceCents),
          currency: "USD" as const,
        };
      }

      const admin = await tx.user.findUnique({
        where: { id: adminUserId },
        select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
      });
      if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) {
        throw new AdminWalletCreditError("FORBIDDEN", "Not authorized.");
      }

      const customer = await tx.user.findUnique({
        where: { id: customerUserId },
        select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
      });
      if (
        !customer ||
        customer.deletedAt ||
        customer.role !== Role.CUSTOMER
      ) {
        throw new AdminWalletCreditError(
          "CUSTOMER_UNAVAILABLE",
          "Customer is unavailable."
        );
      }

      let wallet = await tx.walletAccount.findUnique({
        where: { userId: customer.id },
        select: {
          id: true,
          balanceCents: true,
          version: true,
        },
      });

      if (!wallet) {
        try {
          wallet = await tx.walletAccount.create({
            data: {
              userId: customer.id,
              currency: WalletCurrency.USD,
              balanceCents: 0,
              version: 0,
            },
            select: {
              id: true,
              balanceCents: true,
              version: true,
            },
          });
        } catch (createError) {
          if (!isUniqueViolation(createError)) throw createError;
          wallet = await tx.walletAccount.findUnique({
            where: { userId: customer.id },
            select: {
              id: true,
              balanceCents: true,
              version: true,
            },
          });
          if (!wallet) throw createError;
        }
      }

      const nextBalance = wallet.balanceCents + amountCents;
      if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
        throw new AdminWalletCreditError(
          "INVALID_AMOUNT",
          "Enter a valid USD amount."
        );
      }

      const updatedWallet = await tx.walletAccount.update({
        where: { id: wallet.id },
        data: {
          balanceCents: nextBalance,
          version: { increment: 1 },
        },
        select: {
          balanceCents: true,
          version: true,
        },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.ADMIN_CREDIT,
          direction: WalletDirection.CREDIT,
          status: WalletTransactionStatus.COMPLETED,
          amountCents,
          balanceBeforeCents: wallet.balanceCents,
          balanceAfterCents: updatedWallet.balanceCents,
          idempotencyKey,
          referenceType: ADMIN_MANUAL_CREDIT_REFERENCE_TYPE,
          referenceId: internalReference,
        },
        select: {
          id: true,
          amountCents: true,
          balanceAfterCents: true,
        },
      });

      const metadata: Prisma.InputJsonValue = {
        method: "admin_manual_credit",
        amountCents,
        currency: "USD",
        reason,
        ...(internalReference
          ? { internalReference }
          : {}),
        targetUserId: customer.id,
        walletTransactionId: transaction.id,
      };

      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: ADMIN_WALLET_CREDIT_AUDIT_ACTION,
          targetType: "WalletTransaction",
          targetId: transaction.id,
          metadata,
        },
      });

      return {
        duplicate: false,
        customerUserId: customer.id,
        transactionId: transaction.id,
        amountCents: transaction.amountCents,
        amountLabel: formatUsdCents(transaction.amountCents),
        balanceCents: updatedWallet.balanceCents,
        balanceLabel: formatUsdCents(updatedWallet.balanceCents),
        currency: "USD" as const,
      };
    });

    if (!result.duplicate) {
      scheduleWalletTransactionNotification(result.transactionId);
    }
    return result;
  } catch (error) {
    if (error instanceof AdminWalletCreditError) throw error;

    if (isUniqueViolation(error)) {
      const recovered = await loadExistingCreditResult(
        idempotencyKey,
        customerUserId
      );
      if (recovered) return recovered;
    }

    throw new AdminWalletCreditError(
      "UNAVAILABLE",
      "Wallet credit is temporarily unavailable. Please try again shortly."
    );
  }
}
