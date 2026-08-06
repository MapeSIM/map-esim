import "server-only";

import {
  Role,
  WalletDirection,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { maskAdminEmail } from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";
import {
  formatUsdCents,
  formatWalletDateTime,
  formatWalletReference,
  formatWalletTransactionAmount,
  walletDirectionLabel,
  walletStatusLabel,
  walletTransactionTypeLabel,
  type WalletDirectionLabel,
  type WalletStatusLabel,
  type WalletTransactionTypeLabel,
} from "@/app/lib/wallet/display";

export const ADMIN_CUSTOMER_RECENT_WALLET_TX_LIMIT = 10;

export type AdminCompletedWalletCreditResult = {
  transactionId: string;
  customerId: string;
  amountCents: number;
  amountLabel: string;
  balanceAfterCents: number;
  balanceAfterLabel: string;
  currency: "USD";
};

/**
 * Read-only load of a completed ADMIN_CREDIT for the given CUSTOMER.
 * Never creates/updates/deletes rows. Invalid/mismatched ids → null.
 */
export async function getAdminCompletedWalletCredit(
  customerUserId: string,
  transactionId: string
): Promise<AdminCompletedWalletCreditResult | null> {
  const customerId = (customerUserId ?? "").trim();
  const txId = (transactionId ?? "").trim();
  if (!customerId || customerId.length > 64) return null;
  if (!txId || txId.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(txId)) return null;

  const customer = await prisma.user.findFirst({
    where: { id: customerId, role: Role.CUSTOMER },
    select: { id: true },
  });
  if (!customer) return null;

  const row = await prisma.walletTransaction.findFirst({
    where: {
      id: txId,
      type: WalletTransactionType.ADMIN_CREDIT,
      direction: WalletDirection.CREDIT,
      status: WalletTransactionStatus.COMPLETED,
      wallet: { userId: customer.id },
    },
    select: {
      id: true,
      amountCents: true,
      balanceAfterCents: true,
      wallet: {
        select: { userId: true },
      },
    },
  });

  if (!row) return null;
  if (row.wallet.userId !== customer.id) return null;
  if (
    !Number.isInteger(row.amountCents) ||
    row.amountCents <= 0 ||
    typeof row.balanceAfterCents !== "number" ||
    !Number.isInteger(row.balanceAfterCents) ||
    row.balanceAfterCents < 0
  ) {
    return null;
  }

  return {
    transactionId: row.id,
    customerId: customer.id,
    amountCents: row.amountCents,
    amountLabel: formatUsdCents(row.amountCents),
    balanceAfterCents: row.balanceAfterCents,
    balanceAfterLabel: formatUsdCents(row.balanceAfterCents),
    currency: "USD",
  };
}

export type AdminCompletedWalletDebitResult = {
  transactionId: string;
  customerId: string;
  amountCents: number;
  amountLabel: string;
  balanceAfterCents: number;
  balanceAfterLabel: string;
  currency: "USD";
};

/**
 * Read-only load of a completed ADJUSTMENT_DEBIT for the given CUSTOMER.
 * Never creates/updates/deletes rows. Invalid/mismatched ids → null.
 */
export async function getAdminCompletedWalletDebit(
  customerUserId: string,
  transactionId: string
): Promise<AdminCompletedWalletDebitResult | null> {
  const customerId = (customerUserId ?? "").trim();
  const txId = (transactionId ?? "").trim();
  if (!customerId || customerId.length > 64) return null;
  if (!txId || txId.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(txId)) return null;

  const customer = await prisma.user.findFirst({
    where: { id: customerId, role: Role.CUSTOMER },
    select: { id: true },
  });
  if (!customer) return null;

  const row = await prisma.walletTransaction.findFirst({
    where: {
      id: txId,
      type: WalletTransactionType.ADJUSTMENT_DEBIT,
      direction: WalletDirection.DEBIT,
      status: WalletTransactionStatus.COMPLETED,
      wallet: { userId: customer.id },
    },
    select: {
      id: true,
      amountCents: true,
      balanceAfterCents: true,
      wallet: {
        select: { userId: true },
      },
    },
  });

  if (!row) return null;
  if (row.wallet.userId !== customer.id) return null;
  if (
    !Number.isInteger(row.amountCents) ||
    row.amountCents <= 0 ||
    typeof row.balanceAfterCents !== "number" ||
    !Number.isInteger(row.balanceAfterCents) ||
    row.balanceAfterCents < 0
  ) {
    return null;
  }

  return {
    transactionId: row.id,
    customerId: customer.id,
    amountCents: row.amountCents,
    amountLabel: formatUsdCents(row.amountCents),
    balanceAfterCents: row.balanceAfterCents,
    balanceAfterLabel: formatUsdCents(row.balanceAfterCents),
    currency: "USD",
  };
}

export type AdminCustomerWalletSummary = {
  customerId: string;
  customerName: string;
  customerEmailMasked: string;
  accountActive: boolean;
  balanceCents: number;
  balanceLabel: string;
  currency: "USD";
  walletStatusLabel: "Not created" | "Active";
  hasWallet: boolean;
  totalCompletedCreditsCents: number;
  totalCompletedCreditsLabel: string;
  recentTransactions: AdminCustomerWalletTransactionRow[];
};

export type AdminCustomerWalletTransactionRow = {
  id: string;
  createdAtLabel: string;
  typeLabel: WalletTransactionTypeLabel;
  directionLabel: WalletDirectionLabel;
  amountLabel: string;
  statusLabel: WalletStatusLabel;
  referenceLabel: string | null;
  balanceAfterLabel: string | null;
  /**
   * Local Order id linked via WalletEsimPurchase debit/refund relation.
   * Null when no DB-linked order exists — never inferred from display text.
   */
  relatedOrderId: string | null;
};

/**
 * ADMIN read of a CUSTOMER wallet. Never creates a wallet row.
 */
export async function getAdminCustomerWalletSummary(
  customerUserId: string
): Promise<AdminCustomerWalletSummary | null> {
  const id = (customerUserId ?? "").trim();
  if (!id || id.length > 64) return null;

  const customer = await prisma.user.findFirst({
    where: { id, role: Role.CUSTOMER },
    select: {
      id: true,
      name: true,
      email: true,
      deletedAt: true,
    },
  });
  if (!customer) return null;

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: customer.id },
    select: {
      id: true,
      balanceCents: true,
      currency: true,
    },
  });

  if (!wallet) {
    return {
      customerId: customer.id,
      customerName: (customer.name ?? "").trim() || "Not available",
      customerEmailMasked: maskAdminEmail(customer.email),
      accountActive: !customer.deletedAt,
      balanceCents: 0,
      balanceLabel: formatUsdCents(0),
      currency: "USD",
      walletStatusLabel: "Not created",
      hasWallet: false,
      totalCompletedCreditsCents: 0,
      totalCompletedCreditsLabel: formatUsdCents(0),
      recentTransactions: [],
    };
  }

  const totalCompletedCredits = await prisma.walletTransaction.aggregate({
    where: {
      walletId: wallet.id,
      direction: "CREDIT",
      status: WalletTransactionStatus.COMPLETED,
    },
    _sum: { amountCents: true },
  });

  const recent = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_CUSTOMER_RECENT_WALLET_TX_LIMIT,
    select: {
      id: true,
      createdAt: true,
      type: true,
      direction: true,
      status: true,
      amountCents: true,
      balanceAfterCents: true,
      referenceType: true,
      referenceId: true,
      purchaseAsDebit: {
        select: { orderId: true },
      },
      purchaseAsRefund: {
        select: { orderId: true },
      },
    },
  });

  const balanceCents =
    Number.isInteger(wallet.balanceCents) && wallet.balanceCents >= 0
      ? wallet.balanceCents
      : 0;
  const totalCompletedCreditsCents =
    totalCompletedCredits._sum.amountCents &&
    totalCompletedCredits._sum.amountCents > 0
      ? totalCompletedCredits._sum.amountCents
      : 0;

  return {
    customerId: customer.id,
    customerName: (customer.name ?? "").trim() || "Not available",
    customerEmailMasked: maskAdminEmail(customer.email),
    accountActive: !customer.deletedAt,
    balanceCents,
    balanceLabel: formatUsdCents(balanceCents),
    currency: "USD",
    walletStatusLabel: "Active",
    hasWallet: true,
    totalCompletedCreditsCents,
    totalCompletedCreditsLabel: formatUsdCents(totalCompletedCreditsCents),
    recentTransactions: recent.map((row) => {
      const relatedOrderId =
        row.purchaseAsDebit?.orderId?.trim() ||
        row.purchaseAsRefund?.orderId?.trim() ||
        null;
      return {
        id: row.id,
        createdAtLabel: formatWalletDateTime(row.createdAt),
        typeLabel: walletTransactionTypeLabel(row.type),
        directionLabel: walletDirectionLabel(row.direction),
        amountLabel: formatWalletTransactionAmount(
          row.amountCents,
          row.direction
        ),
        statusLabel: walletStatusLabel(row.status),
        referenceLabel: formatWalletReference(
          row.referenceType,
          row.referenceId
        ),
        balanceAfterLabel:
          typeof row.balanceAfterCents === "number"
            ? formatUsdCents(row.balanceAfterCents)
            : null,
        relatedOrderId,
      };
    }),
  };
}
