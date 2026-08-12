import { unstable_cache } from "next/cache";
import { countries as staticCountries } from "@/app/data/countries";
import {
  destinationPath,
  findDestinationBySlug,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import {
  fetchDestinations,
  fetchPublicDestinationCatalog,
} from "@/app/lib/vesim/server";

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
 * Cached destination catalog for sitemap paths (identity only, no offer mins).
 * Cache key bumped so a poisoned pre-USPR route snapshot cannot linger.
 */
export const getCachedDestinationsForSeo = unstable_cache(
  loadDestinationsForSeo,
  ["seo-destination-catalog-v2"],
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

/**
 * Resolve `/countries/[id]` for metadata using the same public catalog +
 * `findDestinationBySlug` semantics as the country page body.
 * Prevents false "Destination not found" / noindex when the page itself
 * can resolve provider variants (e.g. USPR vs PR).
 */
export async function resolveDestinationForSeo(
  rawId: string
): Promise<VesimDestination | null> {
  const id = rawId.trim();
  if (!id) return null;

  // Primary: same catalog the country detail page uses.
  try {
    const publicCatalog = await fetchPublicDestinationCatalog();
    const fromPublic = findDestinationBySlug(publicCatalog, id);
    if (fromPublic) return fromPublic;
  } catch {
    // Fall through to lighter SEO catalog.
  }

  // Secondary: identity-only SEO cache (no offer enrichment).
  try {
    const seoCatalog = await getCachedDestinationsForSeo();
    return findDestinationBySlug(seoCatalog, id) ?? null;
  } catch {
    return null;
  }
}
