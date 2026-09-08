/**
 * Pure Admin Payment Dashboard helpers (offline-QA safe).
 * Display / filter only — no Prisma, no payment writes, no gateway enablement.
 */

import { ADMIN_SEARCH_MAX_LENGTH } from "@/app/lib/admin/display";

export const ADMIN_PAYMENTS_PAGE_SIZE = 25;
export const ADMIN_PAYMENTS_PAGE_SIZE_MAX = 50;

export const PAYMENT_DASHBOARD_STATUS_FILTERS = [
  "ALL",
  "PENDING",
  "FAILED",
  "CANCELLED",
  "CONFIRMED",
  "OTHER",
] as const;

export type PaymentDashboardStatusFilter =
  (typeof PAYMENT_DASHBOARD_STATUS_FILTERS)[number];

export const PAYMENT_DASHBOARD_PROVIDER_FILTERS = [
  "ALL",
  "SIMPAISA",
  "SAFEPAY",
  "UNKNOWN",
] as const;

export type PaymentDashboardProviderFilter =
  (typeof PAYMENT_DASHBOARD_PROVIDER_FILTERS)[number];

export const PAYMENT_DASHBOARD_WEBHOOK_FILTERS = [
  "ALL",
  "MISSING",
  "PRESENT",
] as const;

export type PaymentDashboardWebhookFilter =
  (typeof PAYMENT_DASHBOARD_WEBHOOK_FILTERS)[number];

/** Attempt statuses treated as in-flight / pending for hub default + KPIs. */
export const PAYMENT_DASHBOARD_PENDING_ATTEMPT_STATUSES = [
  "AWAITING_PAYMENT",
  "PAYMENT_PENDING",
  "RECONCILIATION_REQUIRED",
] as const;

export const PAYMENT_DASHBOARD_FAILED_ATTEMPT_STATUSES = ["FAILED"] as const;
export const PAYMENT_DASHBOARD_CANCELLED_ATTEMPT_STATUSES = [
  "CANCELLED",
] as const;
export const PAYMENT_DASHBOARD_CONFIRMED_ATTEMPT_STATUSES = [
  "PAYMENT_CONFIRMED",
] as const;

export function parsePaymentDashboardStatusFilter(
  raw: string | null | undefined
): PaymentDashboardStatusFilter {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (
    (PAYMENT_DASHBOARD_STATUS_FILTERS as readonly string[]).includes(value)
  ) {
    return value as PaymentDashboardStatusFilter;
  }
  // Default inbox: pending gateway attempts.
  return "PENDING";
}

export function parsePaymentDashboardProviderFilter(
  raw: string | null | undefined
): PaymentDashboardProviderFilter {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (
    (PAYMENT_DASHBOARD_PROVIDER_FILTERS as readonly string[]).includes(value)
  ) {
    return value as PaymentDashboardProviderFilter;
  }
  return "ALL";
}

export function parsePaymentDashboardWebhookFilter(
  raw: string | null | undefined
): PaymentDashboardWebhookFilter {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (
    (PAYMENT_DASHBOARD_WEBHOOK_FILTERS as readonly string[]).includes(value)
  ) {
    return value as PaymentDashboardWebhookFilter;
  }
  return "ALL";
}

export function parsePaymentDashboardSearch(
  raw: string | null | undefined
): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, ADMIN_SEARCH_MAX_LENGTH);
}

export function parsePaymentDashboardPage(
  raw: string | null | undefined
): number {
  const n = Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

export function paymentAttemptStatusesForFilter(
  filter: PaymentDashboardStatusFilter
): string[] | null {
  switch (filter) {
    case "PENDING":
      return [...PAYMENT_DASHBOARD_PENDING_ATTEMPT_STATUSES];
    case "FAILED":
      return [...PAYMENT_DASHBOARD_FAILED_ATTEMPT_STATUSES];
    case "CANCELLED":
      return [...PAYMENT_DASHBOARD_CANCELLED_ATTEMPT_STATUSES];
    case "CONFIRMED":
      return [...PAYMENT_DASHBOARD_CONFIRMED_ATTEMPT_STATUSES];
    case "OTHER":
      return ["DRAFT", "EXPIRED", "REFUNDED"];
    case "ALL":
    default:
      return null;
  }
}

export function isPaymentDashboardPendingAttemptStatus(
  status: string
): boolean {
  return (
    PAYMENT_DASHBOARD_PENDING_ATTEMPT_STATUSES as readonly string[]
  ).includes(status);
}

export function paymentDashboardWebhookLabel(
  webhookEventIdPresent: boolean
): string {
  return webhookEventIdPresent ? "present" : "missing";
}

export function paymentDashboardInquiryPlaceholder(): string {
  return "Check on detail";
}

export function paymentDashboardMethodPlaceholder(): string {
  return "—";
}

export function buildAdminPaymentsHref(options: {
  q?: string;
  status?: string;
  provider?: string;
  webhook?: string;
  page?: number;
}): string {
  const params = new URLSearchParams();
  const q = parsePaymentDashboardSearch(options.q);
  const status = parsePaymentDashboardStatusFilter(options.status);
  const provider = parsePaymentDashboardProviderFilter(options.provider);
  const webhook = parsePaymentDashboardWebhookFilter(options.webhook);
  const page =
    typeof options.page === "number" && Number.isFinite(options.page)
      ? Math.max(1, Math.floor(options.page))
      : 1;

  if (q) params.set("q", q);
  // Default hub status is PENDING — omit from URL when default.
  if (status !== "PENDING") params.set("status", status);
  if (provider !== "ALL") params.set("provider", provider);
  if (webhook !== "ALL") params.set("webhook", webhook);
  if (page > 1) params.set("page", String(page));

  const qs = params.toString();
  return qs ? `/admin/payments?${qs}` : "/admin/payments";
}
