/**
 * Read-only Admin Wallet Ledger loader.
 * Never mutates balance, never marks paid, never releases reservations.
 */
import "server-only";

import { Role } from "@prisma/client";
import { maskAdminEmail } from "@/app/lib/admin/display";
import {
  ADMIN_WALLET_LEDGER_PAGE_SIZE,
  clampAdminWalletLedgerPage,
  parseAdminWalletLedgerPage,
  walletLedgerLifecycleLabel,
  type WalletLedgerLifecycleLabel,
} from "@/app/lib/admin/walletLedgerShared";
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
import { walletEmailNotificationLabel } from "@/app/lib/wallet/transactionNotification";

export type AdminWalletLedgerRow = {
  id: string;
  createdAtLabel: string;
  typeLabel: WalletTransactionTypeLabel;
  directionLabel: WalletDirectionLabel;
  statusLabel: WalletStatusLabel;
  lifecycleLabel: WalletLedgerLifecycleLabel;
  amountLabel: string;
  balanceAfterLabel: string | null;
  referenceLabel: string | null;
  notificationLabel: string | null;
  purchaseId: string | null;
  purchaseStatus: string | null;
  purchaseHref: string | null;
  paymentAttemptId: string | null;
  paymentAttemptHref: string | null;
  orderId: string | null;
  orderHref: string | null;
};

export type AdminWalletLedgerPage = {
  customerId: string;
  customerName: string;
  customerEmailMasked: string;
  accountActive: boolean;
  hasWallet: boolean;
  walletStatusLabel: "Not created" | "Active";
  balanceCents: number;
  balanceLabel: string;
  currency: "USD";
  rows: AdminWalletLedgerRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function resolvePurchaseId(input: {
  purchaseAsDebitId: string | null;
  purchaseAsRefundId: string | null;
  referenceType: string | null;
  referenceId: string | null;
}): string | null {
  if (input.purchaseAsDebitId) return input.purchaseAsDebitId;
  if (input.purchaseAsRefundId) return input.purchaseAsRefundId;
  const refType = (input.referenceType ?? "").trim();
  const refId = (input.referenceId ?? "").trim();
  if (
    (refType === "WALLET_ESIM_PURCHASE" ||
      refType === "WALLET_ESIM_PURCHASE_REFUND") &&
    refId &&
    refId.length <= 64
  ) {
    return refId;
  }
  return null;
}

/**
 * ADMIN read of a CUSTOMER wallet ledger. Never creates a wallet or mutates money.
 */
export async function getAdminWalletLedgerPage(input: {
  customerUserId: string;
  page?: string | null;
}): Promise<AdminWalletLedgerPage | null> {
  const customerId = (input.customerUserId ?? "").trim();
  if (!customerId || customerId.length > 64) return null;

  const customer = await prisma.user.findFirst({
    where: { id: customerId, role: Role.CUSTOMER },
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

  const requestedPage = parseAdminWalletLedgerPage(input.page);
  const pageSize = ADMIN_WALLET_LEDGER_PAGE_SIZE;

  if (!wallet) {
    return {
      customerId: customer.id,
      customerName: (customer.name ?? "").trim() || "Not available",
      customerEmailMasked: maskAdminEmail(customer.email),
      accountActive: !customer.deletedAt,
      hasWallet: false,
      walletStatusLabel: "Not created",
      balanceCents: 0,
      balanceLabel: formatUsdCents(0),
      currency: "USD",
      rows: [],
      page: 1,
      pageSize,
      totalCount: 0,
      totalPages: 1,
    };
  }

  const totalCount = await prisma.walletTransaction.count({
    where: { walletId: wallet.id },
  });
  const { page, totalPages } = clampAdminWalletLedgerPage(
    requestedPage,
    totalCount,
    pageSize
  );
  const skip = (page - 1) * pageSize;

  const rows = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take: pageSize,
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
      emailNotificationStatus: true,
      purchaseAsDebit: {
        select: { id: true, status: true, orderId: true },
      },
      purchaseAsRefund: {
        select: { id: true, status: true, orderId: true },
      },
    },
  });

  const purchaseMeta = new Map<
    string,
    { status: string; orderId: string | null }
  >();
  for (const row of rows) {
    const fromRel = row.purchaseAsDebit ?? row.purchaseAsRefund;
    if (fromRel) {
      purchaseMeta.set(fromRel.id, {
        status: fromRel.status,
        orderId: fromRel.orderId,
      });
    }
  }

  const purchaseIds = Array.from(
    new Set(
      rows
        .map((row) =>
          resolvePurchaseId({
            purchaseAsDebitId: row.purchaseAsDebit?.id ?? null,
            purchaseAsRefundId: row.purchaseAsRefund?.id ?? null,
            referenceType: row.referenceType,
            referenceId: row.referenceId,
          })
        )
        .filter((id): id is string => Boolean(id))
    )
  );

  const missingMetaIds = purchaseIds.filter((id) => !purchaseMeta.has(id));
  if (missingMetaIds.length > 0) {
    const purchases = await prisma.walletEsimPurchase.findMany({
      where: { id: { in: missingMetaIds } },
      select: { id: true, status: true, orderId: true },
    });
    for (const p of purchases) {
      purchaseMeta.set(p.id, { status: p.status, orderId: p.orderId });
    }
  }

  const attemptByPurchaseId = new Map<string, string>();
  if (purchaseIds.length > 0) {
    const attempts = await prisma.esimPurchasePaymentAttempt.findMany({
      where: { purchaseId: { in: purchaseIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, purchaseId: true },
    });
    for (const attempt of attempts) {
      if (!attemptByPurchaseId.has(attempt.purchaseId)) {
        attemptByPurchaseId.set(attempt.purchaseId, attempt.id);
      }
    }
  }

  const balanceCents =
    Number.isInteger(wallet.balanceCents) && wallet.balanceCents >= 0
      ? wallet.balanceCents
      : 0;

  return {
    customerId: customer.id,
    customerName: (customer.name ?? "").trim() || "Not available",
    customerEmailMasked: maskAdminEmail(customer.email),
    accountActive: !customer.deletedAt,
    hasWallet: true,
    walletStatusLabel: "Active",
    balanceCents,
    balanceLabel: formatUsdCents(balanceCents),
    currency: "USD",
    page,
    pageSize,
    totalCount,
    totalPages,
    rows: rows.map((row) => {
      const purchaseId = resolvePurchaseId({
        purchaseAsDebitId: row.purchaseAsDebit?.id ?? null,
        purchaseAsRefundId: row.purchaseAsRefund?.id ?? null,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
      });
      const meta = purchaseId ? purchaseMeta.get(purchaseId) : null;
      const attemptId = purchaseId
        ? attemptByPurchaseId.get(purchaseId) ?? null
        : null;
      const orderId = (meta?.orderId ?? "").trim() || null;

      return {
        id: row.id,
        createdAtLabel: formatWalletDateTime(row.createdAt),
        typeLabel: walletTransactionTypeLabel(row.type),
        directionLabel: walletDirectionLabel(row.direction),
        statusLabel: walletStatusLabel(row.status),
        lifecycleLabel: walletLedgerLifecycleLabel({
          type: row.type,
          status: row.status,
        }),
        amountLabel: formatWalletTransactionAmount(
          row.amountCents,
          row.direction
        ),
        balanceAfterLabel:
          typeof row.balanceAfterCents === "number" &&
          Number.isInteger(row.balanceAfterCents)
            ? formatUsdCents(row.balanceAfterCents)
            : null,
        referenceLabel: formatWalletReference(
          row.referenceType,
          row.referenceId
        ),
        notificationLabel: walletEmailNotificationLabel(
          row.emailNotificationStatus
        ),
        purchaseId,
        purchaseStatus: meta?.status ?? null,
        purchaseHref: purchaseId
          ? `/admin/reconciliation/wallet_purchase/${encodeURIComponent(purchaseId)}`
          : null,
        paymentAttemptId: attemptId,
        paymentAttemptHref: attemptId
          ? `/admin/payments/${encodeURIComponent(attemptId)}`
          : null,
        orderId,
        orderHref: orderId
          ? `/admin/orders/${encodeURIComponent(orderId)}`
          : null,
      };
    }),
  };
}
