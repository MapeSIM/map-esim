import CountriesListing from "@/app/components/countries/CountriesListing";
import JsonLd from "@/app/components/seo/JsonLd";
import { countries as staticCountries } from "@/app/data/countries";
import {
  retailMinFromProviderStartingPrice,
  slugifyDestination,
  toPublicCatalogDestination,
  type DestinationCatalogSource,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import { fetchPublicDestinationCatalog } from "@/app/lib/vesim/server";

/** Align with public destination catalog cache. */
export const revalidate = 300;

function staticFallbackDestinations(): VesimDestination[] {
  return staticCountries.map((item) => {
    // startingPrice is a raw/provider snapshot — convert to MAP retail once.
    const retail = retailMinFromProviderStartingPrice(item.startingPrice);
    return {
      code: item.code,
      name: item.name,
      flag: item.flag,
      regions: item.region ? [item.region] : [],
      offerCount: item.plans,
      minPriceFormatted: retail.minPriceFormatted,
      minPrice: retail.minPrice,
      isPopular: item.region === "Popular",
      isRegional: false,
      isGlobal: false,
      searchAliases: [item.id, item.code, item.name],
      slug: item.id || slugifyDestination(item.name),
      kind: "country" as const,
    };
  });
}

async function loadInitialCatalog(): Promise<{
  destinations: VesimDestination[];
  source: DestinationCatalogSource;
}> {
  try {
    const destinations = await fetchPublicDestinationCatalog();
    if (destinations.length > 0) {
      return {
        destinations: destinations.map(toPublicCatalogDestination),
        source: "catalog",
      };
    }
  } catch {
    // Provider/cache failures must not blank the listing.
  }

  // Static marketing list only when no trusted catalog exists at all.
  return {
    destinations: staticFallbackDestinations().map(toPublicCatalogDestination),
    source: "static",
  };
}

export default async function CountriesPage() {
  const { destinations, source } = await loadInitialCatalog();

  // Structured Data Schema for Search Engines (ItemList)
  const jsonLdData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "MAP eSIM Destinations",
    "description": "Explore mobile eSIM data plans for international travel and country destinations.",
    "url": "https://mapesim.com/countries",
    "itemListElement": destinations.map((dest, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": dest.name,
      "url": `https://mapesim.com/countries/${dest.slug}`,
    })),
  };

  return (
    <>
      <JsonLd data={jsonLdData} />
      <CountriesListing
        initialDestinations={destinations}
        initialSource={source}
      />
    </>
  );
}