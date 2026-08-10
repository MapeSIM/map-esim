/**
 * Offline QA for public absolute self-canonicals.
 * Does not hit the network or mutate data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { absoluteCanonical } from "../app/lib/seo/canonical";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(absoluteCanonical("/"), "https://mapesim.com/");
  assert.equal(absoluteCanonical(""), "https://mapesim.com/");
  assert.equal(absoluteCanonical("/countries"), "https://mapesim.com/countries");
  assert.equal(absoluteCanonical("/plans"), "https://mapesim.com/plans");
  assert.equal(
    absoluteCanonical("/device-compatibility"),
    "https://mapesim.com/device-compatibility"
  );
  assert.equal(
    absoluteCanonical("/countries/saudi-arabia"),
    "https://mapesim.com/countries/saudi-arabia"
  );

  const rootLayout = read("app/layout.tsx");
  assert.doesNotMatch(rootLayout, /openGraph:\s*\{[^}]*url:\s*BRAND_SITE_URL/);
  assert.match(rootLayout, /Do not set openGraph\.url here/);

  const home = read("app/page.tsx");
  assert.match(home, /absoluteCanonical\("\/"\)/);
  assert.doesNotMatch(home, /canonical:\s*"\/"/);

  const countries = read("app/countries/layout.tsx");
  assert.match(countries, /absoluteCanonical\("\/countries"\)/);

  const plans = read("app/plans/layout.tsx");
  assert.match(plans, /absoluteCanonical\("\/plans"\)/);

  const device = read("app/device-compatibility/page.tsx");
  assert.match(device, /absoluteCanonical\("\/device-compatibility"\)/);

  const destination = read("app/countries/[id]/layout.tsx");
  assert.match(destination, /absoluteCanonical\(path\)/);

  const account = read("app/account/layout.tsx");
  assert.match(account, /robots:\s*\{\s*index:\s*false/);
  const admin = read("app/admin/layout.tsx");
  assert.match(admin, /robots:\s*\{\s*index:\s*false/);
  const checkout = read("app/checkout/layout.tsx");
  assert.match(checkout, /robots:\s*\{\s*index:\s*false/);

  // SSR country page fix must remain untouched by this QA's expectations.
  const countryPage = read("app/countries/[id]/page.tsx");
  assert.doesNotMatch(countryPage, /^["']use client["']/m);
  assert.match(countryPage, /fetchOffersForCountry/);

  console.log("ALL_QA_PASSED=seo-canonical");
}

main();
