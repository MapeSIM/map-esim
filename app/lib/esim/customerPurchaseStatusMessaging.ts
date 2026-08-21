/**
 * Customer-facing processing vs review-needed copy.
 * Maps durable purchase status only — no payment or provider side effects.
 */

export const CUSTOMER_PURCHASE_PROCESSING_MESSAGE =
  "Your payment is confirmed. Your eSIM is being prepared. We'll notify you once it's ready.";

export const CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE =
  "Your payment is under review. Please do not make another purchase. We'll update you once the review is complete.";

export const CUSTOMER_PURCHASE_PROCESSING_TITLE =
  "Your eSIM is being prepared";

export const CUSTOMER_PURCHASE_REVIEW_NEEDED_TITLE =
  "Your purchase is under review";

export type CustomerPurchaseStatusMessagingKind =
  | "processing"
  | "review_needed";

export function resolveCustomerPurchaseStatusMessaging(
  status: string
): CustomerPurchaseStatusMessagingKind | null {
  const value = (status ?? "").trim();
  if (
    value === "FUNDED" ||
    value === "PROVIDER_PENDING" ||
    value === "FUNDS_RESERVED"
  ) {
    return "processing";
  }
  if (value === "RECONCILIATION_REQUIRED") return "review_needed";
  return null;
}

export function customerPurchaseStatusMessage(
  kind: CustomerPurchaseStatusMessagingKind
): { title: string; body: string } {
  if (kind === "processing") {
    return {
      title: CUSTOMER_PURCHASE_PROCESSING_TITLE,
      body: CUSTOMER_PURCHASE_PROCESSING_MESSAGE,
    };
  }
  return {
    title: CUSTOMER_PURCHASE_REVIEW_NEEDED_TITLE,
    body: CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE,
  };
}
