/**
 * Offline QA: homepage conversion sections (display only).
 * Does not start a server, mutate payments, or change checkout/API logic.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOME_COMPARISON_COLUMNS,
  HOME_COMPARISON_ROWS,
  HOME_DISCOVERY_CTA_HREF,
  HOME_DISCOVERY_CTA_LABEL,
  HOME_FINAL_CTA_PRIMARY_HREF,
  HOME_FINAL_CTA_PRIMARY_LABEL,
  HOME_FINAL_CTA_SECONDARY_HREF,
  HOME_POPULAR_DESTINATIONS,
  POPULAR_DESTINATION_DISPLAY_ORDER,
} from "../app/lib/home/homeConversionSections";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(HOME_POPULAR_DESTINATIONS.length >= 6);
  assert.ok(HOME_POPULAR_DESTINATIONS.some((item) => item.id === "pakistan"));
  assert.ok(HOME_POPULAR_DESTINATIONS.some((item) => item.id === "france"));
  assert.deepEqual(
    HOME_POPULAR_DESTINATIONS.map((item) => item.name),
    [
      "Pakistan",
      "Saudi Arabia",
      "United Arab Emirates",
      "Turkey",
      "United Kingdom",
      "United States",
      "France",
      "Germany",
    ]
  );
  assert.deepEqual([...POPULAR_DESTINATION_DISPLAY_ORDER], [
    "PK",
    "SA",
    "AE",
    "MY",
    "TH",
    "TR",
    "GB",
    "US",
    "JP",
    "FR",
  ]);
  assert.deepEqual([...HOME_COMPARISON_COLUMNS], [
    "MAP eSIM",
    "Typical roaming",
    "Airport SIM shop",
  ]);
  assert.ok(HOME_COMPARISON_ROWS.length >= 4);
  // B1.1: shared discovery CTA
  assert.equal(HOME_DISCOVERY_CTA_LABEL, "Get eSIM");
  assert.equal(HOME_DISCOVERY_CTA_HREF, "/countries?filter=Popular");
  assert.equal(HOME_FINAL_CTA_PRIMARY_HREF, HOME_DISCOVERY_CTA_HREF);
  assert.equal(HOME_FINAL_CTA_PRIMARY_LABEL, HOME_DISCOVERY_CTA_LABEL);
  assert.equal(HOME_FINAL_CTA_SECONDARY_HREF, "/how-it-works");
  console.log("PASS conversion_copy");

  assert.ok(existsSync(join(root, "app/components/home/HomePopularDestinations.tsx")));
  assert.ok(existsSync(join(root, "app/components/home/HomeComparisonSection.tsx")));
  assert.ok(existsSync(join(root, "app/components/home/HomeFinalCta.tsx")));

  const home = read("app/page.tsx");
  const popular = read("app/components/home/HomePopularDestinations.tsx");
  const comparison = read("app/components/home/HomeComparisonSection.tsx");
  const cta = read("app/components/home/HomeFinalCta.tsx");
  const copy = read("app/lib/home/homeConversionSections.ts");
  const trust = read("app/components/home/HomeTrustSection.tsx");
  const navbar = read("app/components/Navbar.tsx");
  const pkg = read("package.json");
  const prelaunch = read("scripts/qa-prelaunch.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const checkout = read("app/lib/vesim/creditCheckout.ts");

  const heroIdx = home.indexOf("{/* Hero */}");
  const trustIdx = home.indexOf("<HomeTrustSection");
  const popularIdx = home.indexOf("<HomePopularDestinations");
  const comparisonIdx = home.indexOf("<HomeComparisonSection");
  const categoriesIdx = home.indexOf("{/* Categories");
  const ctaIdx = home.indexOf("<HomeFinalCta");
  assert.ok(heroIdx >= 0 && trustIdx > heroIdx);
  assert.ok(popularIdx > trustIdx);
  assert.ok(comparisonIdx > popularIdx);
  assert.ok(categoriesIdx > comparisonIdx);
  assert.ok(ctaIdx > categoriesIdx);
  console.log("PASS homepage_section_order");

  assert.match(trust, /HOME_TRUST_SECTION_INTRO/);
  assert.match(trust, /Why travelers choose MAP eSIM/);
  assert.match(popular, /aria-labelledby="home-popular-heading"/);
  assert.match(popular, /href=\{`\/countries\/\$\{destination\.id\}`\}/);
  assert.match(popular, /href="\/countries\?filter=Popular"/);
  assert.doesNotMatch(popular, /startingPrice|providerPriceUSD|priceUSD/);
  // Mobile P1: tighter spacing toward Popular without removing the section.
  assert.match(popular, /py-8 sm:px-6 sm:py-16/);
  assert.match(popular, /mt-5 grid[\s\S]*?sm:mt-8/);

  // Mobile P1: hero secondary card content compacted (primary CTA remains).
  assert.match(home, /Stay connected wherever you travel/);
  assert.match(home, /HOME_DISCOVERY_CTA_LABEL/);
  assert.match(home, /hidden space-y-2\.5[\s\S]*?sm:block/);
  assert.match(home, /hidden grid-cols-2[\s\S]*?sm:grid/);

  const listing = read("app/components/countries/CountriesListing.tsx");
  assert.match(listing, /sortPopularDestinations|popularDestinationDisplayRank/);
  assert.match(listing, /filter === "Popular"/);

  // B1.1 discovery CTA wired on hero + final + navbar + comparison
  assert.match(home, /HOME_DISCOVERY_CTA_LABEL/);
  assert.match(home, /HOME_DISCOVERY_CTA_HREF/);
  assert.doesNotMatch(home, /Browse eSIM destinations/);
  // Mobile P1: secondary hero CTA differs from primary Get eSIM → /countries.
  assert.match(home, /href="#home-popular-heading"/);
  assert.match(home, /Browse popular/);
  assert.doesNotMatch(
    home,
    /href="\/countries"\s*\n\s*className="[\s\S]*?Explore destinations/
  );
  // Mobile P1: Explore is compact; Popular stays in HomePopularDestinations.
  assert.match(home, /aria-label="Browse plan types"/);
  assert.match(home, /filter\(\(category\) => category\.title !== "Popular"\)/);
  assert.match(home, /hidden gap-5 sm:grid md:grid-cols-3/);
  assert.match(cta, /HOME_DISCOVERY_CTA_LABEL/);
  assert.match(cta, /href=\{HOME_DISCOVERY_CTA_HREF\}/);
  assert.match(cta, /href=\{HOME_FINAL_CTA_SECONDARY_HREF\}/);
  assert.match(navbar, /HOME_DISCOVERY_CTA_LABEL/);
  assert.match(navbar, /href=\{HOME_DISCOVERY_CTA_HREF\}/);
  assert.match(navbar, /Buy eSIM/);

  // B1.2 comparison: desktop table + mobile cards + no forced min-width scroll
  assert.match(comparison, /<table/);
  assert.match(comparison, /HOME_COMPARISON_ROWS/);
  assert.match(comparison, /md:hidden/);
  assert.match(comparison, /md:block/);
  assert.doesNotMatch(comparison, /min-w-\[720px\]/);
  assert.doesNotMatch(comparison, /overflow-x-auto/);
  assert.match(comparison, /HOME_DISCOVERY_CTA_LABEL/);
  assert.match(comparison, /href=\{HOME_DISCOVERY_CTA_HREF\}/);

  assert.doesNotMatch(cta, /href="\/checkout"|href="\/payment"/);
  assert.doesNotMatch(copy, /providerPriceUSD|PAYMENT_GATEWAY_ENABLED/);
  console.log("PASS section_structure");

  assert.match(pkg, /qa:home-conversion-sections/);
  assert.match(prelaunch, /qa:home-conversion-sections/);
  assert.doesNotMatch(apply, /HomePopularDestinations|HomeComparisonSection|HomeFinalCta/);
  assert.doesNotMatch(checkout, /HomePopularDestinations|HomeComparisonSection|HomeFinalCta/);
  assert.doesNotMatch(home, /PAYMENT_GATEWAY_ENABLED|applyVerifiedPaymentEvent/);
  console.log("PASS payments_checkout_untouched");

  console.log("ALL PASS qa-home-conversion-sections");
}

main();
