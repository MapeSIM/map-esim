/**
 * Pure eligibility helpers for admin void of stuck pending wallet eSIM reserves.
 * Offline-QA safe - no Prisma / no balance writes.
 */

export const ADMIN_VOID_WALLET_PURCHASE_DEBIT_REF = "WALLET_ESIM_PURCHASE";

/** Purchase statuses that refundReservedFundsInTx(restoreReady) may release. */
export const ADMIN_VOIDABLE_PURCHASE_STATUSES = [
  "FUNDS_RESERVED",
  "PROVIDER_PENDING",
  "AWAITING_GATEWAY_PAYMENT",
] as const;

export type AdminVoidablePurchaseStatus =
  (typeof ADMIN_VOIDABLE_PURCHASE_STATUSES)[number];

function isVoidablePurchaseStatus(
  status: string | null | undefined
): status is AdminVoidablePurchaseStatus {
  const value = String(status ?? "").trim();
  return (ADMIN_VOIDABLE_PURCHASE_STATUSES as readonly string[]).includes(
    value
  );
}

/**
 * True when a pending PURCHASE_DEBIT may be admin-voided / balance restored.
 * Never true when already REVERSED/COMPLETED, an Order exists, or provider
 * success evidence is present. Released rows must not show Void / Cancel.
 */
export function isAdminVoidablePendingWalletDebit(row: {
  type: string;
  status: string;
  referenceType: string | null | undefined;
  purchaseStatus: string | null | undefined;
  orderId: string | null | undefined;
  providerOrderId: string | null | undefined;
  providerResultKind: string | null | undefined;
}): boolean {
  if (String(row.type ?? "").trim() !== "PURCHASE_DEBIT") return false;
  // Released / captured rows never show Void / Cancel.
  if (String(row.status ?? "").trim() !== "PENDING") return false;
  if (
    String(row.referenceType ?? "").trim() !==
    ADMIN_VOID_WALLET_PURCHASE_DEBIT_REF
  ) {
    return false;
  }
  if (String(row.orderId ?? "").trim()) return false;
  if (String(row.providerOrderId ?? "").trim()) return false;
  if (String(row.providerResultKind ?? "").trim() === "success") return false;
  return isVoidablePurchaseStatus(row.purchaseStatus);
}
