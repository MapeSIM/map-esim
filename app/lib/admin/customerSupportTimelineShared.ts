/**
 * Pure customer support-timeline helpers (offline-QA safe).
 * Compose-don't-store: no timeline table, no Prisma, no payment writes.
 */

export const ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT = 50;
export const ADMIN_CUSTOMER_SUPPORT_TIMELINE_DETAIL_MAX = 120;

export const ADMIN_CUSTOMER_SUPPORT_TIMELINE_SOURCES = [
  "purchase",
  "payment_attempt",
  "webhook_receipt",
  "order",
  "wallet_transaction",
  "refund_request",
  "email",
  "audit",
] as const;

export type AdminCustomerSupportTimelineSource =
  (typeof ADMIN_CUSTOMER_SUPPORT_TIMELINE_SOURCES)[number];

export const ADMIN_CUSTOMER_SUPPORT_TIMELINE_SOURCE_LABELS: Record<
  AdminCustomerSupportTimelineSource,
  string
> = {
  purchase: "Wallet purchase",
  payment_attempt: "Payment attempt",
  webhook_receipt: "Webhook receipt",
  order: "Order",
  wallet_transaction: "Wallet transaction",
  refund_request: "Refund request",
  email: "Email",
  audit: "Audit",
};

/**
 * Allowlisted audit actions only. Login/signup and unrelated admin
 * activity stay off the customer support timeline.
 */
export const ADMIN_CUSTOMER_SUPPORT_TIMELINE_AUDIT_ACTIONS = [
  "esim.wallet_purchase_started",
  "esim.wallet_purchase_completed",
  "esim.wallet_purchase_failed_refunded",
  "esim.wallet_purchase_reconciliation_required",
  "esim.payment_confirmed",
  "esim.payment_failed",
  "esim.payment_webhook_duplicate",
  "esim.payment_failure_email_sent",
  "esim.purchase_funded",
  "esim.recon_required_email_sent",
  "wallet.topup_draft_created",
  "wallet.topup_checkout_created",
  "wallet.topup_payment_pending",
  "wallet.topup_payment_confirmed",
  "wallet.topup_credited",
  "wallet.topup_failed",
  "wallet.topup_reconciliation_required",
  "wallet.topup_webhook_duplicate",
  "wallet.transaction_email_sent",
  "wallet.transaction_email_failed",
  "refund.request_created",
  "refund.request_under_review",
  "refund.request_approved_pending_execution",
  "refund.request_rejected",
  "refund.request_action_blocked",
  "refund.email_received",
  "refund.email_under_review",
  "refund.email_approved_pending_execution",
  "refund.email_rejected",
] as const;

export type AdminCustomerSupportTimelineSortable = {
  id: string;
  occurredAtMs: number;
};

export function isAdminCustomerSupportTimelineAuditAction(
  action: string | null | undefined
): boolean {
  const value = (action ?? "").trim();
  return (ADMIN_CUSTOMER_SUPPORT_TIMELINE_AUDIT_ACTIONS as readonly string[]).includes(
    value
  );
}

export function clipSupportTimelineDetail(
  value: string | null | undefined,
  max = ADMIN_CUSTOMER_SUPPORT_TIMELINE_DETAIL_MAX
): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "—";
  const cap = Math.max(24, Math.min(max, 200));
  if (text.length <= cap) return text;
  return `${text.slice(0, cap - 1)}…`;
}

export function joinSupportTimelineDetail(
  parts: Array<string | null | undefined>
): string {
  return clipSupportTimelineDetail(
    parts
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join(" · ")
  );
}

export function supportTimelineSourceLabel(
  source: string
): string {
  const key = source as AdminCustomerSupportTimelineSource;
  return ADMIN_CUSTOMER_SUPPORT_TIMELINE_SOURCE_LABELS[key] ?? "Event";
}

export function humanizeSupportTimelineStatus(status: string | null | undefined): string {
  const value = (status ?? "").trim();
  if (!value) return "Not available";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function supportTimelinePurchaseTitle(status: string | null | undefined): string {
  switch ((status ?? "").trim()) {
    case "COMPLETED":
      return "eSIM purchase completed";
    case "FAILED_REFUNDED":
      return "eSIM purchase failed and refunded";
    case "RECONCILIATION_REQUIRED":
      return "eSIM purchase needs reconciliation";
    case "AWAITING_GATEWAY_PAYMENT":
      return "eSIM purchase awaiting payment";
    case "FUNDED":
    case "PROVIDER_PENDING":
      return "eSIM purchase in fulfillment";
    case "FUNDS_RESERVED":
      return "eSIM purchase funds reserved";
    default:
      return "eSIM checkout started";
  }
}

export function supportTimelinePaymentAttemptTitle(
  status: string | null | undefined
): string {
  switch ((status ?? "").trim()) {
    case "PAYMENT_CONFIRMED":
      return "Payment confirmed";
    case "FAILED":
      return "Payment failed";
    case "CANCELLED":
      return "Payment cancelled";
    case "REFUNDED":
      return "Payment refunded";
    case "RECONCILIATION_REQUIRED":
      return "Payment needs reconciliation";
    case "AWAITING_PAYMENT":
    case "PAYMENT_PENDING":
      return "Payment awaiting confirmation";
    default:
      return "Payment attempt created";
  }
}

/** Email event only when a real notified-at timestamp exists. */
export function supportTimelineEmailStatusLabel(
  status: string | null | undefined
): string | null {
  switch ((status ?? "").trim()) {
    case "sent":
      return "sent";
    case "sending":
      return "pending";
    case "failed":
      return "failed";
    case "not_configured":
      return "not configured";
    case "skipped":
      return null;
    default: {
      const raw = (status ?? "").trim();
      return raw ? raw.slice(0, 40) : null;
    }
  }
}

export function supportTimelineAuditTitle(action: string | null | undefined): string {
  const value = (action ?? "").trim() || "unknown";
  return `Audit · ${value.slice(0, 80)}`;
}

/**
 * Newest first, then id descending. Hard-capped at 50.
 */
export function selectNewestSupportTimelineEvents<
  T extends AdminCustomerSupportTimelineSortable,
>(
  events: T[],
  limit = ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT
): T[] {
  const take = Math.min(
    Math.max(1, Math.floor(limit) || ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT),
    ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT
  );
  return [...events]
    .sort((a, b) => {
      if (b.occurredAtMs !== a.occurredAtMs) {
        return b.occurredAtMs - a.occurredAtMs;
      }
      if (b.id === a.id) return 0;
      return b.id < a.id ? -1 : 1;
    })
    .slice(0, take);
}
