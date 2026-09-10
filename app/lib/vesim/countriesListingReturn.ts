/**
 * Preserve destination-listing filter/search when opening a plan page,
 * and rebuild /countries back links. Display/navigation only.
 */

export const COUNTRIES_RETURN_FILTER_PARAM = "fromFilter";
export const COUNTRIES_RETURN_Q_PARAM = "fromQ";

const FILTER_IDS = new Set(["Country", "Popular", "Regional", "Global"]);

export function sanitizeCountriesListingFilter(
  value: string | null | undefined
): string | null {
  const filter = (value ?? "").trim();
  return FILTER_IDS.has(filter) ? filter : null;
}

/** Public destinations index href from optional filter + search query. */
export function buildCountriesListingHref(options: {
  filter?: string | null;
  q?: string | null;
}): string {
  const params = new URLSearchParams();
  const filter = sanitizeCountriesListingFilter(options.filter);
  const q = (options.q ?? "").trim();
  if (filter) params.set("filter", filter);
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `/countries?${qs}` : "/countries";
}

/** Plan-page href that carries listing context for the All Destinations back link. */
export function buildDestinationPlansHref(
  destinationId: string,
  options: { filter?: string | null; q?: string | null }
): string {
  const id = destinationId.trim();
  const params = new URLSearchParams();
  const filter = sanitizeCountriesListingFilter(options.filter);
  const q = (options.q ?? "").trim();
  if (filter) params.set(COUNTRIES_RETURN_FILTER_PARAM, filter);
  if (q) params.set(COUNTRIES_RETURN_Q_PARAM, q);
  const qs = params.toString();
  return qs ? `/countries/${id}?${qs}` : `/countries/${id}`;
}

/** Read return context from a plan-page URLSearchParams getter. */
export function countriesListingHrefFromPlanParams(
  get: (key: string) => string | null
): string {
  return buildCountriesListingHref({
    filter: get(COUNTRIES_RETURN_FILTER_PARAM),
    q: get(COUNTRIES_RETURN_Q_PARAM),
  });
}
