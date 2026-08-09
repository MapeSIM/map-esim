/**
 * Offline + live-safe QA for country → regional plan recommendations.
 * Run: npx tsx scripts/qa-country-regional-recommendation.ts
 */
import assert from "node:assert/strict";
import {
  regionalCodeForCountryIso,
} from "../app/lib/vesim/countryRegionalMap";
import {
  destinationPath,
  findRelatedRegionalDestination,
  type VesimDestination,
} from "../app/lib/vesim/destinations";

function country(
  code: string,
  name: string,
  regions: string[] = []
): VesimDestination {
  return {
    code,
    name,
    regions,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    kind: "country",
  };
}

function regional(code: string, name: string): VesimDestination {
  return {
    code,
    name,
    regions: [name],
    isRegional: true,
    slug: code,
    kind: "regional",
  };
}

const catalog: VesimDestination[] = [
  country("PK", "Pakistan"),
  country("FR", "France"),
  country("US", "United States"),
  country("AU", "Australia"),
  country("BR", "Brazil"), // no South America regional in VeSIM
  regional("region-asia", "Asia"),
  regional("region-western-europe", "Western Europe"),
  regional("region-eastern-europe", "Eastern Europe"),
  regional("region-north-america", "North America"),
  regional("region-oceania", "Oceania"),
  regional("region-africa", "Africa"),
  regional("region-regional", "Regional"),
  {
    code: "global",
    name: "Global",
    slug: "global",
    kind: "global",
    isGlobal: true,
  },
];

function main() {
  assert.equal(regionalCodeForCountryIso("PK"), "region-asia");
  assert.equal(regionalCodeForCountryIso("FR"), "region-western-europe");
  assert.equal(regionalCodeForCountryIso("US"), "region-north-america");
  assert.equal(regionalCodeForCountryIso("AU"), "region-oceania");

  const pk = findRelatedRegionalDestination(catalog[0], catalog);
  assert.equal(pk?.code, "region-asia");
  assert.equal(destinationPath(pk!), "/countries/region-asia");

  const fr = findRelatedRegionalDestination(catalog[1], catalog);
  assert.equal(fr?.code, "region-western-europe");
  assert.equal(destinationPath(fr!), "/countries/region-western-europe");

  const us = findRelatedRegionalDestination(catalog[2], catalog);
  assert.equal(us?.code, "region-north-america");
  assert.equal(destinationPath(us!), "/countries/region-north-america");

  const au = findRelatedRegionalDestination(catalog[3], catalog);
  assert.equal(au?.code, "region-oceania");
  assert.equal(destinationPath(au!), "/countries/region-oceania");

  // No invented region when mapping unavailable / catalog missing.
  assert.equal(
    findRelatedRegionalDestination(catalog[4], catalog),
    undefined
  );

  // Metadata still wins when present.
  const withMeta = country("GG", "Guernsey", ["Western Europe"]);
  assert.equal(
    findRelatedRegionalDestination(withMeta, catalog)?.code,
    "region-western-europe"
  );

  // Never recommend on regional/global kinds.
  assert.equal(
    findRelatedRegionalDestination(catalog[5], catalog),
    undefined
  );
  assert.equal(
    findRelatedRegionalDestination(catalog[catalog.length - 1], catalog),
    undefined
  );

  // Generic region-regional is never recommended via ISO fallback.
  assert.notEqual(regionalCodeForCountryIso("PK"), "region-regional");

  console.log("PASS pakistan_asia");
  console.log("PASS france_western_europe");
  console.log("PASS usa_north_america");
  console.log("PASS australia_oceania");
  console.log("PASS no_invented_region");
  console.log("PASS metadata_preferred");
  console.log("PASS no_regional_global_self");
  console.log("ALL_QA_PASSED=country-regional-recommendation");
}

main();
