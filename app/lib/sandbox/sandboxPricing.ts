/**
 * Sandbox Partner pricing — client + server safe (no Prisma).
 * partnerPriceUsd = Number((retailUsd * (1 - discountPercent / 100)).toFixed(2))
 */

export const SANDBOX_DEFAULT_DISCOUNT_PERCENT = 3;
export const SANDBOX_DISCOUNT_PERCENT_MIN = 0;
export const SANDBOX_DISCOUNT_PERCENT_MAX = 50;

export function clampSandboxDiscountPercent(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return SANDBOX_DEFAULT_DISCOUNT_PERCENT;
  const rounded = Math.round(n);
  return Math.min(
    SANDBOX_DISCOUNT_PERCENT_MAX,
    Math.max(SANDBOX_DISCOUNT_PERCENT_MIN, rounded)
  );
}

/** Exact USD partner price from retail USD (2 decimal places). */
export function sandboxPartnerPriceUsd(
  retailUsd: number,
  discountPercent: number = SANDBOX_DEFAULT_DISCOUNT_PERCENT
): number | null {
  if (!Number.isFinite(retailUsd) || retailUsd <= 0) return null;
  const pct = clampSandboxDiscountPercent(discountPercent);
  return Number((retailUsd * (1 - pct / 100)).toFixed(2));
}

/** Partner charge in integer USD cents (matches toFixed(2) USD). */
export function sandboxPartnerPriceCents(
  retailCents: number,
  discountPercent: number = SANDBOX_DEFAULT_DISCOUNT_PERCENT
): number | null {
  if (!Number.isInteger(retailCents) || retailCents <= 0) return null;
  const usd = sandboxPartnerPriceUsd(retailCents / 100, discountPercent);
  if (usd == null) return null;
  return Math.round(usd * 100);
}

export function sandboxDiscountLabel(
  discountPercent: number = SANDBOX_DEFAULT_DISCOUNT_PERCENT
): string {
  const pct = clampSandboxDiscountPercent(discountPercent);
  return `${pct}% off`;
}
