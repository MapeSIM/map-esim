import {
  normalizeDestinations,
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

export type VerifiedCheckoutOffer = {
  offerId: string;
  name: string;
  countryCode: string | null;
  countryName: string | null;
  dataFormatted: string;
  durationDays: number | null;
  priceUSD: number;
  currency: string;
};

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
  const price =
    typeof offer.priceUSD === "number" && Number.isFinite(offer.priceUSD)
      ? offer.priceUSD
      : typeof offer.price === "number" && Number.isFinite(offer.price)
        ? offer.price
        : null;

  if (!offerId || price == null || price < 0) {
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
    priceUSD: price,
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

export async function fetchOffersForCountry(
  country: string,
  token?: TokenResult
): Promise<VesimOffer[]> {
  const auth = token || (await getBrokerToken());
  const baseUrl = getVesimBaseUrl();

  const response = await fetch(
    `${baseUrl}/api/esim/offers?country=${encodeURIComponent(country)}`,
    {
      headers: {
        Authorization: `${auth.tokenType} ${auth.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  const data = await readJsonSafe(response);
  if (!response.ok) {
    return [];
  }

  return normalizeOffers(data);
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

export function publicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof VesimEnvironmentError) {
    return error.message;
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    // Never expose env/config internals or provider auth details.
    if (
      /password|token|authorization|vesim|env|configuration/i.test(message)
    ) {
      return fallback;
    }
    if (message) return message;
  }
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
