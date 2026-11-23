/**
 * Host-based app domain for the 3-site architecture (single Next.js deploy).
 * Edge-safe — no Node / Prisma / server-only imports.
 */

export type AppDomain = "retail" | "partner" | "sandbox";

export const MAP_DOMAIN_HEADER = "x-map-domain";
export const MAP_DOMAIN_COOKIE = "map_domain";
export const MAP_DOMAIN_QUERY = "__domain";

export const RETAIL_SITE_HOST = "mapesim.com";
export const PARTNER_SITE_HOST = "partneresim.com";
export const SANDBOX_SITE_HOST = "mapesim.store";

export const RETAIL_SITE_ORIGIN = `https://${RETAIL_SITE_HOST}`;
export const PARTNER_SITE_ORIGIN = `https://${PARTNER_SITE_HOST}`;
export const SANDBOX_SITE_ORIGIN = `https://${SANDBOX_SITE_HOST}`;

const RETAIL_HOSTS = new Set([
  RETAIL_SITE_HOST,
  `www.${RETAIL_SITE_HOST}`,
]);
const PARTNER_HOSTS = new Set([
  PARTNER_SITE_HOST,
  `www.${PARTNER_SITE_HOST}`,
]);
const SANDBOX_HOSTS = new Set([
  SANDBOX_SITE_HOST,
  `www.${SANDBOX_SITE_HOST}`,
]);

export function stripPort(host: string): string {
  const raw = host.trim().toLowerCase();
  if (!raw) return "";
  // IPv6 [::1]:3000
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    if (end >= 0) return raw.slice(0, end + 1);
  }
  const colon = raw.lastIndexOf(":");
  if (colon > 0 && raw.includes(".")) {
    return raw.slice(0, colon);
  }
  // localhost:3000
  if (colon > 0 && !raw.includes(".")) {
    return raw.slice(0, colon);
  }
  return raw;
}

export function isLocalDevHost(host: string | null | undefined): boolean {
  const h = stripPort(host ?? "");
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h === "::1"
  );
}

/** Normalize host or hostname-like query value → AppDomain | null. */
export function parseAppDomainToken(
  raw: string | null | undefined
): AppDomain | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return null;
  const host = stripPort(value.replace(/^https?:\/\//, "").split("/")[0] ?? "");
  if (
    host === "retail" ||
    host === "mapesim" ||
    RETAIL_HOSTS.has(host)
  ) {
    return "retail";
  }
  if (
    host === "partner" ||
    host === "b2b" ||
    PARTNER_HOSTS.has(host)
  ) {
    return "partner";
  }
  if (
    host === "sandbox" ||
    host === "store" ||
    host === "demo" ||
    SANDBOX_HOSTS.has(host)
  ) {
    return "sandbox";
  }
  return null;
}

export function resolveAppDomainFromHost(
  host: string | null | undefined
): AppDomain {
  const h = stripPort(host ?? "");
  if (!h || isLocalDevHost(h)) return "retail";
  if (PARTNER_HOSTS.has(h)) return "partner";
  if (SANDBOX_HOSTS.has(h)) return "sandbox";
  if (RETAIL_HOSTS.has(h)) return "retail";
  // Unknown production host → retail (safe default).
  return "retail";
}

/**
 * Resolve domain for a request: query override → cookie → host.
 * Used by middleware (and mirrored for server reads via header).
 */
export function resolveAppDomain(input: {
  host?: string | null;
  queryDomain?: string | null;
  cookieDomain?: string | null;
}): AppDomain {
  return (
    parseAppDomainToken(input.queryDomain) ??
    parseAppDomainToken(input.cookieDomain) ??
    resolveAppDomainFromHost(input.host)
  );
}

/** Edge-safe domain resolve from an Auth.js / NextRequest-like object. */
export function resolveAppDomainFromRequest(request: {
  headers: Headers;
  nextUrl: { pathname: string; searchParams: URLSearchParams };
  cookies?: { get: (name: string) => { value: string } | undefined };
}): AppDomain {
  const host = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  )
    .split(",")[0]
    .trim();
  return resolveAppDomain({
    host,
    queryDomain: request.nextUrl.searchParams.get(MAP_DOMAIN_QUERY),
    cookieDomain: request.cookies?.get(MAP_DOMAIN_COOKIE)?.value ?? null,
  });
}

/** True when the path is the B2B marketing/landing surface (rewritten `/` or `/partner`). */
export function isPartnerLandingPath(pathname: string): boolean {
  const path = (pathname || "/").split("?")[0].split("#")[0] || "/";
  return path === "/" || path === "/partner";
}

/** Public origin for cross-domain redirects (docs → partner portal). */
export function publicOriginForDomain(
  domain: AppDomain,
  opts?: { requestHost?: string | null; proto?: string | null }
): string {
  const host = (opts?.requestHost ?? "").split(",")[0]?.trim() ?? "";
  if (isLocalDevHost(host)) {
    const proto =
      (opts?.proto ?? "http").split(",")[0]?.trim().toLowerCase() === "https"
        ? "https"
        : "http";
    return `${proto}://${host}`;
  }
  if (domain === "partner") return PARTNER_SITE_ORIGIN;
  if (domain === "sandbox") return SANDBOX_SITE_ORIGIN;
  return RETAIL_SITE_ORIGIN;
}

/** Auth callback allowlist — all three public site origins. */
export function multiDomainAllowedOrigins(): string[] {
  return [RETAIL_SITE_ORIGIN, PARTNER_SITE_ORIGIN, SANDBOX_SITE_ORIGIN];
}
