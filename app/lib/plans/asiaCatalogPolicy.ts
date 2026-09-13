/**
 * Asia regional storefront overlay (pure, no I/O).
 * Temporary % markup and the 500 MB / 3 Days retail pin are disabled so
 * region-asia uses default MAP retail. Does not mutate provider cost,
 * base retail bands, orders, or snapshots at source.
 */

import { roundUpToNextCent } from "@/app/lib/pricing/retailPrice";
import {
  formatOfferPrice,
  type VesimOffer,
} from "@/app/lib/vesim/offers";

/** Set to 0 to disable — restores exact base MAP retail automatically. */
export const ASIA_TEMPORARY_RETAIL_MARKUP_PERCENT = 0;

export const ASIA_REGIONAL_DESTINATION_CODE = "region-asia";

/**
 * Former Asia 500 MB / 3 Days pin. Not applied — that SKU uses default MAP retail.
 */
export const ASIA_500MB_3DAY_RETAIL_CENTS = 341;
export const ASIA_500MB_3DAY_RETAIL_USD = ASIA_500MB_3DAY_RETAIL_CENTS / 100;

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

export function asiaOfferDurationDays(offer: VesimOffer): number | null {
  const raw =
    typeof offer.durationDays === "number" && Number.isFinite(offer.durationDays)
      ? offer.durationDays
      : typeof offer.validity === "number" && Number.isFinite(offer.validity)
        ? offer.validity
        : null;
  if (raw == null || raw <= 0) return null;
  const days = Number.isInteger(raw) ? raw : Math.round(raw);
  return days > 0 ? days : null;
}

function isFiveHundredMbPackage(offer: VesimOffer): boolean {
  if (offer.dataUnlimited === true) return false;
  if (offer.dataMB === 500) return true;
  if (typeof offer.dataMB === "number" && Number.isFinite(offer.dataMB)) {
    return false;
  }
  return /^500(?:\.0+)?\s*MB$/i.test(trimmed(offer.dataFormatted));
}

export function isAsia500Mb3DayPackage(offer: VesimOffer): boolean {
  return isFiveHundredMbPackage(offer) && asiaOfferDurationDays(offer) === 3;
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
 * Former Asia 500 MB / 3 Days retail pin. Disabled — offer keeps default MAP retail.
 * Provider cost (`providerPriceUSD`) is preserved unchanged.
 */
export function applyAsiaRetailOverride(
  offer: VesimOffer,
  _destination?: string | null
): VesimOffer {
  void _destination;
  return offer;
}

/**
 * Customer storefront Asia retail. Markup and SKU pin are currently disabled,
 * so this returns default MAP retail. Same function is used for catalog and checkout.
 */
export function applyAsiaCustomerRetailPrice(
  offer: VesimOffer,
  destination?: string | null
): VesimOffer {
  return applyAsiaRetailOverride(
    applyAsiaTemporaryRetailMarkup(offer, destination),
    destination
  );
}

/**
 * Customer storefront Asia regional catalog overlay.
 * With markup and SKU pin disabled, region-asia offers keep default MAP retail.
 */
export function applyAsiaPublicCatalog(
  destination: string,
  offers: VesimOffer[]
): VesimOffer[] {
  if (!Array.isArray(offers) || offers.length === 0) return offers;
  if (!isAsiaRegionalDestinationCode(destination)) return offers;
  return offers.map((offer) => applyAsiaCustomerRetailPrice(offer, destination));
}
