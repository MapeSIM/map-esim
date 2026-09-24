/**
 * Customer eSIM gateway reservation stale/expired recovery (offline-safe constants).
 * Releases reserved customer wallet when checkout expires or goes idle.
 * Never funds purchases and never calls VeSIM.
 */

/** Default idle age before a pending attempt is eligible for auto-release (30 min). */
export const CUSTOMER_GATEWAY_STALE_IDLE_MS_DEFAULT = 30 * 60 * 1000;

/**
 * Do not auto-release checkouts older than this (matches abandoned-checkout max age).
 * Ancient rows stay for admin/recon rather than silent release.
 */
export const CUSTOMER_GATEWAY_STALE_MAX_AGE_MS_DEFAULT = 3 * 24 * 60 * 60 * 1000;

export const CUSTOMER_GATEWAY_STALE_BATCH_SIZE = 40;

/** Attempt statuses eligible for stale/expired wallet release. */
export const CUSTOMER_GATEWAY_STALE_ATTEMPT_STATUSES = [
  "DRAFT",
  "AWAITING_PAYMENT",
  "PAYMENT_PENDING",
] as const;

/**
 * Resolve idle threshold from CUSTOMER_ESIM_GATEWAY_STALE_IDLE_MINUTES
 * (positive int) or fall back to the default.
 */
export function resolveCustomerGatewayStaleIdleMs(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = (env.CUSTOMER_ESIM_GATEWAY_STALE_IDLE_MINUTES ?? "").trim();
  if (!raw) return CUSTOMER_GATEWAY_STALE_IDLE_MS_DEFAULT;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return CUSTOMER_GATEWAY_STALE_IDLE_MS_DEFAULT;
  }
  return Math.floor(minutes * 60 * 1000);
}

/**
 * Resolve max-age from CUSTOMER_ESIM_GATEWAY_STALE_MAX_AGE_HOURS or default.
 */
export function resolveCustomerGatewayStaleMaxAgeMs(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = (env.CUSTOMER_ESIM_GATEWAY_STALE_MAX_AGE_HOURS ?? "").trim();
  if (!raw) return CUSTOMER_GATEWAY_STALE_MAX_AGE_MS_DEFAULT;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) {
    return CUSTOMER_GATEWAY_STALE_MAX_AGE_MS_DEFAULT;
  }
  return Math.floor(hours * 60 * 60 * 1000);
}

/**
 * True when the attempt is past expiresAt, or idle past the stale threshold
 * while still within max age.
 */
export function isCustomerGatewayAttemptStale(input: {
  nowMs: number;
  updatedAt: Date;
  expiresAt: Date | null;
  idleMs: number;
  maxAgeMs: number;
}): boolean {
  const updatedMs =
    input.updatedAt instanceof Date
      ? input.updatedAt.getTime()
      : new Date(input.updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return false;

  const ageMs = input.nowMs - updatedMs;
  if (ageMs < 0 || ageMs > input.maxAgeMs) return false;

  if (input.expiresAt) {
    const expiresMs =
      input.expiresAt instanceof Date
        ? input.expiresAt.getTime()
        : new Date(input.expiresAt).getTime();
    if (Number.isFinite(expiresMs) && expiresMs <= input.nowMs) {
      return true;
    }
  }

  return updatedMs <= input.nowMs - input.idleMs;
}
