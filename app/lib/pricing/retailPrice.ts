/**
 * Authoritative MAP eSIM retail pricing (pure, offline-safe).
 * Provider/supplier cost in → customer retail USD cents out.
 * Never log or return provider cost from public surfaces.
 */

/** Provider cost below $10 → 20% markup. */
export const MARKUP_UNDER_10 = 0.2;
/** Provider cost $10–$30 inclusive → 18% markup. */
export const MARKUP_10_TO_30 = 0.18;
/** Provider cost above $30 → 15% markup. */
export const MARKUP_OVER_30 = 0.15;

export function markupRateForProviderCostCents(
  providerCostCents: number
): number | null {
  if (!Number.isInteger(providerCostCents) || providerCostCents <= 0) {
    return null;
  }
  if (providerCostCents < 1000) return MARKUP_UNDER_10;
  if (providerCostCents <= 3000) return MARKUP_10_TO_30;
  return MARKUP_OVER_30;
}

/**
 * Round UP to a customer-friendly USD ending of .49 or .99.
 * Never returns a value below `cents`.
 */
export function roundUpToRetailEndingCents(cents: number): number {
  if (!Number.isInteger(cents) || cents <= 0) {
    return cents;
  }
  const rem = cents % 100;
  const base = cents - rem;
  if (rem === 0) return base + 49;
  if (rem <= 49) return base + 49;
  return base + 99;
}

/**
 * MAP eSIM retail price in integer USD cents from VeSIM provider cost cents.
 */
export function calculateRetailPriceCents(
  providerCostCents: number
): number | null {
  const rate = markupRateForProviderCostCents(providerCostCents);
  if (rate == null) return null;

  // Ceil so fractional cents never understate the markup before retail ending.
  const markedUp = Math.ceil(providerCostCents * (1 + rate));
  const retail = roundUpToRetailEndingCents(markedUp);
  if (retail < markedUp) return null;
  return retail;
}

/** Convenience: provider USD → retail USD (2dp), or null when invalid. */
export function calculateRetailPriceUsd(
  providerPriceUsd: number
): number | null {
  if (!Number.isFinite(providerPriceUsd) || providerPriceUsd < 0) {
    return null;
  }
  const providerCents = Math.round(providerPriceUsd * 100);
  if (!Number.isSafeInteger(providerCents) || providerCents <= 0) {
    return null;
  }
  const retailCents = calculateRetailPriceCents(providerCents);
  if (retailCents == null) return null;
  return retailCents / 100;
}
