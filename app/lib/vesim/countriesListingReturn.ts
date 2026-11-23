/**
 * Preserve destination-listing filter/search when opening a plan page,
 * and rebuild /countries (or /partner/countries) back links. Display/navigation only.
 */

export const COUNTRIES_RETURN_FILTER_PARAM = "fromFilter";
export const COUNTRIES_RETURN_Q_PARAM = "fromQ";

export const PUBLIC_COUNTRIES_BASE_PATH = "/countries";
export const PARTNER_COUNTRIES_BASE_PATH = "/partner/countries";
export const SANDBOX_CATALOG_BASE_PATH = "/sandbox/catalog";

export type CountriesCatalogBasePath =
  | typeof PUBLIC_COUNTRIES_BASE_PATH
  | typeof PARTNER_COUNTRIES_BASE_PATH
  | typeof SANDBOX_CATALOG_BASE_PATH;

const FILTER_IDS = new Set(["Country", "Popular", "Regional", "Global"]);

export function sanitizeCountriesListingFilter(
  value: string | null | undefined
): string | null {
  const filter = (value ?? "").trim();
  return FILTER_IDS.has(filter) ? filter : null;
}

/** Allowlisted catalog roots — public, partner, or sandbox. */
export function normalizeCountriesBasePath(
  basePath?: string | null
): CountriesCatalogBasePath {
  const trimmed = (basePath ?? PUBLIC_COUNTRIES_BASE_PATH)
    .trim()
    .replace(/\/$/, "");
  if (trimmed === PARTNER_COUNTRIES_BASE_PATH) {
    return PARTNER_COUNTRIES_BASE_PATH;
  }
  if (trimmed === SANDBOX_CATALOG_BASE_PATH) {
    return SANDBOX_CATALOG_BASE_PATH;
  }
  return PUBLIC_COUNTRIES_BASE_PATH;
}

/** Public/partner destinations index href from optional filter + search query. */
export function buildCountriesListingHref(options: {
  filter?: string | null;
  q?: string | null;
  basePath?: string | null;
}): string {
  const base = normalizeCountriesBasePath(options.basePath);
  const params = new URLSearchParams();
  const filter = sanitizeCountriesListingFilter(options.filter);
  const q = (options.q ?? "").trim();
  if (filter) params.set("filter", filter);
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Plan-page href that carries listing context for the All Destinations back link. */
export function buildDestinationPlansHref(
  destinationId: string,
  options: {
    filter?: string | null;
    q?: string | null;
    basePath?: string | null;
  }
): string {
  const base = normalizeCountriesBasePath(options.basePath);
  const id = destinationId.trim();
  const params = new URLSearchParams();
  const filter = sanitizeCountriesListingFilter(options.filter);
  const q = (options.q ?? "").trim();
  if (filter) params.set(COUNTRIES_RETURN_FILTER_PARAM, filter);
  if (q) params.set(COUNTRIES_RETURN_Q_PARAM, q);
  const qs = params.toString();
  return qs ? `${base}/${id}?${qs}` : `${base}/${id}`;
}

/** Read return context from a plan-page URLSearchParams getter. */
export function countriesListingHrefFromPlanParams(
  get: (key: string) => string | null,
  basePath?: string | null
): string {
  return buildCountriesListingHref({
    filter: get(COUNTRIES_RETURN_FILTER_PARAM),
    q: get(COUNTRIES_RETURN_Q_PARAM),
    basePath,
  });
}
