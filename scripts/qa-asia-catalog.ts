/**
 * Offline QA for Asia regional retail overlay.
 * Temporary % markup and the 500 MB / 3 Days pin stay disabled.
 * Only Region Asia / Asialink / 1 GB / 7 Days is pinned to Rs 849.
 * Does not call VeSIM, mutate orders, or rewrite snapshots.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { usdCentsToCatalogAmount } from "../app/lib/currency/checkoutMoney";
import { FALLBACK_USD_RATES } from "../app/lib/currency/currencies";
import { formatMoney } from "../app/lib/currency/format";
import {
  applyAsiaCustomerRetailPrice,
  applyAsiaPublicCatalog,
  applyAsiaRetailOverride,
  applyAsiaTemporaryRetailMarkup,
  applyAsiaTemporaryRetailMarkupUsd,
  ASIA_1GB_7DAY_RETAIL_USD,
  ASIA_500MB_3DAY_RETAIL_CENTS,
  ASIA_500MB_3DAY_RETAIL_USD,
  ASIA_REGIONAL_DESTINATION_CODE,
  ASIA_TEMPORARY_RETAIL_MARKUP_PERCENT,
  isAsia1Gb7DayAsialinkPackage,
  isAsia500Mb3DayPackage,
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
  assert.equal(ASIA_TEMPORARY_RETAIL_MARKUP_PERCENT, 0);
  assert.equal(ASIA_REGIONAL_DESTINATION_CODE, "region-asia");
  assert.equal(isAsiaRegionalDestinationCode("region-asia"), true);
  assert.equal(isAsiaRegionalDestinationCode("region-europe"), false);
  assert.equal(isAsiaRegionalDestinationCode("PK"), false);
  assert.equal(isAsiaTemporaryRetailMarkupActive(), false);
  assert.equal(isAsiaTemporaryRetailMarkupActive(0), false);
  assert.equal(ASIA_500MB_3DAY_RETAIL_CENTS, 341);
  assert.equal(ASIA_500MB_3DAY_RETAIL_USD, 3.41);
  assert.equal(ASIA_1GB_7DAY_RETAIL_USD, 849 / 293);
  assert.equal(FALLBACK_USD_RATES.PKR, 293);
  assert.equal(formatMoney(2.66, "PKR"), "Rs 779");
  assert.equal(formatMoney(ASIA_1GB_7DAY_RETAIL_USD, "PKR"), "Rs 849");
  console.log("PASS asia_markup_constants");

  assert.equal(applyAsiaTemporaryRetailMarkupUsd(10), 10);
  assert.equal(applyAsiaTemporaryRetailMarkupUsd(4.83), 4.83);
  assert.equal(applyAsiaTemporaryRetailMarkupUsd(29.99), 29.99);
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
  assert.equal(markedStandard.priceUSD, 4.83);
  assert.equal(markedStandard.providerPriceUSD, 4.2);
  console.log("PASS standard_plan_markup_preserves_provider_cost");

  const markedUnlimited = applyAsiaTemporaryRetailMarkup(unlimited, "region-asia");
  assert.equal(markedUnlimited.priceUSD, 29.99);
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
  assert.equal(catalog[0].priceUSD, 4.83);
  assert.equal(catalog[1].priceUSD, 29.99);
  assert.equal(
    applyAsiaPublicCatalog("region-europe", [europe])[0].priceUSD,
    4.83
  );
  console.log("PASS asia_public_catalog_all_plans");

  const checkoutStandard = applyAsiaCustomerRetailPrice(standard, "region-asia");
  const checkoutCatalog = applyAsiaPublicCatalog("region-asia", [standard])[0];
  assert.equal(checkoutStandard.priceUSD, checkoutCatalog.priceUSD);
  console.log("PASS catalog_checkout_price_parity");

  const asia500 = offer({
    id: "asialink-in-3days-500mb",
    offerId: "asialink-in-3days-500mb",
    country: "region-asia",
    name: "500 MB - 3 days",
    dataFormatted: "500 MB",
    dataMB: 500,
    durationDays: 3,
    priceUSD: 2.7,
    providerPriceUSD: 1.8,
  });
  const asia1gb7d = offer({
    id: "asialink-7-days-1gb",
    offerId: "asialink-7-days-1gb",
    country: "region-asia",
    name: "1 GB - 7 days",
    network: "Asialink",
    dataFormatted: "1 GB",
    dataGB: 1,
    durationDays: 7,
    priceUSD: 2.66,
    providerPriceUSD: 1.9,
  });
  const asia502mb1d = offer({
    id: "SEA-0.49GB",
    country: "region-asia",
    name: "SEA 0.49GB",
    dataFormatted: "502 MB",
    dataMB: 502,
    durationDays: 1,
    priceUSD: 1.62,
    providerPriceUSD: 1.1,
  });
  const asiaUnlimited3d = offer({
    id: "asialink-3days-unlimited",
    country: "region-asia",
    name: "Unlimited - 3 days",
    dataFormatted: "Unlimited",
    dataUnlimited: true,
    durationDays: 3,
    priceUSD: 6.6,
    providerPriceUSD: 5,
  });
  const pk500 = offer({
    id: "ESIM-PK-500MB-3D",
    country: "PK",
    dataFormatted: "500 MB",
    dataMB: 500,
    durationDays: 3,
    priceUSD: 2.7,
    providerPriceUSD: 1.8,
  });

  assert.equal(isAsia500Mb3DayPackage(asia500), true);
  assert.equal(isAsia500Mb3DayPackage(asia1gb7d), false);
  assert.equal(isAsia500Mb3DayPackage(asia502mb1d), false);
  assert.equal(isAsia500Mb3DayPackage(asiaUnlimited3d), false);
  assert.equal(isAsia1Gb7DayAsialinkPackage(asia1gb7d), true);
  assert.equal(isAsia1Gb7DayAsialinkPackage(standard), false);
  assert.equal(isAsia1Gb7DayAsialinkPackage(asia500), false);
  assert.equal(isAsia1Gb7DayAsialinkPackage(asiaUnlimited3d), false);
  assert.equal(isAsia1Gb7DayAsialinkPackage(europe), false);

  const marked500 = applyAsiaCustomerRetailPrice(asia500, "region-asia");
  assert.equal(marked500.priceUSD, 2.7);
  assert.equal(marked500.providerPriceUSD, 1.8);
  assert.equal(asia500.priceUSD, 2.7);
  assert.equal(asia500.providerPriceUSD, 1.8);
  assert.equal(
    applyAsiaCustomerRetailPrice(
      { ...asia500, priceUSD: 3.92, price: 3.92, displayPrice: 3.92 },
      "region-asia"
    ).priceUSD,
    3.92
  );
  assert.equal(formatMoney(3.92, "PKR"), "Rs 1,149");
  assert.equal(formatMoney(ASIA_500MB_3DAY_RETAIL_USD, "PKR"), "Rs 999");
  assert.equal(
    formatMoney(usdCentsToCatalogAmount(ASIA_500MB_3DAY_RETAIL_CENTS), "PKR"),
    "Rs 999"
  );
  console.log("PASS asia_500mb_3d_uses_default_map_retail");

  const pinned1gb7d = applyAsiaCustomerRetailPrice(asia1gb7d, "region-asia");
  assert.equal(pinned1gb7d.priceUSD, ASIA_1GB_7DAY_RETAIL_USD);
  assert.equal(pinned1gb7d.price, ASIA_1GB_7DAY_RETAIL_USD);
  assert.equal(pinned1gb7d.displayPrice, ASIA_1GB_7DAY_RETAIL_USD);
  assert.equal(pinned1gb7d.providerPriceUSD, 1.9);
  assert.equal(asia1gb7d.priceUSD, 2.66);
  assert.equal(asia1gb7d.providerPriceUSD, 1.9);
  assert.equal(formatMoney(pinned1gb7d.priceUSD, "PKR"), "Rs 849");
  assert.equal(
    applyAsiaRetailOverride(asia1gb7d, "region-asia").priceUSD,
    pinned1gb7d.priceUSD
  );
  assert.equal(
    applyAsiaPublicCatalog("region-asia", [asia1gb7d])[0].priceUSD,
    pinned1gb7d.priceUSD
  );
  console.log("PASS asia_1gb_7d_asialink_pinned_rs849");

  const catalogMix = applyAsiaPublicCatalog("region-asia", [
    asia500,
    asia1gb7d,
    asia502mb1d,
    asiaUnlimited3d,
    standard,
  ]);
  assert.equal(catalogMix[0].priceUSD, 2.7);
  assert.equal(catalogMix[0].providerPriceUSD, 1.8);
  assert.equal(catalogMix[1].priceUSD, ASIA_1GB_7DAY_RETAIL_USD);
  assert.equal(catalogMix[1].providerPriceUSD, 1.9);
  assert.equal(formatMoney(catalogMix[1].priceUSD, "PKR"), "Rs 849");
  assert.equal(catalogMix[2].priceUSD, 1.62);
  assert.equal(catalogMix[3].priceUSD, 6.6);
  assert.equal(catalogMix[4].priceUSD, 4.83);
  assert.equal(
    applyAsiaCustomerRetailPrice(asia500, "region-asia").priceUSD,
    catalogMix[0].priceUSD
  );
  assert.equal(
    applyAsiaRetailOverride(asia500, "region-asia").priceUSD,
    catalogMix[0].priceUSD
  );
  assert.equal(
    applyAsiaCustomerRetailPrice(asia1gb7d, "region-asia").priceUSD,
    catalogMix[1].priceUSD
  );
  console.log("PASS asia_catalog_other_plans_unchanged");

  assert.equal(applyAsiaRetailOverride(pk500, "PK").priceUSD, 2.7);
  assert.equal(applyAsiaCustomerRetailPrice(pk500, "PK").priceUSD, 2.7);
  assert.equal(
    applyAsiaPublicCatalog("PK", [pk500])[0].priceUSD,
    2.7
  );
  console.log("PASS pakistan_and_non_asia_500mb_unchanged");

  const policy = read("app/lib/plans/asiaCatalogPolicy.ts");
  const server = read("app/lib/vesim/server.ts");
  const partnerCatalog = read("app/lib/partner/partnerCatalogRead.ts");
  const partnerPurchase = read("app/lib/partner/partnerEsimPurchase.ts");
  const retailPricing = read("app/lib/pricing/retailPrice.ts");
  const pkg = read("package.json");

  assert.match(policy, /ASIA_TEMPORARY_RETAIL_MARKUP_PERCENT = 0/);
  assert.match(policy, /ASIA_500MB_3DAY_RETAIL_CENTS = 341/);
  assert.match(policy, /ASIA_1GB_7DAY_RETAIL_USD = 849 \/ 293/);
  assert.match(policy, /Does not mutate provider cost/);
  assert.match(server, /applyAsiaPublicCatalog/);
  assert.match(server, /applyAsiaCustomerRetailPrice/);
  assert.match(server, /applyAsiaTemporaryMarkup/);
  assert.doesNotMatch(server, /ASIA_500MB_3DAY_RETAIL_CENTS\s*=/);
  assert.match(
    server,
    /export async function verifyOfferAuthoritative[\s\S]*fetchOffersForCountry\(/
  );
  {
    const verifyStart = server.indexOf(
      "export async function verifyOfferAuthoritative"
    );
    assert.ok(verifyStart >= 0);
    const nextExport = server.indexOf("\nexport ", verifyStart + 10);
    const verifyBody = server.slice(
      verifyStart,
      nextExport === -1 ? server.length : nextExport
    );
    assert.doesNotMatch(verifyBody, /fetchPublicOffersForCountry/);
  }
  const liveFetch = server.match(
    /export async function fetchOffersForCountry\([\s\S]*?\nexport async function fetchStrictPublicOffersLive/
  )?.[0];
  assert.ok(liveFetch);
  assert.doesNotMatch(liveFetch, /applyAsiaPublicCatalog/);
  assert.match(partnerCatalog, /applyAsiaTemporaryMarkup:\s*false/);
  assert.match(partnerCatalog, /applyAsiaCustomerOverlay:\s*false/);
  assert.match(partnerPurchase, /applyAsiaTemporaryMarkup:\s*false/);
  assert.doesNotMatch(retailPricing, /asiaCatalogPolicy|ASIA_TEMPORARY/);
  assert.match(pkg, /"qa:asia-catalog"/);
  console.log("PASS wiring_customer_only_partner_excluded");

  console.log("ALL_QA_PASSED=asia-catalog");
}

main();
