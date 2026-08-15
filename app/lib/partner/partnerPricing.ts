/**
 * Partner purchase pricing (pure, offline-safe).
 * Server-authoritative: never trust client money/discount values.
 *
 * partnerChargeCents = round_nearest_cent(retailPriceCents × (10000 − discountBps) / 10000)
 * Rounding: half-up via integer/bigint arithmetic only — never float percentages.
 * Floor: partnerChargeCents must be >= providerCostCents or HARD FAIL (no silent raise).
 */

import {
  PARTNER_DISCOUNT_BPS_MAX,
  PARTNER_DISCOUNT_BPS_MIN,
} from "@/app/lib/partner/discount";

/** Public message — never includes provider cost or internal floor details. */
export const PARTNER_PRICING_UNAVAILABLE_MESSAGE =
  "This package is unavailable at your Partner rate. Please choose another package or contact support.";

export const PARTNER_PRICING_INVALID_INPUT_MESSAGE =
  "Unable to price this package. Please try again.";

export type PartnerPricingSnapshot = {
  retailPriceCents: number;
  discountBps: number;
  partnerChargeCents: number;
  providerCostCents: number;
};

export type PartnerPricingOk = { ok: true } & PartnerPricingSnapshot;

export type PartnerPricingErrorCode =
  | "INVALID_INPUT"
  | "BELOW_PROVIDER_COST";

export type PartnerPricingErr = {
  ok: false;
  code: PartnerPricingErrorCode;
  /** Safe for Partner/admin UI; never reveals provider cost. */
  error: string;
};

export type PartnerPricingResult = PartnerPricingOk | PartnerPricingErr;

export type CalculatePartnerChargeInput = {
  retailPriceCents: number;
  discountBps: number;
  providerCostCents: number;
};

const BPS_DENOMINATOR = BigInt(10_000);
/** Half-up bias for positive division by 10_000. */
const HALF_UP_BIAS = BigInt(5_000);

function isNonNegativeSafeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

function isPositiveSafeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

/**
 * Round `retailPriceCents * (10000 - discountBps) / 10000` to nearest cent (half-up).
 * Uses bigint so large MAP retail × bps stay exact within JS Number safe range on return.
 */
export function partnerChargeCentsFromRetail(
  retailPriceCents: number,
  discountBps: number
): number | null {
  if (!isPositiveSafeInt(retailPriceCents)) return null;
  if (
    !Number.isSafeInteger(discountBps) ||
    discountBps < PARTNER_DISCOUNT_BPS_MIN ||
    discountBps > PARTNER_DISCOUNT_BPS_MAX
  ) {
    return null;
  }

  const keepBps = BigInt(10_000 - discountBps);
  const numerator = BigInt(retailPriceCents) * keepBps;
  // Half-up for non-negative numerator: floor((n + 5000) / 10000)
  const rounded = (numerator + HALF_UP_BIAS) / BPS_DENOMINATOR;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const asNumber = Number(rounded);
  if (!Number.isSafeInteger(asNumber) || asNumber < 0) return null;
  return asNumber;
}

/**
 * Compute immutable Partner charge snapshot from server-trusted inputs.
 */
export function calculatePartnerPurchasePricing(
  input: CalculatePartnerChargeInput
): PartnerPricingResult {
  const { retailPriceCents, discountBps, providerCostCents } = input;

  if (!isPositiveSafeInt(retailPriceCents)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: PARTNER_PRICING_INVALID_INPUT_MESSAGE,
    };
  }
  if (!isNonNegativeSafeInt(providerCostCents)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: PARTNER_PRICING_INVALID_INPUT_MESSAGE,
    };
  }
  if (
    !Number.isSafeInteger(discountBps) ||
    discountBps < PARTNER_DISCOUNT_BPS_MIN ||
    discountBps > PARTNER_DISCOUNT_BPS_MAX
  ) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: PARTNER_PRICING_INVALID_INPUT_MESSAGE,
    };
  }

  const partnerChargeCents = partnerChargeCentsFromRetail(
    retailPriceCents,
    discountBps
  );
  if (partnerChargeCents == null || partnerChargeCents <= 0) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: PARTNER_PRICING_INVALID_INPUT_MESSAGE,
    };
  }

  // HARD FAIL — never silently raise charge to meet provider cost.
  if (partnerChargeCents < providerCostCents) {
    return {
      ok: false,
      code: "BELOW_PROVIDER_COST",
      error: PARTNER_PRICING_UNAVAILABLE_MESSAGE,
    };
  }

  return {
    ok: true,
    retailPriceCents,
    discountBps,
    partnerChargeCents,
    providerCostCents,
  };
}
