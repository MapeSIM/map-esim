/**
 * Pure Admin Payment Recovery Queue helpers (offline-QA safe).
 * Display / filter only — no Prisma, no payment writes, no gateway enablement.
 */

import { PENDING_PAYMENT_VERIFY_AUDIT } from "@/app/lib/admin/pendingPaymentVerifyShared";
import { SIMPAISA_PENDING_INVESTIGATE_AUDIT } from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";

/** Default stale age: 20 minutes. */
export const PAYMENT_RECOVERY_STALE_MS_DEFAULT = 20 * 60 * 1000;
export const PAYMENT_RECOVERY_STALE_MS_MIN = 15 * 60 * 1000;
export const PAYMENT_RECOVERY_STALE_MS_MAX = 30 * 60 * 1000;

export const ADMIN_PAYMENT_RECOVERY_PAGE_SIZE = 25;

export const PAYMENT_RECOVERY_ATTEMPT_STATUSES = [
  "PAYMENT_PENDING",
  "RECONCILIATION_REQUIRED",
] as const;

export type PaymentRecoveryAttemptStatus =
  (typeof PAYMENT_RECOVERY_ATTEMPT_STATUSES)[number];

export const PAYMENT_RECOVERY_PROVIDERS = ["SIMPAISA", "SAFEPAY"] as const;

export type PaymentRecoveryProvider =
  (typeof PAYMENT_RECOVERY_PROVIDERS)[number];

/** Audit actions that record a real investigate/verify decision. */
export const PAYMENT_RECOVERY_INVESTIGATE_AUDIT_ACTIONS = [
  SIMPAISA_PENDING_INVESTIGATE_AUDIT,
  PENDING_PAYMENT_VERIFY_AUDIT,
] as const;

export const PAYMENT_RECOVERY_SUCCESS_DECISIONS = [
  "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED",
  "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED",
] as const;

export const PAYMENT_RECOVERY_FAILED_DECISIONS = [
  "VERIFIED_FAILED",
  "VERIFIED_CANCELLED_OR_EXPIRED",
] as const;

export const PAYMENT_RECOVERY_MISMATCH_DECISIONS = [
  "AMOUNT_MISMATCH",
  "CURRENCY_MISMATCH",
  "REF_MISMATCH",
  "TRACKER_MISMATCH",
] as const;

export const PAYMENT_RECOVERY_POLICY_BLURB =
  "Read/investigate only. Funding remains webhook-authoritative. Admin never marks paid, funds, or replays webhooks from this queue.";

export const PAYMENT_RECOVERY_BANNER_TITLE = "Recovery candidate";

/**
 * Resolve stale threshold in ms. Clamps to 15–30 minutes.
 * Accepts optional minutes from env (PAYMENT_RECOVERY_STALE_MINUTES).
 */
export function parsePaymentRecoveryStaleMs(
  rawMinutes?: string | null
): number {
  const fromEnv =
    rawMinutes === undefined || rawMinutes === null
      ? process.env.PAYMENT_RECOVERY_STALE_MINUTES
      : rawMinutes;
  const trimmed = String(fromEnv ?? "").trim();
  if (!trimmed) return PAYMENT_RECOVERY_STALE_MS_DEFAULT;
  const minutes = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(minutes)) return PAYMENT_RECOVERY_STALE_MS_DEFAULT;
  const ms = minutes * 60 * 1000;
  return Math.min(
    PAYMENT_RECOVERY_STALE_MS_MAX,
    Math.max(PAYMENT_RECOVERY_STALE_MS_MIN, ms)
  );
}

export function paymentRecoveryStaleCutoff(
  nowMs: number,
  staleMs: number = parsePaymentRecoveryStaleMs()
): Date {
  return new Date(nowMs - staleMs);
}

export function isPaymentRecoveryAttemptStatus(
  status: string | null | undefined
): boolean {
  return (PAYMENT_RECOVERY_ATTEMPT_STATUSES as readonly string[]).includes(
    String(status ?? "")
  );
}

export function isPaymentRecoveryProvider(
  provider: string | null | undefined
): boolean {
  return (PAYMENT_RECOVERY_PROVIDERS as readonly string[]).includes(
    String(provider ?? "")
  );
}

/**
 * Durable DB eligibility for recovery queue / detail banner.
 * Does not call providers. Does not trust query params.
 */
export function isPaymentRecoveryCandidate(input: {
  status: string | null | undefined;
  gatewayProvider: string | null | undefined;
  gatewayPaymentRef: string | null | undefined;
  webhookEventId: string | null | undefined;
  updatedAt: Date | string | null | undefined;
  nowMs?: number;
  staleMs?: number;
}): boolean {
  if (!isPaymentRecoveryAttemptStatus(input.status)) return false;
  if (!isPaymentRecoveryProvider(input.gatewayProvider)) return false;
  const ref = String(input.gatewayPaymentRef ?? "").trim();
  if (!ref) return false;
  if (String(input.webhookEventId ?? "").trim()) return false;
  if (!input.updatedAt) return false;
  const updatedAtMs =
    input.updatedAt instanceof Date
      ? input.updatedAt.getTime()
      : new Date(input.updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return false;
  const nowMs =
    typeof input.nowMs === "number" && Number.isFinite(input.nowMs)
      ? input.nowMs
      : Date.now();
  const staleMs =
    typeof input.staleMs === "number" && Number.isFinite(input.staleMs)
      ? input.staleMs
      : parsePaymentRecoveryStaleMs();
  return updatedAtMs <= nowMs - staleMs;
}

export function formatPaymentRecoveryAge(
  updatedAt: Date | string,
  nowMs: number = Date.now()
): string {
  const updatedAtMs =
    updatedAt instanceof Date
      ? updatedAt.getTime()
      : new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return "unknown";
  const ageMs = Math.max(0, nowMs - updatedAtMs);
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function paymentRecoveryWebhookStatusLabel(): string {
  return "missing";
}

export function normalizePaymentRecoveryDecision(
  raw: unknown
): string | null {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 80);
  return value || null;
}

export function paymentRecoveryDecisionLabel(
  decision: string | null | undefined
): string {
  const d = normalizePaymentRecoveryDecision(decision);
  if (!d) return "Never checked";
  return d;
}

/**
 * Suggested safe next action — never mark paid / fund / replay webhook.
 */
export function suggestPaymentRecoverySafeAction(
  decision: string | null | undefined
): string {
  const d = normalizePaymentRecoveryDecision(decision);
  if (!d) {
    return "Run provider Check Status / Verify";
  }
  if (
    (PAYMENT_RECOVERY_SUCCESS_DECISIONS as readonly string[]).includes(d)
  ) {
    return "Wait for authoritative webhook; escalate delivery — do not mark paid";
  }
  if ((PAYMENT_RECOVERY_FAILED_DECISIONS as readonly string[]).includes(d)) {
    return "Use Pending tools for release if eligible — not recovery funding";
  }
  if (
    (PAYMENT_RECOVERY_MISMATCH_DECISIONS as readonly string[]).includes(d)
  ) {
    return "Re-check refs/amount; escalate engineering";
  }
  if (d === "PENDING" || d === "PROVIDER_UNAVAILABLE" || d === "UNKNOWN") {
    return "Run provider Check Status / Verify";
  }
  return "Run provider Check Status / Verify";
}

export function parsePaymentRecoveryPage(
  raw: string | null | undefined
): number {
  const n = Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

export function buildAdminPaymentRecoveryHref(options?: {
  page?: number;
}): string {
  const page =
    typeof options?.page === "number" && Number.isFinite(options.page)
      ? Math.max(1, Math.floor(options.page))
      : 1;
  if (page > 1) return `/admin/payments/recovery?page=${page}`;
  return "/admin/payments/recovery";
}
