/**
 * Pure Admin Email Center helpers (offline-QA safe).
 * No Prisma, no SMTP, no payment/refund mutations.
 */

export const EMAIL_CENTER_PAGE_LIMIT = 80;

export const EMAIL_CENTER_TABS = ["all", "failed"] as const;
export type EmailCenterTab = (typeof EMAIL_CENTER_TABS)[number];

/** UX category filters — display/filter only; does not change delivery. */
export const EMAIL_CENTER_CATEGORIES = [
  "all",
  "orders",
  "payments",
  "refunds",
  "wallet",
  "other",
] as const;
export type EmailCenterCategory = (typeof EMAIL_CENTER_CATEGORIES)[number];

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

export type EmailCenterStatusBucket = "sent" | "failed" | "pending";

export type EmailCenterSummary = {
  sent: number;
  failed: number;
  pending: number;
};

const FAILED_DELIVERY = new Set([
  "failed",
  "not_configured",
  "invalid_email",
]);

const SENT_DELIVERY = new Set(["sent", "already_sent", "skipped"]);

export const EMAIL_CENTER_RESEND_BUTTON_LABEL = "Try sending again";
export const EMAIL_CENTER_RESEND_PENDING_LABEL = "Sending again…";
export const EMAIL_CENTER_RESEND_SAFE_HINT =
  "Safe retry only: uses the same email helper. It does not move money or change payment, refund, or wallet status.";

export function parseEmailCenterTab(
  raw: string | null | undefined
): EmailCenterTab {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "failed" ? "failed" : "all";
}

export function parseEmailCenterCategory(
  raw: string | null | undefined
): EmailCenterCategory {
  const v = (raw ?? "").trim().toLowerCase();
  if (
    v === "orders" ||
    v === "payments" ||
    v === "refunds" ||
    v === "wallet" ||
    v === "other"
  ) {
    return v;
  }
  return "all";
}

export function emailCenterCategoryLabel(
  category: EmailCenterCategory
): string {
  switch (category) {
    case "orders":
      return "Orders / install";
    case "payments":
      return "Payments";
    case "refunds":
      return "Refunds";
    case "wallet":
      return "Wallet";
    case "other":
      return "Other";
    default:
      return "All categories";
  }
}

export function emailCenterCategoryForKind(
  kind: EmailCenterKind
): Exclude<EmailCenterCategory, "all"> {
  switch (kind) {
    case "order_install":
    case "recon_required":
    case "partner_recon_required":
    case "reconciliation_resend":
      return "orders";
    case "payment_failure":
    case "payment_received_pending":
      return "payments";
    case "refund_status":
    case "partner_refund_status":
    case "vesim_review":
      return "refunds";
    case "wallet_transaction":
      return "wallet";
    default:
      return "other";
  }
}

export function normalizeEmailCenterSearchQuery(
  raw: string | null | undefined
): string {
  return (raw ?? "").trim().slice(0, 100);
}

export function emailCenterTabHref(tab: EmailCenterTab): string {
  return buildAdminEmailCenterHref({ tab });
}

export function buildAdminEmailCenterHref(options: {
  tab?: EmailCenterTab | string | null;
  category?: EmailCenterCategory | string | null;
  q?: string | null;
}): string {
  const params = new URLSearchParams();
  const tab = parseEmailCenterTab(options.tab);
  const category = parseEmailCenterCategory(options.category);
  const q = normalizeEmailCenterSearchQuery(options.q);
  if (tab === "failed") params.set("tab", "failed");
  if (category !== "all") params.set("category", category);
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `/admin/emails?${qs}` : "/admin/emails";
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

export function emailCenterStatusBucket(
  status: string | null | undefined
): EmailCenterStatusBucket {
  const normalized = normalizeDeliveryStatus(status);
  if (isFailedEmailDeliveryStatus(normalized)) return "failed";
  if (SENT_DELIVERY.has(normalized)) return "sent";
  return "pending";
}

export function summarizeEmailCenterRows(
  rows: Array<{ deliveryStatus: string }>
): EmailCenterSummary {
  let sent = 0;
  let failed = 0;
  let pending = 0;
  for (const row of rows) {
    const bucket = emailCenterStatusBucket(row.deliveryStatus);
    if (bucket === "sent") sent += 1;
    else if (bucket === "failed") failed += 1;
    else pending += 1;
  }
  return { sent, failed, pending };
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

export function emailCenterRowMatchesSearch(
  row: {
    kindLabel: string;
    actionLabel: string;
    targetType: string;
    targetId: string;
    emailEvent: string | null;
    orderId: string | null;
    recipientSearchText: string | null;
    deliveryStatusLabel: string;
    failureReason: string | null;
  },
  rawQuery: string | null | undefined
): boolean {
  const q = normalizeEmailCenterSearchQuery(rawQuery).toLowerCase();
  if (!q) return true;
  const haystack = [
    row.kindLabel,
    row.actionLabel,
    row.targetType,
    row.targetId,
    row.emailEvent ?? "",
    row.orderId ?? "",
    row.recipientSearchText ?? "",
    row.deliveryStatusLabel,
    row.failureReason ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
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
