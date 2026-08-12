import {
  normalizeDestinations,
  withLowestOfferRetailMinPrice,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import {
  VesimEnvironmentError,
  resolveValidatedVesimBaseUrl,
} from "@/app/lib/vesim/environment";
import {
  normalizeOffers,
  type VesimOffer,
} from "@/app/lib/vesim/offers";
import {
  buildVesimOffersQuery,
  collectAllOfferPagePayloads,
  mergeOfferPageItems,
} from "@/app/lib/vesim/offersPagination";
import { unstable_cache } from "next/cache";

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

type TokenResult = {
  accessToken: string;
  tokenType: string;
};

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

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("Server configuration is incomplete");
  }
  return value;
}

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
  const offerId = (offer.offerId || offer.id || "").trim();
  const retail =
    typeof offer.priceUSD === "number" && Number.isFinite(offer.priceUSD)
      ? offer.priceUSD
      : typeof offer.price === "number" && Number.isFinite(offer.price)
        ? offer.price
        : null;
  const provider =
    typeof offer.providerPriceUSD === "number" &&
    Number.isFinite(offer.providerPriceUSD)
      ? offer.providerPriceUSD
      : retail;

  if (!offerId || retail == null || retail < 0 || provider == null || provider < 0) {
    return null;
  }

  return {
    offerId,
    name: offer.name,
    countryCode:
      sanitizeCountryHint(offer.country) ||
      sanitizeCountryHint(lookupCountry) ||
      null,
    countryName: offer.countryName || null,
    dataFormatted: offer.dataFormatted,
    durationDays: offer.durationDays ?? null,
    priceUSD: retail,
    providerPriceUSD: provider,
    currency: offer.currency || "USD",
  };
}

export async function getBrokerToken(): Promise<TokenResult> {
  // Validates VESIM_ENVIRONMENT + VESIM_BASE_URL before credentials or network.
  const baseUrl = getVesimBaseUrl();
  const email = getRequiredEnv("VESIM_EMAIL");
  const password = getRequiredEnv("VESIM_PASSWORD");

  const response = await fetch(`${baseUrl}/api/auth/broker/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const data = await readJsonSafe(response);
  const accessToken =
    typeof data.access_token === "string" ? data.access_token : "";

  if (!response.ok || !accessToken) {
    throw new Error("Unable to authenticate with the eSIM provider");
  }

  return {
    accessToken,
    tokenType:
      typeof data.token_type === "string" && data.token_type.trim()
        ? data.token_type.trim()
        : "Bearer",
  };
}

export async function fetchDestinations(
  token?: TokenResult
): Promise<VesimDestination[]> {
  const auth = token || (await getBrokerToken());
  const baseUrl = getVesimBaseUrl();

  const response = await fetch(`${baseUrl}/api/esim/destinations`, {
    headers: {
      Authorization: `${auth.tokenType} ${auth.accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const data = await readJsonSafe(response);
  if (!response.ok) {
    return [];
  }

  return normalizeDestinations(data);
}

/** Parallel offer lookups while building public Starting-from mins. */
const PUBLIC_DESTINATION_OFFER_CONCURRENCY = 10;
/** Revalidate offer-derived destination mins (seconds). */
const PUBLIC_DESTINATION_CATALOG_REVALIDATE_SECONDS = 300;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * Replace entry-tier destination minPrice with the cheapest offer MAP retail.
 * Entry-tier (2%) understates Starting from when the cheapest buyable plan is
 * 502MB/1GB (3% tier) — public catalog must use offer retail once.
 */
export async function enrichDestinationsWithOfferRetailMins(
  destinations: VesimDestination[],
  token?: TokenResult
): Promise<VesimDestination[]> {
  if (destinations.length === 0) return destinations;
  // `token` retained for call-site compatibility; public offer snapshots
  // authenticate internally on cache miss via fetchOffersForCountry.
  void token;

  return mapPool(
    destinations,
    PUBLIC_DESTINATION_OFFER_CONCURRENCY,
    async (destination) => {
      const code = destination.code?.trim();
      if (!code) return destination;
      try {
        // Reuse the public browsing offer snapshot so catalog mins and country
        // pages agree within the same short revalidation window.
        const offers = await fetchPublicOffersForCountry(code);
        return withLowestOfferRetailMinPrice(destination, offers);
      } catch {
        // Keep entry-tier fallback when offers are unavailable for this code.
        return destination;
      }
    }
  );
}

async function loadPublicDestinationCatalog(): Promise<VesimDestination[]> {
  const token = await getBrokerToken();
  const destinations = await fetchDestinations(token);
  return enrichDestinationsWithOfferRetailMins(destinations, token);
}

/**
 * Public `/api/vesim/destinations` catalog: Starting from = lowest offer retail.
 * Cached so offer enrichment is not paid on every listing request.
 */
export const fetchPublicDestinationCatalog = unstable_cache(
  loadPublicDestinationCatalog,
  ["public-destination-catalog-offer-mins-v2"],
  { revalidate: PUBLIC_DESTINATION_CATALOG_REVALIDATE_SECONDS }
);

/**
 * Live provider offer fetch (no-store), all pages.
 * Purchase/checkout/admin validation must keep using this path.
 * Uses ?page=&limit=1024 — never fullCatalog=1.
 */
export async function fetchOffersForCountry(
  country: string,
  token?: TokenResult
): Promise<VesimOffer[]> {
  const auth = token || (await getBrokerToken());
  const baseUrl = getVesimBaseUrl();
  const destination = country.trim();
  if (!destination) return [];

  const collected = await collectAllOfferPagePayloads(async (page) => {
    const query = buildVesimOffersQuery(destination, page);
    const response = await fetch(
      `${baseUrl}/api/esim/offers?${query.toString()}`,
      {
        headers: {
          Authorization: `${auth.tokenType} ${auth.accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    const payload = await readJsonSafe(response);
    return { httpOk: response.ok, payload };
  });

  // Fail closed: incomplete pagination must not look like a full catalog.
  if (!collected.ok) {
    return [];
  }

  const allRawOffers = mergeOfferPageItems(collected.payloads);
  return normalizeOffers({ offers: allRawOffers });
}

/** Align public browsing offer snapshots with destination catalog TTL. */
const PUBLIC_OFFERS_REVALIDATE_SECONDS =
  PUBLIC_DESTINATION_CATALOG_REVALIDATE_SECONDS;

function publicOffersCountryKey(country: string): string {
  const raw = country.trim();
  if (!raw || raw.length > 64) return "";
  return sanitizeCountryHint(raw) || raw;
}

const loadCachedPublicOffersForCountry = unstable_cache(
  async (country: string) => fetchOffersForCountry(country),
  // v2: complete multi-page lists (invalidates prior single-page snapshots).
  ["public-country-offers-v2"],
  { revalidate: PUBLIC_OFFERS_REVALIDATE_SECONDS }
);

/**
 * Short-lived PUBLIC BROWSING snapshot of destination offers (~300s).
 * Country plans page + `/api/vesim/offers` use this so soft refreshes do not
 * flip between provider list variants. Never use for purchase validation.
 */
export async function fetchPublicOffersForCountry(
  country: string
): Promise<VesimOffer[]> {
  const key = publicOffersCountryKey(country);
  if (!key) return [];
  return loadCachedPublicOffersForCountry(key);
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
