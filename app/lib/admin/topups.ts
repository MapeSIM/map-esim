import "server-only";

import { WalletTopupStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { maskProviderOrderRef } from "@/app/lib/admin/display";
import { formatUsdCents, formatWalletDateTime } from "@/app/lib/wallet/display";

export const ADMIN_TOPUPS_PAGE_SIZE = 20;

export type AdminTopupListRow = {
  id: string;
  customerLabel: string;
  creditAmountLabel: string;
  chargeLabel: string;
  gatewayLabel: string;
  statusLabel: string;
  createdAtLabel: string;
  paymentConfirmedAtLabel: string;
  walletCreditedAtLabel: string;
  providerRefMasked: string;
  walletTransactionLabel: string;
  failureCategoryLabel: string;
};

export type AdminTopupDetail = AdminTopupListRow & {
  customerUserId: string;
  creditAmountCents: number;
  status: WalletTopupStatus;
};

function gatewayLabel(value: string | null | undefined): string {
  if (!value) return "Not selected";
  return value;
}

function statusLabel(status: WalletTopupStatus): string {
  switch (status) {
    case WalletTopupStatus.DRAFT:
      return "Draft";
    case WalletTopupStatus.AWAITING_PAYMENT:
      return "Awaiting payment";
    case WalletTopupStatus.PAYMENT_PENDING:
      return "Payment pending";
    case WalletTopupStatus.PAYMENT_CONFIRMED:
      return "Payment confirmed";
    case WalletTopupStatus.CREDITED:
      return "Credited";
    case WalletTopupStatus.FAILED:
      return "Failed";
    case WalletTopupStatus.EXPIRED:
      return "Expired";
    case WalletTopupStatus.CANCELLED:
      return "Cancelled";
    case WalletTopupStatus.RECONCILIATION_REQUIRED:
      return "Reconciliation required";
    default:
      return "Unavailable";
  }
}

function mapRow(row: {
  id: string;
  customerUserId: string;
  creditAmountCents: number;
  chargeCurrency: string | null;
  chargeAmountMinor: number | null;
  gatewayProvider: string | null;
  gatewayPaymentRef: string | null;
  status: WalletTopupStatus;
  failureCategory: string | null;
  walletTransactionId: string | null;
  createdAt: Date;
  paymentConfirmedAt: Date | null;
  walletCreditedAt: Date | null;
  customer: { name: string };
}): AdminTopupListRow {
  const chargeLabel =
    row.chargeCurrency && typeof row.chargeAmountMinor === "number"
      ? `${row.chargeAmountMinor} ${row.chargeCurrency}`
      : "Not quoted yet";

  return {
    id: row.id,
    customerLabel: row.customer.name.trim() || "Customer",
    creditAmountLabel: formatUsdCents(row.creditAmountCents),
    chargeLabel,
    gatewayLabel: gatewayLabel(row.gatewayProvider),
    statusLabel: statusLabel(row.status),
    createdAtLabel: formatWalletDateTime(row.createdAt),
    paymentConfirmedAtLabel: row.paymentConfirmedAt
      ? formatWalletDateTime(row.paymentConfirmedAt)
      : "Not available",
    walletCreditedAtLabel: row.walletCreditedAt
      ? formatWalletDateTime(row.walletCreditedAt)
      : "Not available",
    providerRefMasked: maskProviderOrderRef(row.gatewayPaymentRef),
    walletTransactionLabel: row.walletTransactionId
      ? `${row.walletTransactionId.slice(0, 4)}…${row.walletTransactionId.slice(-4)}`
      : "Not linked",
    failureCategoryLabel: row.failureCategory?.trim() || "Not available",
  };
}

export async function getAdminTopupsPage(pageRaw: string | undefined): Promise<{
  rows: AdminTopupListRow[];
  page: number;
  totalPages: number;
  totalCount: number;
}> {
  const pageSize = ADMIN_TOPUPS_PAGE_SIZE;
  const requested = Number.parseInt(String(pageRaw ?? "1"), 10);
  const page =
    Number.isInteger(requested) && requested > 0 ? requested : 1;

  const totalCount = await prisma.walletTopup.count();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const rows = await prisma.walletTopup.findMany({
    orderBy: { createdAt: "desc" },
    skip: (safePage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      customerUserId: true,
      creditAmountCents: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      status: true,
      failureCategory: true,
      walletTransactionId: true,
      createdAt: true,
      paymentConfirmedAt: true,
      walletCreditedAt: true,
      customer: { select: { name: true } },
    },
  });

  return {
    rows: rows.map(mapRow),
    page: safePage,
    totalPages,
    totalCount,
  };
}

export async function getAdminTopupDetail(
  topupId: string
): Promise<AdminTopupDetail | null> {
  const id = topupId.trim();
  if (!id || id.length > 64) return null;

  const row = await prisma.walletTopup.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      creditAmountCents: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      status: true,
      failureCategory: true,
      walletTransactionId: true,
      createdAt: true,
      paymentConfirmedAt: true,
      walletCreditedAt: true,
      customer: { select: { name: true } },
    },
  });
  if (!row) return null;

  return {
    ...mapRow(row),
    customerUserId: row.customerUserId,
    creditAmountCents: row.creditAmountCents,
    status: row.status,
  };
}

export async function getAdminCustomerRecentTopups(
  customerUserId: string,
  limit = 5
): Promise<AdminTopupListRow[]> {
  const id = customerUserId.trim();
  if (!id || id.length > 64) return [];

  const rows = await prisma.walletTopup.findMany({
    where: { customerUserId: id },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 20),
    select: {
      id: true,
      customerUserId: true,
      creditAmountCents: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      status: true,
      failureCategory: true,
      walletTransactionId: true,
      createdAt: true,
      paymentConfirmedAt: true,
      walletCreditedAt: true,
      customer: { select: { name: true } },
    },
  });

  return rows.map(mapRow);
}
