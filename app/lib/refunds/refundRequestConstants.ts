/**
 * Pure customer refund-request constants (offline-safe QA).
 * Review transitions never move money. Execution credits MAP Wallet.
 */

export const REFUND_REQUEST_NOTE_MAX = 500;
/** Customer-facing alias for note max length (safe to import from client/UI). */
export const CUSTOMER_REFUND_NOTE_MAX = REFUND_REQUEST_NOTE_MAX;
export const REFUND_ADMIN_DECISION_NOTE_MAX = 1000;

/** Exact confirm phrase for customer MAP Wallet refund execution. */
export const REFUND_CUSTOMER_WALLET_PHRASE = "REFUND CUSTOMER WALLET";

export const CUSTOMER_REFUND_REQUEST_REFERENCE_TYPE = "CUSTOMER_REFUND_REQUEST";

export const REFUND_REQUEST_REASONS = [
  "TECHNICAL_ISSUE",
  "DUPLICATE_PAYMENT",
  "ESIM_NOT_RECEIVED",
  "WRONG_PLAN",
  "UNUSED_PLAN",
  "OTHER",
] as const;

export type RefundRequestReasonCode = (typeof REFUND_REQUEST_REASONS)[number];

export const REFUND_REQUEST_STATUSES = [
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED_PENDING_EXECUTION",
  "EXECUTION_FAILED",
  "REJECTED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type RefundRequestStatusCode = (typeof REFUND_REQUEST_STATUSES)[number];

/** Statuses that block a second customer request for the same order. */
export const REFUND_REQUEST_OPEN_STATUSES = [
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED_PENDING_EXECUTION",
  "EXECUTION_FAILED",
] as const;

/** Statuses from which admin may execute MAP Wallet credit. */
export const REFUND_REQUEST_EXECUTABLE_STATUSES = [
  "APPROVED_PENDING_EXECUTION",
  "EXECUTION_FAILED",
] as const;

export const REFUND_AUDIT = {
  CREATED: "refund.request_created",
  UNDER_REVIEW: "refund.request_under_review",
  APPROVED_PENDING: "refund.request_approved_pending_execution",
  REJECTED: "refund.request_rejected",
  ACTION_BLOCKED: "refund.request_action_blocked",
  EXECUTION_STARTED: "refund.request_execution_started",
  EXECUTION_FAILED: "refund.request_execution_failed",
  EXECUTION_BLOCKED: "refund.request_execution_blocked",
  WALLET_CREDITED: "refund.request_wallet_credited",
  REQUEST_COMPLETED: "refund.request_completed",
  REQUEST_SYNCED: "refund.request_synced_completed",
  EMAIL_RECEIVED: "refund.email_received",
  EMAIL_UNDER_REVIEW: "refund.email_under_review",
  EMAIL_APPROVED_PENDING: "refund.email_approved_pending_execution",
  EMAIL_REJECTED: "refund.email_rejected",
  EMAIL_COMPLETED: "refund.email_completed",
} as const;

/** Customer refund-status email events. */
export const REFUND_STATUS_EMAIL_EVENTS = [
  "received",
  "under_review",
  "approved_pending_execution",
  "rejected",
  "completed",
] as const;

export type RefundStatusEmailEvent =
  (typeof REFUND_STATUS_EMAIL_EVENTS)[number];

export function customerRefundRequestIdempotencyKey(requestId: string): string {
  return `customer_refund_req_${requestId.trim()}`.slice(0, 128);
}

export function refundReasonLabel(reason: string): string {
  switch (reason) {
    case "TECHNICAL_ISSUE":
      return "Technical issue";
    case "DUPLICATE_PAYMENT":
      return "Duplicate payment";
    case "ESIM_NOT_RECEIVED":
      return "eSIM not received";
    case "WRONG_PLAN":
      return "Wrong plan";
    case "UNUSED_PLAN":
      return "Unused plan";
    case "OTHER":
      return "Other";
    default:
      return "Unavailable";
  }
}

export function refundStatusLabel(status: string): string {
  switch (status) {
    case "REQUESTED":
      return "Requested";
    case "UNDER_REVIEW":
      return "Under review";
    case "APPROVED_PENDING_EXECUTION":
      return "Approved — pending execution";
    case "EXECUTION_FAILED":
      return "Execution failed — retry";
    case "REJECTED":
      return "Rejected";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Unavailable";
  }
}

export function parseRefundRequestReason(
  raw: unknown
): RefundRequestReasonCode | null {
  const value = String(raw ?? "").trim();
  return (REFUND_REQUEST_REASONS as readonly string[]).includes(value)
    ? (value as RefundRequestReasonCode)
    : null;
}

export function isOpenRefundStatus(status: string): boolean {
  return (REFUND_REQUEST_OPEN_STATUSES as readonly string[]).includes(status);
}

export function isExecutableRefundStatus(status: string): boolean {
  return (REFUND_REQUEST_EXECUTABLE_STATUSES as readonly string[]).includes(
    status
  );
}
