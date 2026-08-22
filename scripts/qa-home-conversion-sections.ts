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
  HOME_FINAL_CTA_PRIMARY_HREF,
  HOME_FINAL_CTA_SECONDARY_HREF,
  HOME_POPULAR_DESTINATIONS,
} from "../app/lib/home/homeConversionSections";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(HOME_POPULAR_DESTINATIONS.length >= 6);
  assert.ok(HOME_POPULAR_DESTINATIONS.some((item) => item.id === "pakistan"));
  assert.ok(HOME_POPULAR_DESTINATIONS.some((item) => item.id === "france"));
  assert.deepEqual([...HOME_COMPARISON_COLUMNS], [
    "MAP eSIM",
    "Typical roaming",
    "Airport SIM shop",
  ]);
  assert.ok(HOME_COMPARISON_ROWS.length >= 4);
  assert.equal(HOME_FINAL_CTA_PRIMARY_HREF, "/countries");
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
  const pkg = read("package.json");
  const prelaunch = read("scripts/qa-prelaunch.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const checkout = read("app/lib/vesim/creditCheckout.ts");

  const heroIdx = home.indexOf("{/* Hero */}");
  const trustIdx = home.indexOf("<HomeTrustSection");
  const popularIdx = home.indexOf("<HomePopularDestinations");
  const comparisonIdx = home.indexOf("<HomeComparisonSection");
  const categoriesIdx = home.indexOf("{/* Categories */}");
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
  assert.match(comparison, /<table/);
  assert.match(comparison, /HOME_COMPARISON_ROWS/);
  assert.match(cta, /HOME_FINAL_CTA_PRIMARY_LABEL/);
  assert.match(cta, /href=\{HOME_FINAL_CTA_PRIMARY_HREF\}/);
  assert.match(cta, /href=\{HOME_FINAL_CTA_SECONDARY_HREF\}/);
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
