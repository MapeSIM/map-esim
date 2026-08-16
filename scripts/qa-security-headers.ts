/**
 * Offline QA for Phase 8F-A security headers, CSP Report-Only, and private routes.
 * Does not start a server, call VeSIM, mutate wallets, or send email.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCspReportOnlyValue,
  buildGlobalSecurityHeaders,
  buildNextConfigHeaderSources,
  PRIVATE_NO_STORE_VALUE,
  PUBLIC_CURRENCY_RATES_CACHE,
  shouldEnableHsts,
} from "../app/lib/security/headers";
import { VESIM_ENV_PUBLIC_ERROR } from "../app/lib/vesim/environmentPolicy";
import { isTawkEnabledRoute } from "../app/lib/support/tawkRoutes";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const headersSrc = read("app/lib/security/headers.ts");
  const nextConfig = read("next.config.ts");
  const serverSrc = read("app/lib/vesim/server.ts");
  const tawkChat = read("app/components/support/TawkChat.tsx");
  const tawkRoutes = read("app/lib/support/tawkRoutes.ts");
  const consentGate = read("app/components/cookies/ConsentScriptGate.tsx");
  const authTs = read("auth.ts");
  const paymentPage = read("app/payment/page.tsx");
  const currencyApi = read("app/api/currency/rates/route.ts");
  const tokenApi = read("app/api/vesim/token/route.ts");
  const pkg = read("package.json");
  const robots = read("app/robots.ts");
  const sitemap = read("app/sitemap.ts");
  const contact = read("app/lib/contact/submitContactForm.ts");

  console.log("1) Global non-CSP headers");
  const global = buildGlobalSecurityHeaders({ NODE_ENV: "development" });
  const keys = new Set(global.map((h) => h.key));
  assert.equal(keys.has("X-Content-Type-Options"), true);
  assert.equal(
    global.find((h) => h.key === "X-Content-Type-Options")?.value,
    "nosniff"
  );
  assert.equal(
    global.find((h) => h.key === "Referrer-Policy")?.value,
    "strict-origin-when-cross-origin"
  );
  assert.equal(
    global.find((h) => h.key === "X-Frame-Options")?.value,
    "DENY"
  );
  assert.match(
    global.find((h) => h.key === "Permissions-Policy")?.value || "",
    /camera=\(\)/
  );
  assert.match(
    global.find((h) => h.key === "Permissions-Policy")?.value || "",
    /geolocation=\(\)/
  );
  assert.equal(keys.has("Cross-Origin-Opener-Policy"), false);
  assert.equal(keys.has("Cross-Origin-Resource-Policy"), false);
  console.log("   ok");

  console.log("2) HSTS production-gated");
  assert.equal(
    shouldEnableHsts({
      NODE_ENV: "development",
      AUTH_URL: "https://mapesim.com",
    }),
    false
  );
  assert.equal(
    shouldEnableHsts({
      NODE_ENV: "production",
      AUTH_URL: "http://localhost:3000",
    }),
    false
  );
  assert.equal(
    shouldEnableHsts({
      NODE_ENV: "production",
      AUTH_URL: "https://mapesim.com",
    }),
    true
  );
  const prodHeaders = buildGlobalSecurityHeaders({
    NODE_ENV: "production",
    AUTH_URL: "https://mapesim.com",
  });
  assert.equal(
    prodHeaders.some((h) => h.key === "Strict-Transport-Security"),
    true
  );
  const devHeaders = buildGlobalSecurityHeaders({
    NODE_ENV: "development",
    AUTH_URL: "http://localhost:3000",
  });
  assert.equal(
    devHeaders.some((h) => h.key === "Strict-Transport-Security"),
    false
  );
  console.log("   ok");

  console.log("3) CSP is Report-Only, not enforced");
  const prodKeys = buildGlobalSecurityHeaders({
    NODE_ENV: "production",
    AUTH_URL: "https://mapesim.com",
  }).map((h) => h.key);
  assert.equal(prodKeys.includes("Content-Security-Policy-Report-Only"), true);
  assert.equal(prodKeys.includes("Content-Security-Policy"), false);
  assert.ok(!nextConfig.includes('key: "Content-Security-Policy"'));
  assert.ok(!headersSrc.includes('key: "Content-Security-Policy"'));
  assert.match(headersSrc, /Content-Security-Policy-Report-Only/);
  const csp = buildCspReportOnlyValue({ NODE_ENV: "production" });
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self' https:\/\/accounts\.google\.com/);
  assert.match(csp, /https:\/\/embed\.tawk\.to/);
  assert.match(csp, /https:\/\/\*\.tawk\.to/);
  assert.match(
    csp,
    /style-src 'self' 'unsafe-inline' https:\/\/\*\.tawk\.to/
  );
  assert.match(
    csp,
    /script-src 'self' 'unsafe-inline' 'unsafe-eval' https:\/\/embed\.tawk\.to https:\/\/cdn\.jsdelivr\.net/
  );
  assert.match(
    csp,
    /img-src 'self' data: blob: https:\/\/flagcdn\.com https:\/\/\*\.tawk\.to https:\/\/cdn\.jsdelivr\.net https:\/\/\*\.public\.blob\.vercel-storage\.com https:\/\/\*\.blob\.vercel-storage\.com/
  );
  assert.ok(!/script-src[^;]*https:\/\/\*\.tawk\.to/.test(csp));
  assert.ok(!/style-src[^;]*cdn\.jsdelivr\.net/.test(csp));
  assert.ok(!/font-src[^;]*cdn\.jsdelivr\.net/.test(csp));
  assert.ok(!/connect-src[^;]*cdn\.jsdelivr\.net/.test(csp));
  assert.ok(!/frame-src[^;]*cdn\.jsdelivr\.net/.test(csp));
  assert.ok(!csp.includes("fonts.googleapis.com"));
  assert.ok(!csp.includes("tawk.link"));
  assert.match(csp, /wss:\/\/\*\.tawk\.to/);
  assert.match(csp, /https:\/\/flagcdn\.com/);
  assert.match(csp, /upgrade-insecure-requests/);
  assert.ok(!csp.includes("vesim"));
  assert.ok(!csp.includes("open.er-api.com"));
  const cspDev = buildCspReportOnlyValue({ NODE_ENV: "development" });
  assert.ok(!cspDev.includes("upgrade-insecure-requests"));
  assert.match(nextConfig, /buildNextConfigHeaderSources/);
  console.log("   ok");

  console.log("4) Private routes: noindex + private no-store");
  const sources = buildNextConfigHeaderSources({ NODE_ENV: "development" });
  const bySource = Object.fromEntries(
    sources.map((s) => [s.source, s.headers])
  );
  for (const path of [
    "/account/:path*",
    "/admin/:path*",
    "/checkout/:path*",
    "/payment/:path*",
    "/success/:path*",
    "/signin",
    "/signup",
    "/oauth-consent",
    "/dashboard/:path*",
  ]) {
    const h = bySource[path] || [];
    assert.ok(
      h.some(
        (x) => x.key === "X-Robots-Tag" && x.value === "noindex, nofollow"
      ),
      `missing noindex for ${path}`
    );
    assert.ok(
      h.some(
        (x) =>
          x.key === "Cache-Control" && x.value === PRIVATE_NO_STORE_VALUE
      ),
      `missing private no-store for ${path}`
    );
  }
  assert.equal(PRIVATE_NO_STORE_VALUE, "private, no-store, max-age=0");
  assert.match(read("app/account/layout.tsx"), /robots:\s*\{\s*index:\s*false/);
  assert.match(read("app/admin/layout.tsx"), /robots:\s*\{\s*index:\s*false/);
  assert.match(read("app/payment/layout.tsx"), /robots:\s*\{\s*index:\s*false/);
  assert.match(robots, /disallow:[\s\S]*\/account/);
  assert.ok(!sitemap.includes("/account"));
  assert.ok(!sitemap.includes("/payment"));
  console.log("   ok");

  console.log("5) Sensitive APIs + currency policy");
  for (const path of [
    "/api/account/:path*",
    "/api/admin/:path*",
    "/api/vesim/:path*",
    "/api/auth/:path*",
  ]) {
    const h = bySource[path] || [];
    assert.ok(
      h.some(
        (x) => x.key === "Cache-Control" && x.value === PRIVATE_NO_STORE_VALUE
      ),
      `missing API no-store for ${path}`
    );
  }
  assert.match(currencyApi, /PUBLIC_CURRENCY_RATES_CACHE/);
  assert.equal(
    PUBLIC_CURRENCY_RATES_CACHE,
    "public, max-age=300, stale-while-revalidate=3600"
  );
  assert.match(tokenApi, /Not found/);
  assert.match(tokenApi, /PRIVATE_API_RESPONSE_HEADERS|private, no-store/);
  console.log("   ok");

  console.log("6) publicErrorMessage fails closed");
  assert.match(serverSrc, /export function publicErrorMessage/);
  assert.match(serverSrc, /Always fail closed|fail closed/i);
  assert.ok(!/if \(message\) return message/.test(serverSrc));
  assert.match(serverSrc, /VesimEnvironmentError/);
  assert.match(serverSrc, /return fallback/);
  assert.equal(typeof VESIM_ENV_PUBLIC_ERROR, "string");
  assert.ok(VESIM_ENV_PUBLIC_ERROR.length > 10);
  console.log("   ok");

  console.log("7) Tawk consent/routes + Google OAuth unchanged");
  assert.match(consentGate, /enabledByConsent=\{marketingAllowed\}/);
  assert.match(tawkChat, /enabledByConsent/);
  assert.match(tawkRoutes, /\/payment/);
  assert.match(tawkRoutes, /\/account/);
  assert.equal(isTawkEnabledRoute("/support"), true);
  assert.equal(isTawkEnabledRoute("/contact"), true);
  assert.equal(isTawkEnabledRoute("/account"), false);
  assert.equal(isTawkEnabledRoute("/payment"), false);
  assert.equal(isTawkEnabledRoute("/admin"), false);
  assert.match(authTs, /AUTH_GOOGLE_ID/);
  assert.match(authTs, /allowDangerousEmailAccountLinking:\s*false/);
  assert.match(contact, /submitContactFormAction/);
  assert.match(csp, /form-action 'self'/);
  console.log("   ok");

  console.log("8) Payment gateway untouched + package script");
  assert.ok(!paymentPage.includes("buildGlobalSecurityHeaders"));
  assert.ok(!paymentPage.includes("Content-Security-Policy"));
  assert.match(
    read("app/payment/layout.tsx"),
    /business logic stays unchanged|robots/
  );
  assert.match(pkg, /"qa:security-headers"/);
  console.log("   ok");

  console.log("PASS security_headers_offline_qa");
}

main();
