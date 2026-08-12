import PlansListing from "@/app/components/plans/PlansListing";
import { countries as staticCountries } from "@/app/data/countries";
import { toPublicVesimOffers, type VesimOffer } from "@/app/lib/vesim/offers";
import type { VesimDestination } from "@/app/lib/vesim/destinations";
import {
  findDestinationBySlug,
  findRelatedRegionalDestination,
  slugifyDestination,
  withLowestOfferRetailMinPrice,
} from "@/app/lib/vesim/destinations";
import {
  fetchPublicDestinationCatalog,
  fetchPublicOffersForCountry,
} from "@/app/lib/vesim/server";

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

  return {
    code: match.code,
    name: match.name,
    flag: match.flag,
    regions: match.region ? [match.region] : [],
    offerCount: match.plans,
    minPriceFormatted: match.startingPrice,
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

export default async function CountryDetailPage({
  params,
}: CountryDetailPageProps) {
  const { id: rawId } = await params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  const fallbackDestination = id ? staticToDestination(id) : undefined;

  if (!id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Destination not found</h1>
          <p className="mt-3 text-[var(--text-muted)]">
            We couldn&apos;t find plans for this destination.
          </p>
        </div>
      </main>
    );
  }

  const destinations = await loadPublicDestinations();
  const countryNames: Record<string, string> = {};
  for (const item of destinations) {
    if (item.kind === "country") {
      countryNames[item.code.toUpperCase()] = item.name;
    }
  }

  const matched =
    findDestinationBySlug(destinations, id) || fallbackDestination || null;

  if (!matched) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Destination not found</h1>
          <p className="mt-3 text-[var(--text-muted)]">
            We couldn&apos;t find plans for this destination.
          </p>
        </div>
      </main>
    );
  }

  const relatedRegional =
    matched.kind === "country"
      ? findRelatedRegionalDestination(matched, destinations) || null
      : null;

  const { offers, error } = await loadPublicOffers(matched.code.trim());
  const destination = withLowestOfferRetailMinPrice(
    { ...matched, offerCount: offers.length },
    offers
  );

  return (
    <PlansListing
      destination={destination}
      offers={offers}
      loading={false}
      error={error}
      countryNames={countryNames}
      relatedRegional={relatedRegional}
    />
  );
}
