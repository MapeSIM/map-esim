/**
 * Read-only wallet reservation monitor (Operations).
 * Lists open wallet holds — never mutates payments, wallets, or statuses.
 */
import "server-only";

import { WalletEsimPurchaseStatus } from "@prisma/client";
import { maskAdminEmail } from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import {
  adminWalletReservationStatusLabel,
  buildAdminWalletPurchaseReconciliationHref,
  buildWalletReservationPaymentDetailHref,
  formatAdminReservedWalletAmount,
  formatWalletReservationTotalUsd,
  isAdminWalletReconciliationLinkApplicable,
  isOpenWalletReservation,
  isSplitPaymentReservation,
  isStaleWalletReservation,
  sumReservedWalletCents,
  WALLET_RESERVATION_MONITOR_POLICY_BLURB,
  WALLET_RESERVATION_MONITOR_STALE_MS,
  WALLET_RESERVATION_MONITOR_TAKE,
  walletReservationAgeLabel,
  walletReservationPackageLabel,
} from "@/app/lib/admin/walletReservationMonitorShared";

export type WalletReservationMonitorRow = {
  purchaseId: string;
  customerLabel: string;
  customerHref: string | null;
  packageLabel: string;
  status: string;
  statusLabel: string;
  reservedAmountLabel: string;
  walletAppliedCents: number;
  ageLabel: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  stale: boolean;
  split: boolean;
  paymentDetailHref: string | null;
  reconciliationHref: string | null;
};

export type WalletReservationMonitorDashboard = {
  checkedAtLabel: string;
  staleMinutes: number;
  policyBlurb: string;
  openCount: number;
  totalReservedUsdLabel: string;
  staleCount: number;
  splitCount: number;
  truncated: boolean;
  rows: WalletReservationMonitorRow[];
};

function customerLabelFrom(user: {
  id: string;
  name: string | null;
  email: string | null;
} | null): string {
  if (!user) return "Not available";
  const name = (user.name ?? "").trim() || "Customer";
  return `${name} · ${maskAdminEmail(user.email)}`;
}

/**
 * Open wallet reservation inventory for Operations.
 * Call only after admin Operations access checks.
 */
export async function getWalletReservationMonitorDashboard(
  now: Date = new Date()
): Promise<WalletReservationMonitorDashboard> {
  const nowMs = now.getTime();
  const take = WALLET_RESERVATION_MONITOR_TAKE;

  const rows = await prisma.walletEsimPurchase.findMany({
    where: {
      refundTransactionId: null,
      walletAppliedCents: { gt: 0 },
      status: {
        in: [
          WalletEsimPurchaseStatus.FUNDS_RESERVED,
          WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
          WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
        ],
      },
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      status: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
      refundTransactionId: true,
      destinationName: true,
      destinationCode: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      createdAt: true,
      updatedAt: true,
      customer: {
        select: { id: true, name: true, email: true },
      },
      paymentAttempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  const openRows = rows.filter((row) =>
    isOpenWalletReservation({
      status: row.status,
      walletAppliedCents: row.walletAppliedCents,
      refundTransactionId: row.refundTransactionId,
    })
  );

  const mapped: WalletReservationMonitorRow[] = openRows.map((row) => {
    const attemptId = row.paymentAttempts[0]?.id ?? null;
    const status = row.status;
    const showRecon = isAdminWalletReconciliationLinkApplicable({
      purchaseStatus: status,
    });
    return {
      purchaseId: row.id,
      customerLabel: customerLabelFrom(row.customer),
      customerHref: row.customer?.id
        ? `/admin/customers/${encodeURIComponent(row.customer.id)}`
        : null,
      packageLabel: walletReservationPackageLabel(row),
      status,
      statusLabel: adminWalletReservationStatusLabel(status),
      reservedAmountLabel: formatAdminReservedWalletAmount(
        row.walletAppliedCents,
        { showCentsSecondary: false }
      ),
      walletAppliedCents: row.walletAppliedCents,
      ageLabel: walletReservationAgeLabel(row.updatedAt, nowMs),
      createdAtLabel: formatUtcTimestamp(row.createdAt),
      updatedAtLabel: formatUtcTimestamp(row.updatedAt),
      stale: isStaleWalletReservation({
        updatedAt: row.updatedAt,
        nowMs,
        staleMs: WALLET_RESERVATION_MONITOR_STALE_MS,
      }),
      split: isSplitPaymentReservation({
        status,
        walletAppliedCents: row.walletAppliedCents,
        gatewayAmountCents: row.gatewayAmountCents,
      }),
      paymentDetailHref: buildWalletReservationPaymentDetailHref(attemptId),
      reconciliationHref: showRecon
        ? buildAdminWalletPurchaseReconciliationHref(row.id)
        : null,
    };
  });

  const totalCents = sumReservedWalletCents(mapped);
  const staleCount = mapped.filter((r) => r.stale).length;
  const splitCount = mapped.filter((r) => r.split).length;

  return {
    checkedAtLabel: formatUtcTimestamp(now),
    staleMinutes: Math.round(WALLET_RESERVATION_MONITOR_STALE_MS / 60_000),
    policyBlurb: WALLET_RESERVATION_MONITOR_POLICY_BLURB,
    openCount: mapped.length,
    totalReservedUsdLabel: formatWalletReservationTotalUsd(totalCents),
    staleCount,
    splitCount,
    truncated: rows.length >= take,
    rows: mapped,
  };
}
