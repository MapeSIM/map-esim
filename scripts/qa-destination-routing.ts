/**
 * Offline QA: PR vs USPR destination routing stays distinct.
 * Does not call VeSIM, invent offers, merge destinations, or touch checkout.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  destinationPath,
  destinationRouteId,
  destinationSlug,
  findDestinationBySlug,
  isIso2CountryCode,
  normalizeDestination,
  slugifyDestination,
  type VesimDestination,
} from "../app/lib/vesim/destinations";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function asDestination(raw: {
  code: string;
  name: string;
}): VesimDestination {
  const normalized = normalizeDestination(raw);
  assert.ok(normalized, `expected normalizeDestination(${raw.code})`);
  return normalized;
}

function main() {
  const destinationsSrc = read("app/lib/vesim/destinations.ts");
  const listing = read("app/components/countries/CountriesListing.tsx");
  const countryPage = read("app/countries/[id]/page.tsx");

  console.log("1) Non-ISO provider codes get distinct route identity");
  assert.equal(isIso2CountryCode("PR"), true);
  assert.equal(isIso2CountryCode("USPR"), false);
  assert.equal(
    destinationSlug({ code: "PR", name: "Puerto Rico" }),
    "puerto-rico"
  );
  assert.equal(
    destinationSlug({ code: "USPR", name: "Puerto Rico" }),
    "uspr"
  );
  assert.equal(slugifyDestination("Puerto Rico"), "puerto-rico");
  console.log("   ok");

  console.log("2) PR keeps SEO path; USPR uses provider code path");
  const pr = asDestination({ code: "PR", name: "Puerto Rico" });
  const uspr = asDestination({ code: "USPR", name: "Puerto Rico" });
  assert.equal(pr.slug, "puerto-rico");
  assert.equal(uspr.slug, "uspr");
  assert.equal(destinationRouteId(pr), "puerto-rico");
  assert.equal(destinationRouteId(uspr), "uspr");
  assert.equal(destinationPath(pr), "/countries/puerto-rico");
  assert.equal(destinationPath(uspr), "/countries/uspr");
  assert.notEqual(destinationPath(pr), destinationPath(uspr));
  // Stale shared slug must still not steal the SEO URL for USPR.
  assert.equal(
    destinationPath({
      code: "USPR",
      name: "Puerto Rico",
      slug: "puerto-rico",
      kind: "country",
    }),
    "/countries/uspr"
  );
  console.log("   ok");

  console.log("3) Resolver prefers provider code; puerto-rico stays PR");
  // Put USPR first to catch order-sensitive regressions.
  const catalog = [uspr, pr];
  assert.equal(findDestinationBySlug(catalog, "puerto-rico")?.code, "PR");
  assert.equal(findDestinationBySlug(catalog, "uspr")?.code, "USPR");
  assert.equal(findDestinationBySlug(catalog, "USPR")?.code, "USPR");
  assert.equal(findDestinationBySlug(catalog, "pr")?.code, "PR");
  assert.equal(findDestinationBySlug(catalog, "PR")?.code, "PR");
  console.log("   ok");

  console.log("4) Country page still loads offers by matched provider code");
  assert.match(countryPage, /findDestinationBySlug\(destinations,\s*id\)/);
  assert.match(countryPage, /loadPublicOffers\(matched\.code/);
  assert.match(listing, /destinationRouteId/);
  assert.match(destinationsSrc, /isIso2CountryCode/);
  assert.match(destinationsSrc, /destinationRouteId/);
  assert.doesNotMatch(destinationsSrc, /mergeDestinations|dedupeDestinations/);
  console.log("   ok");

  console.log("PASS destination_routing_qa");
}

main();
