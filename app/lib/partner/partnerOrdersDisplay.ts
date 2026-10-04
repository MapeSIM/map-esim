/**
 * Pure Partner order display helpers (safe for offline QA).
 * No Prisma, no secrets, no provider cost.
 */

import { PartnerEsimPurchaseStatus } from "@prisma/client";

export const PARTNER_ORDERS_PAGE_LIMIT = 20;

export function parsePartnerOrdersPage(
  raw: string | null | undefined
): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 500);
}

/** Completed Partner eSIM with install credentials, no activation evidence. */
export const PARTNER_ESIM_READY_LABEL = "Ready to install";

export type PartnerOrderStatusBadge =
  | "Completed"
  | "Processing"
  | "Under review"
  | "Refunded"
  /** Completed purchase whose VeSIM line cache reports EXPIRED. */
  | "eSIM Expired"
  /** @deprecated Prefer "Refunded"; kept for older UI/QA string matches. */
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
  status: PartnerEsimPurchaseStatus,
  options?: {
    hasCompletedRefund?: boolean;
    /** Cached VeSIM line state (e.g. EXPIRED) — never invents expiry from validity. */
    providerLifecycleStatus?: string | null;
  }
): PartnerOrderStatusBadge {
  if (
    options?.hasCompletedRefund === true ||
    status === PartnerEsimPurchaseStatus.FAILED_REFUNDED
  ) {
    return "Refunded";
  }
  let badge: PartnerOrderStatusBadge;
  switch (status) {
    case PartnerEsimPurchaseStatus.COMPLETED:
      badge = "Completed";
      break;
    case PartnerEsimPurchaseStatus.PROVIDER_PENDING:
    case PartnerEsimPurchaseStatus.FUNDS_RESERVED:
    case PartnerEsimPurchaseStatus.READY:
    case PartnerEsimPurchaseStatus.DRAFT:
      badge = "Processing";
      break;
    case PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED:
      badge = "Under review";
      break;
    default:
      badge = "Processing";
      break;
  }

  const lifecycle = (options?.providerLifecycleStatus ?? "")
    .trim()
    .toUpperCase();
  if (badge === "Completed" && lifecycle === "EXPIRED") {
    return "eSIM Expired";
  }
  return badge;
}

export function partnerOrderIsRefunded(
  badge: PartnerOrderStatusBadge
): boolean {
  return badge === "Refunded" || badge === "Failed — balance returned";
}

export function partnerOrderIsExpired(
  badge: PartnerOrderStatusBadge
): boolean {
  return badge === "eSIM Expired";
}

/** Install QR only for non-expired completed purchases. */
export function partnerOrderInstallAllowed(
  badge: PartnerOrderStatusBadge
): boolean {
  return badge === "Completed";
}

/** Usage / top-up surfaces for completed or expired (non-refunded) lines. */
export function partnerOrderLineReady(
  badge: PartnerOrderStatusBadge
): boolean {
  return badge === "Completed" || badge === "eSIM Expired";
}

export function partnerOrderStatusHelp(
  badge: PartnerOrderStatusBadge
): string {
  if (badge === "eSIM Expired") {
    return "This eSIM package has expired. Top up or purchase a new plan to continue using data.";
  }
  return "";
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
