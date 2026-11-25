/**
 * Partner catalog reads — Partner-facing destination + offer cards.
 * Browse uses public destination/offer snapshots (fast).
 * Purchase still verifies live via verifyOfferAuthoritative.
 * Catalog shows MAP retail; Partner discount % is applied at checkout.
 * Never exposes provider cost or raw discountBps to the client.
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import { applyPakistanPublicCatalog } from "@/app/lib/plans/pakistanCatalogPolicy";
import { partnerChargeCentsFromRetail } from "@/app/lib/partner/partnerPricing";
import {
  calculatePartnerPurchaseFunding,
  partnerPurchaseRequiresGateway,
} from "@/app/lib/partner/partnerPurchaseFunding";
import { planCardOperatorLabel } from "@/app/lib/plans/planOfferPresentation";
import { destinationDisplayName } from "@/app/lib/vesim/destinationPresentation";
import type { VesimOffer } from "@/app/lib/vesim/offers";
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
  /** Snapshot-backed plan count for destination cards. */
  planCount: number;
  /** Lowest retail USD for "From $X" on destination cards. */
  minRetailPriceUsd: number | null;
  minRetailPriceLabel: string | null;
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

/**
 * Partner-facing offer card.
 * Never includes raw discountBps, partnerChargeCents field name, or provider cost.
 * retailPriceLabel is portal display only (discount still applied server-side at buy).
 */
export type PartnerCatalogOffer = {
  offerId: string;
  name: string;
  dataLabel: string;
  validityLabel: string;
  durationDays: number | null;
  networkLabel: string | null;
  isUnlimited: boolean;
  retailPriceUsd: number;
  /** MAP eSIM retail list price — shown on catalog with discount-at-checkout note. */
  retailPriceLabel: string;
  /** Final Partner price after admin discount — charged at checkout. */
  partnerPriceLabel: string;
  /**
   * Final Partner payable (integer USD cents) for balance sufficiency UI.
   * Display/check only — purchase path recomputes server-side.
   */
  partnerPriceCents: number;
  destinationLabel: string;
  /** Present when split payment UI is enabled. */
  fundingDisplay: PartnerCatalogFundingDisplay | null;
  /** Read-only VeSIM capability — portal Add More Data / API catalog signal. */
  supportTopUp: boolean;
  supportTopUpType: string | null;
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
 * Snapshot-only min retail + plan counts (no live VeSIM fan-out).
 */
async function loadDestinationRetailStats(): Promise<
  Map<string, { planCount: number; minRetailCents: number }>
> {
  const out = new Map<string, { planCount: number; minRetailCents: number }>();
  try {
    const snapshots = await prisma.publicDestinationOfferSnapshot.findMany({
      select: { destinationCode: true, offersJson: true },
    });
    for (const snap of snapshots) {
      const code = sanitizeCountryHint(snap.destinationCode);
      if (!code) continue;
      const raw = Array.isArray(snap.offersJson)
        ? (snap.offersJson as unknown as VesimOffer[])
        : [];
      const offers = applyPakistanPublicCatalog(code, raw);
      let planCount = 0;
      let minRetailCents: number | null = null;
      for (const offer of offers) {
        const verified = toVerifiedCheckoutOffer(offer, code, {
          applyAsiaTemporaryMarkup: false,
        });
        if (!verified) continue;
        const retailCents = Math.round(verified.priceUSD * 100);
        if (!Number.isFinite(retailCents) || retailCents <= 0) continue;
        planCount += 1;
        if (minRetailCents == null || retailCents < minRetailCents) {
          minRetailCents = retailCents;
        }
      }
      if (planCount > 0 && minRetailCents != null) {
        out.set(code, { planCount, minRetailCents });
      }
    }
  } catch {
    // leave empty — cards show "—" / 0 plans
  }
  return out;
}

/**
 * Partner destination picker — public cached catalog (not live VeSIM).
 * Enriched with snapshot plan counts + starting retail for destination cards.
 */
export async function listPartnerCatalogDestinations(): Promise<
  PartnerCatalogDestination[]
> {
  try {
    const [destinations, stats] = await Promise.all([
      fetchPublicDestinationCatalog(),
      loadDestinationRetailStats(),
    ]);
    return destinations
      .filter((d) => Boolean(d.code?.trim()))
      .slice(0, 400)
      .map((d) => {
        const code = d.code;
        const stat = stats.get(sanitizeCountryHint(code) || code);
        const minRetailCents = stat?.minRetailCents ?? null;
        return {
          code,
          name: destinationDisplayName(d),
          kind: d.kind,
          flag: d.flag,
          isPopular: d.isPopular === true,
          slug: d.slug,
          searchAliases: d.searchAliases,
          planCount: stat?.planCount ?? d.offerCount ?? 0,
          minRetailPriceUsd:
            minRetailCents != null
              ? Number((minRetailCents / 100).toFixed(2))
              : d.minPrice != null && Number.isFinite(d.minPrice)
                ? Number(d.minPrice)
                : null,
          minRetailPriceLabel:
            minRetailCents != null
              ? formatUsdCents(minRetailCents)
              : d.minPrice != null && Number.isFinite(d.minPrice)
                ? `$${Number(d.minPrice).toFixed(2)}`
                : null,
        };
      });
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
  durationDays?: number | null;
  networkLabel?: string | null;
  isUnlimited?: boolean;
  supportTopUp?: boolean;
  supportTopUpType?: string | null;
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

  const supportTopUp = input.supportTopUp === true;
  const rawType = input.supportTopUpType;
  const supportTopUpType =
    supportTopUp && typeof rawType === "string" && rawType.trim()
      ? rawType.trim()
      : null;

  return {
    offerId: input.offerId,
    name: input.name,
    dataLabel: input.dataLabel,
    validityLabel: input.validityLabel,
    durationDays: input.durationDays ?? null,
    networkLabel: input.networkLabel ?? null,
    isUnlimited: input.isUnlimited === true,
    retailPriceUsd: Number((input.retailPriceCents / 100).toFixed(2)),
    retailPriceLabel: `${formatUsdCents(input.retailPriceCents)} USD`,
    partnerPriceLabel: `${formatUsdCents(partnerChargeCents)} USD`,
    partnerPriceCents: partnerChargeCents,
    destinationLabel: input.destinationLabel,
    fundingDisplay,
    supportTopUp,
    supportTopUpType,
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
            ? verified.durationDays === 1
              ? "1 Day"
              : `${verified.durationDays} Days`
            : "Not available",
        destinationLabel:
          verified.countryName || verified.countryCode || code,
        retailPriceCents: retailCents,
        durationDays: verified.durationDays ?? null,
        networkLabel: planCardOperatorLabel(offer),
        isUnlimited:
          offer.dataUnlimited === true ||
          /unlimited/i.test(verified.dataFormatted || "") ||
          /unlimited/i.test(offer.dataFormatted || ""),
        supportTopUp: offer.supportTopUp === true,
        supportTopUpType: offer.supportTopUpType ?? null,
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
        ? input.durationDays === 1
          ? "1 Day"
          : `${input.durationDays} Days`
        : "Not available",
    destinationLabel:
      (input.countryName ?? "").trim() ||
      (input.countryCode ?? "").trim() ||
      "Destination",
    retailPriceCents: retailCents,
    durationDays: input.durationDays ?? null,
    networkLabel: null,
    isUnlimited: /unlimited/i.test(input.dataFormatted || ""),
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
    "retailPriceCents",
  ] as const;
}
