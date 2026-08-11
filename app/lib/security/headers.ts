/**
 * Central security header builders for Next.js config and route handlers.
 * Pure helpers — safe to import from next.config.ts and QA scripts.
 */

export type SecurityHeader = { key: string; value: string };

/** Private HTML / sensitive JSON — never cache in shared or browser stores. */
export const PRIVATE_NO_STORE_VALUE =
  "private, no-store, max-age=0" as const;

/** Public FX rates — intentional short browser/CDN cache (server revalidates separately). */
export const PUBLIC_CURRENCY_RATES_CACHE =
  "public, max-age=300, stale-while-revalidate=3600" as const;

export const PRIVATE_NO_STORE_HEADERS: SecurityHeader[] = [
  { key: "Cache-Control", value: PRIVATE_NO_STORE_VALUE },
  { key: "Pragma", value: "no-cache" },
];

export const PRIVATE_NOINDEX_HEADERS: SecurityHeader[] = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/**
 * HSTS only for real production HTTPS deployments.
 * Never enable for localhost or plain-http AUTH_URL.
 */
export function shouldEnableHsts(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.NODE_ENV || "").trim() !== "production") return false;
  const authUrl = (env.AUTH_URL || env.NEXTAUTH_URL || "").trim().toLowerCase();
  if (!authUrl) return false;
  if (authUrl.includes("localhost") || authUrl.includes("127.0.0.1")) {
    return false;
  }
  return authUrl.startsWith("https://");
}

export function buildHstsHeader(
  env: NodeJS.ProcessEnv = process.env
): SecurityHeader | null {
  if (!shouldEnableHsts(env)) return null;
  return {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  };
}

/**
 * CSP Report-Only baseline for Phase 8F-A.
 * Not enforced — browsers report violations only.
 */
export function buildCspReportOnlyValue(
  env: NodeJS.ProcessEnv = process.env
): string {
  const isProd = (env.NODE_ENV || "").trim() === "production";
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com",
    // Next.js App Router currently needs inline script compatibility until nonce CSP.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://embed.tawk.to https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://*.tawk.to",
    "img-src 'self' data: blob: https://flagcdn.com https://*.tawk.to https://cdn.jsdelivr.net",
    "font-src 'self' data: https://*.tawk.to",
    "connect-src 'self' https://*.tawk.to wss://*.tawk.to",
    "frame-src https://*.tawk.to",
    "worker-src 'self' blob:",
  ];
  if (isProd) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

/** Site-wide headers applied to every response (CSP Report-Only + baseline). */
export function buildGlobalSecurityHeaders(
  env: NodeJS.ProcessEnv = process.env
): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    {
      key: "Content-Security-Policy-Report-Only",
      value: buildCspReportOnlyValue(env),
    },
  ];
  const hsts = buildHstsHeader(env);
  if (hsts) headers.push(hsts);
  // COOP/CORP omitted — redirect-based Google OAuth and cross-origin flag/QR
  // assets are safer without aggressive isolation headers in this phase.
  return headers;
}

/** Private HTML routes: noindex + private no-store. */
export function buildPrivateHtmlHeaders(): SecurityHeader[] {
  return [...PRIVATE_NOINDEX_HEADERS, ...PRIVATE_NO_STORE_HEADERS];
}

/** Sensitive API routes: private no-store only (no robots tag needed). */
export function buildPrivateApiHeaders(): SecurityHeader[] {
  return [...PRIVATE_NO_STORE_HEADERS];
}

/**
 * Next.js `headers()` route table for Phase 8F-A.
 * Global headers apply to all paths; private sources add noindex/cache.
 */
export function buildNextConfigHeaderSources(
  env: NodeJS.ProcessEnv = process.env
): Array<{ source: string; headers: SecurityHeader[] }> {
  const global = buildGlobalSecurityHeaders(env);
  const privateHtml = buildPrivateHtmlHeaders();
  const privateApi = buildPrivateApiHeaders();

  const privateHtmlSources = [
    "/account",
    "/account/:path*",
    "/admin",
    "/admin/:path*",
    "/checkout",
    "/checkout/:path*",
    "/payment",
    "/payment/:path*",
    "/success",
    "/success/:path*",
    "/signin",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/reset-password/:path*",
    "/verify-email",
    "/verify-reset-code",
    "/oauth-consent",
    "/oauth-consent/:path*",
    "/dashboard",
    "/dashboard/:path*",
  ];

  const privateApiSources = [
    "/api/account/:path*",
    "/api/admin/:path*",
    "/api/vesim/:path*",
    "/api/auth/:path*",
  ];

  return [
    { source: "/:path*", headers: global },
    ...privateHtmlSources.map((source) => ({
      source,
      headers: privateHtml,
    })),
    ...privateApiSources.map((source) => ({
      source,
      headers: privateApi,
    })),
  ];
}

/** Headers object for NextResponse / Route Handler usage. */
export const PRIVATE_API_RESPONSE_HEADERS: Record<string, string> = {
  "Cache-Control": PRIVATE_NO_STORE_VALUE,
  Pragma: "no-cache",
};
