/**
 * Authoritative MAP eSIM retail pricing (pure, offline-safe).
 * Provider/supplier cost (USD cents) → customer retail USD cents via fixed cost bands.
 * Never log or return provider cost from public surfaces.
 */

/** Fixed MAP retail for VeSIM provider cost exactly $0.66 (preserve live selling price). */
export const RETAIL_CENTS_FOR_PROVIDER_66 = 68;

/** Additive markup: provider cost below $0.66, or $0.67–$1.00 inclusive (not the $0.66 exception). */
export const RETAIL_ADD_CENTS_067_TO_100 = 50;

/** Additive markup: provider cost $1.01–$2.99 inclusive. */
export const RETAIL_ADD_CENTS_101_TO_299 = 60;

/** Multiplier: provider cost $3.00–$9.99 inclusive. */
export const RETAIL_MULTIPLIER_300_TO_999 = 1.2;

/** Multiplier: provider cost $10.00 and above. */
export const RETAIL_MULTIPLIER_1000_PLUS = 1.15;

const MB_PER_GB = 1024;

/**
 * Allowance fields remain for offer presentation / label parsing only.
 * Retail profit bands are provider-cost-based and ignore allowance.
 */
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

/** Round UP to the next whole USD cent. Never returns below `cents`. */
export function roundUpToNextCent(cents: number): number {
  if (!Number.isFinite(cents) || cents <= 0) return cents;
  return Math.ceil(cents);
}

/**
 * MAP eSIM retail price in integer USD cents from VeSIM provider cost cents.
 * Cost-band policy (allowance ignored when provided for call-site compatibility).
 */
export function calculateRetailPriceCents(
  providerCostCents: number,
  _allowance?: RetailAllowanceInput
): number | null {
  void _allowance;
  if (!Number.isInteger(providerCostCents) || providerCostCents <= 0) {
    return null;
  }

  let retailCents: number;
  if (providerCostCents === 66) {
    retailCents = RETAIL_CENTS_FOR_PROVIDER_66;
  } else if (providerCostCents <= 100) {
    // Below $0.66, or $0.67–$1.00: +$0.50 (exact $0.66 handled above).
    retailCents = providerCostCents + RETAIL_ADD_CENTS_067_TO_100;
  } else if (providerCostCents >= 101 && providerCostCents <= 299) {
    retailCents = providerCostCents + RETAIL_ADD_CENTS_101_TO_299;
  } else if (providerCostCents >= 300 && providerCostCents <= 999) {
    retailCents = roundUpToNextCent(
      providerCostCents * RETAIL_MULTIPLIER_300_TO_999
    );
  } else {
    // providerCostCents >= 1000
    retailCents = roundUpToNextCent(
      providerCostCents * RETAIL_MULTIPLIER_1000_PLUS
    );
  }

  if (!Number.isInteger(retailCents) || retailCents < providerCostCents) {
    return null;
  }
  return retailCents;
}

/**
 * Destination list / "From" pricing when only VeSIM min cost is known.
 * Same provider-cost bands as offer retail (no assumed 100MB / % markup).
 */
export function calculateEntryRetailPriceCents(
  providerCostCents: number
): number | null {
  return calculateRetailPriceCents(providerCostCents);
}

/** Convenience: provider USD → retail USD (2dp), or null when invalid. */
export function calculateRetailPriceUsd(
  providerPriceUsd: number,
  allowance?: RetailAllowanceInput
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
 * Not for free-form marketing titles. Not used for retail profit calculation.
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
