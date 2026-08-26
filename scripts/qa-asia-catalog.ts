/**
 * Offline QA for temporary Asia regional retail markup overlay.
 * Does not call VeSIM, mutate orders, or rewrite snapshots.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyAsiaPublicCatalog,
  applyAsiaTemporaryRetailMarkup,
  applyAsiaTemporaryRetailMarkupUsd,
  ASIA_REGIONAL_DESTINATION_CODE,
  ASIA_TEMPORARY_RETAIL_MARKUP_PERCENT,
  isAsiaRegionalDestinationCode,
  isAsiaTemporaryRetailMarkupActive,
} from "../app/lib/plans/asiaCatalogPolicy";
import type { VesimOffer } from "../app/lib/vesim/offers";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function offer(partial: Partial<VesimOffer> & Pick<VesimOffer, "id">): VesimOffer {
  return {
    name: partial.name || partial.id,
    dataFormatted: partial.dataFormatted || "1 GB",
    priceFormatted: partial.priceFormatted || "$5.00",
    priceUSD: partial.priceUSD ?? 5,
    ...partial,
  };
}

function main() {
  assert.equal(ASIA_TEMPORARY_RETAIL_MARKUP_PERCENT, 45);
  assert.equal(ASIA_REGIONAL_DESTINATION_CODE, "region-asia");
  assert.equal(isAsiaRegionalDestinationCode("region-asia"), true);
  assert.equal(isAsiaRegionalDestinationCode("region-europe"), false);
  assert.equal(isAsiaRegionalDestinationCode("PK"), false);
  assert.equal(isAsiaTemporaryRetailMarkupActive(), true);
  assert.equal(isAsiaTemporaryRetailMarkupActive(0), false);
  console.log("PASS asia_markup_constants");

  assert.equal(applyAsiaTemporaryRetailMarkupUsd(10), 14.5);
  assert.equal(applyAsiaTemporaryRetailMarkupUsd(4.83), 7.01);
  assert.equal(applyAsiaTemporaryRetailMarkupUsd(29.99), 43.49);
  assert.equal(applyAsiaTemporaryRetailMarkupUsd(10, 0), 10);
  console.log("PASS asia_markup_formula");

  const standard = offer({
    id: "ESIM-ASIA-1GB",
    country: "region-asia",
    dataFormatted: "1 GB",
    dataGB: 1,
    durationDays: 7,
    priceUSD: 4.83,
    providerPriceUSD: 4.2,
  });
  const unlimited = offer({
    id: "ESIM-ASIA-UL-30",
    country: "region-asia",
    dataFormatted: "Unlimited",
    dataUnlimited: true,
    durationDays: 30,
    priceUSD: 29.99,
    providerPriceUSD: 24,
    currency: "USD",
  });
  const europe = offer({
    id: "ESIM-EU-1GB",
    country: "region-europe",
    dataFormatted: "1 GB",
    dataGB: 1,
    durationDays: 7,
    priceUSD: 4.83,
    providerPriceUSD: 4.2,
  });
  const pk = offer({
    id: "ESIM-PK-1GB",
    country: "PK",
    dataFormatted: "1 GB",
    dataGB: 1,
    durationDays: 7,
    priceUSD: 4.83,
    providerPriceUSD: 4.2,
  });

  const markedStandard = applyAsiaTemporaryRetailMarkup(standard, "region-asia");
  assert.equal(markedStandard.priceUSD, 7.01);
  assert.equal(markedStandard.price, 7.01);
  assert.equal(markedStandard.displayPrice, 7.01);
  assert.equal(markedStandard.priceFormatted, "$7.01");
  assert.equal(markedStandard.providerPriceUSD, 4.2);
  console.log("PASS standard_plan_markup_preserves_provider_cost");

  const markedUnlimited = applyAsiaTemporaryRetailMarkup(unlimited, "region-asia");
  assert.equal(markedUnlimited.priceUSD, 43.49);
  assert.equal(markedUnlimited.providerPriceUSD, 24);
  console.log("PASS unlimited_plan_markup");

  assert.equal(
    applyAsiaTemporaryRetailMarkup(europe, "region-europe").priceUSD,
    4.83
  );
  assert.equal(applyAsiaTemporaryRetailMarkup(pk, "PK").priceUSD, 4.83);
  console.log("PASS non_asia_destinations_unchanged");

  const catalog = applyAsiaPublicCatalog("region-asia", [standard, unlimited]);
  assert.equal(catalog.length, 2);
  assert.equal(catalog[0].priceUSD, 7.01);
  assert.equal(catalog[1].priceUSD, 43.49);
  assert.equal(
    applyAsiaPublicCatalog("region-europe", [europe])[0].priceUSD,
    4.83
  );
  console.log("PASS asia_public_catalog_all_plans");

  const checkoutStandard = applyAsiaTemporaryRetailMarkup(standard, "region-asia");
  const checkoutCatalog = applyAsiaPublicCatalog("region-asia", [standard])[0];
  assert.equal(checkoutStandard.priceUSD, checkoutCatalog.priceUSD);
  console.log("PASS catalog_checkout_price_parity");

  const policy = read("app/lib/plans/asiaCatalogPolicy.ts");
  const server = read("app/lib/vesim/server.ts");
  const partnerCatalog = read("app/lib/partner/partnerCatalogRead.ts");
  const partnerPurchase = read("app/lib/partner/partnerEsimPurchase.ts");
  const retailPricing = read("app/lib/pricing/retailPrice.ts");
  const pkg = read("package.json");

  assert.match(policy, /ASIA_TEMPORARY_RETAIL_MARKUP_PERCENT = 45/);
  assert.match(policy, /Does not mutate provider cost/);
  assert.match(server, /applyAsiaPublicCatalog/);
  assert.match(server, /applyAsiaTemporaryRetailMarkup/);
  assert.match(server, /applyAsiaTemporaryMarkup/);
  assert.match(
    server,
    /export async function verifyOfferAuthoritative[\s\S]*fetchOffersForCountry\(/
  );
  assert.doesNotMatch(
    server,
    /verifyOfferAuthoritative[\s\S]*fetchPublicOffersForCountry/
  );
  const liveFetch = server.match(
    /export async function fetchOffersForCountry\([\s\S]*?\nexport async function fetchStrictPublicOffersLive/
  )?.[0];
  assert.ok(liveFetch);
  assert.doesNotMatch(liveFetch, /applyAsiaPublicCatalog/);
  assert.match(partnerCatalog, /applyAsiaTemporaryMarkup:\s*false/);
  assert.match(partnerPurchase, /applyAsiaTemporaryMarkup:\s*false/);
  assert.doesNotMatch(retailPricing, /asiaCatalogPolicy|ASIA_TEMPORARY/);
  assert.match(pkg, /"qa:asia-catalog"/);
  console.log("PASS wiring_customer_only_partner_excluded");

  console.log("ALL_QA_PASSED=asia-catalog");
}

main();
