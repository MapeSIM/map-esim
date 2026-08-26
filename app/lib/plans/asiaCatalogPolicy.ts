/**
 * Temporary Asia regional storefront retail overlay (pure, no I/O).
 * Applies a reversible % markup on top of existing MAP retail for region-asia only.
 * Does not mutate provider cost, base retail bands, orders, or snapshots at source.
 */

import { roundUpToNextCent } from "@/app/lib/pricing/retailPrice";
import {
  formatOfferPrice,
  type VesimOffer,
} from "@/app/lib/vesim/offers";

/** Set to 0 to disable — restores exact base MAP retail automatically. */
export const ASIA_TEMPORARY_RETAIL_MARKUP_PERCENT = 45;

export const ASIA_REGIONAL_DESTINATION_CODE = "region-asia";

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function isAsiaRegionalDestinationCode(
  raw: string | null | undefined
): boolean {
  const value = trimmed(raw).toLowerCase();
  return value === ASIA_REGIONAL_DESTINATION_CODE;
}

export function isAsiaTemporaryRetailMarkupActive(
  percent: number = ASIA_TEMPORARY_RETAIL_MARKUP_PERCENT
): boolean {
  return Number.isFinite(percent) && percent > 0;
}

/**
 * Apply the temporary Asia markup multiplier to an existing MAP retail USD amount.
 * Formula: temporaryRetailPrice = currentRetailPrice * (1 + percent / 100), ceil to cent.
 */
export function applyAsiaTemporaryRetailMarkupUsd(
  retailUsd: number,
  percent: number = ASIA_TEMPORARY_RETAIL_MARKUP_PERCENT
): number {
  if (!Number.isFinite(retailUsd) || retailUsd <= 0) return retailUsd;
  if (!isAsiaTemporaryRetailMarkupActive(percent)) return retailUsd;
  const multiplier = 1 + percent / 100;
  const markedUpCents = roundUpToNextCent(retailUsd * 100 * multiplier);
  return markedUpCents / 100;
}

function resolveRetailUsd(offer: VesimOffer): number | null {
  if (typeof offer.priceUSD === "number" && Number.isFinite(offer.priceUSD)) {
    return offer.priceUSD;
  }
  if (typeof offer.price === "number" && Number.isFinite(offer.price)) {
    return offer.price;
  }
  if (
    typeof offer.displayPrice === "number" &&
    Number.isFinite(offer.displayPrice)
  ) {
    return offer.displayPrice;
  }
  return null;
}

/**
 * Bump MAP retail display/charge fields for Asia regional plans.
 * Provider cost (`providerPriceUSD`) is preserved unchanged.
 */
export function applyAsiaTemporaryRetailMarkup(
  offer: VesimOffer,
  destination?: string | null
): VesimOffer {
  if (!isAsiaRegionalDestinationCode(destination)) return offer;
  if (!isAsiaTemporaryRetailMarkupActive()) return offer;

  const currentRetail = resolveRetailUsd(offer);
  if (currentRetail == null || currentRetail <= 0) return offer;

  const temporaryRetail = applyAsiaTemporaryRetailMarkupUsd(currentRetail);
  if (temporaryRetail === currentRetail) return offer;

  const currency = trimmed(offer.currency) || "USD";
  return {
    ...offer,
    priceUSD: temporaryRetail,
    price: temporaryRetail,
    displayPrice: temporaryRetail,
    priceFormatted: formatOfferPrice(temporaryRetail, currency),
  };
}

/**
 * Customer storefront Asia regional catalog overlay.
 * Standard and Unlimited plans on region-asia receive the temporary markup.
 */
export function applyAsiaPublicCatalog(
  destination: string,
  offers: VesimOffer[]
): VesimOffer[] {
  if (!Array.isArray(offers) || offers.length === 0) return offers;
  if (!isAsiaRegionalDestinationCode(destination)) return offers;
  if (!isAsiaTemporaryRetailMarkupActive()) return offers;
  return offers.map((offer) => applyAsiaTemporaryRetailMarkup(offer, destination));
}
