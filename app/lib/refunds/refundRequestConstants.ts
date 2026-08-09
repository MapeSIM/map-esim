/**
 * Pure refund-request constants (offline-safe QA).
 * No money movement in this foundation phase.
 */

export const REFUND_REQUEST_NOTE_MAX = 500;
/** Customer-facing alias for note max length (safe to import from client/UI). */
export const CUSTOMER_REFUND_NOTE_MAX = REFUND_REQUEST_NOTE_MAX;
export const REFUND_ADMIN_DECISION_NOTE_MAX = 1000;

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
] as const;

export const REFUND_AUDIT = {
  CREATED: "refund.request_created",
  UNDER_REVIEW: "refund.request_under_review",
  APPROVED_PENDING: "refund.request_approved_pending_execution",
  REJECTED: "refund.request_rejected",
  ACTION_BLOCKED: "refund.request_action_blocked",
  EMAIL_RECEIVED: "refund.email_received",
  EMAIL_APPROVED_PENDING: "refund.email_approved_pending_execution",
  EMAIL_REJECTED: "refund.email_rejected",
} as const;

/** Customer refund-status email events (no COMPLETED in this phase). */
export const REFUND_STATUS_EMAIL_EVENTS = [
  "received",
  "approved_pending_execution",
  "rejected",
] as const;

export type RefundStatusEmailEvent =
  (typeof REFUND_STATUS_EMAIL_EVENTS)[number];

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
