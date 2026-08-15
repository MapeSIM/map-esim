/**
 * Partner discount helpers: UI percent ↔ basis points.
 * 5% = 500 bps, 7.5% = 750 bps. No silent clamp.
 */

export const PARTNER_DISCOUNT_BPS_MIN = 0;
/** 99.00% — never allow 100%+ nonsensical discounts. */
export const PARTNER_DISCOUNT_BPS_MAX = 9900;

export type ParseDiscountResult =
  | { ok: true; discountBps: number }
  | { ok: false; error: string };

/**
 * Parse a percentage string/number into discountBps.
 * Accepts: "0", "5", "5.0", "7.5", "99", "99.00"
 * Rejects: empty, negative, >= 100%, >2 decimals, NaN.
 */
export function parseDiscountPercentToBps(raw: unknown): ParseDiscountResult {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { ok: false, error: "Enter a valid discount percentage." };
  }
  const s = String(raw).trim();
  if (!s) {
    return { ok: false, error: "Enter a valid discount percentage." };
  }
  if (/[eE+]/.test(s) || s.includes("-") || s.includes(",")) {
    return { ok: false, error: "Enter a valid discount percentage." };
  }
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(s)) {
    return {
      ok: false,
      error: "Use up to two decimal places (for example 5 or 7.5).",
    };
  }

  const [wholePart, fractionPart = ""] = s.split(".");
  const whole = Number.parseInt(wholePart, 10);
  if (!Number.isSafeInteger(whole) || whole < 0) {
    return { ok: false, error: "Enter a valid discount percentage." };
  }
  const frac = fractionPart.padEnd(2, "0");
  const fracCents = Number.parseInt(frac, 10);
  if (!Number.isInteger(fracCents) || fracCents < 0 || fracCents > 99) {
    return { ok: false, error: "Enter a valid discount percentage." };
  }

  // percent with 2dp → bps: 7.50% → 750
  const discountBps = whole * 100 + fracCents;
  if (!Number.isSafeInteger(discountBps) || discountBps < PARTNER_DISCOUNT_BPS_MIN) {
    return { ok: false, error: "Enter a valid discount percentage." };
  }
  if (discountBps > PARTNER_DISCOUNT_BPS_MAX) {
    return {
      ok: false,
      error: "Discount must be between 0% and 99%.",
    };
  }
  return { ok: true, discountBps };
}

/** Format bps for UI display (750 → "7.5", 500 → "5"). */
export function formatDiscountBpsAsPercent(discountBps: number): string {
  if (!Number.isInteger(discountBps) || discountBps < 0) return "0";
  const whole = Math.floor(discountBps / 100);
  const frac = discountBps % 100;
  if (frac === 0) return String(whole);
  if (frac % 10 === 0) return `${whole}.${frac / 10}`;
  return `${whole}.${String(frac).padStart(2, "0")}`;
}
