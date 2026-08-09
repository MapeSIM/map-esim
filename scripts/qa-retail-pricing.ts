/**
 * Offline QA for authoritative MAP eSIM retail pricing (allowance-based).
 * Does not call VeSIM, mutate DB, or place orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calculateEntryRetailPriceCents,
  calculateEntryRetailPriceUsd,
  calculateRetailPriceCents,
  calculateRetailPriceUsd,
  MARKUP_100MB_TO_500MB,
  MARKUP_1GB_TO_5GB,
  MARKUP_500MB_TO_1GB,
  MARKUP_5GB_TO_10GB,
  MARKUP_ENTRY_UNKNOWN_ALLOWANCE,
  MARKUP_OVER_10GB,
  MARKUP_UNLIMITED,
  MARKUP_UP_TO_100MB,
  markupRateForAllowance,
  roundUpToNextCent,
} from "../app/lib/pricing/retailPrice";
import {
  normalizeOffer,
  parsePublicVesimOffers,
  toPublicVesimOffer,
  toPublicVesimOffers,
} from "../app/lib/vesim/offers";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(MARKUP_UP_TO_100MB, 0.02);
  assert.equal(MARKUP_100MB_TO_500MB, 0.02);
  assert.equal(MARKUP_500MB_TO_1GB, 0.03);
  assert.equal(MARKUP_1GB_TO_5GB, 0.04);
  assert.equal(MARKUP_5GB_TO_10GB, 0.05);
  assert.equal(MARKUP_OVER_10GB, 0.06);
  assert.equal(MARKUP_UNLIMITED, 0.06);
  assert.equal(MARKUP_ENTRY_UNKNOWN_ALLOWANCE, 0.02);

  assert.equal(markupRateForAllowance({ dataMB: 100 }), 0.02);
  assert.equal(markupRateForAllowance({ dataMB: 101 }), 0.02);
  assert.equal(markupRateForAllowance({ dataMB: 500 }), 0.02);
  assert.equal(markupRateForAllowance({ dataMB: 501 }), 0.03);
  assert.equal(markupRateForAllowance({ dataGB: 1 }), 0.03);
  assert.equal(markupRateForAllowance({ dataMB: 1024 }), 0.03);
  assert.equal(markupRateForAllowance({ dataMB: 1025 }), 0.04);
  assert.equal(markupRateForAllowance({ dataGB: 5 }), 0.04);
  assert.equal(markupRateForAllowance({ dataGB: 5.1 }), 0.05);
  assert.equal(markupRateForAllowance({ dataGB: 10 }), 0.05);
  assert.equal(markupRateForAllowance({ dataGB: 10.1 }), 0.06);
  assert.equal(markupRateForAllowance({ dataUnlimited: true }), 0.06);
  console.log("PASS markup_tiers_and_boundaries");

  // Representative provider costs → ceil-to-cent retail (no .49/.99).
  assert.equal(calculateRetailPriceCents(66, { dataMB: 100 }), 68); // 2%
  assert.equal(calculateRetailPriceCents(66, { dataMB: 500 }), 68); // 2%
  assert.equal(calculateRetailPriceCents(120, { dataGB: 1 }), 124); // 3%
  assert.equal(calculateRetailPriceCents(250, { dataGB: 3 }), 260); // 4%
  assert.equal(calculateRetailPriceCents(400, { dataGB: 5 }), 416); // 4%
  assert.equal(calculateRetailPriceCents(800, { dataGB: 10 }), 840); // 5%
  assert.equal(calculateRetailPriceCents(1200, { dataGB: 20 }), 1272); // 6%
  assert.equal(
    calculateRetailPriceCents(1500, { dataUnlimited: true }),
    1590
  ); // 6%
  assert.equal(calculateRetailPriceUsd(0.66, { dataMB: 100 }), 0.68);
  assert.equal(calculateEntryRetailPriceCents(66), 68);
  assert.equal(calculateEntryRetailPriceUsd(0.66), 0.68);
  console.log("PASS sample_retail_targets");

  // Rounding: next cent only; never reduces marked-up amount.
  const cases: Array<{
    cents: number;
    allowance: Parameters<typeof calculateRetailPriceCents>[1];
  }> = [
    { cents: 1, allowance: { dataMB: 100 } },
    { cents: 66, allowance: { dataMB: 100 } },
    { cents: 66, allowance: { dataMB: 500 } },
    { cents: 99, allowance: { dataGB: 1 } },
    { cents: 250, allowance: { dataGB: 3 } },
    { cents: 999, allowance: { dataGB: 10 } },
    { cents: 1500, allowance: { dataUnlimited: true } },
    { cents: 3276, allowance: { dataGB: 20 } },
  ];
  for (const { cents, allowance } of cases) {
    const rate = markupRateForAllowance(allowance)!;
    const markedUp = roundUpToNextCent(cents * (1 + rate));
    const retail = calculateRetailPriceCents(cents, allowance)!;
    assert.equal(retail, markedUp);
    assert.ok(retail >= markedUp);
    assert.ok(retail >= cents);
  }
  assert.equal(roundUpToNextCent(67.01), 68);
  assert.equal(roundUpToNextCent(67), 67);
  console.log("PASS rounding_up_to_next_cent_never_reduces");

  const pricing = read("app/lib/pricing/retailPrice.ts");
  const offers = read("app/lib/vesim/offers.ts");
  const server = read("app/lib/vesim/server.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const actions = read("app/lib/esim/walletPurchaseActions.ts");
  const gateway = read("app/lib/esim/esimPurchaseGatewayCheckout.ts");
  const offersRoute = read("app/api/vesim/offers/route.ts");
  const offerRoute = read("app/api/vesim/offer/route.ts");
  const quoteRoute = read("app/api/vesim/quote/route.ts");
  const persist = read("app/lib/orders/persistAssignedOrder.ts");
  const destinations = read("app/lib/vesim/destinations.ts");
  const countryDetail = read("app/countries/[id]/page.tsx");
  const currencyFormat = read("app/lib/currency/format.ts");
  const pkg = read("package.json");

  assert.match(pricing, /calculateRetailPriceCents/);
  assert.match(pricing, /markupRateForAllowance/);
  assert.match(pricing, /roundUpToNextCent/);
  assert.doesNotMatch(pricing, /roundUpToRetailEndingCents/);
  assert.match(offers, /calculateRetailPriceUsd/);
  assert.match(offers, /dataUnlimited:\s*data\.dataUnlimited/);
  assert.match(offers, /providerPriceUSD/);
  assert.match(offers, /toPublicVesimOffers/);
  assert.match(server, /providerPriceUSD/);
  assert.match(server, /toPublicVerifiedCheckoutOffer/);
  assert.match(
    wallet,
    /const providerCostCents = usdPriceToCents\(offer\.providerPriceUSD\)/
  );
  assert.match(wallet, /const priceCents = usdPriceToCents\(offer\.priceUSD\)/);
  assert.match(wallet, /providerCostCents,/);
  assert.match(actions, /void formData\.get\("priceUSD"\)/);
  assert.match(actions, /verifyOfferAuthoritative|prepareWalletEsimPurchase/);
  assert.match(gateway, /priceCents/);
  assert.match(offersRoute, /toPublicVesimOffers/);
  assert.match(offerRoute, /toPublicVerifiedCheckoutOffer/);
  assert.match(quoteRoute, /toPublicVerifiedCheckoutOffer/);
  assert.match(
    persist,
    /providerAmount:\s*options\.verifiedOffer\.providerPriceUSD/
  );
  assert.match(persist, /displayAmount:\s*options\.verifiedOffer\.priceUSD/);
  assert.match(destinations, /calculateEntryRetailPriceUsd/);
  assert.match(countryDetail, /lowestPrice \?\? current\.minPrice/);
  assert.match(currencyFormat, /convertFromUsd/);
  assert.match(pkg, /"qa:retail-pricing"/);
  assert.doesNotMatch(offersRoute, /providerPriceUSD/);
  console.log("PASS catalog_checkout_wallet_gateway_public_strip_contracts");

  assert.match(actions, /Never trust browser money/);
  assert.match(actions, /void formData\.get\("price"\)/);
  console.log("PASS client_price_tampering_blocked");

  // Country UI must trust public retail JSON — never second markup pass.
  assert.match(countryDetail, /parsePublicVesimOffers/);
  assert.doesNotMatch(countryDetail, /normalizeOffers\(/);
  assert.match(offers, /parsePublicVesimOffers/);
  assert.match(
    offers,
    /priceUSD is trusted as MAP retail|trusted as MAP retail/
  );
  console.log("PASS country_public_offers_no_second_normalize");

  // provider ~$0.66 → server retail $0.68; public display must stay $0.68 (not $0.70).
  const raw100 = {
    id: "qa-100mb",
    name: "100MB QA",
    price: 0.66,
    dataMB: 100,
    durationDays: 7,
  };
  const server100 = normalizeOffer(raw100);
  assert.ok(server100);
  assert.equal(server100!.priceUSD, 0.68);
  assert.equal(server100!.providerPriceUSD, 0.66);
  const public100 = toPublicVesimOffer(server100!);
  assert.equal(public100.providerPriceUSD, undefined);
  assert.equal(public100.priceUSD, 0.68);
  const display100 = parsePublicVesimOffers({
    success: true,
    offers: toPublicVesimOffers([server100!]),
  })[0];
  assert.ok(display100);
  assert.equal(display100.priceUSD, 0.68);
  assert.notEqual(display100.priceUSD, 0.7);
  assert.equal(display100.providerPriceUSD, undefined);
  // Wallet/checkout authoritative path = single normalizeOffers on raw VeSIM.
  assert.equal(server100!.priceUSD, display100.priceUSD);
  console.log("PASS no_double_markup_100mb_display_matches_authoritative");

  // Larger package: provider $1.20 / 1GB → 3% → $1.24 (not second-marked to $1.27).
  const raw1gb = {
    id: "qa-1gb",
    name: "1GB QA",
    price: 1.2,
    dataGB: 1,
    durationDays: 30,
  };
  const server1gb = normalizeOffer(raw1gb);
  assert.ok(server1gb);
  assert.equal(server1gb!.priceUSD, 1.24);
  assert.equal(server1gb!.providerPriceUSD, 1.2);
  const display1gb = parsePublicVesimOffers({
    offers: [toPublicVesimOffer(server1gb!)],
  })[0];
  assert.ok(display1gb);
  assert.equal(display1gb.priceUSD, 1.24);
  assert.notEqual(display1gb.priceUSD, 1.27);
  assert.equal(display1gb.providerPriceUSD, undefined);
  assert.equal(server1gb!.priceUSD, display1gb.priceUSD);
  console.log("PASS no_double_markup_larger_plan_display_matches_authoritative");

  // Accidental provider leak in public JSON must be stripped by parsePublic.
  const leaked = parsePublicVesimOffers({
    offers: [
      {
        id: "leak",
        name: "Leak",
        dataFormatted: "100 MB",
        priceUSD: 0.68,
        priceFormatted: "$0.68",
        providerPriceUSD: 0.66,
      },
    ],
  })[0];
  assert.ok(leaked);
  assert.equal(leaked.priceUSD, 0.68);
  assert.equal(leaked.providerPriceUSD, undefined);
  console.log("PASS provider_price_stripped_from_public_parse");

  console.log("ALL_RETAIL_PRICING_CHECKS_PASSED");
}

main();
