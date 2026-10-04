/**
 * Abandoned checkout recovery cron constants (offline-safe).
 * Delay/batch only — no SMTP, Prisma, or checkout side effects.
 *
 * Eligibility window (defaults): createdAt between 30 and 90 minutes ago.
 * Call /api/cron/abandoned-checkout-recovery every 15–30 minutes via an
 * external scheduler (Vercel Hobby allows only one daily vercel.json cron).
 */

/** Minimum age before recovery email is eligible (30 minutes). */
export const ABANDONED_CHECKOUT_IDLE_MS_DEFAULT = 30 * 60 * 1000;

/**
 * One recovery-email candidate (purchase + owner). Used to coalesce
 * multiple idle purchases for the same customer into a single send.
 */
export type AbandonedCheckoutCandidateRef = {
  id: string;
  customerUserId: string;
  updatedAt: Date;
};

/**
 * Keep at most one purchase per customer — the newest by updatedAt
 * (tie-break: higher id). Sibling rows in the same batch are dropped
 * so only one abandoned-checkout email is scheduled per customer per run.
 */
export function coalesceAbandonedCheckoutCandidatesByCustomer(
  candidates: readonly AbandonedCheckoutCandidateRef[]
): AbandonedCheckoutCandidateRef[] {
  const byCustomer = new Map<string, AbandonedCheckoutCandidateRef>();

  for (const row of candidates) {
    const customerId = (row.customerUserId ?? "").trim();
    const purchaseId = (row.id ?? "").trim();
    if (!customerId || !purchaseId) continue;

    const normalized: AbandonedCheckoutCandidateRef = {
      id: purchaseId,
      customerUserId: customerId,
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt
          : new Date(row.updatedAt),
    };

    const existing = byCustomer.get(customerId);
    if (!existing) {
      byCustomer.set(customerId, normalized);
      continue;
    }

    const existingMs = existing.updatedAt.getTime();
    const nextMs = normalized.updatedAt.getTime();
    const preferNext =
      nextMs > existingMs ||
      (nextMs === existingMs && normalized.id > existing.id);
    if (preferNext) {
      byCustomer.set(customerId, normalized);
    }
  }

  return [...byCustomer.values()];
}

/**
 * Do not recover checkouts older than this (default 90 minutes).
 * Keeps the send window tight so frequent cron hits only mail recent abandons.
 */
export const ABANDONED_CHECKOUT_MAX_AGE_MS_DEFAULT = 90 * 60 * 1000;

export const ABANDONED_CHECKOUT_BATCH_SIZE = 40;

/** Purchase statuses eligible for abandoned-checkout recovery. */
export const ABANDONED_CHECKOUT_RECOVERY_STATUSES = [
  "READY",
  "AWAITING_GATEWAY_PAYMENT",
] as const;

/**
 * Resolve minimum age from ABANDONED_CHECKOUT_IDLE_MINUTES (positive int)
 * or fall back to the default (30 minutes).
 */
export function resolveAbandonedCheckoutIdleMs(
  envValue: string | undefined = process.env.ABANDONED_CHECKOUT_IDLE_MINUTES
): number {
  const raw = (envValue ?? "").trim();
  if (!raw) return ABANDONED_CHECKOUT_IDLE_MS_DEFAULT;
  const minutes = Number.parseInt(raw, 10);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60 * 24 * 14) {
    return ABANDONED_CHECKOUT_IDLE_MS_DEFAULT;
  }
  return minutes * 60 * 1000;
}

/**
 * Resolve max age from ABANDONED_CHECKOUT_MAX_AGE_MINUTES (preferred) or
 * legacy ABANDONED_CHECKOUT_MAX_AGE_HOURS. Default: 90 minutes.
 */
export function resolveAbandonedCheckoutMaxAgeMs(
  envMinutes: string | undefined = process.env.ABANDONED_CHECKOUT_MAX_AGE_MINUTES,
  envHours: string | undefined = process.env.ABANDONED_CHECKOUT_MAX_AGE_HOURS
): number {
  const minutesRaw = (envMinutes ?? "").trim();
  if (minutesRaw) {
    const minutes = Number.parseInt(minutesRaw, 10);
    if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 * 24 * 30) {
      return minutes * 60 * 1000;
    }
  }
  const hoursRaw = (envHours ?? "").trim();
  if (hoursRaw) {
    const hours = Number.parseInt(hoursRaw, 10);
    if (Number.isFinite(hours) && hours >= 1 && hours <= 24 * 30) {
      return hours * 60 * 60 * 1000;
    }
  }
  return ABANDONED_CHECKOUT_MAX_AGE_MS_DEFAULT;
}
