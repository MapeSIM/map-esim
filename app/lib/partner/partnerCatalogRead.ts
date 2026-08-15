/**
 * Partner catalog reads — MAP retail offers only.
 * Never exposes discount, provider cost, or partner charge.
 */
import "server-only";

import {
  listAdminAssignmentDestinations,
  type AdminDestinationOption,
} from "@/app/lib/esim/adminPackageAssignmentRead";
import {
  fetchOffersForCountry,
  sanitizeCountryHint,
  toVerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";
import { formatUsdCents } from "@/app/lib/wallet/display";

export type PartnerCatalogDestination = AdminDestinationOption;

/** Retail-facing offer card. No discount / provider / charge fields. */
export type PartnerCatalogOffer = {
  offerId: string;
  name: string;
  dataLabel: string;
  validityLabel: string;
  /** MAP retail catalog price — same public semantics. */
  retailPriceLabel: string;
  destinationLabel: string;
};

export async function listPartnerCatalogDestinations(): Promise<
  PartnerCatalogDestination[]
> {
  return listAdminAssignmentDestinations();
}

/**
 * List MAP retail offers for a destination.
 * Strips supplier cost — Partner never sees providerPriceUSD.
 */
export async function listPartnerCatalogOffers(
  destinationCode: string
): Promise<PartnerCatalogOffer[]> {
  const code = sanitizeCountryHint(destinationCode);
  if (!code) return [];

  try {
    const offers = await fetchOffersForCountry(code);
    const out: PartnerCatalogOffer[] = [];
    for (const offer of offers) {
      const verified = toVerifiedCheckoutOffer(offer, code);
      if (!verified) continue;
      const retailCents = Math.round(verified.priceUSD * 100);
      if (!Number.isFinite(retailCents) || retailCents <= 0) continue;
      out.push({
        offerId: verified.offerId,
        name: verified.name,
        dataLabel: verified.dataFormatted || "Not available",
        validityLabel:
          verified.durationDays != null
            ? `${verified.durationDays} Days`
            : "Not available",
        retailPriceLabel: `${formatUsdCents(retailCents)} USD`,
        destinationLabel:
          verified.countryName || verified.countryCode || code,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Pure mapper for QA — asserts retail-only shape. */
export function partnerCatalogOfferFromRetail(input: {
  offerId: string;
  name: string;
  dataFormatted: string;
  durationDays: number | null;
  priceUSD: number;
  countryName: string | null;
  countryCode: string | null;
}): PartnerCatalogOffer | null {
  const retailCents = Math.round(input.priceUSD * 100);
  if (!Number.isFinite(retailCents) || retailCents <= 0) return null;
  const offerId = (input.offerId ?? "").trim();
  if (!offerId) return null;
  return {
    offerId,
    name: (input.name ?? "").trim() || "eSIM",
    dataLabel: (input.dataFormatted ?? "").trim() || "Not available",
    validityLabel:
      input.durationDays != null
        ? `${input.durationDays} Days`
        : "Not available",
    retailPriceLabel: `${formatUsdCents(retailCents)} USD`,
    destinationLabel:
      (input.countryName ?? "").trim() ||
      (input.countryCode ?? "").trim() ||
      "Destination",
  };
}

export function partnerCatalogOfferForbiddenKeys(): readonly string[] {
  return [
    "discountBps",
    "discountVersion",
    "partnerChargeCents",
    "providerCostCents",
    "providerPriceUSD",
    "providerCostLabel",
    "discountPercent",
  ] as const;
}
