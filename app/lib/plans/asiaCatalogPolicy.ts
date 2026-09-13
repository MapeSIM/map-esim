/**
 * Asia regional storefront overlay (pure, no I/O).
 * Temporary % markup and the 500 MB / 3 Days retail pin stay disabled.
 * Only the Asialink 1 GB / 7 Days customer retail pin is applied.
 * Does not mutate provider cost, base retail bands, orders, or snapshots at source.
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

/**
 * Customer MAP retail for Region Asia / Asialink / 1 GB / 7 Days.
 * 849 PKR at the fixed 293 PKR/USD display rate. Provider cost is unchanged.
 */
export const ASIA_1GB_7DAY_RETAIL_USD = 849 / 293;

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

function isOneGbPackage(offer: VesimOffer): boolean {
  if (offer.dataUnlimited === true) return false;
  if (offer.dataGB === 1) return true;
  if (typeof offer.dataGB === "number" && Number.isFinite(offer.dataGB)) {
    return false;
  }
  if (offer.dataMB === 1024) return true;
  return /^1(?:\.0+)?\s*GB$/i.test(trimmed(offer.dataFormatted));
}

function isAsialinkOffer(offer: VesimOffer): boolean {
  const parts = [
    offer.id,
    offer.offerId,
    offer.name,
    offer.network,
    ...(Array.isArray(offer.networks) ? offer.networks : []),
  ];
  return parts.some((value) => /asialink/i.test(trimmed(value)));
}

export function isAsia1Gb7DayAsialinkPackage(offer: VesimOffer): boolean {
  return (
    isAsialinkOffer(offer) &&
    isOneGbPackage(offer) &&
    asiaOfferDurationDays(offer) === 7
  );
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
 * Pin customer retail for Region Asia / Asialink / 1 GB / 7 Days only.
 * Other Asia SKUs and non-Asia destinations keep default MAP retail.
 * Provider cost (`providerPriceUSD`) is preserved unchanged.
 */
export function applyAsiaRetailOverride(
  offer: VesimOffer,
  destination?: string | null
): VesimOffer {
  if (
    !isAsiaRegionalDestinationCode(destination) &&
    !isAsiaRegionalDestinationCode(offer.country)
  ) {
    return offer;
  }
  if (!isAsia1Gb7DayAsialinkPackage(offer)) return offer;

  const currency = trimmed(offer.currency) || "USD";
  return {
    ...offer,
    priceUSD: ASIA_1GB_7DAY_RETAIL_USD,
    price: ASIA_1GB_7DAY_RETAIL_USD,
    displayPrice: ASIA_1GB_7DAY_RETAIL_USD,
    priceFormatted: formatOfferPrice(ASIA_1GB_7DAY_RETAIL_USD, currency),
  };
}

/**
 * Customer storefront Asia retail. Same function is used for catalog and checkout.
 * Applies only the Asialink 1 GB / 7 Days pin; % markup stays disabled.
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
 * Only the Asialink 1 GB / 7 Days SKU is pinned; other plans keep default MAP retail.
 */
export function applyAsiaPublicCatalog(
  destination: string,
  offers: VesimOffer[]
): VesimOffer[] {
  if (!Array.isArray(offers) || offers.length === 0) return offers;
  if (!isAsiaRegionalDestinationCode(destination)) return offers;
  return offers.map((offer) => applyAsiaCustomerRetailPrice(offer, destination));
}
