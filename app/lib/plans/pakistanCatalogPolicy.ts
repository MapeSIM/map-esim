/**
 * Pakistan storefront catalog merchandising (pure, no I/O).
 * Hides retired PK packages and pins MAP retail for selected Day 1 / Day 7
 * packages plus Unlimited 30-day. Does not mutate orders, snapshots, or
 * provider offer IDs / providerPriceUSD.
 */

import {
  formatOfferPrice,
  type VesimOffer,
} from "@/app/lib/vesim/offers";

/** MAP retail for Pakistan Unlimited Data, 30 Days. */
export const PAKISTAN_UNLIMITED_30_RETAIL_CENTS = 2999;
export const PAKISTAN_UNLIMITED_30_RETAIL_USD =
  PAKISTAN_UNLIMITED_30_RETAIL_CENTS / 100;

/** Pakistan Day 1 package retail pins (USD cents). */
export const PAKISTAN_DAY1_500MB_RETAIL_CENTS = 99;
export const PAKISTAN_DAY1_1GB_RETAIL_CENTS = 129;
export const PAKISTAN_DAY1_2GB_RETAIL_CENTS = 199;
export const PAKISTAN_DAY1_3GB_RETAIL_CENTS = 330;
export const PAKISTAN_DAY1_10GB_RETAIL_CENTS = 499;

/** Pakistan Day 7 package retail pins (USD cents). */
export const PAKISTAN_DAY7_500MB_RETAIL_CENTS = 130;
export const PAKISTAN_DAY7_1GB_RETAIL_CENTS = 156;

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function isPakistanDestinationCode(
  raw: string | null | undefined
): boolean {
  const value = trimmed(raw);
  if (!value) return false;
  if (/^pk$/i.test(value)) return true;
  if (/^pakistan$/i.test(value)) return true;
  return false;
}

function isPakistanOffer(offer: VesimOffer, destination?: string | null): boolean {
  if (isPakistanDestinationCode(destination)) return true;
  if (isPakistanDestinationCode(offer.country)) return true;
  if (trimmed(offer.countryName).toLowerCase() === "pakistan") return true;
  const id = trimmed(offer.offerId || offer.id).toUpperCase();
  return /^ESIM-PK(?:-|$)/.test(id);
}

export function pakistanOfferDurationDays(offer: VesimOffer): number | null {
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

function isFiftyGbPackage(offer: VesimOffer): boolean {
  if (offer.dataUnlimited === true) return false;
  if (offer.dataGB === 50) return true;
  return /^50(?:\.0+)?\s*GB$/i.test(trimmed(offer.dataFormatted));
}

function isUnlimitedTenDayPackage(offer: VesimOffer): boolean {
  return offer.dataUnlimited === true && pakistanOfferDurationDays(offer) === 10;
}

function isUnlimitedThirtyDayPackage(offer: VesimOffer): boolean {
  return offer.dataUnlimited === true && pakistanOfferDurationDays(offer) === 30;
}

function isFiveHundredMbFamily(offer: VesimOffer): boolean {
  if (offer.dataUnlimited === true) return false;
  if (offer.dataMB === 500 || offer.dataMB === 502) return true;
  if (typeof offer.dataMB === "number" && Number.isFinite(offer.dataMB)) {
    return false;
  }
  // 500 MB / 502 MB labels (VeSIM sometimes lists 502 MB for the ~500 MB SKU).
  return /^(?:500|502)(?:\.0+)?\s*MB$/i.test(trimmed(offer.dataFormatted));
}

function isExactGbPackage(offer: VesimOffer, gb: number): boolean {
  if (offer.dataUnlimited === true) return false;
  if (offer.dataGB === gb) return true;
  if (typeof offer.dataGB === "number" && Number.isFinite(offer.dataGB)) {
    return false;
  }
  if (offer.dataMB === gb * 1024) return true;
  const re = new RegExp(`^${gb}(?:\\.0+)?\\s*GB$`, "i");
  return re.test(trimmed(offer.dataFormatted));
}

/**
 * Resolve pinned MAP retail USD for a Pakistan Day 1 / Day 7 / Unlimited 30 SKU.
 * Returns null when the offer is not one of the pinned packages.
 */
export function resolvePakistanPinnedRetailUsd(
  offer: VesimOffer
): number | null {
  const days = pakistanOfferDurationDays(offer);
  if (days == null) return null;

  if (isUnlimitedThirtyDayPackage(offer)) {
    return PAKISTAN_UNLIMITED_30_RETAIL_USD;
  }

  if (days === 1) {
    if (isFiveHundredMbFamily(offer)) {
      return PAKISTAN_DAY1_500MB_RETAIL_CENTS / 100;
    }
    if (isExactGbPackage(offer, 1)) return PAKISTAN_DAY1_1GB_RETAIL_CENTS / 100;
    if (isExactGbPackage(offer, 2)) return PAKISTAN_DAY1_2GB_RETAIL_CENTS / 100;
    if (isExactGbPackage(offer, 3)) return PAKISTAN_DAY1_3GB_RETAIL_CENTS / 100;
    if (isExactGbPackage(offer, 10)) return PAKISTAN_DAY1_10GB_RETAIL_CENTS / 100;
    return null;
  }

  if (days === 7) {
    if (isFiveHundredMbFamily(offer)) {
      return PAKISTAN_DAY7_500MB_RETAIL_CENTS / 100;
    }
    if (isExactGbPackage(offer, 1)) return PAKISTAN_DAY7_1GB_RETAIL_CENTS / 100;
    return null;
  }

  return null;
}

/** Retired PK packages — hidden from customer/partner catalog listing only. */
export function isHiddenPakistanCatalogOffer(offer: VesimOffer): boolean {
  return isFiftyGbPackage(offer) || isUnlimitedTenDayPackage(offer);
}

function withPinnedRetail(offer: VesimOffer, retailUsd: number): VesimOffer {
  const currency = trimmed(offer.currency) || "USD";
  return {
    ...offer,
    priceUSD: retailUsd,
    price: retailUsd,
    displayPrice: retailUsd,
    priceFormatted: formatOfferPrice(retailUsd, currency),
  };
}

/**
 * Pin Pakistan MAP retail for Day 1 / Day 7 / Unlimited 30 packages.
 * Used by public catalog and authoritative checkout verification (all roles).
 * Provider cost (`providerPriceUSD`) is preserved unchanged.
 */
export function applyPakistanRetailOverride(
  offer: VesimOffer,
  destination?: string | null
): VesimOffer {
  if (!isPakistanOffer(offer, destination)) return offer;
  const pinned = resolvePakistanPinnedRetailUsd(offer);
  if (pinned == null) return offer;
  return withPinnedRetail(offer, pinned);
}

/**
 * Customer/partner Pakistan catalog: hide retired packages, pin Day 1 / Day 7 /
 * Unlimited 30-day retail. Other destinations and remaining PK plans unchanged.
 */
export function applyPakistanPublicCatalog(
  destination: string,
  offers: VesimOffer[]
): VesimOffer[] {
  if (!Array.isArray(offers) || offers.length === 0) return offers;
  if (!isPakistanDestinationCode(destination)) return offers;
  return offers
    .filter((offer) => !isHiddenPakistanCatalogOffer(offer))
    .map((offer) => applyPakistanRetailOverride(offer, destination));
}
