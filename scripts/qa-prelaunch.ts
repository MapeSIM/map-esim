/**
 * MAP eSIM pre-launch doctor — lean, read-only aggregator.
 *
 * - Reuses existing qa:* scripts (no logic duplication)
 * - Adds small offline checks for routes, redirects, destination integrity, git
 * - Optional live HTTP sanity when PRELAUNCH_BASE_URL is set (GET only)
 *
 * NEVER places VeSIM orders, payments, wallet mutations, refunds, or emails.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  destinationPath,
  destinationRouteId,
  findDestinationBySlug,
  normalizeDestination,
  type VesimDestination,
} from "../app/lib/vesim/destinations";
import { destinationDisplayName } from "../app/lib/vesim/destinationPresentation";
import { absoluteCanonical } from "../app/lib/seo/canonical";
import { BRAND_NAME } from "../app/lib/brand";

const root = join(__dirname, "..");
const BASELINE = "2897d03b59687cc06ee98c331494b68ff690bbc6";

type Level = "PASS" | "WARN" | "FAIL" | "MANUAL";

type Finding = {
  level: Level;
  check: string;
  reason: string;
  affected?: string;
  action?: string;
};

const findings: Finding[] = [];

function add(
  level: Level,
  check: string,
  reason: string,
  affected?: string,
  action?: string
) {
  findings.push({ level, check, reason, affected, action });
}

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function pageExists(routePath: string): boolean {
  // Dynamic segments: /countries/pakistan → countries/[id]
  if (routePath.startsWith("/countries/") && routePath !== "/countries") {
    return existsSync(join(root, "app/countries/[id]/page.tsx"));
  }
  const cleaned = routePath.replace(/\/+$/, "") || "/";
  if (cleaned === "/") return existsSync(join(root, "app/page.tsx"));
  const rel = `app${cleaned}/page.tsx`;
  return existsSync(join(root, rel));
}

function runNpmScript(script: string, timeoutMs = 120_000): {
  ok: boolean;
  output: string;
} {
  const result = spawnSync("npm", ["run", script], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    timeout: timeoutMs,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return { ok: result.status === 0, output };
}

function runTsx(relScript: string, timeoutMs = 120_000): {
  ok: boolean;
  output: string;
} {
  const result = spawnSync("npx", ["tsx", relScript], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    timeout: timeoutMs,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return { ok: result.status === 0, output };
}

function git(args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  return (result.stdout || "").trim();
}

function asDestination(code: string, name: string): VesimDestination {
  const d = normalizeDestination({ code, name });
  if (!d) throw new Error(`normalizeDestination failed for ${code}`);
  return d;
}

// ─── A. Existing QA aggregation ─────────────────────────────────────────────

type QaJob =
  | { kind: "npm"; script: string; label: string }
  | { kind: "tsx"; file: string; label: string };

const EXISTING_QA: QaJob[] = [
  { kind: "npm", script: "qa:destination-routing", label: "destination routing" },
  {
    kind: "npm",
    script: "qa:destination-presentation",
    label: "destination presentation",
  },
  {
    kind: "npm",
    script: "qa:destination-catalog-ssr",
    label: "destination catalog SSR",
  },
  { kind: "npm", script: "qa:country-plans-ssr", label: "country plan SSR" },
  {
    kind: "npm",
    script: "qa:plan-card-presentation",
    label: "plan-card presentation",
  },
  {
    kind: "tsx",
    file: "scripts/qa-country-regional-recommendation.ts",
    label: "country/regional recommendation",
  },
  { kind: "npm", script: "qa:seo-canonical", label: "SEO canonical" },
  { kind: "npm", script: "qa:security-headers", label: "security headers" },
  { kind: "npm", script: "qa:password-policy", label: "password policy" },
  { kind: "npm", script: "qa:cookie-consent", label: "cookie consent" },
  { kind: "npm", script: "qa:google-oauth", label: "Google OAuth" },
  { kind: "npm", script: "qa:guest-checkout-gate", label: "guest checkout gate" },
  { kind: "npm", script: "qa:vesim-environment", label: "VeSIM environment" },
  {
    kind: "npm",
    script: "qa:post-payment-success-route",
    label: "post-payment success route",
  },
  {
    kind: "npm",
    script: "qa:safepay-webhook-observability",
    label: "safepay webhook observability",
  },
  {
    kind: "npm",
    script: "qa:admin-wallet-credit",
    label: "admin wallet credit (read-only)",
  },
  {
    kind: "npm",
    script: "qa:admin-wallet-debit",
    label: "admin wallet debit (read-only)",
  },
  {
    kind: "npm",
    script: "qa:refund-request-foundation",
    label: "refund request foundation",
  },
  {
    kind: "npm",
    script: "qa:admin-reconciliation-readonly",
    label: "admin reconciliation readonly",
  },
  {
    kind: "npm",
    script: "qa:admin-operations-health",
    label: "admin operations health",
  },
  { kind: "npm", script: "email:qa", label: "email channels" },
  { kind: "npm", script: "qa:plans-discovery", label: "plans discovery" },
  {
    kind: "npm",
    script: "qa:affiliates-partnerships",
    label: "affiliates & partnerships",
  },
  { kind: "npm", script: "qa:navbar-layout", label: "navbar layout" },
];

// Optional if present from SEO metadata work-in-progress
if (existsSync(join(root, "scripts/qa-destination-seo-metadata.ts"))) {
  const pkg = read("package.json");
  if (pkg.includes("qa:destination-seo-metadata")) {
    EXISTING_QA.splice(3, 0, {
      kind: "npm",
      script: "qa:destination-seo-metadata",
      label: "destination SEO metadata",
    });
  } else {
    EXISTING_QA.splice(3, 0, {
      kind: "tsx",
      file: "scripts/qa-destination-seo-metadata.ts",
      label: "destination SEO metadata",
    });
  }
}

function runExistingQa() {
  for (const job of EXISTING_QA) {
    const check = `existing:${job.label}`;
    const result =
      job.kind === "npm"
        ? runNpmScript(job.script)
        : runTsx(job.file);
    if (result.ok) {
      add("PASS", check, `${job.label} QA passed`);
    } else {
      const lines = result.output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const expected = lines.find((l) => l.startsWith("expected:"));
      const assertion = lines.find((l) => /AssertionError|assert\./i.test(l));
      const reason =
        expected ||
        assertion ||
        lines.filter((l) => !l.includes("... more characters")).slice(-3).join(" | ") ||
        "non-zero exit";
      add(
        "FAIL",
        check,
        `QA failed: ${reason}`,
        job.kind === "npm" ? `npm run ${job.script}` : job.file,
        "Fix failing existing QA before launch"
      );
    }
  }
}

// ─── B. Public route sanity ─────────────────────────────────────────────────

/** Repo-derived public marketing/support routes (must have page.tsx). */
const PUBLIC_ROUTES = [
  "/",
  "/countries",
  "/countries/pakistan",
  "/countries/puerto-rico",
  "/countries/uspr",
  "/plans",
  "/device-compatibility",
  "/support",
  "/contact",
  "/about",
  "/affiliates-and-partnerships",
  "/how-it-works",
  "/install/iphone",
  "/install/android",
  "/privacy-policy",
  "/terms-and-conditions",
  "/cookie-policy",
  "/refund-policy",
] as const;

/** Provider-data dependent destination detail routes. */
const PROVIDER_DEPENDENT = new Set([
  "/countries/pakistan",
  "/countries/puerto-rico",
  "/countries/uspr",
]);

function checkPublicRoutesOffline() {
  for (const route of PUBLIC_ROUTES) {
    if (pageExists(route)) {
      add(
        "PASS",
        `route:exists:${route}`,
        "page.tsx present in repo",
        route
      );
    } else {
      add(
        "FAIL",
        `route:exists:${route}`,
        "expected public page file missing",
        route,
        "Restore the page or remove from launch checklist"
      );
    }
  }
}

async function checkPublicRoutesLive() {
  const base = (process.env.PRELAUNCH_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) {
    add(
      "WARN",
      "route:live-http",
      "PRELAUNCH_BASE_URL not set — skipped live GET sanity",
      "public routes",
      "Re-run with PRELAUNCH_BASE_URL=https://mapesim.com for live status codes"
    );
    return;
  }

  for (const route of PUBLIC_ROUTES) {
    const url = `${base}${route === "/" ? "/" : route}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { Accept: "text/html" },
      });
      const status = res.status;
      if (status >= 500) {
        add(
          "FAIL",
          `route:live:${route}`,
          `unexpected HTTP ${status}`,
          url,
          "Investigate server error before launch"
        );
      } else if (status === 404) {
        add(
          "FAIL",
          `route:live:${route}`,
          "unexpected HTTP 404",
          url,
          "Confirm deploy includes this route"
        );
      } else if (status >= 200 && status < 400) {
        if (PROVIDER_DEPENDENT.has(route)) {
          add(
            "WARN",
            `route:live:${route}`,
            `HTTP ${status} (provider-data dependent destination)`,
            url,
            "Spot-check offers still load for this destination"
          );
        } else {
          add(
            "PASS",
            `route:live:${route}`,
            `HTTP ${status}`,
            url
          );
        }
      } else {
        add(
          "WARN",
          `route:live:${route}`,
          `unexpected HTTP ${status}`,
          url,
          "Confirm whether this status is intentional"
        );
      }
    } catch (err) {
      add(
        "FAIL",
        `route:live:${route}`,
        `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        url,
        "Check network / base URL"
      );
    }
  }
}

// ─── C. Destination integrity ───────────────────────────────────────────────

function checkDestinationIntegrity() {
  const pr = asDestination("PR", "Puerto Rico");
  const uspr = asDestination("USPR", "Puerto Rico");
  const catalog = [uspr, pr];

  const prKey = `country-${pr.code}-${destinationRouteId(pr)}`;
  const usprKey = `country-${uspr.code}-${destinationRouteId(uspr)}`;
  if (prKey === usprKey) {
    add(
      "FAIL",
      "destination:react-keys",
      "PR and USPR React keys collide",
      "CountriesListing",
      "Include provider code in list keys"
    );
  } else {
    add(
      "PASS",
      "destination:react-keys",
      "PR and USPR React keys are distinct",
      `${prKey} vs ${usprKey}`
    );
  }

  const prRoute = destinationRouteId(pr);
  const usprRoute = destinationRouteId(uspr);
  if (prRoute === usprRoute) {
    add(
      "FAIL",
      "destination:route-ids",
      "PR and USPR share the same route id",
      `${prRoute}`,
      "Keep non-ISO codes on provider-code paths"
    );
  } else {
    add(
      "PASS",
      "destination:route-ids",
      "PR and USPR route ids are distinct",
      `${prRoute} vs ${usprRoute}`
    );
  }

  const resolvedPr = findDestinationBySlug(catalog, "puerto-rico");
  const resolvedUspr = findDestinationBySlug(catalog, "uspr");
  if (resolvedPr?.code !== "PR") {
    add(
      "FAIL",
      "destination:resolve:pr",
      `puerto-rico resolved to ${resolvedPr?.code ?? "null"}`,
      "/countries/puerto-rico",
      "Fix findDestinationBySlug / destinationRouteId"
    );
  } else {
    add(
      "PASS",
      "destination:resolve:pr",
      "puerto-rico resolves to PR",
      "/countries/puerto-rico"
    );
  }
  if (resolvedUspr?.code !== "USPR") {
    add(
      "FAIL",
      "destination:resolve:uspr",
      `uspr resolved to ${resolvedUspr?.code ?? "null"}`,
      "/countries/uspr",
      "Fix findDestinationBySlug / destinationRouteId"
    );
  } else {
    add(
      "PASS",
      "destination:resolve:uspr",
      "uspr resolves to USPR",
      "/countries/uspr"
    );
  }

  for (const dest of catalog) {
    const path = destinationPath(dest);
    const id = path.replace(/^\/countries\//, "");
    const back = findDestinationBySlug(catalog, id);
    if (!back || back.code !== dest.code) {
      add(
        "FAIL",
        `destination:href-roundtrip:${dest.code}`,
        `href ${path} does not resolve back to ${dest.code}`,
        path,
        "Align destinationPath with findDestinationBySlug"
      );
    } else {
      add(
        "PASS",
        `destination:href-roundtrip:${dest.code}`,
        `href round-trips to ${dest.code}`,
        path
      );
    }
  }

  const listing = read("app/components/countries/CountriesListing.tsx");
  if (!/destinationReactKey|kind\}-\$\{destination\.code\}/.test(listing)) {
    add(
      "FAIL",
      "destination:listing-keys",
      "CountriesListing missing code-aware React keys",
      "CountriesListing.tsx",
      "Keep provider code in list keys"
    );
  } else {
    add(
      "PASS",
      "destination:listing-keys",
      "CountriesListing uses code-aware React keys",
      "CountriesListing.tsx"
    );
  }
}

// ─── D. Plan-card contract (delegate + static guard) ─────────────────────────

function checkPlanCardContract() {
  // Full contract covered by qa:plan-card-presentation; add a static safety net.
  const presentation = read("app/lib/plans/planOfferPresentation.ts");
  const listing = read("app/components/plans/PlansListing.tsx");

  if (!/isForbiddenPlanCardText|planCardSecondaryText/.test(presentation)) {
    add(
      "FAIL",
      "plan-card:helpers",
      "planOfferPresentation missing card-text guards",
      "planOfferPresentation.ts",
      "Restore plan-card presentation helpers"
    );
  } else {
    add(
      "PASS",
      "plan-card:helpers",
      "plan-card forbidden-text helpers present",
      "planOfferPresentation.ts"
    );
  }

  if (/providerPriceUSD/.test(listing)) {
    add(
      "FAIL",
      "plan-card:provider-cost",
      "PlansListing references providerPriceUSD",
      "PlansListing.tsx",
      "Strip provider cost from public cards"
    );
  } else {
    add(
      "PASS",
      "plan-card:provider-cost",
      "PlansListing does not reference providerPriceUSD",
      "PlansListing.tsx"
    );
  }

  // Card path should not dump packageInfo / Fair Use into secondary lines helper usage.
  if (
    /planCardSecondaryText|planCardSecondaryLines/.test(listing) &&
    !/packageInfo/.test(
      listing.slice(
        Math.max(0, listing.indexOf("planCardSecondary")),
        listing.indexOf("planCardSecondary") + 800
      )
    )
  ) {
    add(
      "PASS",
      "plan-card:listing-uses-helpers",
      "PlansListing uses shared plan-card helpers",
      "PlansListing.tsx"
    );
  } else if (/planCardSecondaryText|planCardSecondaryLines/.test(listing)) {
    add(
      "PASS",
      "plan-card:listing-uses-helpers",
      "PlansListing uses shared plan-card helpers",
      "PlansListing.tsx"
    );
  } else {
    add(
      "WARN",
      "plan-card:listing-uses-helpers",
      "PlansListing may not use shared secondary-text helpers",
      "PlansListing.tsx",
      "Confirm card copy still goes through planOfferPresentation"
    );
  }
}

// ─── E. Redirect / success-target audit ─────────────────────────────────────

function checkRedirectTargets() {
  const targets: Array<{ label: string; file: string; routeHint: string }> = [
    {
      label: "admin wallet credit success",
      file: "app/admin/customers/[id]/wallet/credit/success/page.tsx",
      routeHint: "/admin/customers/[id]/wallet/credit/success",
    },
    {
      label: "admin wallet debit success",
      file: "app/admin/customers/[id]/wallet/debit/success/page.tsx",
      routeHint: "/admin/customers/[id]/wallet/debit/success",
    },
    {
      label: "customer purchase success",
      file: "app/account/esim/buy/success/page.tsx",
      routeHint: "/account/esim/buy/success",
    },
    {
      label: "customer purchase failed",
      file: "app/account/esim/buy/failed/page.tsx",
      routeHint: "/account/esim/buy/failed",
    },
    {
      label: "payment return",
      file: "app/account/esim/buy/payment/return/page.tsx",
      routeHint: "/account/esim/buy/payment/return",
    },
    {
      label: "payment cancel",
      file: "app/account/esim/buy/payment/cancel/page.tsx",
      routeHint: "/account/esim/buy/payment/cancel",
    },
    {
      label: "legacy /success",
      file: "app/success/page.tsx",
      routeHint: "/success",
    },
    {
      label: "verify email",
      file: "app/verify-email/page.tsx",
      routeHint: "/verify-email",
    },
    {
      label: "reset password",
      file: "app/reset-password/page.tsx",
      routeHint: "/reset-password",
    },
    {
      label: "verify reset code",
      file: "app/verify-reset-code/page.tsx",
      routeHint: "/verify-reset-code",
    },
    {
      label: "signin",
      file: "app/signin/page.tsx",
      routeHint: "/signin",
    },
    {
      label: "admin package assign success",
      file: "app/admin/customers/[id]/esim/assign/success/page.tsx",
      routeHint: "/admin/customers/[id]/esim/assign/success",
    },
    {
      label: "admin wallet-buy success",
      file: "app/admin/customers/[id]/esim/wallet-buy/success/page.tsx",
      routeHint: "/admin/customers/[id]/esim/wallet-buy/success",
    },
  ];

  for (const t of targets) {
    if (existsSync(join(root, t.file))) {
      add("PASS", `redirect-target:${t.label}`, "success/auth page exists", t.routeHint);
    } else {
      add(
        "FAIL",
        `redirect-target:${t.label}`,
        "redirect target page missing",
        t.routeHint,
        "Restore page or update redirect builders"
      );
    }
  }

  // Static confirm redirect builders point at existing success folders.
  const creditActions = read("app/lib/wallet/adminCreditActions.ts");
  const debitActions = read("app/lib/wallet/adminDebitActions.ts");
  if (/wallet\/credit\/success/.test(creditActions)) {
    add(
      "PASS",
      "redirect-builder:credit",
      "admin credit redirects to credit/success",
      "adminCreditActions.ts"
    );
  } else {
    add(
      "FAIL",
      "redirect-builder:credit",
      "admin credit success path not found in actions",
      "adminCreditActions.ts",
      "Confirm buildSuccessPath still targets credit/success"
    );
  }
  if (/wallet\/debit\/success/.test(debitActions)) {
    add(
      "PASS",
      "redirect-builder:debit",
      "admin debit redirects to debit/success",
      "adminDebitActions.ts"
    );
  } else {
    add(
      "FAIL",
      "redirect-builder:debit",
      "admin debit success path not found in actions",
      "adminDebitActions.ts",
      "Confirm buildSuccessPath still targets debit/success"
    );
  }
}

// ─── F. SEO sanity ──────────────────────────────────────────────────────────

function checkSeoSanity() {
  const countryLayout = read("app/countries/[id]/layout.tsx");
  const accountLayout = read("app/account/layout.tsx");
  const adminLayout = read("app/admin/layout.tsx");
  const checkoutLayout = read("app/checkout/layout.tsx");
  const sitemap = read("app/sitemap.ts");
  const robots = read("app/robots.ts");
  const seoCatalog = read("app/lib/seo/destinationCatalog.ts");

  if (/absoluteCanonical\(path\)/.test(countryLayout) && /resolveDestinationForSeo/.test(countryLayout)) {
    add(
      "PASS",
      "seo:destination-layout",
      "destination layout builds self-canonical via resolveDestinationForSeo",
      "app/countries/[id]/layout.tsx"
    );
  } else {
    add(
      "FAIL",
      "seo:destination-layout",
      "destination metadata missing canonical resolver wiring",
      "app/countries/[id]/layout.tsx",
      "Restore generateMetadata canonical path"
    );
  }

  if (/fetchPublicDestinationCatalog/.test(seoCatalog)) {
    add(
      "PASS",
      "seo:resolver-aligned",
      "SEO resolver uses public catalog (same as page body)",
      "destinationCatalog.ts"
    );
  } else {
    add(
      "WARN",
      "seo:resolver-aligned",
      "SEO resolver may still use a separate catalog path from the page body",
      "destinationCatalog.ts",
      "Align resolveDestinationForSeo with fetchPublicDestinationCatalog"
    );
  }

  // Expected metadata derivation for PR / USPR (offline).
  const pr = asDestination("PR", "Puerto Rico");
  const uspr = asDestination("USPR", "Puerto Rico");
  const prCanon = absoluteCanonical(destinationPath(pr));
  const usprCanon = absoluteCanonical(destinationPath(uspr));
  const prTitle = `${destinationDisplayName(pr)} eSIM | ${BRAND_NAME}`;
  const usprTitle = `${destinationDisplayName(uspr)} eSIM | ${BRAND_NAME}`;

  if (
    prCanon === "https://mapesim.com/countries/puerto-rico" &&
    prTitle.includes("Puerto Rico") &&
    !prTitle.includes("(US)")
  ) {
    add(
      "PASS",
      "seo:meta:pr",
      `PR → ${prTitle} / ${prCanon}`,
      "/countries/puerto-rico"
    );
  } else {
    add(
      "FAIL",
      "seo:meta:pr",
      `unexpected PR metadata ${prTitle} ${prCanon}`,
      "/countries/puerto-rico",
      "Fix destinationPath / display name for PR"
    );
  }

  if (
    usprCanon === "https://mapesim.com/countries/uspr" &&
    usprTitle.includes("Puerto Rico (US)")
  ) {
    add(
      "PASS",
      "seo:meta:uspr",
      `USPR → ${usprTitle} / ${usprCanon}`,
      "/countries/uspr"
    );
  } else {
    add(
      "FAIL",
      "seo:meta:uspr",
      `unexpected USPR metadata ${usprTitle} ${usprCanon}`,
      "/countries/uspr",
      "Fix destinationPath / display name for USPR"
    );
  }

  add(
    "WARN",
    "seo:production-cache",
    "Production may serve stale destination metadata until SEO/public catalog caches refresh",
    "/countries/uspr",
    "After deploy, verify live <title>/canonical for USPR; do not clear caches from this doctor"
  );

  for (const [label, src] of [
    ["account", accountLayout],
    ["admin", adminLayout],
    ["checkout", checkoutLayout],
  ] as const) {
    if (/robots:\s*\{\s*index:\s*false/.test(src)) {
      add(
        "PASS",
        `seo:noindex:${label}`,
        `${label} layout is noindex`,
        `app/${label}/layout.tsx`
      );
    } else {
      add(
        "FAIL",
        `seo:noindex:${label}`,
        `${label} layout missing robots index:false`,
        `app/${label}/layout.tsx`,
        "Keep private areas noindex"
      );
    }
  }

  if (/getCanonicalDestinationPathsForSitemap|staticRoutes/.test(sitemap)) {
    add("PASS", "seo:sitemap", "sitemap.ts present with static + destination paths", "app/sitemap.ts");
  } else {
    add(
      "FAIL",
      "seo:sitemap",
      "sitemap.ts missing expected generators",
      "app/sitemap.ts",
      "Restore sitemap staticRoutes / destination paths"
    );
  }

  if (/export default function robots/.test(robots)) {
    add("PASS", "seo:robots", "robots.ts present", "app/robots.ts");
  } else {
    add(
      "FAIL",
      "seo:robots",
      "robots.ts missing or unexpected",
      "app/robots.ts",
      "Restore robots metadata route"
    );
  }

  if (/robots:\s*\{\s*index:\s*true/.test(countryLayout)) {
    add(
      "PASS",
      "seo:destination-indexable",
      "resolved destinations set index:true",
      "app/countries/[id]/layout.tsx"
    );
  } else {
    add(
      "WARN",
      "seo:destination-indexable",
      "could not confirm index:true on destination layout",
      "app/countries/[id]/layout.tsx",
      "Confirm public destinations are indexable when resolved"
    );
  }
}

// ─── G. Git / deployment sanity ─────────────────────────────────────────────

function checkGitSanity() {
  const head = git(["rev-parse", "HEAD"]);
  const origin = git(["rev-parse", "origin/main"]);
  const status = git(["status", "--short"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

  add("PASS", "git:head", `local HEAD ${head}`, branch || "main");
  if (origin) {
    add("PASS", "git:origin-main", `origin/main ${origin}`, "origin/main");
    if (head === origin) {
      add("PASS", "git:synced", "HEAD matches origin/main", head);
    } else {
      add(
        "WARN",
        "git:synced",
        "HEAD differs from origin/main",
        `${head} vs ${origin}`,
        "Push or pull before treating this tree as production"
      );
    }
  } else {
    add(
      "WARN",
      "git:origin-main",
      "could not resolve origin/main",
      "git",
      "Fetch origin/main if needed"
    );
  }

  if (!status) {
    add("PASS", "git:clean", "working tree clean", "git status");
  } else {
    add(
      "WARN",
      "git:clean",
      `working tree dirty:\n${status}`,
      "git status",
      "Commit or stash before production cut"
    );
  }

  if (head.startsWith(BASELINE.slice(0, 7)) || head === BASELINE) {
    add(
      "PASS",
      "git:baseline",
      `HEAD matches intended baseline ${BASELINE.slice(0, 7)}`,
      BASELINE
    );
  } else {
    add(
      "WARN",
      "git:baseline",
      `HEAD ${head} is not baseline ${BASELINE}`,
      "git",
      "Confirm intentional divergence from launch baseline"
    );
  }

  // No Vercel/gh CLI assumed — mark deployment commit as MANUAL.
  add(
    "MANUAL",
    "deploy:production-sha",
    "No deployment CLI available in this doctor — confirm production commit in host dashboard",
    "production",
    "Verify host deploy SHA == origin/main"
  );
}

// ─── H. Console / client ────────────────────────────────────────────────────

function checkConsoleClient() {
  add(
    "MANUAL",
    "client:console-errors",
    "No Playwright/browser runner in package.json",
    "browser",
    "Manually check browser console on /, /countries, /countries/pakistan, /countries/uspr"
  );
  add(
    "MANUAL",
    "client:react-key-warnings",
    "No automated React key warning capture",
    "CountriesListing / PlansListing",
    "Confirm no duplicate-key warnings in browser console"
  );
  add(
    "MANUAL",
    "client:hydration",
    "No automated hydration check",
    "public pages",
    "Spot-check no hydration mismatch warnings"
  );
  add(
    "MANUAL",
    "uat:visual-plan-cards",
    "Visual plan-card / Plan Details UAT not automated",
    "Pakistan / Afghanistan / PR / USPR",
    "Human UAT of card cleanliness and Plan Details FUP retention"
  );
}

// ─── Report ─────────────────────────────────────────────────────────────────

function printReport(startedAt: number) {
  const groups: Record<Level, Finding[]> = {
    PASS: [],
    WARN: [],
    FAIL: [],
    MANUAL: [],
  };
  for (const f of findings) groups[f.level].push(f);

  const elapsedMs = Date.now() - startedAt;
  console.log("");
  console.log("MAP eSIM PRE-LAUNCH DOCTOR");
  console.log("==========================");
  console.log(`Runtime: ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log("");

  for (const level of ["PASS", "WARN", "FAIL", "MANUAL"] as Level[]) {
    console.log(level);
    if (groups[level].length === 0) {
      console.log("  (none)");
    } else {
      for (const f of groups[level]) {
        console.log(`  - [${f.check}] ${f.reason}`);
        if (level === "FAIL" || level === "WARN") {
          if (f.affected) console.log(`      affected: ${f.affected}`);
          if (f.action) console.log(`      next: ${f.action}`);
        }
      }
    }
    console.log("");
  }

  console.log("SUMMARY");
  console.log(`PASS: ${groups.PASS.length}`);
  console.log(`WARN: ${groups.WARN.length}`);
  console.log(`FAIL: ${groups.FAIL.length}`);
  console.log(`MANUAL: ${groups.MANUAL.length}`);
}

async function main() {
  const startedAt = Date.now();
  console.log("Running MAP eSIM pre-launch doctor (read-only)...");

  runExistingQa();
  checkPublicRoutesOffline();
  await checkPublicRoutesLive();
  checkDestinationIntegrity();
  checkPlanCardContract();
  checkRedirectTargets();
  checkSeoSanity();
  checkGitSanity();
  checkConsoleClient();

  printReport(startedAt);

  const failed = findings.some((f) => f.level === "FAIL");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("PRELAUNCH_DOCTOR_CRASH", err);
  process.exit(2);
});
