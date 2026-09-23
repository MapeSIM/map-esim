import { CountrySeoContent } from "@/app/components/countries/CountrySeoContent";
import PlansListing from "@/app/components/plans/PlansListing";
import { countries as staticCountries } from "@/app/data/countries";
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
  fetchPublicOffersForCountry,
} from "@/app/lib/vesim/server";
import { notFound, permanentRedirect } from "next/navigation";

/** Align with public destination catalog cache; keep crawlers on fresh plan HTML. */
export const revalidate = 300;

type CountryDetailPageProps = {
  params: Promise<{ id: string }>;
};

function staticToDestination(id: string): VesimDestination | undefined {
  const match = staticCountries.find(
    (item) =>
      item.id.toLowerCase() === id.toLowerCase() ||
      item.code.toLowerCase() === id.toLowerCase() ||
      slugifyDestination(item.name) === slugifyDestination(id)
  );

  if (!match) return undefined;

  // startingPrice is a raw/provider snapshot — convert to MAP retail once.
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
    // Provider/auth failures must not blank the SEO shell.
    return [];
  }
}

async function loadPublicOffers(countryCode: string): Promise<{
  offers: VesimOffer[];
  error: string;
}> {
  try {
    // Snapshot-first: return last-good immediately; leased VeSIM refresh runs
    // after the response. Checkout still uses verifyOfferAuthoritative (live).
    const raw = await fetchPublicOffersForCountry(countryCode, {
      refreshMode: "background",
    });
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

/** Best-effort offer code hint so catalog + offers can load in parallel. */
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

export default async function CountryDetailPage({
  params,
}: CountryDetailPageProps) {
  const { id: rawId } = await params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  const fallbackDestination = id ? staticToDestination(id) : undefined;

  if (!id) {
    notFound();
  }

  const earlyCode = earlyOfferCodeHint(id, fallbackDestination);
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
    findDestinationBySlug(destinations, id) || fallbackDestination || null;

  if (!matched) {
    notFound();
  }

  // Permanent redirect ISO/alias URLs to the canonical destination slug.
  const canonicalRouteId = destinationRouteId(matched);
  if (id.toLowerCase() !== canonicalRouteId.toLowerCase()) {
    permanentRedirect(destinationPath(matched));
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
    >
      <CountrySeoContent destination={destination} offers={offers} />
    </PlansListing>
  );
}
