/**
 * Customer-facing processing vs review-needed copy.
 * Maps durable purchase status only — no payment or provider side effects.
 */

import {
  esimPurchasePaymentReviewHref,
  esimPurchaseReviewNeededHref,
} from "@/app/lib/esim/esimPurchasePaymentReturnState";

export const CUSTOMER_PURCHASE_PROCESSING_MESSAGE =
  "Your payment is confirmed. Your eSIM is being prepared. We'll notify you once it's ready.";

export const CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE =
  "Your payment is under review. Please do not make another purchase. We'll update you once the review is complete.";

export const CUSTOMER_PURCHASE_PROCESSING_TITLE =
  "Your eSIM is being prepared";

export const CUSTOMER_PURCHASE_REVIEW_NEEDED_TITLE =
  "Your purchase is under review";

export const CUSTOMER_PURCHASE_CHECKOUT_MESSAGE =
  "Continue checkout to finish this purchase.";

export const CUSTOMER_PURCHASE_PAYMENT_PENDING_MESSAGE =
  "Your payment is not completed. Continue checkout to finish paying.";

/** Display-only age for stale checkout copy. Does not expire attempts or release funds. */
export const CUSTOMER_STALE_CHECKOUT_DISPLAY_MS = 30 * 60 * 1000;

export const CUSTOMER_STALE_CHECKOUT_MESSAGE =
  "This checkout may no longer be active. You can continue checkout or start again.";

/** Review deep-link (abandoned email CTA) — display only. */
export const CUSTOMER_ABANDONED_REVIEW_STALE_TITLE =
  "This checkout may be outdated";

export const CUSTOMER_ABANDONED_REVIEW_OUTDATED_TITLE =
  "This checkout link is outdated";

export const CUSTOMER_ABANDONED_REVIEW_OUTDATED_MESSAGE =
  "This unfinished checkout is too old to rely on. Starting a new purchase is recommended. You can still continue below if you prefer.";

export const CUSTOMER_ABANDONED_REVIEW_PAYMENT_ENDED_TITLE =
  "Payment was not completed";

export const CUSTOMER_ABANDONED_REVIEW_PAYMENT_ENDED_MESSAGE =
  "The previous payment attempt expired or was cancelled. No eSIM was created. You can continue checkout below or start a new purchase.";

export const CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL =
  "Start a new purchase";

export const CUSTOMER_ABANDONED_REVIEW_CONTINUE_LABEL =
  "Continue this checkout";

/** Customer UI only. Does not delete rows or change purchase status. */
export const CUSTOMER_PENDING_PURCHASES_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export const CUSTOMER_PENDING_PURCHASE_STATUSES = [
  "READY",
  "AWAITING_GATEWAY_PAYMENT",
  "FUNDS_RESERVED",
  "FUNDED",
  "PROVIDER_PENDING",
  "RECONCILIATION_REQUIRED",
] as const;

export type CustomerPendingPurchaseStatus =
  (typeof CUSTOMER_PENDING_PURCHASE_STATUSES)[number];

export type CustomerPurchaseStatusMessagingKind =
  | "processing"
  | "review_needed";

export type CustomerPendingPurchaseAction =
  | "continue_checkout"
  | "view_status";

export type CustomerPendingPurchaseVisibility = {
  action: CustomerPendingPurchaseAction;
  statusLabel: string;
  ctaLabel: string;
  title: string;
  body: string;
};

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

export function resolveCustomerPendingPurchaseVisibility(
  status: string
): CustomerPendingPurchaseVisibility | null {
  const value = (status ?? "").trim();
  if (value === "READY") {
    return {
      action: "continue_checkout",
      statusLabel: "Checkout",
      ctaLabel: "Continue checkout",
      title: "Checkout not finished",
      body: CUSTOMER_PURCHASE_CHECKOUT_MESSAGE,
    };
  }
  if (value === "AWAITING_GATEWAY_PAYMENT") {
    return {
      action: "continue_checkout",
      statusLabel: "Payment pending",
      ctaLabel: "Continue checkout",
      title: "Payment not completed",
      body: CUSTOMER_PURCHASE_PAYMENT_PENDING_MESSAGE,
    };
  }
  const kind = resolveCustomerPurchaseStatusMessaging(value);
  if (!kind) return null;
  const copy = customerPurchaseStatusMessage(kind);
  if (kind === "processing") {
    return {
      action: "view_status",
      statusLabel: "Preparing eSIM",
      ctaLabel: "View status",
      title: copy.title,
      body: copy.body,
    };
  }
  return {
    action: "view_status",
    statusLabel: "Under review",
    ctaLabel: "View status",
    title: copy.title,
    body: copy.body,
  };
}

export function customerPendingPurchaseHref(
  status: string,
  purchaseId: string
): string | null {
  const vis = resolveCustomerPendingPurchaseVisibility(status);
  const id = (purchaseId ?? "").trim();
  if (!vis || !id || id.length > 64) return null;
  if (vis.action === "continue_checkout") {
    return esimPurchasePaymentReviewHref(id);
  }
  return esimPurchaseReviewNeededHref(id);
}

export function isCustomerStaleCheckoutDisplay(input: {
  status: string;
  updatedAt: Date | string | number;
  now?: Date | number;
}): boolean {
  const vis = resolveCustomerPendingPurchaseVisibility(input.status);
  if (vis?.action !== "continue_checkout") return false;
  const updatedMs =
    input.updatedAt instanceof Date
      ? input.updatedAt.getTime()
      : typeof input.updatedAt === "number"
        ? input.updatedAt
        : Date.parse(String(input.updatedAt));
  if (!Number.isFinite(updatedMs)) return false;
  const nowMs =
    input.now instanceof Date
      ? input.now.getTime()
      : typeof input.now === "number"
        ? input.now
        : Date.now();
  if (!Number.isFinite(nowMs)) return false;
  return nowMs - updatedMs >= CUSTOMER_STALE_CHECKOUT_DISPLAY_MS;
}

export function isCustomerPendingPurchaseVisibleInUi(input: {
  updatedAt: Date | string | number;
  now?: Date | number;
}): boolean {
  const updatedMs =
    input.updatedAt instanceof Date
      ? input.updatedAt.getTime()
      : typeof input.updatedAt === "number"
        ? input.updatedAt
        : Date.parse(String(input.updatedAt));
  if (!Number.isFinite(updatedMs)) return false;
  const nowMs =
    input.now instanceof Date
      ? input.now.getTime()
      : typeof input.now === "number"
        ? input.now
        : Date.now();
  if (!Number.isFinite(nowMs)) return false;
  return nowMs - updatedMs <= CUSTOMER_PENDING_PURCHASES_MAX_AGE_MS;
}

export type AbandonedCheckoutReviewGuidanceKind =
  | "payment_not_completed"
  | "outdated"
  | "stale";

export type AbandonedCheckoutReviewGuidance = {
  kind: AbandonedCheckoutReviewGuidanceKind;
  title: string;
  body: string;
  startNewPurchaseLabel: string;
  continueLabel: string;
};

/**
 * Display-only guidance for abandoned-checkout review deep links.
 * Does not change purchase status, funding, or auth.
 * Fresh READY / in-flight AWAITING (with pending attempt) → null.
 */
export function resolveAbandonedCheckoutReviewGuidance(input: {
  status: string;
  updatedAt: Date | string | number;
  pendingGatewayAttemptId?: string | null;
  now?: Date | number;
}): AbandonedCheckoutReviewGuidance | null {
  const status = (input.status ?? "").trim();
  if (status !== "READY" && status !== "AWAITING_GATEWAY_PAYMENT") {
    return null;
  }

  const pendingId = (input.pendingGatewayAttemptId ?? "").trim();
  if (status === "AWAITING_GATEWAY_PAYMENT" && !pendingId) {
    return {
      kind: "payment_not_completed",
      title: CUSTOMER_ABANDONED_REVIEW_PAYMENT_ENDED_TITLE,
      body: CUSTOMER_ABANDONED_REVIEW_PAYMENT_ENDED_MESSAGE,
      startNewPurchaseLabel: CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL,
      continueLabel: CUSTOMER_ABANDONED_REVIEW_CONTINUE_LABEL,
    };
  }

  if (
    !isCustomerPendingPurchaseVisibleInUi({
      updatedAt: input.updatedAt,
      now: input.now,
    })
  ) {
    return {
      kind: "outdated",
      title: CUSTOMER_ABANDONED_REVIEW_OUTDATED_TITLE,
      body: CUSTOMER_ABANDONED_REVIEW_OUTDATED_MESSAGE,
      startNewPurchaseLabel: CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL,
      continueLabel: CUSTOMER_ABANDONED_REVIEW_CONTINUE_LABEL,
    };
  }

  if (
    isCustomerStaleCheckoutDisplay({
      status,
      updatedAt: input.updatedAt,
      now: input.now,
    })
  ) {
    return {
      kind: "stale",
      title: CUSTOMER_ABANDONED_REVIEW_STALE_TITLE,
      body: CUSTOMER_STALE_CHECKOUT_MESSAGE,
      startNewPurchaseLabel: CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL,
      continueLabel: CUSTOMER_ABANDONED_REVIEW_CONTINUE_LABEL,
    };
  }

  return null;
}
