/**
 * Pure eligibility helpers for admin void / release of unprovisioned Partner eSIM holds.
 * Offline-QA safe — no Prisma / no balance writes.
 */

/** Purchase statuses an admin may release when eSIM was never provisioned. */
export const ADMIN_VOIDABLE_PARTNER_PURCHASE_STATUSES = [
  "FUNDS_RESERVED",
  "PROVIDER_PENDING",
  "RECONCILIATION_REQUIRED",
  "AWAITING_GATEWAY_PAYMENT",
] as const;

export type AdminVoidablePartnerPurchaseStatus =
  (typeof ADMIN_VOIDABLE_PARTNER_PURCHASE_STATUSES)[number];

function isVoidablePartnerPurchaseStatus(
  status: string | null | undefined
): status is AdminVoidablePartnerPurchaseStatus {
  const value = String(status ?? "").trim();
  return (ADMIN_VOIDABLE_PARTNER_PURCHASE_STATUSES as readonly string[]).includes(
    value
  );
}

/**
 * True when a Partner eSIM purchase may be admin-voided / wallet restored.
 * Never true when an Order exists, provider success evidence is present, or
 * funds were already refunded. Split/gateway-funded rows with provider refs
 * must use reconciliation case tools instead.
 */
export function isAdminVoidablePartnerPurchase(row: {
  status: string | null | undefined;
  orderId: string | null | undefined;
  providerOrderId: string | null | undefined;
  providerResultKind: string | null | undefined;
  debitTransactionId: string | null | undefined;
  refundTransactionId: string | null | undefined;
  walletAppliedCents: number | null | undefined;
  gatewayAmountCents?: number | null | undefined;
}): boolean {
  if (!isVoidablePartnerPurchaseStatus(row.status)) return false;
  if (String(row.orderId ?? "").trim()) return false;
  if (String(row.providerOrderId ?? "").trim()) return false;
  if (String(row.providerResultKind ?? "").trim() === "success") return false;
  if (String(row.refundTransactionId ?? "").trim()) return false;
  if (!String(row.debitTransactionId ?? "").trim()) return false;
  const wallet = row.walletAppliedCents;
  if (
    typeof wallet !== "number" ||
    !Number.isInteger(wallet) ||
    !Number.isSafeInteger(wallet) ||
    wallet <= 0
  ) {
    return false;
  }
  const status = String(row.status ?? "").trim();
  const gateway =
    typeof row.gatewayAmountCents === "number" &&
    Number.isInteger(row.gatewayAmountCents)
      ? row.gatewayAmountCents
      : 0;
  // PROVIDER_PENDING / RECON: only full-wallet (no gateway remainder).
  if (
    (status === "PROVIDER_PENDING" || status === "RECONCILIATION_REQUIRED") &&
    gateway !== 0
  ) {
    return false;
  }
  return true;
}

/** Stuck partner purchases that should deep-link to reconciliation case tools. */
export function partnerPurchaseNeedsReconciliationCase(status: string | null | undefined): boolean {
  const value = String(status ?? "").trim();
  return (
    value === "RECONCILIATION_REQUIRED" || value === "PROVIDER_PENDING"
  );
}

export function partnerPurchaseReconciliationHref(purchaseId: string): string {
  const id = String(purchaseId ?? "").trim();
  return `/admin/reconciliation/partner_purchase/${encodeURIComponent(id)}`;
}
