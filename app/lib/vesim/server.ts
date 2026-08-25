import {
  normalizeDestinations,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import {
  VesimEnvironmentError,
  resolveValidatedVesimBaseUrl,
} from "@/app/lib/vesim/environment";
import {
  applyPakistanPublicCatalog,
  applyPakistanRetailOverride,
} from "@/app/lib/plans/pakistanCatalogPolicy";
import {
  normalizeOffers,
  type VesimOffer,
} from "@/app/lib/vesim/offers";
import {
  buildVesimOffersQuery,
  collectAllOfferPagePayloads,
  isUsableOffersPage,
  isUsablePublicOffersPage,
  mergeOfferPageItems,
} from "@/app/lib/vesim/offersPagination";
import { prisma } from "@/app/lib/db";
import {
  PUBLIC_OFFER_FLAG_OFF_REVALIDATE_SECONDS,
  PUBLIC_OFFER_REFRESH_TIMEOUT_MS,
  PublicOfferSnapshotError,
} from "@/app/lib/vesim/publicOfferSnapshot";
import {
  loadPublicOffersForCountry,
  withPublicOfferRefreshTimeout,
} from "@/app/lib/vesim/publicOfferSnapshotRefresh";
import { unstable_cache } from "next/cache";
import {
  getBrokerToken,
  vesimAuthorizedFetch,
  type BrokerTokenResult,
} from "@/app/lib/vesim/brokerAuth";

export type TokenResult = BrokerTokenResult;
export { getBrokerToken, vesimAuthorizedFetch };

export type VerifiedCheckoutOffer = {
  offerId: string;
  name: string;
  countryCode: string | null;
  countryName: string | null;
  dataFormatted: string;
  durationDays: number | null;
  /** MAP eSIM retail USD charged to the customer. */
  priceUSD: number;
  /** Raw VeSIM supplier USD — server/admin only. */
  providerPriceUSD: number;
  currency: string;
};

/** Public JSON for verified offers — retail only, never supplier cost. */
export function toPublicVerifiedCheckoutOffer(offer: VerifiedCheckoutOffer) {
  return {
    offerId: offer.offerId,
    name: offer.name,
    countryCode: offer.countryCode,
    countryName: offer.countryName,
    dataFormatted: offer.dataFormatted,
    durationDays: offer.durationDays,
    priceUSD: offer.priceUSD,
    currency: offer.currency,
  };
}

type JsonRecord = Record<string, unknown>;

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const idempotencyStore = new Map<
  string,
  {
    status: "pending" | "completed";
    orderId?: string;
    expiresAt: number;
  }
>();

export function getVesimBaseUrl(): string {
  // Shared fail-closed boundary: mode + host must match before any provider call.
  return resolveValidatedVesimBaseUrl();
}

export async function readJsonSafe(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    return {};
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeOfferId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function sanitizeCountryHint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Allow ISO country codes and known destination codes (region-*, global).
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^(region-[a-z0-9-]+|global)$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

export function extractCountryHintFromOfferId(offerId: string): string | null {
  const match = offerId.toUpperCase().match(/^ESIM-([A-Z]{2})(?:-|$)/);
  return match?.[1] || null;
}

export function findOfferById(
  offers: VesimOffer[],
  offerId: string
): VesimOffer | undefined {
  const target = offerId.trim().toUpperCase();
  if (!target) return undefined;

  return offers.find((offer) => {
    const ids = [offer.id, offer.offerId, offer.code]
      .filter(Boolean)
      .map((value) => String(value).trim().toUpperCase());
    return ids.includes(target);
  });
}

export function toVerifiedCheckoutOffer(
  offer: VesimOffer,
  lookupCountry?: string | null
): VerifiedCheckoutOffer | null {
  const priced = applyPakistanRetailOverride(offer, lookupCountry);
  const offerId = (priced.offerId || priced.id || "").trim();
  const retail =
    typeof priced.priceUSD === "number" && Number.isFinite(priced.priceUSD)
      ? priced.priceUSD
      : typeof priced.price === "number" && Number.isFinite(priced.price)
        ? priced.price
        : null;
  const provider =
    typeof priced.providerPriceUSD === "number" &&
    Number.isFinite(priced.providerPriceUSD)
      ? priced.providerPriceUSD
      : retail;

  if (!offerId || retail == null || retail < 0 || provider == null || provider < 0) {
    return null;
  }

  return {
    offerId,
    name: priced.name,
    countryCode:
      sanitizeCountryHint(priced.country) ||
      sanitizeCountryHint(lookupCountry) ||
      null,
    countryName: priced.countryName || null,
    dataFormatted: priced.dataFormatted,
    durationDays: priced.durationDays ?? null,
    priceUSD: retail,
    providerPriceUSD: provider,
    currency: priced.currency || "USD",
  };
}

export async function fetchDestinations(
  token?: TokenResult
): Promise<VesimDestination[]> {
  const baseUrl = getVesimBaseUrl();
  // When a token is supplied by the caller, use it once (no auto-retry here);
  // otherwise use authorized fetch with one auth recovery + one retry.
  const response = token
    ? await fetch(`${baseUrl}/api/esim/destinations`, {
        headers: {
          Authorization: `${token.tokenType} ${token.accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      })
    : await vesimAuthorizedFetch(`${baseUrl}/api/esim/destinations`);

  const data = await readJsonSafe(response);
  if (!response.ok) {
    return [];
  }

  return normalizeDestinations(data);
}

/** Revalidate public destination identity list (seconds). */
const PUBLIC_DESTINATION_CATALOG_REVALIDATE_SECONDS = 300;

/**
 * Previously fanned out live offer fetches from inside the destination catalog
 * cache (nested `unstable_cache` writes). That path stays a no-op: listing
 * "From" uses VeSIM destination minPrice → entry retail, which can differ
 * from the country-page lowest-offer retail until a separate listing snapshot
 * exists. Do not restore per-country offer fan-out here.
 */
export async function enrichDestinationsWithOfferRetailMins(
  destinations: VesimDestination[],
  token?: TokenResult
): Promise<VesimDestination[]> {
  void token;
  return destinations;
}

async function loadPublicDestinationCatalog(): Promise<VesimDestination[]> {
  const token = await getBrokerToken();
  const destinations = await fetchDestinations(token);
  if (destinations.length === 0) {
    throw new PublicOfferSnapshotError("empty_destination_catalog");
  }
  return destinations;
}

/**
 * Public `/api/vesim/destinations` identity catalog.
 * Does not fetch or cache per-country offers.
 */
export const fetchPublicDestinationCatalog = unstable_cache(
  loadPublicDestinationCatalog,
  ["public-destination-catalog-v3"],
  { revalidate: PUBLIC_DESTINATION_CATALOG_REVALIDATE_SECONDS }
);

async function collectDestinationOfferPages(
  destination: string,
  token: TokenResult | undefined,
  isPageUsable: (httpOk: boolean, payload: unknown) => boolean,
  options?: { signal?: AbortSignal }
) {
  const baseUrl = getVesimBaseUrl();
  const signal = options?.signal;
  return collectAllOfferPagePayloads(async (page) => {
    const query = buildVesimOffersQuery(destination, page);
    const url = `${baseUrl}/api/esim/offers?${query.toString()}`;
    const response = token
      ? await fetch(url, {
          headers: {
            Authorization: `${token.tokenType} ${token.accessToken}`,
            Accept: "application/json",
          },
          cache: "no-store",
          signal,
        })
      : await vesimAuthorizedFetch(url, { signal });
    const payload = await readJsonSafe(response);
    return { httpOk: response.ok, payload };
  }, { isPageUsable });
}

/**
 * Live provider offer fetch (no-store), all pages.
 * Purchase/checkout/admin validation must keep using this path.
 * Uses ?page=&limit=1024 — never fullCatalog=1.
 */
export async function fetchOffersForCountry(
  country: string,
  token?: TokenResult
): Promise<VesimOffer[]> {
  const destination = country.trim();
  if (!destination) return [];

  const collected = await collectDestinationOfferPages(
    destination,
    token,
    isUsableOffersPage
  );

  // Fail closed: incomplete pagination must not look like a full catalog.
  if (!collected.ok) {
    return [];
  }

  const allRawOffers = mergeOfferPageItems(collected.payloads);
  return normalizeOffers({ offers: allRawOffers });
}

/**
 * Strict live public browse fetch. Throws instead of returning an empty list.
 * Used by the flag-off Data Cache fill and by snapshot refresh/seed.
 */
export async function fetchStrictPublicOffersLive(
  country: string,
  options?: { signal?: AbortSignal }
): Promise<VesimOffer[]> {
  const destination = country.trim();
  if (!destination) {
    throw new PublicOfferSnapshotError("invalid_country");
  }

  const collected = await collectDestinationOfferPages(
    destination,
    undefined,
    isUsablePublicOffersPage,
    { signal: options?.signal }
  );

  if (!collected.ok) {
    throw new PublicOfferSnapshotError("incomplete");
  }

  const offers = normalizeOffers({
    offers: mergeOfferPageItems(collected.payloads),
  });
  if (offers.length === 0) {
    throw new PublicOfferSnapshotError("empty");
  }
  return offers;
}

function publicOffersCountryKey(country: string): string {
  const raw = country.trim();
  if (!raw || raw.length > 64) return "";
  return sanitizeCountryHint(raw) || raw;
}

async function loadFlagOffCachedPublicOffers(
  country: string
): Promise<VesimOffer[]> {
  return withPublicOfferRefreshTimeout(
    (signal) => fetchStrictPublicOffersLive(country, { signal }),
    PUBLIC_OFFER_REFRESH_TIMEOUT_MS
  );
}

/**
 * Bounded flag-off / pre-migration public offer cache (300s).
 * Same loader for country HTML and `/api/vesim/offers`.
 */
const loadCachedFlagOffPublicOffersForCountry = unstable_cache(
  loadFlagOffCachedPublicOffers,
  ["public-country-offers-v4-strict"],
  { revalidate: PUBLIC_OFFER_FLAG_OFF_REVALIDATE_SECONDS }
);

/**
 * PUBLIC BROWSING offers for country pages + `/api/vesim/offers`.
 * publicReadsOn=false or missing tables: 300s Data Cache of strict live lists.
 * publicReadsOn=true: durable PostgreSQL snapshot only; missing → throw.
 * Never use for purchase validation.
 */
export async function fetchPublicOffersForCountry(
  country: string
): Promise<VesimOffer[]> {
  const key = publicOffersCountryKey(country);
  if (!key) {
    throw new PublicOfferSnapshotError("invalid_country");
  }
  const offers = await loadPublicOffersForCountry({
    client: prisma,
    country: key,
    fetchLive: (destination) =>
      withPublicOfferRefreshTimeout(
        (signal) => fetchStrictPublicOffersLive(destination, { signal }),
        PUBLIC_OFFER_REFRESH_TIMEOUT_MS
      ),
    loadFlagOffCached: loadCachedFlagOffPublicOffersForCountry,
  });
  return applyPakistanPublicCatalog(key, offers);
}

export async function verifyOfferAuthoritative(options: {
  offerId: string;
  countryHint?: string | null;
}): Promise<VerifiedCheckoutOffer | null> {
  const offerId = normalizeOfferId(options.offerId);
  if (!offerId || offerId.length > 120) {
    return null;
  }

  const hint = sanitizeCountryHint(options.countryHint);
  const fromId = extractCountryHintFromOfferId(offerId);
  const candidates = Array.from(
    new Set([hint, fromId].filter((value): value is string => Boolean(value)))
  );

  if (candidates.length === 0) {
    return null;
  }

  const token = await getBrokerToken();

  for (const country of candidates) {
    const offers = await fetchOffersForCountry(country, token);
    const match = findOfferById(offers, offerId);
    if (!match) continue;

    const verified = toVerifiedCheckoutOffer(match, country);
    if (verified) return verified;
  }

  return null;
}

function pruneIdempotencyStore(now = Date.now()) {
  for (const [key, entry] of idempotencyStore.entries()) {
    if (entry.expiresAt <= now) {
      idempotencyStore.delete(key);
    }
  }
}

export function beginIdempotentCheckout(key: string): {
  ok: true;
} | {
  ok: false;
  status: number;
  error: string;
  orderId?: string;
} {
  const normalized = key.trim().slice(0, 128);
  if (!normalized) {
    return { ok: true };
  }

  pruneIdempotencyStore();
  const existing = idempotencyStore.get(normalized);
  const now = Date.now();

  if (existing && existing.expiresAt > now) {
    if (existing.status === "completed" && existing.orderId) {
      return {
        ok: false,
        status: 200,
        error: "Order already created",
        orderId: existing.orderId,
      };
    }

    if (existing.status === "pending") {
      return {
        ok: false,
        status: 409,
        error: "A purchase for this request is already in progress",
      };
    }
  }

  idempotencyStore.set(normalized, {
    status: "pending",
    expiresAt: now + IDEMPOTENCY_TTL_MS,
  });

  return { ok: true };
}

export function completeIdempotentCheckout(key: string, orderId: string) {
  const normalized = key.trim().slice(0, 128);
  if (!normalized) return;

  idempotencyStore.set(normalized, {
    status: "completed",
    orderId,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
}

export function failIdempotentCheckout(key: string) {
  const normalized = key.trim().slice(0, 128);
  if (!normalized) return;
  idempotencyStore.delete(normalized);
}

/**
 * Customer-facing API error text only.
 * Production (and browser responses generally) use the provided fallback or the
 * opaque VeSIM environment message — never Prisma/SQL/provider/config details.
 * Server logs remain responsible for safe diagnostics.
 */
export function publicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof VesimEnvironmentError) {
    return error.message;
  }
  // Always fail closed for unknown errors — do not forward Error.message
  // (may contain Prisma, SQL, hosts, or provider wording).
  void error;
  return fallback;
}

export function extractOrderId(payload: JsonRecord): string | null {
  const candidates = [
    payload.orderId,
    payload.order_id,
    payload.id,
    typeof payload.order === "object" && payload.order
      ? (payload.order as JsonRecord).orderId ||
        (payload.order as JsonRecord).id
      : null,
    typeof payload.data === "object" && payload.data
      ? (payload.data as JsonRecord).orderId ||
        (payload.data as JsonRecord).id
      : null,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function extractReturnedOfferId(payload: JsonRecord): string | null {
  const candidates = [
    payload.offerId,
    payload.offer_id,
    typeof payload.order === "object" && payload.order
      ? (payload.order as JsonRecord).offerId
      : null,
    typeof payload.data === "object" && payload.data
      ? (payload.data as JsonRecord).offerId
      : null,
    typeof payload.offer === "object" && payload.offer
      ? (payload.offer as JsonRecord).id ||
        (payload.offer as JsonRecord).offerId
      : null,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}
