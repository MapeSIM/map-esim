/**
 * Authoritative MAP eSIM retail pricing (pure, offline-safe).
 * Provider/supplier cost + structured data allowance → customer retail USD cents.
 * Never log or return provider cost from public surfaces.
 */

/** Up to 100MB inclusive. */
export const MARKUP_UP_TO_100MB = 0.02;
/** More than 100MB up to 500MB inclusive. */
export const MARKUP_100MB_TO_500MB = 0.02;
/** More than 500MB up to 1GB inclusive. */
export const MARKUP_500MB_TO_1GB = 0.03;
/** More than 1GB up to 5GB inclusive. */
export const MARKUP_1GB_TO_5GB = 0.04;
/** More than 5GB up to 10GB inclusive. */
export const MARKUP_5GB_TO_10GB = 0.05;
/** More than 10GB. */
export const MARKUP_OVER_10GB = 0.06;
/** Unlimited data packages. */
export const MARKUP_UNLIMITED = 0.06;

/** Entry-tier markup used only when allowance is unknown (e.g. destination minPrice). */
export const MARKUP_ENTRY_UNKNOWN_ALLOWANCE = MARKUP_UP_TO_100MB;

const MB_PER_GB = 1024;

export type RetailAllowanceInput = {
  dataUnlimited?: boolean | null;
  dataMB?: number | null;
  dataGB?: number | null;
};

/**
 * Resolve total megabytes from structured VeSIM allowance fields.
 * Prefers dataMB; otherwise converts dataGB. Returns null when unknown.
 */
export function resolveAllowanceMegabytes(
  allowance: RetailAllowanceInput
): number | null {
  if (allowance.dataUnlimited === true) return null;
  if (
    typeof allowance.dataMB === "number" &&
    Number.isFinite(allowance.dataMB) &&
    allowance.dataMB > 0
  ) {
    return allowance.dataMB;
  }
  if (
    typeof allowance.dataGB === "number" &&
    Number.isFinite(allowance.dataGB) &&
    allowance.dataGB > 0
  ) {
    return allowance.dataGB * MB_PER_GB;
  }
  return null;
}

/**
 * Markup rate from structured allowance. Null when allowance cannot be classified.
 */
export function markupRateForAllowance(
  allowance: RetailAllowanceInput
): number | null {
  if (allowance.dataUnlimited === true) return MARKUP_UNLIMITED;

  const mb = resolveAllowanceMegabytes(allowance);
  if (mb == null || !(mb > 0)) return null;

  if (mb <= 100) return MARKUP_UP_TO_100MB;
  if (mb <= 500) return MARKUP_100MB_TO_500MB;
  if (mb <= MB_PER_GB) return MARKUP_500MB_TO_1GB;
  if (mb <= 5 * MB_PER_GB) return MARKUP_1GB_TO_5GB;
  if (mb <= 10 * MB_PER_GB) return MARKUP_5GB_TO_10GB;
  return MARKUP_OVER_10GB;
}

/** Round UP to the next whole USD cent. Never returns below `cents`. */
export function roundUpToNextCent(cents: number): number {
  if (!Number.isFinite(cents) || cents <= 0) return cents;
  return Math.ceil(cents);
}

/**
 * MAP eSIM retail price in integer USD cents from VeSIM provider cost cents
 * and structured data allowance.
 */
export function calculateRetailPriceCents(
  providerCostCents: number,
  allowance: RetailAllowanceInput
): number | null {
  if (!Number.isInteger(providerCostCents) || providerCostCents <= 0) {
    return null;
  }
  const rate = markupRateForAllowance(allowance);
  if (rate == null) return null;

  const markedUp = roundUpToNextCent(providerCostCents * (1 + rate));
  if (!Number.isInteger(markedUp) || markedUp < providerCostCents) return null;
  return markedUp;
}

/**
 * Fallback when only VeSIM destination minPrice is known (no offer allowance).
 * Applies entry-tier markup so "From" never uses supplier 1:1.
 * Public catalog / country pages must prefer lowest offer retail when offers load.
 */
export function calculateEntryRetailPriceCents(
  providerCostCents: number
): number | null {
  return calculateRetailPriceCents(providerCostCents, { dataMB: 100 });
}

/** Convenience: provider USD → retail USD (2dp), or null when invalid. */
export function calculateRetailPriceUsd(
  providerPriceUsd: number,
  allowance: RetailAllowanceInput
): number | null {
  if (!Number.isFinite(providerPriceUsd) || providerPriceUsd < 0) {
    return null;
  }
  const providerCents = Math.round(providerPriceUsd * 100);
  if (!Number.isSafeInteger(providerCents) || providerCents <= 0) {
    return null;
  }
  const retailCents = calculateRetailPriceCents(providerCents, allowance);
  if (retailCents == null) return null;
  return retailCents / 100;
}

export function calculateEntryRetailPriceUsd(
  providerPriceUsd: number
): number | null {
  if (!Number.isFinite(providerPriceUsd) || providerPriceUsd < 0) {
    return null;
  }
  const providerCents = Math.round(providerPriceUsd * 100);
  if (!Number.isSafeInteger(providerCents) || providerCents <= 0) {
    return null;
  }
  const retailCents = calculateEntryRetailPriceCents(providerCents);
  if (retailCents == null) return null;
  return retailCents / 100;
}

/**
 * Parse allowance labels from structured display fields (e.g. "100 MB", "3 GB").
 * Not for free-form marketing titles.
 */
export function allowanceFromDataLabel(
  label: string | null | undefined
): RetailAllowanceInput | null {
  const text = (label ?? "").trim();
  if (!text) return null;
  if (/\bunlimited\b/i.test(text)) return { dataUnlimited: true };
  const mb = text.match(/(\d+(?:\.\d+)?)\s*MB\b/i);
  if (mb) {
    const dataMB = Number(mb[1]);
    return Number.isFinite(dataMB) && dataMB > 0 ? { dataMB } : null;
  }
  const gb = text.match(/(\d+(?:\.\d+)?)\s*GB\b/i);
  if (gb) {
    const dataGB = Number(gb[1]);
    return Number.isFinite(dataGB) && dataGB > 0 ? { dataGB } : null;
  }
  return null;
}
