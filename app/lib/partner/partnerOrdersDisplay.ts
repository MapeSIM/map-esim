/**
 * Pure Partner order display helpers (safe for offline QA).
 * No Prisma, no secrets, no provider cost.
 */

import { PartnerEsimPurchaseStatus } from "@prisma/client";

export const PARTNER_ORDERS_PAGE_LIMIT = 100;

export type PartnerOrderStatusBadge =
  | "Completed"
  | "Processing"
  | "Under review"
  | "Failed — balance returned";

export type PartnerAttentionKind =
  | "provider_pending"
  | "reconciliation_required"
  | "failed_refunded";

export function shortPartnerOrderReference(orderId: string): string {
  const id = (orderId ?? "").trim();
  if (!id) return "—";
  if (id.length <= 8) return "••••";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function shortPartnerPurchaseReference(purchaseId: string): string {
  return shortPartnerOrderReference(purchaseId);
}

export function displayOrUnavailable(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : "Not available";
}

export function formatPartnerOrderDate(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

export function partnerOrderStatusFromPurchase(
  status: PartnerEsimPurchaseStatus
): PartnerOrderStatusBadge {
  switch (status) {
    case PartnerEsimPurchaseStatus.COMPLETED:
      return "Completed";
    case PartnerEsimPurchaseStatus.PROVIDER_PENDING:
    case PartnerEsimPurchaseStatus.FUNDS_RESERVED:
    case PartnerEsimPurchaseStatus.READY:
    case PartnerEsimPurchaseStatus.DRAFT:
      return "Processing";
    case PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED:
      return "Under review";
    case PartnerEsimPurchaseStatus.FAILED_REFUNDED:
      return "Failed — balance returned";
    default:
      return "Processing";
  }
}

export function partnerAttentionKindFromStatus(
  status: PartnerEsimPurchaseStatus
): PartnerAttentionKind | null {
  if (status === PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
    return "provider_pending";
  }
  if (status === PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED) {
    return "reconciliation_required";
  }
  if (status === PartnerEsimPurchaseStatus.FAILED_REFUNDED) {
    return "failed_refunded";
  }
  return null;
}

export function partnerAttentionTitle(kind: PartnerAttentionKind): string {
  switch (kind) {
    case "provider_pending":
      return "Purchase in progress";
    case "reconciliation_required":
      return "Under review";
    case "failed_refunded":
      return "Purchase failed — balance returned";
  }
}

export function partnerAttentionMessage(kind: PartnerAttentionKind): string {
  switch (kind) {
    case "provider_pending":
      return "This purchase is still processing with the provider. Do not buy the same plan again until it completes.";
    case "reconciliation_required":
      return "This purchase is under review by MAP eSIM. Do not retry or buy this plan again until MAP eSIM confirms the result.";
    case "failed_refunded":
      return "The purchase could not be completed. The exact amount charged has been returned to your Partner balance.";
  }
}

/** Keys that must never appear on Partner order list/detail DTOs. */
export const PARTNER_ORDER_FORBIDDEN_KEYS = [
  "providerCostCents",
  "providerCost",
  "discountBps",
  "discountVersion",
  "providerResultKind",
  "safeProviderStatusCode",
  "providerOrderId",
  "iccidEncrypted",
  "iccidHash",
  "reconciliationResolutionReason",
  "reconciliationLockReason",
  "failureCategory",
  "failureCode",
] as const;

export function assertNoPartnerOrderForbiddenKeys(
  value: unknown,
  path = "root"
): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      assertNoPartnerOrderForbiddenKeys(item, `${path}[${i}]`)
    );
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      (PARTNER_ORDER_FORBIDDEN_KEYS as readonly string[]).includes(key)
    ) {
      throw new Error(`Forbidden Partner order field at ${path}.${key}`);
    }
    assertNoPartnerOrderForbiddenKeys(child, `${path}.${key}`);
  }
}
