/**
 * Offline QA: /countries must SSR the trusted destination catalog and never
 * regress a full catalog to the tiny static marketing fallback on refresh failure.
 * Does not call VeSIM, mutate DB, or touch payments.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countries as staticCountries } from "../app/data/countries";
import {
  STATIC_DESTINATION_FALLBACK_MAX,
  shouldAcceptPublicDestinationCatalog,
} from "../app/lib/vesim/destinations";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const page = read("app/countries/page.tsx");
  const listing = read("app/components/countries/CountriesListing.tsx");
  const destinations = read("app/lib/vesim/destinations.ts");
  const api = read("app/api/vesim/destinations/route.ts");
  const pkg = read("package.json");

  console.log("1) /countries SSR seeds trusted catalog");
  assert.doesNotMatch(page, /^["']use client["']/m);
  assert.match(page, /export default async function CountriesPage/);
  assert.match(page, /fetchPublicDestinationCatalog/);
  assert.match(page, /CountriesListing/);
  assert.match(page, /initialSource/);
  assert.match(page, /source:\s*"static"/);
  assert.match(page, /staticFallbackDestinations|staticCountries/);
  assert.doesNotMatch(page, /fetch\(\s*["'`]\/api\/vesim\//);
  assert.doesNotMatch(page, /useEffect\s*\(/);
  console.log("   ok");

  console.log("2) Client soft-refresh never clears last good catalog");
  assert.match(listing, /^["']use client["']/m);
  assert.match(listing, /parsePublicDestinations/);
  assert.match(listing, /shouldAcceptPublicDestinationCatalog/);
  assert.match(listing, /fetch\(["'`]\/api\/vesim\/destinations/);
  assert.doesNotMatch(listing, /normalizeDestinations\(/);
  assert.doesNotMatch(listing, /getBrokerToken|VESIM_PASSWORD|providerPriceUSD/);
  assert.match(listing, /Keep last good catalog/);
  assert.match(listing, /setUpdating\(true\)/);
  assert.doesNotMatch(
    listing,
    /setDestinations\(\s*\(\s*\)\s*=>\s*staticCountries/
  );
  // Must not seed client state from static marketing list anymore.
  assert.doesNotMatch(listing, /from ["']@\/app\/data\/countries["']|from ["']\.\.\/data\/countries["']/);
  console.log("   ok");

  console.log("3) Accept policy: small fallback cannot overwrite larger catalog");
  assert.equal(staticCountries.length, STATIC_DESTINATION_FALLBACK_MAX);
  assert.match(destinations, /shouldAcceptPublicDestinationCatalog/);
  assert.equal(
    shouldAcceptPublicDestinationCatalog({
      currentLength: 120,
      currentSource: "catalog",
      nextLength: 0,
    }),
    false
  );
  assert.equal(
    shouldAcceptPublicDestinationCatalog({
      currentLength: 120,
      currentSource: "catalog",
      nextLength: STATIC_DESTINATION_FALLBACK_MAX,
    }),
    false
  );
  assert.equal(
    shouldAcceptPublicDestinationCatalog({
      currentLength: 120,
      currentSource: "catalog",
      nextLength: 8,
      nextIsStaticFallback: true,
    }),
    false
  );
  assert.equal(
    shouldAcceptPublicDestinationCatalog({
      currentLength: 8,
      currentSource: "static",
      nextLength: 8,
      nextIsStaticFallback: true,
    }),
    true
  );
  assert.equal(
    shouldAcceptPublicDestinationCatalog({
      currentLength: 8,
      currentSource: "static",
      nextLength: 140,
    }),
    true
  );
  assert.equal(
    shouldAcceptPublicDestinationCatalog({
      currentLength: 140,
      currentSource: "catalog",
      nextLength: 138,
    }),
    true
  );
  console.log("   ok");

  console.log("4) API remains server-side; browser never talks to VeSIM");
  assert.match(api, /fetchPublicDestinationCatalog/);
  assert.doesNotMatch(listing, /vesim\.world|getVesimBaseUrl/);
  assert.match(pkg, /"qa:destination-catalog-ssr"/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=destination-catalog-ssr");
}

main();
