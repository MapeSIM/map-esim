/**
 * Admin UX Phase 1–2 copy: nav labels, page titles/descriptions, human status labels.
 * Presentation only — no payment, wallet, refund, webhook, or recovery logic.
 */

/** Nav + page titles (UI labels only; routes unchanged). */
export const ADMIN_UX_NAV = {
  overview: "Overview",
  payments: "Payments",
  verifyPending: "Verify Pending",
  failedPayments: "Failed Payments",
  staleUnpaidHolds: "Stale Unpaid Holds",
  webhookReceipts: "Webhook Receipts",
  stuckCases: "Stuck Cases",
  operationsDashboard: "Operations Dashboard",
  walletHolds: "Wallet Holds",
  systemAlerts: "System Alerts",
} as const;

/** One-line page purposes for Payments / Operations surfaces. */
export const ADMIN_UX_PAGE = {
  payments: {
    title: "Payments",
    description:
      "Gateway payment inbox. Funding stays webhook-authoritative — this page never marks a payment paid.",
  },
  verifyPending: {
    title: "Verify pending gateway",
    description:
      "Check awaiting gateway attempts with Safepay reporter or Simpaisa Inquire. Successful evidence still needs an authoritative webhook before funding.",
  },
  failedPayments: {
    title: "Failed payments",
    description:
      "Failed and cancelled gateway attempts. Read-only — does not cancel, refund, or mark a purchase funded.",
  },
  staleUnpaidHolds: {
    title: "Stale unpaid holds",
    description:
      "Investigate and release unpaid wallet holds only. Funding remains webhook-authoritative. Never marks paid, funds, or replays webhooks.",
  },
  webhookReceipts: {
    title: "Webhook receipts",
    description:
      "Read-only gateway webhook receipt log for payment investigation.",
  },
  stuckCases: {
    title: "Stuck cases",
    description:
      "Review stuck purchases, uncertain provider results, and failed notifications. Open a case for controlled, evidence-gated recovery.",
  },
  operationsDashboard: {
    title: "Operations Dashboard",
    description:
      "System health and safe runtime pause switches. Health cards are read-only. Controls pause new work only — they never refund, email, or mutate wallets or orders.",
  },
  walletHolds: {
    title: "Wallet Holds",
    description:
      "Read-only inventory of open wallet holds. Does not release, refund, fund, or mark paid. Use Verify Pending or Stuck Cases for gated actions.",
  },
  overview: {
    title: "Overview",
    description:
      "Read-only operations snapshot. No orders, refunds, or emails can be changed from this page.",
  },
  orders: {
    title: "Orders",
    description:
      "Local order snapshots only. Provider fulfilment status is not refreshed from this page.",
  },
} as const;

/** Filter / hub bucket labels (values stay internal enums). */
export const ADMIN_UX_FILTER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  CONFIRMED: "Confirmed",
  OTHER: "Other",
  ALL: "All",
  COMPLETED: "Completed",
};

/**
 * Known status enums → human-friendly admin labels.
 * Unknown SCREAMING_SNAKE values are lightly title-cased; other strings pass through.
 */
const ADMIN_HUMAN_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  AWAITING_GATEWAY_PAYMENT: "Awaiting gateway payment",
  PAYMENT_PENDING: "Payment pending",
  PAYMENT_CONFIRMED: "Payment confirmed",
  RECONCILIATION_REQUIRED: "Needs reconciliation",
  FUNDS_RESERVED: "Funds reserved",
  FUNDED: "Funded",
  PROVIDER_PENDING: "Provider pending",
  READY: "Ready",
  DRAFT: "Draft",
  COMPLETED: "Completed",
  PENDING: "Pending",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  CANCELED: "Cancelled",
  FAILED_REFUNDED: "Failed — balance returned",
  CONFIRMED: "Confirmed",
  MISSING: "Missing",
  PRESENT: "Present",
  LINKED: "Linked customer",
  GUEST: "Guest order",
  NEED_ACTION: "Need action",
  WAITING: "Waiting",
  RESOLVED: "Resolved",
  LOCKED: "Locked",
  ESCALATED: "Escalated",
  WARNING: "Warning",
  CRITICAL: "Critical",
  HIGH: "High",
  INFO: "Info",
  UNAVAILABLE: "Unavailable",
  HEALTHY: "Healthy",
  DEGRADED: "Degraded",
  PAUSED: "Paused",
  ENABLED: "Enabled",
  DISABLED: "Disabled",
  CONFIGURED: "Configured",
  NOT_CONFIGURED: "Not configured",
  OPERATIONAL: "Operational",
};

export function adminHumanStatusLabel(
  status: string | null | undefined
): string {
  const value = String(status ?? "").trim();
  if (!value) return "Not available";
  const known = ADMIN_HUMAN_STATUS_LABELS[value];
  if (known) return known;
  const upper = value.toUpperCase().replace(/\s+/g, "_");
  if (ADMIN_HUMAN_STATUS_LABELS[upper]) {
    return ADMIN_HUMAN_STATUS_LABELS[upper];
  }
  if (!/^[A-Z0-9_]+$/.test(value)) return value;
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function adminFilterStatusLabel(
  filterValue: string | null | undefined
): string {
  const value = String(filterValue ?? "").trim().toUpperCase();
  if (!value) return "All";
  return ADMIN_UX_FILTER_STATUS_LABEL[value] ?? adminHumanStatusLabel(value);
}
