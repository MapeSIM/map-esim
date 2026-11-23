import { Download } from "lucide-react";
import { redirect } from "next/navigation";
import CountriesListing from "@/app/components/countries/CountriesListing";
import { countries as staticCountries } from "@/app/data/countries";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { PARTNER_COUNTRIES_BASE_PATH } from "@/app/lib/vesim/countriesListingReturn";
import {
  retailMinFromProviderStartingPrice,
  slugifyDestination,
  toPublicCatalogDestination,
  type DestinationCatalogSource,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import { fetchPublicDestinationCatalog } from "@/app/lib/vesim/server";
import { readAppDomain } from "@/app/lib/domain/readAppDomain";

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
    // Provider/cache failures must not blank the listing.
  }

  return {
    destinations: staticFallbackDestinations().map(toPublicCatalogDestination),
    source: "static",
  };
}

/**
 * Partner destinations catalog — same UI as public /countries, inside the
 * partner shell, with retail "From" prices and Buy Now → partner checkout.
 */
export default async function PartnerCountriesPage() {
  const domain = await readAppDomain();
  // mapesim.com — 6a9cf44 Buy eSIM used public /countries.
  if (domain !== "partner") {
    redirect("/countries");
  }

  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return (
      <div
        className="rounded-2xl border border-white/[0.08] bg-[#0D1526] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-slate-100">
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  const { destinations, source } = await loadInitialCatalog();

  return (
    <div
      className="space-y-4 [--accent-soft:#6ee7b7] [--heading:#f8fafc] [--page-bg:transparent] [--surface:#0D1526] [--surface-2:#111827] [--text:#e2e8f0] [--text-muted:#94a3b8] [--border:rgba(255,255,255,0.08)] [--border-strong:rgba(255,255,255,0.12)]"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Catalog
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Browse destinations at retail rates. Your partner discount is
            applied automatically at checkout.
          </p>
        </div>
        <a
          href="/api/partner/catalog/csv"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download All Plans CSV
        </a>
      </header>

      <CountriesListing
        initialDestinations={destinations}
        initialSource={source}
        basePath={PARTNER_COUNTRIES_BASE_PATH}
      />
    </div>
  );
}
