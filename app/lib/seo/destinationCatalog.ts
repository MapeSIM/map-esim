import { unstable_cache } from "next/cache";
import { countries as staticCountries } from "@/app/data/countries";
import {
  destinationPath,
  findDestinationBySlug,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import { fetchDestinations } from "@/app/lib/vesim/server";

/** Revalidate SEO destination reads hourly — avoids per-request provider calls. */
const SEO_DESTINATION_REVALIDATE_SECONDS = 60 * 60;

/** Process-local last successful provider catalog for cold-cache provider failures. */
let lastSuccessfulDestinations: VesimDestination[] = [];

function staticEmergencyDestinations(): VesimDestination[] {
  return staticCountries.map((country) => ({
    code: country.code,
    name: country.name,
    slug: country.id,
    kind: "country" as const,
    isPopular: country.region === "Popular",
    isRegional: false,
    isGlobal: false,
    regions: country.region ? [country.region] : [],
    searchAliases: [country.id, country.code, country.name],
  }));
}

async function loadDestinationsForSeo(): Promise<VesimDestination[]> {
  try {
    const destinations = await fetchDestinations();
    if (destinations.length > 0) {
      lastSuccessfulDestinations = destinations;
      return destinations;
    }
  } catch {
    // Provider/auth/env failures must not empty the public sitemap.
  }

  if (lastSuccessfulDestinations.length > 0) {
    return lastSuccessfulDestinations;
  }

  return staticEmergencyDestinations();
}

/**
 * Cached destination catalog for sitemap + destination metadata.
 * Primary source: VeSIM destinations. Fallback: last success, then static emergency list.
 */
export const getCachedDestinationsForSeo = unstable_cache(
  loadDestinationsForSeo,
  ["seo-destination-catalog-v1"],
  { revalidate: SEO_DESTINATION_REVALIDATE_SECONDS }
);

/** Deduplicated canonical destination paths (`destinationPath`) for sitemap URLs. */
export async function getCanonicalDestinationPathsForSitemap(): Promise<
  string[]
> {
  const destinations = await getCachedDestinationsForSeo();
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const destination of destinations) {
    const path = destinationPath(destination);
    if (!path.startsWith("/countries/") || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }

  return paths;
}

export async function resolveDestinationForSeo(
  rawId: string
): Promise<VesimDestination | null> {
  const id = rawId.trim();
  if (!id) return null;

  const destinations = await getCachedDestinationsForSeo();
  return findDestinationBySlug(destinations, id) ?? null;
}
