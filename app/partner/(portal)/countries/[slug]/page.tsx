import { Suspense } from "react";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import DestinationPlansSkeleton from "@/app/components/plans/DestinationPlansSkeleton";
import PlansListing from "@/app/components/plans/PlansListing";
import { countries as staticCountries } from "@/app/data/countries";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { PARTNER_COUNTRIES_BASE_PATH } from "@/app/lib/vesim/countriesListingReturn";
import { toPublicVesimOffers, type VesimOffer } from "@/app/lib/vesim/offers";
import type { VesimDestination } from "@/app/lib/vesim/destinations";
import {
  destinationPath,
  destinationRouteId,
  findDestinationBySlug,
  findRelatedRegionalDestination,
  retailMinFromProviderStartingPrice,
  slugifyDestination,
  toPublicPlanDestination,
  withLowestOfferRetailMinPrice,
} from "@/app/lib/vesim/destinations";
import {
  fetchPublicDestinationCatalog,
  fetchCachedPublicOffersForCountry as fetchPublicOffersForCountry,
} from "@/app/lib/vesim/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PartnerCountryDetailPageProps = {
  params: Promise<{ slug: string }>;
};

function staticToDestination(id: string): VesimDestination | undefined {
  const match = staticCountries.find(
    (item) =>
      item.id.toLowerCase() === id.toLowerCase() ||
      item.code.toLowerCase() === id.toLowerCase() ||
      slugifyDestination(item.name) === slugifyDestination(id)
  );

  if (!match) return undefined;

  const retail = retailMinFromProviderStartingPrice(match.startingPrice);

  return {
    code: match.code,
    name: match.name,
    flag: match.flag,
    regions: match.region ? [match.region] : [],
    offerCount: match.plans,
    minPrice: retail.minPrice,
    minPriceFormatted: retail.minPriceFormatted,
    isPopular: match.region === "Popular",
    isRegional: false,
    isGlobal: false,
    searchAliases: [match.id, match.code, match.name],
    slug: match.id,
    kind: "country",
  };
}

async function loadPublicDestinations(): Promise<VesimDestination[]> {
  try {
    return await fetchPublicDestinationCatalog();
  } catch {
    return [];
  }
}

async function loadPublicOffers(countryCode: string): Promise<{
  offers: VesimOffer[];
  error: string;
}> {
  try {
    const raw = await fetchPublicOffersForCountry(countryCode);
    return { offers: toPublicVesimOffers(raw), error: "" };
  } catch {
    return {
      offers: [],
      error:
        "Plans are temporarily unavailable for this destination. Please try again shortly.",
    };
  }
}

function sameDestinationCode(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function earlyOfferCodeHint(
  id: string,
  fallback: VesimDestination | undefined
): string | null {
  if (fallback?.code) return fallback.code.trim();
  const key = id.trim().toLowerCase();
  if (key === "global" || key.startsWith("region-")) return key;
  if (/^[a-z]{2}$/i.test(key)) return key.toUpperCase();
  return null;
}

async function PartnerCountryPlansContent({ slug }: { slug: string }) {
  const fallbackDestination = staticToDestination(slug);
  const earlyCode = earlyOfferCodeHint(slug, fallbackDestination);
  const destinationsPromise = loadPublicDestinations();
  const earlyOffersPromise = earlyCode ? loadPublicOffers(earlyCode) : null;

  const destinations = await destinationsPromise;
  const countryNames: Record<string, string> = {};
  for (const item of destinations) {
    if (item.kind === "country") {
      countryNames[item.code.toUpperCase()] = item.name;
    }
  }

  const matched =
    findDestinationBySlug(destinations, slug) || fallbackDestination || null;

  if (!matched) {
    notFound();
  }

  const canonicalRouteId = destinationRouteId(matched);
  if (slug.toLowerCase() !== canonicalRouteId.toLowerCase()) {
    permanentRedirect(destinationPath(matched, PARTNER_COUNTRIES_BASE_PATH));
  }

  const relatedRegional =
    matched.kind === "country"
      ? findRelatedRegionalDestination(matched, destinations) || null
      : null;

  const { offers, error } =
    earlyOffersPromise && sameDestinationCode(matched.code, earlyCode || "")
      ? await earlyOffersPromise
      : await loadPublicOffers(matched.code.trim());

  const destination = toPublicPlanDestination(
    withLowestOfferRetailMinPrice(
      { ...matched, offerCount: offers.length },
      offers
    )
  );
  const publicRelatedRegional = relatedRegional
    ? toPublicPlanDestination(relatedRegional)
    : null;

  return (
    <PlansListing
      destination={destination}
      offers={offers}
      loading={false}
      error={error}
      countryNames={countryNames}
      relatedRegional={publicRelatedRegional}
      listingBasePath={PARTNER_COUNTRIES_BASE_PATH}
      forcePartnerCheckout
    />
  );
}

/**
 * Partner destination plans — same UI as public /countries/[id], with retail
 * rates on cards and Buy Now → /partner/buy (discount at checkout).
 */
export default async function PartnerCountryDetailPage({
  params,
}: PartnerCountryDetailPageProps) {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    redirect("/signin");
  }

  const { slug: rawSlug } = await params;
  const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";

  if (!slug) {
    notFound();
  }

  return (
    <Suspense fallback={<DestinationPlansSkeleton />}>
      <PartnerCountryPlansContent slug={slug} />
    </Suspense>
  );
}
