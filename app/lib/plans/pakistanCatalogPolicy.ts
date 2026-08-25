/**
 * Pakistan storefront catalog merchandising (pure, no I/O).
 * Hides retired PK packages and pins Unlimited 30-day MAP retail.
 * Does not mutate orders, snapshots, or provider offer IDs.
 */

import {
  formatOfferPrice,
  type VesimOffer,
} from "@/app/lib/vesim/offers";

/** MAP retail for Pakistan Unlimited Data, 30 Days. */
export const PAKISTAN_UNLIMITED_30_RETAIL_CENTS = 2999;
export const PAKISTAN_UNLIMITED_30_RETAIL_USD =
  PAKISTAN_UNLIMITED_30_RETAIL_CENTS / 100;

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

/** Retired PK packages — hidden from customer/partner catalog listing only. */
export function isHiddenPakistanCatalogOffer(offer: VesimOffer): boolean {
  return isFiftyGbPackage(offer) || isUnlimitedTenDayPackage(offer);
}

export function applyPakistanRetailOverride(
  offer: VesimOffer,
  destination?: string | null
): VesimOffer {
  if (!isPakistanOffer(offer, destination)) return offer;
  if (!isUnlimitedThirtyDayPackage(offer)) return offer;
  const currency = trimmed(offer.currency) || "USD";
  return {
    ...offer,
    priceUSD: PAKISTAN_UNLIMITED_30_RETAIL_USD,
    price: PAKISTAN_UNLIMITED_30_RETAIL_USD,
    displayPrice: PAKISTAN_UNLIMITED_30_RETAIL_USD,
    priceFormatted: formatOfferPrice(PAKISTAN_UNLIMITED_30_RETAIL_USD, currency),
  };
}

/**
 * Customer/partner Pakistan catalog: hide retired packages, pin Unlimited 30-day retail.
 * Other destinations and remaining PK plans are unchanged.
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
