/**
 * Pure Admin Email Center helpers (offline-QA safe).
 * No Prisma, no SMTP, no payment/refund mutations.
 */

export const EMAIL_CENTER_PAGE_LIMIT = 80;

export const EMAIL_CENTER_TABS = ["all", "failed"] as const;
export type EmailCenterTab = (typeof EMAIL_CENTER_TABS)[number];

/** Known outgoing-email audit actions (status lives in metadata.deliveryStatus). */
export const EMAIL_CENTER_AUDIT_ACTIONS = [
  "refund.email_received",
  "refund.email_under_review",
  "refund.email_approved_pending_execution",
  "refund.email_rejected",
  "refund.email_completed",
  "refund.vesim_review_email_sending",
  "refund.vesim_review_email_sent",
  "refund.vesim_review_email_failed",
  "partner_refund.email_received",
  "partner_refund.email_under_review",
  "partner_refund.email_approved_pending_execution",
  "partner_refund.email_rejected",
  "partner_refund.email_completed",
  "wallet.transaction_email_sent",
  "wallet.transaction_email_failed",
  "esim.payment_failure_email_sent",
  "esim.payment_received_pending_email_sent",
  "esim.recon_required_email_sent",
  "esim.wallet_delivery_email_failed",
  "esim.wallet_delivery_email_uncertain",
  "partner.recon_required_email_sent",
  "reconciliation.email_resent",
] as const;

export type EmailCenterRetryKind =
  | "refund_status"
  | "partner_refund_status"
  | "wallet_transaction"
  | "recon_required"
  | "partner_recon_required"
  | "payment_received_pending"
  | "payment_failure"
  | "order_install_purchase"
  | "order_install_assignment";

export type EmailCenterKind =
  | "refund_status"
  | "partner_refund_status"
  | "vesim_review"
  | "wallet_transaction"
  | "payment_failure"
  | "payment_received_pending"
  | "recon_required"
  | "partner_recon_required"
  | "order_install"
  | "reconciliation_resend"
  | "other";

const FAILED_DELIVERY = new Set([
  "failed",
  "not_configured",
  "invalid_email",
]);

export function parseEmailCenterTab(
  raw: string | null | undefined
): EmailCenterTab {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "failed" ? "failed" : "all";
}

export function emailCenterTabHref(tab: EmailCenterTab): string {
  return tab === "failed" ? "/admin/emails?tab=failed" : "/admin/emails";
}

export function isFailedEmailDeliveryStatus(
  status: string | null | undefined
): boolean {
  return FAILED_DELIVERY.has((status ?? "").trim().toLowerCase());
}

export function normalizeDeliveryStatus(
  status: string | null | undefined,
  action?: string | null
): string {
  const raw = (status ?? "").trim().toLowerCase();
  if (raw) return raw;
  const act = (action ?? "").trim().toLowerCase();
  if (act.endsWith("_email_failed") || act.endsWith("email_failed")) {
    return "failed";
  }
  if (act.endsWith("_email_sent") || act.endsWith("email_sent")) {
    return "sent";
  }
  if (act.endsWith("_email_uncertain") || act.includes("uncertain")) {
    return "uncertain";
  }
  if (act.endsWith("_email_sending") || act.includes("sending")) {
    return "sending";
  }
  return "unknown";
}

export function deliveryStatusLabel(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "sent":
    case "already_sent":
      return "Sent";
    case "sending":
      return "Sending";
    case "failed":
      return "Failed";
    case "not_configured":
      return "Not configured";
    case "invalid_email":
      return "Invalid recipient";
    case "skipped":
      return "Skipped";
    case "uncertain":
      return "Uncertain";
    default:
      return status.trim() || "Unknown";
  }
}

export function emailCenterKindFromAction(action: string): EmailCenterKind {
  const a = action.trim().toLowerCase();
  if (a.startsWith("refund.vesim_review_email")) return "vesim_review";
  if (a.startsWith("refund.email_")) return "refund_status";
  if (a.startsWith("partner_refund.email_")) return "partner_refund_status";
  if (a.startsWith("wallet.transaction_email")) return "wallet_transaction";
  if (a === "esim.payment_failure_email_sent") return "payment_failure";
  if (a === "esim.payment_received_pending_email_sent") {
    return "payment_received_pending";
  }
  if (a === "esim.recon_required_email_sent") return "recon_required";
  if (a === "partner.recon_required_email_sent") return "partner_recon_required";
  if (
    a === "esim.wallet_delivery_email_failed" ||
    a === "esim.wallet_delivery_email_uncertain"
  ) {
    return "order_install";
  }
  if (a === "reconciliation.email_resent") return "reconciliation_resend";
  return "other";
}

export function emailCenterKindLabel(kind: EmailCenterKind): string {
  switch (kind) {
    case "refund_status":
      return "Customer refund status";
    case "partner_refund_status":
      return "Partner refund status";
    case "vesim_review":
      return "VeSIM refund review";
    case "wallet_transaction":
      return "Wallet balance change";
    case "payment_failure":
      return "Payment failure notice";
    case "payment_received_pending":
      return "Payment received (pending eSIM)";
    case "recon_required":
      return "Order under review";
    case "partner_recon_required":
      return "Partner order under review";
    case "order_install":
      return "eSIM install / QR";
    case "reconciliation_resend":
      return "Reconciliation resend";
    default:
      return "Email";
  }
}

export function sanitizeFailureReason(
  value: string | null | undefined
): string | null {
  const t = (value ?? "").trim();
  if (!t) return null;
  // Never surface raw SMTP payloads or oversized blobs.
  return t.slice(0, 120);
}

export function isRefundStatusEmailEvent(
  value: string | null | undefined
): value is
  | "received"
  | "under_review"
  | "approved_pending_execution"
  | "rejected"
  | "completed" {
  switch ((value ?? "").trim()) {
    case "received":
    case "under_review":
    case "approved_pending_execution":
    case "rejected":
    case "completed":
      return true;
    default:
      return false;
  }
}
