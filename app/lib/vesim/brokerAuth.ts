/**
 * Process-local VeSIM broker auth (access + refresh).
 * No DB persistence — password remint is the cross-instance fallback.
 * Never logs tokens, credentials, or Authorization headers.
 */
import "server-only";

import {
  resolveValidatedVesimBaseUrl,
} from "@/app/lib/vesim/environment";

export type BrokerTokenResult = {
  accessToken: string;
  tokenType: string;
};

type CachedBrokerAuth = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  /** Epoch ms when access token should be treated as expired. */
  expiresAtMs: number;
};

type JsonRecord = Record<string, unknown>;

const AUTH_FAILURE_MESSAGE = "Unable to authenticate with the eSIM provider";
/** Refresh this many ms before access expiry. */
const REFRESH_SKEW_MS = 60_000;
/** Fallback TTL when provider omits expires_in / expires_at. */
const DEFAULT_ACCESS_TTL_MS = 55 * 60 * 1000;

let cached: CachedBrokerAuth | null = null;
/** Single-flight for mint/refresh/password recovery on this instance. */
let authFlight: Promise<CachedBrokerAuth> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("Server configuration is incomplete");
  }
  return value;
}

async function readJsonSafe(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    return {};
  }
}

function parseExpiresAtMs(data: JsonRecord, now = Date.now()): number {
  const expiresIn = data.expires_in;
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0) {
    return now + Math.floor(expiresIn) * 1000;
  }
  if (typeof expiresIn === "string" && expiresIn.trim()) {
    const n = Number(expiresIn);
    if (Number.isFinite(n) && n > 0) return now + Math.floor(n) * 1000;
  }
  const expiresAt = data.expires_at;
  if (typeof expiresAt === "string" && expiresAt.trim()) {
    const t = Date.parse(expiresAt);
    if (Number.isFinite(t)) return t;
  }
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
    // Heuristic: seconds vs ms
    return expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  }
  return now + DEFAULT_ACCESS_TTL_MS;
}

function parseAuthPayload(data: JsonRecord): CachedBrokerAuth | null {
  const accessToken =
    typeof data.access_token === "string" ? data.access_token.trim() : "";
  if (!accessToken) return null;
  const refreshRaw =
    typeof data.refresh_token === "string" ? data.refresh_token.trim() : "";
  const tokenType =
    typeof data.token_type === "string" && data.token_type.trim()
      ? data.token_type.trim()
      : "Bearer";
  return {
    accessToken,
    refreshToken: refreshRaw || null,
    tokenType,
    expiresAtMs: parseExpiresAtMs(data),
  };
}

function applyCache(next: CachedBrokerAuth): CachedBrokerAuth {
  // Always replace refresh_token with newest returned value when present.
  // If refresh response omits refresh_token, keep prior refresh token.
  if (!next.refreshToken && cached?.refreshToken) {
    next = { ...next, refreshToken: cached.refreshToken };
  }
  cached = next;
  return next;
}

function isAccessFresh(entry: CachedBrokerAuth, now = Date.now()): boolean {
  return entry.expiresAtMs - REFRESH_SKEW_MS > now && Boolean(entry.accessToken);
}

async function passwordLogin(): Promise<CachedBrokerAuth> {
  const baseUrl = resolveValidatedVesimBaseUrl();
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
  const parsed = parseAuthPayload(data);
  if (!response.ok || !parsed) {
    throw new Error(AUTH_FAILURE_MESSAGE);
  }
  return applyCache(parsed);
}

async function refreshLogin(refreshToken: string): Promise<CachedBrokerAuth> {
  const baseUrl = resolveValidatedVesimBaseUrl();
  const response = await fetch(`${baseUrl}/api/auth/broker/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });

  const data = await readJsonSafe(response);
  if (response.status === 401 || response.status === 403) {
    throw new Error(AUTH_FAILURE_MESSAGE);
  }
  const parsed = parseAuthPayload(data);
  if (!response.ok || !parsed) {
    throw new Error(AUTH_FAILURE_MESSAGE);
  }
  // Newest refresh_token from response replaces prior (via applyCache).
  return applyCache(parsed);
}

/**
 * Ensure a usable access token (single-flight).
 * Uses cache → refresh (if near expiry / forced) → password login.
 */
async function ensureCachedAuth(options?: {
  forceRefresh?: boolean;
  forcePassword?: boolean;
}): Promise<CachedBrokerAuth> {
  const forcePassword = options?.forcePassword === true;
  const forceRefresh = options?.forceRefresh === true || forcePassword;

  if (!forceRefresh && cached && isAccessFresh(cached)) {
    return cached;
  }

  if (authFlight) {
    return authFlight;
  }

  authFlight = (async () => {
    try {
      if (forcePassword) {
        return await passwordLogin();
      }

      if (!forceRefresh && cached && isAccessFresh(cached)) {
        return cached;
      }

      const refreshToken = cached?.refreshToken?.trim() || "";
      if (refreshToken) {
        try {
          return await refreshLogin(refreshToken);
        } catch {
          // Controlled password fallback — one remint path.
          return await passwordLogin();
        }
      }

      return await passwordLogin();
    } finally {
      authFlight = null;
    }
  })();

  return authFlight;
}

function toResult(entry: CachedBrokerAuth): BrokerTokenResult {
  return {
    accessToken: entry.accessToken,
    tokenType: entry.tokenType,
  };
}

/** Public entry used by all VeSIM callers. */
export async function getBrokerToken(): Promise<BrokerTokenResult> {
  const entry = await ensureCachedAuth();
  return toResult(entry);
}

/**
 * One controlled auth recovery after a protected-call auth failure.
 * Prefers refresh; falls back to password login once.
 */
export async function recoverBrokerAuthAfterFailure(): Promise<BrokerTokenResult> {
  // Invalidate access so we do not reuse the rejected token.
  if (cached) {
    cached = {
      ...cached,
      accessToken: "",
      expiresAtMs: 0,
    };
  }
  const entry = await ensureCachedAuth({ forceRefresh: true });
  return toResult(entry);
}

export function isBrokerAuthHttpStatus(status: number): boolean {
  // Only 401 is treated as expired/invalid auth eligible for recovery.
  // 403 is a provider permission/forbidden response — never remint/retry.
  return status === 401;
}

/**
 * Authorized VeSIM fetch with at most one auth recovery + one original retry
 * when the protected call returns HTTP 401.
 * HTTP 403 is returned as-is (no refresh, remint, or retry).
 * No recursion. Does not retry 429/503 in a loop.
 */
export async function vesimAuthorizedFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const buildInit = (auth: BrokerTokenResult): RequestInit => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `${auth.tokenType} ${auth.accessToken}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    return {
      ...init,
      headers,
      cache: init?.cache ?? "no-store",
    };
  };

  let auth = await getBrokerToken();
  let response = await fetch(url, buildInit(auth));

  if (response.status === 401) {
    auth = await recoverBrokerAuthAfterFailure();
    response = await fetch(url, buildInit(auth));
  }

  return response;
}

/** Test/QA helpers — never expose tokens. */
export function __brokerAuthTestReset(): void {
  cached = null;
  authFlight = null;
}

export function __brokerAuthTestGetMeta(): {
  hasAccess: boolean;
  hasRefresh: boolean;
  expiresAtMs: number | null;
} {
  return {
    hasAccess: Boolean(cached?.accessToken),
    hasRefresh: Boolean(cached?.refreshToken),
    expiresAtMs: cached?.expiresAtMs ?? null,
  };
}

export function __brokerAuthTestSeed(options: {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string;
  expiresAtMs: number;
}): void {
  cached = {
    accessToken: options.accessToken,
    refreshToken: options.refreshToken ?? null,
    tokenType: options.tokenType ?? "Bearer",
    expiresAtMs: options.expiresAtMs,
  };
}
