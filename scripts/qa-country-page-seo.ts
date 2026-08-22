/**
 * Offline QA: country page SEO content below plan listings.
 * Does not start a server, mutate payments, or change checkout/API logic.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCountrySeoContent } from "../app/lib/seo/countryPageContent";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const japan = buildCountrySeoContent({
    name: "Japan",
    kind: "country",
    path: "/countries/japan",
  });
  const france = buildCountrySeoContent({
    name: "France",
    kind: "country",
    path: "/countries/france",
  });
  const europe = buildCountrySeoContent({
    name: "Europe",
    kind: "regional",
    path: "/countries/europe",
  });

  assert.equal(japan.introTitle, "Japan eSIM");
  assert.equal(france.introTitle, "France eSIM");
  assert.notEqual(japan.intro, france.intro);
  assert.match(japan.intro, /Stay connected in Japan/);
  assert.match(france.intro, /Stay connected in France/);
  assert.match(japan.whyTitle, /Japan/);
  assert.match(france.whyTitle, /France/);
  assert.equal(japan.whyItems.length, 4);
  assert.equal(japan.steps.length, 4);
  assert.ok(japan.faqs.length >= 4);
  assert.ok(japan.faqs.every((faq) => faq.question.includes("Japan") || faq.answer.length > 20));
  assert.ok(japan.faqs.some((faq) => faq.question.includes("Japan")));
  assert.ok(france.faqs.some((faq) => faq.question.includes("France")));
  assert.equal(japan.breadcrumbs[2]?.path, "/countries/japan");
  assert.equal(france.breadcrumbs[2]?.path, "/countries/france");
  assert.match(europe.intro, /Stay connected across Europe/);
  assert.doesNotMatch(japan.intro, /Stay connected across Japan/);
  console.log("PASS dynamic_country_copy");

  assert.ok(existsSync(join(root, "app/lib/seo/countryPageContent.ts")));
  assert.ok(existsSync(join(root, "app/components/countries/CountrySeoContent.tsx")));

  const page = read("app/countries/[id]/page.tsx");
  const listing = read("app/components/plans/PlansListing.tsx");
  const section = read("app/components/countries/CountrySeoContent.tsx");
  const graph = read("app/lib/seo/siteGraph.ts");
  const pkg = read("package.json");
  const prelaunch = read("scripts/qa-prelaunch.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const checkout = read("app/lib/vesim/creditCheckout.ts");

  assert.doesNotMatch(page, /^["']use client["']/m);
  assert.match(page, /CountrySeoContent/);
  assert.match(page, /<CountrySeoContent destination=\{destination\} \/>/);
  assert.match(page, /loading=\{false\}/);
  console.log("PASS country_page_wires_seo_slot");

  assert.match(listing, /children\?: ReactNode/);
  const childrenSlot = listing.lastIndexOf("{children}");
  const modal = listing.indexOf("<PlanDetailsModal");
  assert.ok(childrenSlot > 0);
  assert.ok(modal > childrenSlot);
  assert.match(listing, /\{children\}\s*\r?\n\s*<PlanDetailsModal/);
  console.log("PASS seo_below_plan_listings");

  assert.match(section, /<Breadcrumbs/);
  assert.match(section, /country-seo-intro-heading/);
  assert.match(section, /country-seo-why-heading/);
  assert.match(section, /country-seo-steps-heading/);
  assert.match(section, /country-seo-faq-heading/);
  assert.match(section, /<details/);
  assert.match(section, /<summary/);
  assert.match(section, /faqPage\(/);
  assert.match(section, /breadcrumbList\(/);
  assert.match(section, /buildCountrySeoContent/);
  assert.doesNotMatch(section, /href="\/install\/iphone"/);
  assert.doesNotMatch(section, /href="\/install\/android"/);
  assert.doesNotMatch(section, /PAYMENT_GATEWAY_ENABLED|applyVerifiedPaymentEvent/);
  console.log("PASS seo_section_structure");

  assert.match(graph, /export function faqPage/);
  assert.match(graph, /"@type": "FAQPage"/);
  assert.match(graph, /export function breadcrumbList/);
  console.log("PASS schema_helpers");

  assert.match(pkg, /qa:country-page-seo/);
  assert.match(prelaunch, /qa:country-page-seo/);
  assert.doesNotMatch(apply, /CountrySeoContent|buildCountrySeoContent/);
  assert.doesNotMatch(checkout, /CountrySeoContent|buildCountrySeoContent/);
  console.log("PASS payments_checkout_untouched");

  console.log("ALL PASS qa-country-page-seo");
}

main();
