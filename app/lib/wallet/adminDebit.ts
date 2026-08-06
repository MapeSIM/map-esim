import "server-only";

import {
  Prisma,
  Role,
  WalletDirection,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { ADMIN_DEBIT_MIN_CENTS } from "@/app/lib/wallet/amount";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";

export const ADMIN_MANUAL_DEBIT_REFERENCE_TYPE = "ADMIN_MANUAL_DEBIT";
export const ADMIN_WALLET_DEBIT_AUDIT_ACTION = "wallet.admin_debit_completed";

export type AdminWalletDebitInput = {
  adminUserId: string;
  customerUserId: string;
  amountCents: number;
  reason: string;
  internalReference: string | null;
  idempotencyKey: string;
};

export type AdminWalletDebitResult = {
  duplicate: boolean;
  customerUserId: string;
  transactionId: string;
  amountCents: number;
  amountLabel: string;
  balanceCents: number;
  balanceLabel: string;
  currency: "USD";
};

export class AdminWalletDebitError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "CUSTOMER_UNAVAILABLE"
    | "WALLET_UNAVAILABLE"
    | "INSUFFICIENT_FUNDS"
    | "INVALID_AMOUNT"
    | "INVALID_IDEMPOTENCY"
    | "UNAVAILABLE";

  constructor(code: AdminWalletDebitError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "AdminWalletDebitError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function loadExistingDebitResult(
  idempotencyKey: string,
  customerUserId: string
): Promise<AdminWalletDebitResult | null> {
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
    existing.type !== WalletTransactionType.ADJUSTMENT_DEBIT ||
    existing.direction !== WalletDirection.DEBIT ||
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
 * Atomically debit a CUSTOMER wallet (ADJUSTMENT_DEBIT).
 * Wallet must already exist. Never creates a wallet.
 * Uses conditional balance update so concurrent debits cannot go negative.
 * Duplicate idempotencyKey returns the original completed result.
 */
export async function debitCustomerWalletByAdmin(
  input: AdminWalletDebitInput
): Promise<AdminWalletDebitResult> {
  const adminUserId = input.adminUserId.trim();
  const customerUserId = input.customerUserId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const reason = input.reason.trim();
  const internalReference = input.internalReference?.trim() || null;
  const amountCents = input.amountCents;

  if (!adminUserId || adminUserId.length > 64) {
    throw new AdminWalletDebitError("FORBIDDEN", "Not authorized.");
  }
  if (!customerUserId || customerUserId.length > 64) {
    throw new AdminWalletDebitError(
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
    throw new AdminWalletDebitError(
      "INVALID_IDEMPOTENCY",
      "This debit request could not be processed. Please reload and try again."
    );
  }
  if (
    !Number.isInteger(amountCents) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < ADMIN_DEBIT_MIN_CENTS
  ) {
    throw new AdminWalletDebitError(
      "INVALID_AMOUNT",
      "Enter a valid USD amount."
    );
  }

  const prior = await loadExistingDebitResult(idempotencyKey, customerUserId);
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
          existingTx.type !== WalletTransactionType.ADJUSTMENT_DEBIT
        ) {
          throw new AdminWalletDebitError(
            "INVALID_IDEMPOTENCY",
            "This debit request could not be processed. Please reload and try again."
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
        select: { id: true, role: true, deletedAt: true },
      });
      if (!admin || admin.deletedAt || admin.role !== Role.ADMIN) {
        throw new AdminWalletDebitError("FORBIDDEN", "Not authorized.");
      }

      const customer = await tx.user.findUnique({
        where: { id: customerUserId },
        select: { id: true, role: true, deletedAt: true },
      });
      if (
        !customer ||
        customer.deletedAt ||
        customer.role !== Role.CUSTOMER
      ) {
        throw new AdminWalletDebitError(
          "CUSTOMER_UNAVAILABLE",
          "Customer is unavailable."
        );
      }

      const wallet = await tx.walletAccount.findUnique({
        where: { userId: customer.id },
        select: {
          id: true,
          balanceCents: true,
        },
      });

      if (!wallet) {
        throw new AdminWalletDebitError(
          "WALLET_UNAVAILABLE",
          "No wallet funds are available to deduct."
        );
      }

      if (wallet.balanceCents < ADMIN_DEBIT_MIN_CENTS) {
        throw new AdminWalletDebitError(
          "INSUFFICIENT_FUNDS",
          "No wallet funds are available to deduct."
        );
      }

      if (wallet.balanceCents < amountCents) {
        throw new AdminWalletDebitError(
          "INSUFFICIENT_FUNDS",
          "Debit amount cannot exceed the available wallet balance."
        );
      }

      // Atomic conditional deduct — concurrent debits cannot drive balance negative.
      const updated = await tx.walletAccount.updateMany({
        where: {
          id: wallet.id,
          balanceCents: { gte: amountCents },
        },
        data: {
          balanceCents: { decrement: amountCents },
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new AdminWalletDebitError(
          "INSUFFICIENT_FUNDS",
          "Debit amount cannot exceed the available wallet balance."
        );
      }

      const walletAfter = await tx.walletAccount.findUnique({
        where: { id: wallet.id },
        select: { balanceCents: true },
      });
      if (
        !walletAfter ||
        !Number.isInteger(walletAfter.balanceCents) ||
        walletAfter.balanceCents < 0
      ) {
        throw new AdminWalletDebitError(
          "UNAVAILABLE",
          "Wallet debit is temporarily unavailable. Please try again shortly."
        );
      }

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.ADJUSTMENT_DEBIT,
          direction: WalletDirection.DEBIT,
          status: WalletTransactionStatus.COMPLETED,
          amountCents,
          balanceBeforeCents: wallet.balanceCents,
          balanceAfterCents: walletAfter.balanceCents,
          idempotencyKey,
          referenceType: ADMIN_MANUAL_DEBIT_REFERENCE_TYPE,
          referenceId: internalReference,
        },
        select: {
          id: true,
          amountCents: true,
          balanceAfterCents: true,
        },
      });

      const metadata: Prisma.InputJsonValue = {
        method: "admin_manual_debit",
        amountCents,
        currency: "USD",
        reason,
        ...(internalReference ? { internalReference } : {}),
        targetUserId: customer.id,
        walletTransactionId: transaction.id,
      };

      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: ADMIN_WALLET_DEBIT_AUDIT_ACTION,
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
        balanceCents: walletAfter.balanceCents,
        balanceLabel: formatUsdCents(walletAfter.balanceCents),
        currency: "USD" as const,
      };
    });

    if (!result.duplicate) {
      scheduleWalletTransactionNotification(result.transactionId);
    }
    return result;
  } catch (error) {
    if (error instanceof AdminWalletDebitError) throw error;

    if (isUniqueViolation(error)) {
      const recovered = await loadExistingDebitResult(
        idempotencyKey,
        customerUserId
      );
      if (recovered) return recovered;
    }

    throw new AdminWalletDebitError(
      "UNAVAILABLE",
      "Wallet debit is temporarily unavailable. Please try again shortly."
    );
  }
}
