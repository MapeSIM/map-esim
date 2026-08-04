import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  WALLET_TRANSACTIONS_PAGE_SIZE,
  clampWalletTransactionsPage,
  formatUsdCents,
  formatWalletDateTime,
  formatWalletReference,
  formatWalletTransactionAmount,
  parseWalletTransactionsPage,
  walletDirectionLabel,
  walletStatusLabel,
  walletTransactionTypeLabel,
  type WalletDirectionLabel,
  type WalletStatusLabel,
  type WalletTransactionTypeLabel,
} from "@/app/lib/wallet/display";

export type CustomerWalletSummary = {
  balanceCents: number;
  balanceLabel: string;
  currency: "USD";
  hasWallet: boolean;
};

export type CustomerWalletTransactionRow = {
  id: string;
  createdAtLabel: string;
  typeLabel: WalletTransactionTypeLabel;
  directionLabel: WalletDirectionLabel;
  amountLabel: string;
  statusLabel: WalletStatusLabel;
  referenceLabel: string | null;
};

export type CustomerWalletTransactionsPage = {
  rows: CustomerWalletTransactionRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  balanceCents: number;
  balanceLabel: string;
  currency: "USD";
  hasWallet: boolean;
};

async function loadActiveCustomerId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt || user.role !== Role.CUSTOMER) {
    return null;
  }
  return user.id;
}

/**
 * Read-only wallet summary. Never creates a wallet row.
 * Missing wallet → $0.00.
 */
export async function getCustomerWalletSummary(
  userId: string
): Promise<CustomerWalletSummary | null> {
  const customerId = await loadActiveCustomerId(userId);
  if (!customerId) return null;

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: customerId },
    select: {
      balanceCents: true,
      currency: true,
    },
  });

  if (!wallet) {
    return {
      balanceCents: 0,
      balanceLabel: formatUsdCents(0),
      currency: "USD",
      hasWallet: false,
    };
  }

  const balanceCents =
    Number.isInteger(wallet.balanceCents) && wallet.balanceCents >= 0
      ? wallet.balanceCents
      : 0;

  return {
    balanceCents,
    balanceLabel: formatUsdCents(balanceCents),
    currency: "USD",
    hasWallet: true,
  };
}

/**
 * Read-only paginated ledger. Never creates a wallet or transaction.
 * Missing wallet → empty history and $0.00 balance.
 */
export async function getCustomerWalletTransactions(
  userId: string,
  pageInput?: string | number | null
): Promise<CustomerWalletTransactionsPage | null> {
  const customerId = await loadActiveCustomerId(userId);
  if (!customerId) return null;

  const pageSize = WALLET_TRANSACTIONS_PAGE_SIZE;
  let page = parseWalletTransactionsPage(pageInput);

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: customerId },
    select: {
      id: true,
      balanceCents: true,
      currency: true,
    },
  });

  if (!wallet) {
    return {
      rows: [],
      page: 1,
      pageSize,
      totalCount: 0,
      totalPages: 1,
      balanceCents: 0,
      balanceLabel: formatUsdCents(0),
      currency: "USD",
      hasWallet: false,
    };
  }

  const totalCount = await prisma.walletTransaction.count({
    where: { walletId: wallet.id },
  });

  const clamped = clampWalletTransactionsPage(page, totalCount, pageSize);
  page = clamped.page;

  const rows = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      createdAt: true,
      type: true,
      direction: true,
      status: true,
      amountCents: true,
      referenceType: true,
      referenceId: true,
    },
  });

  const balanceCents =
    Number.isInteger(wallet.balanceCents) && wallet.balanceCents >= 0
      ? wallet.balanceCents
      : 0;

  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAtLabel: formatWalletDateTime(row.createdAt),
      typeLabel: walletTransactionTypeLabel(row.type),
      directionLabel: walletDirectionLabel(row.direction),
      amountLabel: formatWalletTransactionAmount(row.amountCents, row.direction),
      statusLabel: walletStatusLabel(row.status),
      // ADMIN_CREDIT keeps reason/internal reference admin-only.
      referenceLabel:
        row.type === "ADMIN_CREDIT"
          ? null
          : formatWalletReference(row.referenceType, row.referenceId),
    })),
    page,
    pageSize,
    totalCount,
    totalPages: clamped.totalPages,
    balanceCents,
    balanceLabel: formatUsdCents(balanceCents),
    currency: "USD",
    hasWallet: true,
  };
}
