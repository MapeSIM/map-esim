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
} as const;

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
