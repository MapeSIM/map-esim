import { Download } from "lucide-react";
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
      <div className="flex justify-end">
        <a
          href="/api/partner/catalog/csv"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.03] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06]"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download CSV
        </a>
      </div>

      <CountriesListing
        initialDestinations={destinations}
        initialSource={source}
        basePath={PARTNER_COUNTRIES_BASE_PATH}
      />
    </div>
  );
}
