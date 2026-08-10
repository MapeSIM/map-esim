import CountriesListing from "@/app/components/countries/CountriesListing";
import { countries as staticCountries } from "@/app/data/countries";
import {
  slugifyDestination,
  type DestinationCatalogSource,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import { fetchPublicDestinationCatalog } from "@/app/lib/vesim/server";

/** Align with public destination catalog cache (offer-min enrichment). */
export const revalidate = 300;

function staticFallbackDestinations(): VesimDestination[] {
  return staticCountries.map((item) => ({
    code: item.code,
    name: item.name,
    flag: item.flag,
    regions: item.region ? [item.region] : [],
    offerCount: item.plans,
    minPriceFormatted: item.startingPrice,
    minPrice: (() => {
      const parsed = Number(item.startingPrice.replace(/[^0-9.]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    })(),
    isPopular: item.region === "Popular",
    isRegional: false,
    isGlobal: false,
    searchAliases: [item.id, item.code, item.name],
    slug: item.id || slugifyDestination(item.name),
    kind: "country" as const,
  }));
}

async function loadInitialCatalog(): Promise<{
  destinations: VesimDestination[];
  source: DestinationCatalogSource;
}> {
  try {
    const destinations = await fetchPublicDestinationCatalog();
    if (destinations.length > 0) {
      return { destinations, source: "catalog" };
    }
  } catch {
    // Provider/cache failures must not blank the listing.
  }

  // Static marketing list only when no trusted catalog exists at all.
  return { destinations: staticFallbackDestinations(), source: "static" };
}

export default async function CountriesPage() {
  const { destinations, source } = await loadInitialCatalog();

  return (
    <CountriesListing
      initialDestinations={destinations}
      initialSource={source}
    />
  );
}
