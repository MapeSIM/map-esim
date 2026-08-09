/**
 * Pure VeSIM environment/host policy (safe for offline QA).
 * No network, no credentials, no Prisma.
 *
 * Staging broker hosts are confirmed. Live broker/API hosts are supplied by the
 * server-only module — never inferred from eSIM activation-host allowlists.
 */

export type VesimEnvironmentMode = "staging" | "live";

/** Confirmed staging broker/API hosts only. */
export const VESIM_STAGING_BROKER_HOSTS = [
  "www.vesim.xyz",
  "vesim.xyz",
] as const;

/**
 * @deprecated Prefer VESIM_STAGING_BROKER_HOSTS + server-only live allowlist.
 * Kept for callers that expect a mode map; live is always empty here.
 */
export const VESIM_APPROVED_HOSTS: Record<
  VesimEnvironmentMode,
  readonly string[]
> = {
  staging: VESIM_STAGING_BROKER_HOSTS,
  live: [],
};

/** Safe internal codes for logs — never includes host, credentials, or tokens. */
export const VESIM_ENV_ERROR_CODE = "VESIM_ENV_INVALID";
export const VESIM_LIVE_HOST_UNCONFIRMED_CODE = "VESIM_LIVE_HOST_UNCONFIRMED";

export type VesimEnvFailureCode =
  | typeof VESIM_ENV_ERROR_CODE
  | typeof VESIM_LIVE_HOST_UNCONFIRMED_CODE;

/** Generic customer/admin-facing message — no configuration details. */
export const VESIM_ENV_PUBLIC_ERROR =
  "eSIM purchasing is temporarily unavailable. Please contact support.";

export type VesimBaseUrlParseResult =
  | { ok: true; baseUrl: string; host: string }
  | {
      ok: false;
      reason: "missing" | "malformed" | "protocol" | "credentials" | "host";
    };

export function parseVesimEnvironmentMode(
  raw: string | null | undefined
): VesimEnvironmentMode | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "staging") return "staging";
  // Official ops docs may say "production"; app mode remains "live".
  if (value === "live" || value === "production") return "live";
  return null;
}

/**
 * Parse and normalize VESIM_BASE_URL to https origin + hostname.
 * Rejects non-https, embedded credentials, and unparseable values.
 */
export function parseVesimBaseUrl(
  raw: string | null | undefined
): VesimBaseUrlParseResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "missing" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "protocol" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials" };
  }

  const host = url.hostname.trim().toLowerCase();
  if (!host || host.includes(" ")) {
    return { ok: false, reason: "host" };
  }

  return {
    ok: true,
    baseUrl: `https://${host}`,
    host,
  };
}

export function isHostInAllowlist(
  host: string,
  allowlist: readonly string[]
): boolean {
  const normalized = host.trim().toLowerCase();
  return allowlist.some((entry) => entry.trim().toLowerCase() === normalized);
}

export type VesimEnvironmentValidation =
  | { ok: true; mode: VesimEnvironmentMode; baseUrl: string; host: string }
  | { ok: false; code: VesimEnvFailureCode };

/**
 * Validate mode + base URL pairing.
 * `liveBrokerHosts` must come from the server-only allowlist (may be empty).
 * Never returns host/credentials in errors.
 */
export function validateVesimEnvironmentConfig(input: {
  environment: string | null | undefined;
  baseUrl: string | null | undefined;
  /** Confirmed live broker hosts only — empty until VeSIM confirms. */
  liveBrokerHosts?: readonly string[];
}): VesimEnvironmentValidation {
  const mode = parseVesimEnvironmentMode(input.environment);
  if (!mode) {
    return { ok: false, code: VESIM_ENV_ERROR_CODE };
  }

  if (mode === "live") {
    const liveHosts = input.liveBrokerHosts ?? [];
    if (liveHosts.length === 0) {
      return { ok: false, code: VESIM_LIVE_HOST_UNCONFIRMED_CODE };
    }

    const parsedLive = parseVesimBaseUrl(input.baseUrl);
    if (!parsedLive.ok) {
      return { ok: false, code: VESIM_ENV_ERROR_CODE };
    }
    if (!isHostInAllowlist(parsedLive.host, liveHosts)) {
      return { ok: false, code: VESIM_ENV_ERROR_CODE };
    }
    return {
      ok: true,
      mode,
      baseUrl: parsedLive.baseUrl,
      host: parsedLive.host,
    };
  }

  const parsed = parseVesimBaseUrl(input.baseUrl);
  if (!parsed.ok) {
    return { ok: false, code: VESIM_ENV_ERROR_CODE };
  }

  if (!isHostInAllowlist(parsed.host, VESIM_STAGING_BROKER_HOSTS)) {
    return { ok: false, code: VESIM_ENV_ERROR_CODE };
  }

  return {
    ok: true,
    mode,
    baseUrl: parsed.baseUrl,
    host: parsed.host,
  };
}

/** @deprecated Use isHostInAllowlist with the mode-specific allowlist. */
export function isApprovedVesimHostForMode(
  mode: VesimEnvironmentMode,
  host: string,
  liveBrokerHosts: readonly string[] = []
): boolean {
  if (mode === "live") {
    return (
      liveBrokerHosts.length > 0 && isHostInAllowlist(host, liveBrokerHosts)
    );
  }
  return isHostInAllowlist(host, VESIM_STAGING_BROKER_HOSTS);
}
