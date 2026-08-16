/**
 * Pure Partner refund-request constants (offline-safe QA).
 * Slice 1 creates REQUESTED rows only — no money movement.
 */

export const PARTNER_REFUND_NOTE_MAX = 500;

export const PARTNER_REFUND_REQUEST_REASONS = [
  "ESIM_NOT_RECEIVED",
  "INSTALL_DETAILS_UNAVAILABLE",
  "PROVIDER_OR_ORDER_ISSUE",
  "OTHER",
] as const;

export type PartnerRefundRequestReasonCode =
  (typeof PARTNER_REFUND_REQUEST_REASONS)[number];

/** Statuses that block a second Partner request for the same purchase. */
export const PARTNER_REFUND_REQUEST_OPEN_STATUSES = [
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED_PENDING_EXECUTION",
] as const;

export const PARTNER_REFUND_AUDIT = {
  CREATED: "partner_refund.request_created",
  REVIEW_STARTED: "partner_refund.review_started",
  APPROVED_PENDING: "partner_refund.approved_pending_execution",
  REJECTED: "partner_refund.rejected",
  EXECUTION_STARTED: "partner_refund.execution_started",
  EXECUTION_BLOCKED: "partner_refund.execution_blocked",
  WALLET_REFUNDED: "partner_refund.wallet_refunded",
  REQUEST_COMPLETED: "partner_refund.request_completed",
} as const;

/** Partner-facing status copy (Admin queue may use the shared refund labels). */
export function partnerRefundStatusLabel(status: string): string {
  switch (status) {
    case "REQUESTED":
      return "Refund requested";
    case "UNDER_REVIEW":
      return "Under review";
    case "APPROVED_PENDING_EXECUTION":
      return "Approved — refund pending";
    case "REJECTED":
      return "Refund request rejected";
    case "COMPLETED":
      return "Refund completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Unavailable";
  }
}

export function partnerRefundReasonLabel(reason: string): string {
  switch (reason) {
    case "ESIM_NOT_RECEIVED":
      return "eSIM not received";
    case "INSTALL_DETAILS_UNAVAILABLE":
      return "Installation details unavailable";
    case "PROVIDER_OR_ORDER_ISSUE":
      return "Provider/order issue";
    case "OTHER":
      return "Other";
    default:
      return "Unavailable";
  }
}

export function parsePartnerRefundRequestReason(
  raw: unknown
): PartnerRefundRequestReasonCode | null {
  const value = String(raw ?? "").trim();
  return (PARTNER_REFUND_REQUEST_REASONS as readonly string[]).includes(value)
    ? (value as PartnerRefundRequestReasonCode)
    : null;
}

export function isOpenPartnerRefundStatus(status: string): boolean {
  return (PARTNER_REFUND_REQUEST_OPEN_STATUSES as readonly string[]).includes(
    status
  );
}

export function sanitizePartnerRefundNote(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
