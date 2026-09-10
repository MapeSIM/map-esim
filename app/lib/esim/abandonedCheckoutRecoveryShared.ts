/**
 * Abandoned checkout recovery cron constants (offline-safe).
 * Delay/batch only — no SMTP, Prisma, or checkout side effects.
 */

/** Default idle age before recovery email is eligible (30 minutes). */
export const ABANDONED_CHECKOUT_IDLE_MS_DEFAULT = 30 * 60 * 1000;

/**
 * Do not recover checkouts older than this (matches pending-purchase UI window).
 * Prevents endless mail to ancient READY rows.
 */
export const ABANDONED_CHECKOUT_MAX_AGE_MS_DEFAULT = 3 * 24 * 60 * 60 * 1000;

export const ABANDONED_CHECKOUT_BATCH_SIZE = 40;

/** Purchase statuses eligible for abandoned-checkout recovery. */
export const ABANDONED_CHECKOUT_RECOVERY_STATUSES = [
  "READY",
  "AWAITING_GATEWAY_PAYMENT",
] as const;

/**
 * Resolve idle threshold from ABANDONED_CHECKOUT_IDLE_MINUTES (positive int)
 * or fall back to the default.
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

export function resolveAbandonedCheckoutMaxAgeMs(
  envValue: string | undefined = process.env.ABANDONED_CHECKOUT_MAX_AGE_HOURS
): number {
  const raw = (envValue ?? "").trim();
  if (!raw) return ABANDONED_CHECKOUT_MAX_AGE_MS_DEFAULT;
  const hours = Number.parseInt(raw, 10);
  if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 30) {
    return ABANDONED_CHECKOUT_MAX_AGE_MS_DEFAULT;
  }
  return hours * 60 * 60 * 1000;
}
