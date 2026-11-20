/**
 * Partner Public API catalog reads — destinations + partner-priced offers.
 * Never leaks supplier names, provider cost, or discount internals.
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import {
  listPartnerCatalogDestinations,
  listPartnerCatalogOffers,
  type PartnerCatalogOffer,
} from "@/app/lib/partner/partnerCatalogRead";
import { partnerChargeCentsFromRetail } from "@/app/lib/partner/partnerPricing";
import { applyPakistanPublicCatalog } from "@/app/lib/plans/pakistanCatalogPolicy";
import { destinationDisplayName } from "@/app/lib/vesim/destinationPresentation";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import {
  fetchPublicDestinationCatalog,
  fetchPublicOffersForCountry,
  normalizeOfferId,
  sanitizeCountryHint,
  toVerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";
import { formatUsdCents } from "@/app/lib/wallet/display";

export type PartnerApiDestinationRow = {
  code: string;
  name: string;
  kind: string;
  flag?: string;
  minPartnerPriceUsd: number | null;
  minPartnerPriceLabel: string | null;
};

export type PartnerApiOfferRow = {
  offerId: string;
  name: string;
  dataLabel: string;
  validityLabel: string;
  destinationCode: string;
  destinationLabel: string;
  region: string | null;
  partnerPriceUsd: number;
  partnerPriceCents: number;
  partnerPriceLabel: string;
  currency: "USD";
};

function offerToApiRow(
  offer: PartnerCatalogOffer,
  destinationCode: string,
  region: string | null
): PartnerApiOfferRow {
  return {
    offerId: offer.offerId,
    name: offer.name,
    dataLabel: offer.dataLabel,
    validityLabel: offer.validityLabel,
    destinationCode,
    destinationLabel: offer.destinationLabel,
    region,
    partnerPriceUsd: Number((offer.partnerPriceCents / 100).toFixed(2)),
    partnerPriceCents: offer.partnerPriceCents,
    partnerPriceLabel: offer.partnerPriceLabel,
    currency: "USD",
  };
}

function mapSnapshotOffer(input: {
  offer: VesimOffer;
  destinationCode: string;
  discountBps: number;
}): PartnerApiOfferRow | null {
  const verified = toVerifiedCheckoutOffer(input.offer, input.destinationCode, {
    applyAsiaTemporaryMarkup: false,
  });
  if (!verified) return null;
  const retailCents = Math.round(verified.priceUSD * 100);
  if (!Number.isFinite(retailCents) || retailCents <= 0) return null;
  const partnerChargeCents = partnerChargeCentsFromRetail(
    retailCents,
    input.discountBps
  );
  if (partnerChargeCents == null || partnerChargeCents <= 0) return null;
  const offerRegions = input.offer.regions;
  const region =
    Array.isArray(offerRegions) && offerRegions.length > 0
      ? String(offerRegions[0])
      : input.destinationCode.startsWith("region-")
        ? input.destinationCode
        : null;
  return {
    offerId: verified.offerId,
    name: verified.name,
    dataLabel: verified.dataFormatted || "Not available",
    validityLabel:
      verified.durationDays != null
        ? `${verified.durationDays} Days`
        : "Not available",
    destinationCode: input.destinationCode,
    destinationLabel:
      verified.countryName || verified.countryCode || input.destinationCode,
    region,
    partnerPriceUsd: Number((partnerChargeCents / 100).toFixed(2)),
    partnerPriceCents: partnerChargeCents,
    partnerPriceLabel: `${formatUsdCents(partnerChargeCents)} USD`,
    currency: "USD",
  };
}

export async function listPartnerApiDestinations(options: {
  discountBps: number;
}): Promise<PartnerApiDestinationRow[]> {
  const destinations = await listPartnerCatalogDestinations();
  const out: PartnerApiDestinationRow[] = [];

  // Prefer DB snapshots for min-price without live fan-out.
  const snapshots = await prisma.publicDestinationOfferSnapshot.findMany({
    select: {
      destinationCode: true,
      offersJson: true,
    },
  });
  const minByCode = new Map<string, number>();
  for (const snap of snapshots) {
    const code = sanitizeCountryHint(snap.destinationCode);
    if (!code) continue;
    const raw = Array.isArray(snap.offersJson)
      ? (snap.offersJson as unknown as VesimOffer[])
      : [];
    const offers = applyPakistanPublicCatalog(code, raw);
    let minCents: number | null = null;
    for (const offer of offers) {
      const mapped = mapSnapshotOffer({
        offer,
        destinationCode: code,
        discountBps: options.discountBps,
      });
      if (!mapped) continue;
      if (minCents == null || mapped.partnerPriceCents < minCents) {
        minCents = mapped.partnerPriceCents;
      }
    }
    if (minCents != null) minByCode.set(code, minCents);
  }

  for (const d of destinations) {
    const minCents = minByCode.get(d.code) ?? null;
    out.push({
      code: d.code,
      name: d.name,
      kind: d.kind,
      flag: d.flag,
      minPartnerPriceUsd:
        minCents != null ? Number((minCents / 100).toFixed(2)) : null,
      minPartnerPriceLabel:
        minCents != null ? `${formatUsdCents(minCents)} USD` : null,
    });
  }
  return out;
}

export async function listPartnerApiOffers(options: {
  discountBps: number;
  page: number;
  limit: number;
  country?: string | null;
  region?: string | null;
  search?: string | null;
  fullCatalog?: boolean;
}): Promise<{
  offers: PartnerApiOfferRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}> {
  const page = Math.max(1, options.page);
  const limit = Math.min(500, Math.max(1, options.limit));
  const country = sanitizeCountryHint(options.country);
  const region = (options.region ?? "").trim().toLowerCase() || null;
  const search = (options.search ?? "").trim().toLowerCase() || null;

  const collected: PartnerApiOfferRow[] = [];

  if (country && !options.fullCatalog) {
    const offers = await listPartnerCatalogOffers(country, {
      discountBps: options.discountBps,
      walletBalanceCents: 0,
      splitPaymentEnabled: false,
    });
    for (const offer of offers) {
      collected.push(offerToApiRow(offer, country, region));
    }
  } else {
    // Full catalog (or filtered across destinations): read snapshots then price.
    const snapshots = await prisma.publicDestinationOfferSnapshot.findMany({
      select: { destinationCode: true, offersJson: true },
      orderBy: { destinationCode: "asc" },
    });
    // Fallback: if no snapshots, walk destination catalog (background refresh).
    if (snapshots.length === 0) {
      const destinations = await fetchPublicDestinationCatalog().catch(() => []);
      for (const d of destinations.slice(0, 80)) {
        const code = sanitizeCountryHint(d.code);
        if (!code) continue;
        if (country && code !== country) continue;
        try {
          const offers = await listPartnerCatalogOffers(code, {
            discountBps: options.discountBps,
            walletBalanceCents: 0,
            splitPaymentEnabled: false,
          });
          for (const offer of offers) {
            collected.push(
              offerToApiRow(
                offer,
                code,
                d.kind === "regional" || d.kind === "global" ? code : null
              )
            );
          }
        } catch {
          // skip destination
        }
      }
    } else {
      for (const snap of snapshots) {
        const code = sanitizeCountryHint(snap.destinationCode);
        if (!code) continue;
        if (country && code !== country) continue;
        if (region && !code.toLowerCase().includes(region) && code !== region) {
          continue;
        }
        const raw = Array.isArray(snap.offersJson)
          ? (snap.offersJson as unknown as VesimOffer[])
          : [];
        const offers = applyPakistanPublicCatalog(
          code,
          await Promise.resolve(raw)
        );
        // Prefer live-ish snapshot transform without Asia customer overlay.
        let liveOffers = offers;
        try {
          liveOffers = applyPakistanPublicCatalog(
            code,
            await fetchPublicOffersForCountry(code, {
              refreshMode: "background",
              applyAsiaCustomerOverlay: false,
            })
          );
        } catch {
          liveOffers = offers;
        }
        for (const offer of liveOffers) {
          const mapped = mapSnapshotOffer({
            offer,
            destinationCode: code,
            discountBps: options.discountBps,
          });
          if (mapped) collected.push(mapped);
        }
      }
    }
  }

  let filtered = collected;
  if (search) {
    filtered = collected.filter((row) => {
      const hay = `${row.offerId} ${row.name} ${row.destinationLabel} ${row.dataLabel} ${row.destinationCode}`.toLowerCase();
      return hay.includes(search);
    });
  }
  if (region && !country) {
    filtered = filtered.filter(
      (row) =>
        (row.region ?? "").toLowerCase().includes(region) ||
        row.destinationCode.toLowerCase().includes(region)
    );
  }

  // Dedupe by offerId (keep cheapest partner price).
  const byId = new Map<string, PartnerApiOfferRow>();
  for (const row of filtered) {
    const existing = byId.get(row.offerId);
    if (!existing || row.partnerPriceCents < existing.partnerPriceCents) {
      byId.set(row.offerId, row);
    }
  }
  const unique = Array.from(byId.values()).sort((a, b) =>
    a.offerId.localeCompare(b.offerId)
  );

  const total = unique.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const offers = unique.slice(start, start + limit);

  return { offers, page: safePage, limit, total, totalPages };
}

export async function getPartnerApiOffer(options: {
  offerId: string;
  discountBps: number;
  countryHint?: string | null;
}): Promise<PartnerApiOfferRow | null> {
  const offerId = normalizeOfferId(options.offerId);
  if (!offerId) return null;

  // Search snapshots first (fast), then destination-scoped list.
  const snapshots = await prisma.publicDestinationOfferSnapshot.findMany({
    select: { destinationCode: true, offersJson: true },
  });
  for (const snap of snapshots) {
    const code = sanitizeCountryHint(snap.destinationCode);
    if (!code) continue;
    const hint = sanitizeCountryHint(options.countryHint);
    if (hint && code !== hint) continue;
    const raw = Array.isArray(snap.offersJson)
      ? (snap.offersJson as unknown as VesimOffer[])
      : [];
    for (const offer of applyPakistanPublicCatalog(code, raw)) {
      const id = normalizeOfferId(
        String((offer as VesimOffer).offerId ?? (offer as VesimOffer).id ?? "")
      );
      if (id !== offerId) continue;
      const mapped = mapSnapshotOffer({
        offer,
        destinationCode: code,
        discountBps: options.discountBps,
      });
      if (mapped) return mapped;
    }
  }

  const hint = sanitizeCountryHint(options.countryHint);
  if (hint) {
    const offers = await listPartnerCatalogOffers(hint, {
      discountBps: options.discountBps,
      walletBalanceCents: 0,
      splitPaymentEnabled: false,
    });
    const found = offers.find((o) => o.offerId === offerId);
    if (found) return offerToApiRow(found, hint, null);
  }

  // Last resort: scan popular destinations briefly.
  const destinations = await fetchPublicDestinationCatalog().catch(() => []);
  for (const d of destinations.slice(0, 40)) {
    const code = sanitizeCountryHint(d.code);
    if (!code) continue;
    try {
      const offers = await listPartnerCatalogOffers(code, {
        discountBps: options.discountBps,
        walletBalanceCents: 0,
        splitPaymentEnabled: false,
      });
      const found = offers.find((o) => o.offerId === offerId);
      if (found) {
        return offerToApiRow(
          found,
          code,
          d.kind === "regional" || d.kind === "global" ? code : null
        );
      }
    } catch {
      // continue
    }
  }
  return null;
}

export function partnerApiDestinationDisplayName(code: string): string {
  return destinationDisplayName({ code, name: code, kind: "country" as const });
}
