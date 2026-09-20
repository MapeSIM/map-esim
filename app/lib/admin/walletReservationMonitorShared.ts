/**
 * Pure wallet reservation monitor helpers (offline-QA safe).
 * Read-only classification/display — no Prisma, payments, or wallet mutations.
 */

import {
  adminWalletReservationStatusLabel,
  buildAdminWalletPurchaseReconciliationHref,
  formatAdminReservedWalletAmount,
  isAdminWalletReconciliationLinkApplicable,
} from "@/app/lib/admin/adminWalletReservationDisplay";
import { MONITORING_THRESHOLDS } from "@/app/lib/admin/monitoringAlertShared";
import { formatAgeMs } from "@/app/lib/admin/operationsHealthShared";
import { formatUsdCents } from "@/app/lib/wallet/display";

export const WALLET_RESERVATION_MONITOR_TAKE = 200;

export const WALLET_RESERVATION_MONITOR_STALE_MS =
  MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS;

export const WALLET_RESERVATION_MONITOR_POLICY_BLURB =
  "Read-only inventory of open wallet holds. Does not release reservations, refund, fund, or mark paid. Use Pending payment tools or Reconciliation for gated actions.";

/** Purchase statuses that can represent an open wallet reservation. */
export const WALLET_RESERVATION_MONITOR_STATUSES = [
  "FUNDS_RESERVED",
  "AWAITING_GATEWAY_PAYMENT",
  "RECONCILIATION_REQUIRED",
] as const;

export type WalletReservationMonitorStatus =
  (typeof WALLET_RESERVATION_MONITOR_STATUSES)[number];

export function isOpenWalletReservation(input: {
  status: string | null | undefined;
  walletAppliedCents: unknown;
  refundTransactionId?: string | null;
}): boolean {
  const status = String(input.status ?? "").trim();
  const cents = input.walletAppliedCents;
  if (
    typeof cents !== "number" ||
    !Number.isInteger(cents) ||
    !Number.isSafeInteger(cents) ||
    cents <= 0
  ) {
    return false;
  }
  if (String(input.refundTransactionId ?? "").trim()) {
    return false;
  }
  if (status === "FUNDS_RESERVED") return true;
  if (status === "AWAITING_GATEWAY_PAYMENT") return true;
  if (status === "RECONCILIATION_REQUIRED") return true;
  return false;
}

/** Split path: gateway remainder still owed while wallet portion is held. */
export function isSplitPaymentReservation(input: {
  status: string | null | undefined;
  walletAppliedCents: unknown;
  gatewayAmountCents?: unknown;
}): boolean {
  if (!isOpenWalletReservation(input)) return false;
  const status = String(input.status ?? "").trim();
  if (status !== "AWAITING_GATEWAY_PAYMENT") return false;
  const gateway = input.gatewayAmountCents;
  if (
    typeof gateway === "number" &&
    Number.isInteger(gateway) &&
    Number.isSafeInteger(gateway)
  ) {
    return gateway > 0;
  }
  // Status alone is enough when gateway cents are unavailable.
  return true;
}

export function isStaleWalletReservation(input: {
  updatedAt: Date | string | null | undefined;
  nowMs?: number;
  staleMs?: number;
}): boolean {
  if (!input.updatedAt) return false;
  const updatedAtMs =
    input.updatedAt instanceof Date
      ? input.updatedAt.getTime()
      : new Date(input.updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return false;
  const nowMs =
    typeof input.nowMs === "number" && Number.isFinite(input.nowMs)
      ? input.nowMs
      : Date.now();
  const staleMs =
    typeof input.staleMs === "number" && Number.isFinite(input.staleMs)
      ? input.staleMs
      : WALLET_RESERVATION_MONITOR_STALE_MS;
  return updatedAtMs <= nowMs - staleMs;
}

export function walletReservationAgeLabel(
  updatedAt: Date | string | null | undefined,
  nowMs: number = Date.now()
): string {
  if (!updatedAt) return "—";
  const updatedAtMs =
    updatedAt instanceof Date
      ? updatedAt.getTime()
      : new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return "—";
  return formatAgeMs(Math.max(0, nowMs - updatedAtMs));
}

export function walletReservationPackageLabel(row: {
  destinationName?: string | null;
  destinationCode?: string | null;
  planName?: string | null;
  dataAllowance?: string | null;
  validity?: string | null;
}): string {
  const dest =
    (row.destinationName ?? "").trim() ||
    (row.destinationCode ?? "").trim() ||
    "—";
  const plan = (row.planName ?? "").trim();
  const data = (row.dataAllowance ?? "").trim();
  const validity = (row.validity ?? "").trim();
  const packageBits = [plan, data, validity].filter(Boolean).join(" · ");
  return packageBits ? `${dest} — ${packageBits}` : dest;
}

export function sumReservedWalletCents(
  rows: Array<{ walletAppliedCents: unknown }>
): number {
  let total = 0;
  for (const row of rows) {
    const cents = row.walletAppliedCents;
    if (
      typeof cents === "number" &&
      Number.isInteger(cents) &&
      Number.isSafeInteger(cents) &&
      cents > 0
    ) {
      total += cents;
    }
  }
  return total;
}

export function formatWalletReservationTotalUsd(cents: unknown): string {
  if (
    typeof cents !== "number" ||
    !Number.isInteger(cents) ||
    !Number.isSafeInteger(cents) ||
    cents < 0
  ) {
    return formatUsdCents(0);
  }
  return formatUsdCents(cents);
}

export function buildWalletReservationPaymentDetailHref(
  attemptId: string | null | undefined
): string | null {
  const id = String(attemptId ?? "").trim();
  if (!id || id.length > 64) return null;
  return `/admin/payments/${encodeURIComponent(id)}`;
}

export {
  adminWalletReservationStatusLabel,
  buildAdminWalletPurchaseReconciliationHref,
  formatAdminReservedWalletAmount,
  isAdminWalletReconciliationLinkApplicable,
};
