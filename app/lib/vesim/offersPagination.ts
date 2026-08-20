import { extractOffers } from "@/app/lib/vesim/offers";

/** Official VeSIM Partner API maximum page size for GET /api/esim/offers. */
export const VESIM_OFFERS_PAGE_LIMIT = 1024;

/**
 * Hard safety cap — with limit=1024 this is far beyond any destination catalog.
 * If the provider reports more pages than this, fail closed (do not return a partial list).
 */
export const VESIM_OFFERS_MAX_PAGES = 32;

export type OfferPageFetchResult = {
  httpOk: boolean;
  payload: unknown;
};

/**
 * Build query for a filtered destination offers page.
 *
 * MAP preserves existing destination semantics: ISO countries, `region-*`, and
 * `global` are all sent as the `country` query param (same as pre-pagination).
 * Never sets `fullCatalog=1` — that flag is for raw full-catalog dumps only.
 */
export function buildVesimOffersQuery(
  destination: string,
  page: number
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("country", destination);
  params.set("page", String(Math.max(1, Math.floor(page))));
  params.set("limit", String(VESIM_OFFERS_PAGE_LIMIT));
  return params;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n >= 1 ? n : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      const t = Math.trunc(n);
      return t >= 1 ? t : null;
    }
  }
  return null;
}

/** Read documented `totalPages` when present and valid. */
export function readOffersTotalPages(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  return asPositiveInt((payload as Record<string, unknown>).totalPages);
}

/**
 * Resolve how many pages to fetch from the first response.
 * Missing/invalid `totalPages` → single page only (do not invent further pages).
 * `totalPages` above the safety cap → incomplete (caller must fail closed).
 */
export function resolveOffersFetchPlan(payload: unknown): {
  pagesToFetch: number;
  exceedsSafetyCap: boolean;
} {
  const totalPages = readOffersTotalPages(payload);
  if (totalPages == null) {
    return { pagesToFetch: 1, exceedsSafetyCap: false };
  }
  if (totalPages > VESIM_OFFERS_MAX_PAGES) {
    return {
      pagesToFetch: VESIM_OFFERS_MAX_PAGES,
      exceedsSafetyCap: true,
    };
  }
  return { pagesToFetch: totalPages, exceedsSafetyCap: false };
}

/**
 * Accept HTTP 200 pages. If the documented `success` field is explicitly false,
 * treat as failure. Missing `success` remains allowed for older shapes.
 * Live checkout/admin fetching keeps this looser parser.
 */
export function isUsableOffersPage(
  httpOk: boolean,
  payload: unknown
): boolean {
  if (!httpOk) return false;
  if (!payload || typeof payload !== "object") return false;
  const success = (payload as Record<string, unknown>).success;
  if (success === false) return false;
  return true;
}

/**
 * Public browsing snapshots require an explicit success:true JSON object.
 * Missing success, non-objects, and non-OK HTTP must not look complete.
 */
export function isUsablePublicOffersPage(
  httpOk: boolean,
  payload: unknown
): boolean {
  if (!httpOk) return false;
  if (!payload || typeof payload !== "object") return false;
  return (payload as Record<string, unknown>).success === true;
}

/** Concatenate `offers` arrays from each page in provider order. */
export function mergeOfferPageItems(payloads: unknown[]): unknown[] {
  const merged: unknown[] = [];
  for (const payload of payloads) {
    merged.push(...extractOffers(payload));
  }
  return merged;
}

/**
 * Fetch every offers page for a destination via an injected page fetcher
 * (keeps network I/O out of unit tests).
 *
 * Fail closed: any non-usable page, or totalPages above the safety cap,
 * returns ok:false — never a partial catalog.
 */
export async function collectAllOfferPagePayloads(
  fetchPage: (page: number) => Promise<OfferPageFetchResult>,
  options?: {
    isPageUsable?: (httpOk: boolean, payload: unknown) => boolean;
  }
): Promise<{ ok: true; payloads: unknown[] } | { ok: false }> {
  const isPageUsable = options?.isPageUsable ?? isUsableOffersPage;
  const first = await fetchPage(1);
  if (!isPageUsable(first.httpOk, first.payload)) {
    return { ok: false };
  }

  const plan = resolveOffersFetchPlan(first.payload);
  if (plan.exceedsSafetyCap) {
    return { ok: false };
  }

  const payloads: unknown[] = [first.payload];
  const requestedPages = [1];

  for (let page = 2; page <= plan.pagesToFetch; page++) {
    // Loop bound is totalPages (capped); never unbounded.
    const next = await fetchPage(page);
    if (!isPageUsable(next.httpOk, next.payload)) {
      return { ok: false };
    }
    payloads.push(next.payload);
    requestedPages.push(page);
  }

  // Guard against accidental duplicate page fetches in the collector itself.
  if (new Set(requestedPages).size !== requestedPages.length) {
    return { ok: false };
  }

  return { ok: true, payloads };
}
