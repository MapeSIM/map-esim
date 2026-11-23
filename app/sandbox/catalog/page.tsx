import { Download } from "lucide-react";
import CountriesListing from "@/app/components/countries/CountriesListing";
import { countries as staticCountries } from "@/app/data/countries";
import {
  retailMinFromProviderStartingPrice,
  slugifyDestination,
  toPublicCatalogDestination,
  type DestinationCatalogSource,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import { SANDBOX_CATALOG_BASE_PATH } from "@/app/lib/vesim/countriesListingReturn";
import { fetchPublicDestinationCatalog } from "@/app/lib/vesim/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function staticFallbackDestinations(): VesimDestination[] {
  return staticCountries.map((item) => {
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
    /* fall through */
  }
  return {
    destinations: staticFallbackDestinations().map(toPublicCatalogDestination),
    source: "static",
  };
}

export default async function SandboxCatalogPage() {
  const { destinations, source } = await loadInitialCatalog();

  return (
    <div className="space-y-2 [--accent-soft:#6ee7b7] [--heading:#f8fafc] [--page-bg:transparent] [--surface:#0D1526] [--surface-2:#111827] [--text:#e2e8f0] [--text-muted:#94a3b8] [--border:rgba(255,255,255,0.08)] [--border-strong:rgba(255,255,255,0.12)]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-50 sm:text-2xl">
            Catalog
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Browse destinations and buy with your sandbox wallet.
          </p>
        </div>
        <a
          href="/api/partner/catalog/csv"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.03] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06]"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download CSV
        </a>
      </header>
      <CountriesListing
        initialDestinations={destinations}
        initialSource={source}
        basePath={SANDBOX_CATALOG_BASE_PATH}
        embedded
      />
    </div>
  );
}
