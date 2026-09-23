/**
 * Partner catalog reads — Partner-facing offer cards.
 * Browse uses public destination/offer snapshots (fast).
 * Purchase still verifies live via verifyOfferAuthoritative.
 * Exposes final Partner price labels only — never discount %, retail,
 * provider cost, or raw partnerChargeCents.
 */
import "server-only";

import { applyPakistanPublicCatalog } from "@/app/lib/plans/pakistanCatalogPolicy";
import { partnerChargeCentsFromRetail } from "@/app/lib/partner/partnerPricing";
import {
  calculatePartnerPurchaseFunding,
  partnerPurchaseRequiresGateway,
} from "@/app/lib/partner/partnerPurchaseFunding";
import { destinationDisplayName } from "@/app/lib/vesim/destinationPresentation";
import {
  fetchPublicDestinationCatalog,
  fetchPublicOffersForCountry,
  sanitizeCountryHint,
  toVerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { PublicOfferSnapshotError } from "@/app/lib/vesim/publicOfferSnapshot";

export type PartnerCatalogDestination = {
  code: string;
  name: string;
  kind: string;
  flag?: string;
  isPopular?: boolean;
  slug?: string;
  searchAliases?: string[];
};

/** Split / gateway remainder labels for Partner purchase UI (display only). */
export type PartnerCatalogFundingDisplay = {
  totalLabel: string;
  walletAppliedLabel: string;
  gatewayRemainingLabel: string;
  requiresGateway: boolean;
  /** Final Partner payable after discount (integer USD cents). */
  totalCents: number;
  walletAppliedCents: number;
  gatewayAmountCents: number;
};

/** Partner-facing offer card. No discount / provider / charge cents fields. */
export type PartnerCatalogOffer = {
  offerId: string;
  name: string;
  dataLabel: string;
  validityLabel: string;
  /** Final Partner price after admin discount — display only. */
  partnerPriceLabel: string;
  destinationLabel: string;
  /** Present when split payment UI is enabled. */
  fundingDisplay: PartnerCatalogFundingDisplay | null;
};

export type PartnerCatalogOfferPricingContext = {
  /** Partner profile discountBps (server-loaded). */
  discountBps: number;
  /** Partner wallet balance cents (server-loaded). */
  walletBalanceCents: number;
  /** When true, attach wallet/gateway funding labels. */
  splitPaymentEnabled?: boolean;
};

/**
 * Partner destination picker — public cached catalog (not live VeSIM).
 */
export async function listPartnerCatalogDestinations(): Promise<
  PartnerCatalogDestination[]
> {
  try {
    const destinations = await fetchPublicDestinationCatalog();
    return destinations
      .filter((d) => Boolean(d.code?.trim()))
      .slice(0, 400)
      .map((d) => ({
        code: d.code,
        name: destinationDisplayName(d),
        kind: d.kind,
        flag: d.flag,
        isPopular: d.isPopular === true,
        slug: d.slug,
        searchAliases: d.searchAliases,
      }));
  } catch {
    return [];
  }
}

function buildPartnerCatalogOfferDisplay(input: {
  offerId: string;
  name: string;
  dataLabel: string;
  validityLabel: string;
  destinationLabel: string;
  retailPriceCents: number;
  pricing?: PartnerCatalogOfferPricingContext;
}): PartnerCatalogOffer | null {
  const discountBps = input.pricing?.discountBps ?? 0;
  const partnerChargeCents = partnerChargeCentsFromRetail(
    input.retailPriceCents,
    discountBps
  );
  if (partnerChargeCents == null || partnerChargeCents <= 0) return null;

  let fundingDisplay: PartnerCatalogFundingDisplay | null = null;
  if (input.pricing?.splitPaymentEnabled) {
    const funding = calculatePartnerPurchaseFunding({
      partnerChargeCents,
      walletBalanceCents: Math.max(0, input.pricing.walletBalanceCents),
      useWallet: true,
    });
    fundingDisplay = {
      totalLabel: `${formatUsdCents(funding.partnerChargeCents)} USD`,
      walletAppliedLabel: `${formatUsdCents(funding.walletAppliedCents)} USD`,
      gatewayRemainingLabel: `${formatUsdCents(funding.gatewayAmountCents)} USD`,
      requiresGateway: partnerPurchaseRequiresGateway(funding),
      totalCents: funding.partnerChargeCents,
      walletAppliedCents: funding.walletAppliedCents,
      gatewayAmountCents: funding.gatewayAmountCents,
    };
  }

  return {
    offerId: input.offerId,
    name: input.name,
    dataLabel: input.dataLabel,
    validityLabel: input.validityLabel,
    partnerPriceLabel: `${formatUsdCents(partnerChargeCents)} USD`,
    destinationLabel: input.destinationLabel,
    fundingDisplay,
  };
}

/**
 * List Partner-priced offers for a destination (public snapshot / background refresh).
 * Strips supplier cost — Partner never sees providerPriceUSD / discount %.
 * Buy/prepare still calls verifyOfferAuthoritative (live VeSIM).
 */
export async function listPartnerCatalogOffers(
  destinationCode: string,
  pricing?: PartnerCatalogOfferPricingContext
): Promise<PartnerCatalogOffer[]> {
  const code = sanitizeCountryHint(destinationCode);
  if (!code) return [];

  try {
    const offers = applyPakistanPublicCatalog(
      code,
      await fetchPublicOffersForCountry(code, {
        refreshMode: "background",
        applyAsiaCustomerOverlay: false,
      })
    );
    const out: PartnerCatalogOffer[] = [];
    for (const offer of offers) {
      const verified = toVerifiedCheckoutOffer(offer, code, {
        applyAsiaTemporaryMarkup: false,
      });
      if (!verified) continue;
      const retailCents = Math.round(verified.priceUSD * 100);
      if (!Number.isFinite(retailCents) || retailCents <= 0) continue;
      const row = buildPartnerCatalogOfferDisplay({
        offerId: verified.offerId,
        name: verified.name,
        dataLabel: verified.dataFormatted || "Not available",
        validityLabel:
          verified.durationDays != null
            ? `${verified.durationDays} Days`
            : "Not available",
        destinationLabel:
          verified.countryName || verified.countryCode || code,
        retailPriceCents: retailCents,
        pricing,
      });
      if (row) out.push(row);
    }
    return out;
  } catch (error) {
    if (error instanceof PublicOfferSnapshotError) {
      return [];
    }
    return [];
  }
}

/** Pure mapper for QA — Partner price label only (optional discount context). */
export function partnerCatalogOfferFromRetail(input: {
  offerId: string;
  name: string;
  dataFormatted: string;
  durationDays: number | null;
  priceUSD: number;
  countryName: string | null;
  countryCode: string | null;
  discountBps?: number;
  walletBalanceCents?: number;
  splitPaymentEnabled?: boolean;
}): PartnerCatalogOffer | null {
  const retailCents = Math.round(input.priceUSD * 100);
  if (!Number.isFinite(retailCents) || retailCents <= 0) return null;
  const offerId = (input.offerId ?? "").trim();
  if (!offerId) return null;
  return buildPartnerCatalogOfferDisplay({
    offerId,
    name: (input.name ?? "").trim() || "eSIM",
    dataLabel: (input.dataFormatted ?? "").trim() || "Not available",
    validityLabel:
      input.durationDays != null
        ? `${input.durationDays} Days`
        : "Not available",
    destinationLabel:
      (input.countryName ?? "").trim() ||
      (input.countryCode ?? "").trim() ||
      "Destination",
    retailPriceCents: retailCents,
    pricing:
      input.discountBps != null ||
      input.walletBalanceCents != null ||
      input.splitPaymentEnabled
        ? {
            discountBps: input.discountBps ?? 0,
            walletBalanceCents: input.walletBalanceCents ?? 0,
            splitPaymentEnabled: input.splitPaymentEnabled === true,
          }
        : { discountBps: 0, walletBalanceCents: 0, splitPaymentEnabled: false },
  });
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
    "retailPriceLabel",
    "retailPriceCents",
  ] as const;
}
