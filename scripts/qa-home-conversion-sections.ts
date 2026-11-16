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
  assert.equal(HOME_DISCOVERY_CTA_LABEL, "Get eSIM");
  assert.equal(HOME_DISCOVERY_CTA_HREF, "/countries?filter=Popular");
  assert.equal(HOME_FINAL_CTA_PRIMARY_HREF, HOME_DISCOVERY_CTA_HREF);
  assert.equal(HOME_FINAL_CTA_PRIMARY_LABEL, HOME_DISCOVERY_CTA_LABEL);
  assert.equal(HOME_FINAL_CTA_SECONDARY_HREF, "/how-it-works");
  console.log("PASS conversion_copy");

  assert.ok(
    existsSync(join(root, "app/components/home/HomePopularDestinations.tsx"))
  );
  assert.ok(
    existsSync(join(root, "app/components/home/HomeComparisonSection.tsx"))
  );
  assert.ok(existsSync(join(root, "app/components/home/HomeFinalCta.tsx")));

  const home = read("app/page.tsx");
  const popular = read("app/components/home/HomePopularDestinations.tsx");
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
  const usageIdx = home.indexOf("<DeferredHomeEsimUsageWidget");
  const howIdx = home.indexOf("{/* How it works */}");
  const faqIdx = home.indexOf('id="faq"');
  const ctaIdx = home.indexOf("<HomeFinalCta");
  assert.ok(heroIdx >= 0 && trustIdx > heroIdx);
  assert.ok(popularIdx > trustIdx);
  assert.ok(usageIdx > popularIdx);
  assert.ok(howIdx > usageIdx);
  assert.ok(faqIdx > howIdx);
  assert.ok(ctaIdx > faqIdx);
  // Trimmed: no announcement, comparison, explore categories, or tall devices block.
  assert.doesNotMatch(home, /Instant digital delivery/);
  assert.doesNotMatch(home, /HomeComparisonSection/);
  assert.doesNotMatch(home, /Browse plan types|Categories/);
  assert.doesNotMatch(home, /Compatible devices/);
  console.log("PASS homepage_section_order");

  assert.match(trust, /Why travelers choose MAP eSIM/);
  assert.match(popular, /aria-labelledby="home-popular-heading"/);
  assert.match(popular, /href=\{`\/countries\/\$\{destination\.id\}`\}/);
  assert.match(popular, /href="\/countries\?filter=Popular"/);
  assert.doesNotMatch(popular, /startingPrice|providerPriceUSD|priceUSD/);
  assert.match(popular, /py-8 sm:px-6 sm:py-16/);
  // Mobile: top-6 2-col grid + View all destinations CTA.
  assert.match(popular, /MOBILE_TOP_COUNT|slice\(0,\s*MOBILE_TOP_COUNT\)|slice\(0,\s*6\)/);
  assert.match(popular, /grid-cols-2[\s\S]*?sm:hidden/);
  assert.match(popular, /View all destinations/);
  assert.match(popular, /hidden[\s\S]*?sm:grid[\s\S]*?lg:grid-cols-4/);

  assert.match(home, /Stay connected wherever you travel/);
  assert.match(home, /HOME_DISCOVERY_CTA_LABEL/);
  // Hero secondary card is lean (no bullet list / mini feature grid).
  assert.doesNotMatch(home, /hidden space-y-2\.5[\s\S]*?sm:block/);
  assert.doesNotMatch(home, /hidden grid-cols-2[\s\S]*?sm:grid/);
  assert.match(home, /Your travel internet, ready before takeoff/);

  const listing = [
    read("app/components/countries/CountriesListing.tsx"),
    read("app/components/countries/CountriesListingClient.tsx"),
    read("app/lib/vesim/countriesListingModel.ts"),
  ].join("\n");
  assert.match(listing, /sortPopularDestinations|popularDestinationDisplayRank/);
  assert.match(listing, /filter === "Popular"/);

  assert.match(home, /HOME_DISCOVERY_CTA_LABEL/);
  assert.match(home, /HOME_DISCOVERY_CTA_HREF/);
  assert.doesNotMatch(home, /Browse eSIM destinations/);
  assert.match(home, /href="#home-popular-heading"/);
  assert.match(home, /Browse popular/);
  assert.match(
    home,
    /DeferredEsimCompatibilityInlineTrigger|EsimCompatibilityInlineTrigger/
  );
  assert.match(home, /Check eSIM compatibility \(\?\)/);
  assert.match(home, /FaqAccordion/);
  assert.match(cta, /HOME_DISCOVERY_CTA_LABEL/);
  assert.match(cta, /href=\{HOME_DISCOVERY_CTA_HREF\}/);
  assert.match(cta, /href=\{HOME_FINAL_CTA_SECONDARY_HREF\}/);
  assert.match(navbar, /HOME_DISCOVERY_CTA_LABEL/);
  assert.match(navbar, /href=\{HOME_DISCOVERY_CTA_HREF\}/);
  assert.match(navbar, /Buy eSIM/);

  assert.doesNotMatch(cta, /href="\/checkout"|href="\/payment"/);
  assert.doesNotMatch(copy, /providerPriceUSD|PAYMENT_GATEWAY_ENABLED/);
  console.log("PASS section_structure");

  assert.match(pkg, /qa:home-conversion-sections/);
  assert.match(prelaunch, /qa:home-conversion-sections/);
  assert.doesNotMatch(
    apply,
    /HomePopularDestinations|HomeComparisonSection|HomeFinalCta/
  );
  assert.doesNotMatch(
    checkout,
    /HomePopularDestinations|HomeComparisonSection|HomeFinalCta/
  );
  assert.doesNotMatch(home, /PAYMENT_GATEWAY_ENABLED|applyVerifiedPaymentEvent/);
  console.log("PASS payments_checkout_untouched");

  console.log("ALL PASS qa-home-conversion-sections");
}

main();
