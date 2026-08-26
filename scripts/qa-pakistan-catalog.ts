/**
 * Offline QA for Pakistan eSIM catalog merchandising.
 * Does not call VeSIM, mutate orders, or rewrite snapshots.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyPakistanPublicCatalog,
  applyPakistanRetailOverride,
  isHiddenPakistanCatalogOffer,
  isPakistanDestinationCode,
  PAKISTAN_UNLIMITED_30_RETAIL_CENTS,
  PAKISTAN_UNLIMITED_30_RETAIL_USD,
} from "../app/lib/plans/pakistanCatalogPolicy";
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
  assert.equal(PAKISTAN_UNLIMITED_30_RETAIL_CENTS, 2999);
  assert.equal(PAKISTAN_UNLIMITED_30_RETAIL_USD, 29.99);
  assert.equal(isPakistanDestinationCode("PK"), true);
  assert.equal(isPakistanDestinationCode("pakistan"), true);
  assert.equal(isPakistanDestinationCode("AE"), false);
  console.log("PASS pakistan_retail_constants");

  const gb1 = offer({
    id: "ESIM-PK-1GB",
    country: "PK",
    dataFormatted: "1 GB",
    dataGB: 1,
    durationDays: 7,
    priceUSD: 4.83,
    providerPriceUSD: 4.2,
  });
  const gb20 = offer({
    id: "ESIM-PK-20GB",
    country: "PK",
    dataFormatted: "20 GB",
    dataGB: 20,
    durationDays: 30,
    priceUSD: 18.5,
    providerPriceUSD: 16,
  });
  const gb50 = offer({
    id: "ESIM-PK-50GB",
    country: "PK",
    dataFormatted: "50 GB",
    dataGB: 50,
    durationDays: 30,
    priceUSD: 22,
    providerPriceUSD: 19,
  });
  const unlimited10 = offer({
    id: "ESIM-PK-UL-10",
    country: "PK",
    dataFormatted: "Unlimited",
    dataUnlimited: true,
    durationDays: 10,
    priceUSD: 12,
    providerPriceUSD: 10,
  });
  const unlimited30 = offer({
    id: "ESIM-PK-UL-30",
    country: "PK",
    countryName: "Pakistan",
    dataFormatted: "Unlimited",
    dataUnlimited: true,
    durationDays: 30,
    priceUSD: 41.4,
    providerPriceUSD: 36,
    currency: "USD",
  });
  const unlimited7 = offer({
    id: "ESIM-PK-UL-7",
    country: "PK",
    dataFormatted: "Unlimited",
    dataUnlimited: true,
    durationDays: 7,
    priceUSD: 9,
    providerPriceUSD: 7.5,
  });
  const ae50 = offer({
    id: "ESIM-AE-50GB",
    country: "AE",
    dataFormatted: "50 GB",
    dataGB: 50,
    durationDays: 30,
    priceUSD: 25,
    providerPriceUSD: 21,
  });
  const aeUnlimited10 = offer({
    id: "ESIM-AE-UL-10",
    country: "AE",
    dataFormatted: "Unlimited",
    dataUnlimited: true,
    durationDays: 10,
    priceUSD: 14,
    providerPriceUSD: 12,
  });
  const aeUnlimited30 = offer({
    id: "ESIM-AE-UL-30",
    country: "AE",
    dataFormatted: "Unlimited",
    dataUnlimited: true,
    durationDays: 30,
    priceUSD: 40,
    providerPriceUSD: 34,
  });

  assert.equal(isHiddenPakistanCatalogOffer(gb50), true);
  assert.equal(isHiddenPakistanCatalogOffer(unlimited10), true);
  assert.equal(isHiddenPakistanCatalogOffer(gb1), false);
  assert.equal(isHiddenPakistanCatalogOffer(gb20), false);
  assert.equal(isHiddenPakistanCatalogOffer(unlimited30), false);
  assert.equal(isHiddenPakistanCatalogOffer(unlimited7), false);
  console.log("PASS hide_50gb_and_unlimited_10_day");

  const pkCatalog = applyPakistanPublicCatalog("PK", [
    gb1,
    gb20,
    gb50,
    unlimited10,
    unlimited30,
    unlimited7,
  ]);
  const pkIds = pkCatalog.map((item) => item.id);
  assert.deepEqual(pkIds, ["ESIM-PK-1GB", "ESIM-PK-20GB", "ESIM-PK-UL-30", "ESIM-PK-UL-7"]);
  const pinned = pkCatalog.find((item) => item.id === "ESIM-PK-UL-30");
  assert.ok(pinned);
  assert.equal(pinned!.priceUSD, 29.99);
  assert.equal(pinned!.price, 29.99);
  assert.equal(pinned!.displayPrice, 29.99);
  assert.equal(pinned!.priceFormatted, "$29.99");
  assert.equal(pinned!.providerPriceUSD, 36);
  assert.equal(pinned!.durationDays, 30);
  assert.equal(pinned!.dataFormatted, "Unlimited");

  const kept1 = pkCatalog.find((item) => item.id === "ESIM-PK-1GB");
  assert.equal(kept1!.priceUSD, 4.83);
  const kept20 = pkCatalog.find((item) => item.id === "ESIM-PK-20GB");
  assert.equal(kept20!.priceUSD, 18.5);
  const kept7 = pkCatalog.find((item) => item.id === "ESIM-PK-UL-7");
  assert.equal(kept7!.priceUSD, 9);
  console.log("PASS pk_catalog_hide_and_unlimited_30_price");

  const aeCatalog = applyPakistanPublicCatalog("AE", [
    ae50,
    aeUnlimited10,
    aeUnlimited30,
  ]);
  assert.equal(aeCatalog.length, 3);
  assert.equal(aeCatalog[0].priceUSD, 25);
  assert.equal(aeCatalog[1].durationDays, 10);
  assert.equal(aeCatalog[2].priceUSD, 40);
  console.log("PASS other_destinations_unchanged");

  const checkout = applyPakistanRetailOverride(unlimited30, "PK");
  assert.equal(checkout.priceUSD, 29.99);
  assert.equal(checkout.providerPriceUSD, 36);
  const stillVisible = applyPakistanRetailOverride(gb50, "PK");
  assert.equal(stillVisible.id, "ESIM-PK-50GB");
  assert.equal(stillVisible.priceUSD, 22);
  console.log("PASS checkout_override_does_not_drop_hidden_offers");

  const policy = read("app/lib/plans/pakistanCatalogPolicy.ts");
  const server = read("app/lib/vesim/server.ts");
  const publicApi = read("app/api/vesim/offers/route.ts");
  const partner = read("app/lib/partner/partnerCatalogRead.ts");
  const persist = read("app/lib/orders/persistAssignedOrder.ts");
  const applyPayment = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const pkg = read("package.json");

  assert.match(policy, /Does not mutate orders/);
  assert.match(server, /applyPakistanPublicCatalog/);
  assert.match(server, /applyPakistanRetailOverride/);
  assert.match(server, /fetchPublicOffersForCountry/);
  assert.match(
    server,
    /return applyAsiaPublicCatalog\(\s*key,\s*applyPakistanPublicCatalog\(key, offers\)\s*\)/
  );
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
  assert.doesNotMatch(liveFetch, /applyPakistanPublicCatalog/);
  assert.match(publicApi, /fetchPublicOffersForCountry/);
  assert.match(partner, /applyPakistanPublicCatalog/);
  assert.doesNotMatch(persist, /pakistanCatalogPolicy|applyPakistanPublicCatalog/);
  assert.doesNotMatch(applyPayment, /pakistanCatalogPolicy|applyPakistanPublicCatalog/);
  assert.match(pkg, /"qa:pakistan-catalog"/);
  console.log("PASS wiring_listing_only_hide_orders_untouched");

  console.log("ALL_QA_PASSED=pakistan-catalog");
}

main();
