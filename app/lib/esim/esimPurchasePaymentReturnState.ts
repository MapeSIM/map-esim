/**
 * Pure return-page UX mapping from durable purchase/attempt statuses.
 * Browser query params (tracker/status) must never be passed here.
 */

export type EsimPaymentReturnKind =
  | "completed"
  | "verified"
  | "pending"
  | "not_completed"
  | "under_review";

const FAILED_ATTEMPT = new Set([
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
]);

export function resolveEsimPaymentReturnKind(input: {
  purchaseStatus: string;
  attemptStatus: string;
}): EsimPaymentReturnKind {
  const purchase = (input.purchaseStatus ?? "").trim();
  const attempt = (input.attemptStatus ?? "").trim();

  if (purchase === "COMPLETED") return "completed";
  if (purchase === "FUNDED" || purchase === "PROVIDER_PENDING") {
    return "verified";
  }
  if (
    purchase === "RECONCILIATION_REQUIRED" ||
    attempt === "RECONCILIATION_REQUIRED"
  ) {
    return "under_review";
  }
  if (purchase === "FAILED_REFUNDED") return "not_completed";
  if (FAILED_ATTEMPT.has(attempt)) return "not_completed";
  return "pending";
}

export function esimPurchasePaymentSuccessHref(purchaseId: string): string {
  return `/account/esim/buy/success?purchase=${encodeURIComponent(purchaseId)}`;
}

export function esimPurchasePaymentReviewHref(purchaseId: string): string {
  return `/account/esim/buy/review?purchase=${encodeURIComponent(purchaseId)}`;
}

export function esimPurchaseReviewNeededHref(purchaseId: string): string {
  return `/account/esim/buy/review-needed?purchase=${encodeURIComponent(purchaseId)}`;
}
