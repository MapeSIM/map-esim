import PlansDiscovery from "@/app/components/plans/PlansDiscovery";
import { countries as staticCountries } from "@/app/data/countries";
import {
  selectPlansDiscoveryDestinations,
  selectPlansDiscoverySelectorOptions,
  selectPlansPriorityDestinations,
} from "@/app/lib/plans/plansDiscovery";
import {
  slugifyDestination,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import { fetchPublicDestinationCatalog } from "@/app/lib/vesim/server";

/** Align with public destination catalog cache. */
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

async function loadCatalog(): Promise<VesimDestination[]> {
  try {
    const destinations = await fetchPublicDestinationCatalog();
    if (destinations.length > 0) return destinations;
  } catch {
    // Fail soft — destination selection UI still works with static links.
  }
  return staticFallbackDestinations();
}

export default async function PlansPage() {
  const destinations = await loadCatalog();
  const priorityDestinations = selectPlansPriorityDestinations(destinations);
  const priorityCodes = new Set(
    priorityDestinations.map((item) => item.code.trim().toUpperCase())
  );
  const featured = selectPlansDiscoveryDestinations(destinations, {
    excludeCodes: priorityCodes,
  });
  const selectorOptions = selectPlansDiscoverySelectorOptions(destinations);

  return (
    <PlansDiscovery
      featured={featured}
      selectorOptions={selectorOptions}
      priorityDestinations={priorityDestinations}
    />
  );
}
