/**
 * Offline QA for authoritative MAP eSIM retail pricing (provider-cost bands).
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
  RETAIL_ADD_CENTS_067_TO_100,
  RETAIL_ADD_CENTS_101_TO_299,
  RETAIL_CENTS_FOR_PROVIDER_66,
  RETAIL_MULTIPLIER_1000_PLUS,
  RETAIL_MULTIPLIER_300_TO_999,
  roundUpToNextCent,
} from "../app/lib/pricing/retailPrice";
import {
  lowestOfferRetailUsd,
  normalizeDestination,
  normalizeDestinations,
  parsePublicDestination,
  parsePublicDestinations,
  retailMinFromProviderStartingPrice,
  withLowestOfferRetailMinPrice,
} from "../app/lib/vesim/destinations";
import {
  normalizeOffer,
  parsePublicVesimOffers,
  toPublicVesimOffer,
  toPublicVesimOffers,
} from "../app/lib/vesim/offers";
import { convertFromUsd, formatMoney } from "../app/lib/currency/format";
import { FALLBACK_USD_RATES } from "../app/lib/currency/currencies";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(RETAIL_CENTS_FOR_PROVIDER_66, 68);
  assert.equal(RETAIL_ADD_CENTS_067_TO_100, 50);
  assert.equal(RETAIL_ADD_CENTS_101_TO_299, 60);
  assert.equal(RETAIL_MULTIPLIER_300_TO_999, 1.2);
  assert.equal(RETAIL_MULTIPLIER_1000_PLUS, 1.15);
  assert.equal(FALLBACK_USD_RATES.PKR, 293);
  console.log("PASS retail_band_constants");

  // Required cost-band samples (USD).
  assert.equal(calculateRetailPriceUsd(0.5), 1.0);
  assert.equal(calculateRetailPriceUsd(0.65), 1.15);
  assert.equal(calculateRetailPriceUsd(0.66), 0.68);
  assert.equal(calculateRetailPriceUsd(0.67), 1.17);
  assert.equal(calculateRetailPriceUsd(1.0), 1.5);
  assert.equal(calculateRetailPriceUsd(1.01), 1.61);
  assert.equal(calculateRetailPriceUsd(2.0), 2.6);
  assert.equal(calculateRetailPriceUsd(2.99), 3.59);
  assert.equal(calculateRetailPriceUsd(3.0), 3.6);
  assert.equal(calculateRetailPriceUsd(5.0), 6.0);
  assert.equal(calculateRetailPriceUsd(8.0), 9.6);
  assert.equal(calculateRetailPriceUsd(9.99), 11.99); // 999×1.20 → ceil 1199¢
  assert.equal(calculateRetailPriceUsd(10.0), 11.5);
  assert.equal(calculateRetailPriceUsd(20.0), 23.0);

  assert.equal(calculateRetailPriceCents(50), 100);
  assert.equal(calculateRetailPriceCents(65), 115);
  assert.equal(calculateRetailPriceCents(66), 68);
  assert.equal(calculateRetailPriceCents(67), 117);
  assert.equal(calculateRetailPriceCents(100), 150);
  assert.equal(calculateRetailPriceCents(101), 161);
  assert.equal(calculateRetailPriceCents(299), 359);
  assert.equal(calculateRetailPriceCents(300), 360);
  assert.equal(calculateRetailPriceCents(999), 1199);
  assert.equal(calculateRetailPriceCents(1000), 1150);

  // Allowance is ignored — same cost → same retail.
  assert.equal(calculateRetailPriceCents(66, { dataMB: 100 }), 68);
  assert.equal(calculateRetailPriceCents(66, { dataMB: 502 }), 68);
  assert.equal(calculateRetailPriceCents(66, { dataUnlimited: true }), 68);
  assert.equal(calculateEntryRetailPriceCents(66), 68);
  assert.equal(calculateEntryRetailPriceUsd(0.66), 0.68);
  assert.equal(calculateEntryRetailPriceUsd(0.68), 1.18); // 68¢ + 50¢
  console.log("PASS sample_retail_cost_bands");

  // Rounding: multipliers ceil to next cent; never below provider.
  assert.equal(roundUpToNextCent(1198.8), 1199);
  assert.equal(roundUpToNextCent(67.01), 68);
  assert.equal(roundUpToNextCent(67), 67);
  for (const cents of [66, 67, 100, 101, 299, 300, 999, 1000, 2000, 3276]) {
    const retail = calculateRetailPriceCents(cents)!;
    assert.ok(retail >= cents);
    assert.equal(retail, Math.trunc(retail));
  }
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
  const countriesList = read("app/countries/page.tsx");
  const countriesListing = read("app/components/countries/CountriesListing.tsx");
  const currencyFormat = read("app/lib/currency/format.ts");
  const currencies = read("app/lib/currency/currencies.ts");
  const pkg = read("package.json");

  assert.match(pricing, /calculateRetailPriceCents/);
  assert.match(pricing, /RETAIL_CENTS_FOR_PROVIDER_66/);
  assert.match(pricing, /roundUpToNextCent/);
  assert.doesNotMatch(pricing, /markupRateForAllowance/);
  assert.doesNotMatch(pricing, /MARKUP_UP_TO_100MB/);
  assert.doesNotMatch(pricing, /roundUpToRetailEndingCents/);
  assert.match(offers, /calculateRetailPriceUsd/);
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
  assert.match(destinations, /retailMinFromProviderStartingPrice/);
  assert.doesNotMatch(destinations, /retailMinFromStaticStartingPrice/);
  assert.match(destinations, /withLowestOfferRetailMinPrice/);
  assert.match(countryDetail, /withLowestOfferRetailMinPrice/);
  assert.match(countryDetail, /retailMinFromProviderStartingPrice/);
  assert.match(countriesList, /retailMinFromProviderStartingPrice/);
  assert.match(read("app/plans/page.tsx"), /retailMinFromProviderStartingPrice/);
  assert.match(read("app/data/countries.ts"), /raw\/provider-ish USD snapshot/);
  assert.match(server, /fetchPublicDestinationCatalog|enrichDestinationsWithOfferRetailMins/);
  assert.match(currencyFormat, /convertFromUsd/);
  assert.match(currencies, /PKR:\s*293/);
  assert.match(pkg, /"qa:retail-pricing"/);
  assert.doesNotMatch(offersRoute, /providerPriceUSD/);
  const destinationsRoute = read("app/api/vesim/destinations/route.ts");
  assert.match(destinationsRoute, /fetchPublicDestinationCatalog/);
  assert.doesNotMatch(
    destinationsRoute,
    /const destinations = await fetchDestinations\(\)/
  );
  console.log("PASS catalog_checkout_wallet_gateway_public_strip_contracts");

  assert.match(actions, /Never trust browser money/);
  assert.match(actions, /void formData\.get\("price"\)/);
  console.log("PASS client_price_tampering_blocked");

  assert.match(countryDetail, /toPublicVesimOffers|parsePublicVesimOffers/);
  assert.doesNotMatch(countryDetail, /normalizeOffers\(/);
  assert.match(offers, /parsePublicVesimOffers/);
  assert.match(
    offers,
    /priceUSD is trusted as MAP retail|trusted as MAP retail/
  );
  console.log("PASS country_public_offers_no_second_normalize");

  // provider $0.66 → retail $0.68; public display must stay $0.68.
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
  assert.equal(display100.providerPriceUSD, undefined);
  assert.equal(server100!.priceUSD, display100.priceUSD);
  console.log("PASS no_double_markup_100mb_display_matches_authoritative");

  // Larger package: provider $1.20 → +$0.60 → $1.80 (allowance ignored).
  const raw1gb = {
    id: "qa-1gb",
    name: "1GB QA",
    price: 1.2,
    dataGB: 1,
    durationDays: 30,
  };
  const server1gb = normalizeOffer(raw1gb);
  assert.ok(server1gb);
  assert.equal(server1gb!.priceUSD, 1.8);
  assert.equal(server1gb!.providerPriceUSD, 1.2);
  const display1gb = parsePublicVesimOffers({
    offers: [toPublicVesimOffer(server1gb!)],
  })[0];
  assert.ok(display1gb);
  assert.equal(display1gb.priceUSD, 1.8);
  assert.equal(display1gb.providerPriceUSD, undefined);
  assert.equal(server1gb!.priceUSD, display1gb.priceUSD);
  console.log("PASS no_double_markup_larger_plan_display_matches_authoritative");

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

  assert.match(countriesList, /fetchPublicDestinationCatalog/);
  assert.match(countriesListing, /parsePublicDestinations/);
  assert.doesNotMatch(countriesListing, /normalizeDestinations\(/);
  assert.match(countryDetail, /fetchPublicDestinationCatalog|withLowestOfferRetailMinPrice/);
  assert.doesNotMatch(countryDetail, /normalizeDestinations\(/);
  assert.match(destinations, /parsePublicDestinations/);
  assert.match(destinations, /applyEntryRetail/);
  console.log("PASS starting_price_public_destinations_no_second_normalize");

  const rawDest = {
    code: "PK",
    name: "Pakistan",
    minPrice: 0.66,
    offerCount: 12,
  };
  const serverDest = normalizeDestination(rawDest);
  assert.ok(serverDest);
  assert.equal(serverDest!.minPrice, 0.68);
  const publicDestPayload = {
    success: true,
    destinations: normalizeDestinations({ destinations: [rawDest] }),
  };
  const displayDest = parsePublicDestinations(publicDestPayload).find(
    (d) => d.code === "PK"
  );
  assert.ok(displayDest);
  assert.equal(displayDest!.minPrice, 0.68);
  // Re-applying entry retail to an already-retail 0.68 treats it as provider 68¢ → $1.18.
  const doubleBugged = normalizeDestination({
    code: "PK",
    name: "Pakistan",
    minPrice: 0.68,
  });
  assert.equal(doubleBugged!.minPrice, 1.18);
  assert.equal(
    parsePublicDestination({
      code: "PK",
      name: "Pakistan",
      minPrice: 0.68,
    })!.minPrice,
    0.68
  );
  console.log("PASS starting_price_no_double_entry_markup");

  const cheapestPlan = normalizeOffer({
    id: "pk-100mb",
    name: "100MB",
    price: 0.66,
    dataMB: 100,
  });
  assert.ok(cheapestPlan);
  assert.equal(cheapestPlan!.priceUSD, 0.68);
  const publicPlan = parsePublicVesimOffers({
    offers: [toPublicVesimOffer(cheapestPlan!)],
  })[0];
  assert.equal(publicPlan.priceUSD, displayDest!.minPrice);
  console.log("PASS starting_price_matches_cheapest_public_plan_068");

  // Same provider cost → entry min and offer retail match (cost bands ignore allowance).
  const rawDeMinProvider = 0.68;
  const entryDe = normalizeDestination({
    code: "DE",
    name: "Germany",
    minPrice: rawDeMinProvider,
  });
  assert.equal(entryDe!.minPrice, 1.18);
  const de502 = normalizeOffer({
    id: "de-502",
    name: "Germany 500MB/Day",
    price: rawDeMinProvider,
    dataMB: 502,
    durationDays: 1,
  });
  assert.ok(de502);
  assert.equal(de502!.priceUSD, 1.18);
  assert.equal(entryDe!.minPrice, de502!.priceUSD);
  const dePublicPlan = parsePublicVesimOffers({
    offers: [toPublicVesimOffer(de502!)],
  })[0];
  const deEnriched = withLowestOfferRetailMinPrice(entryDe!, [dePublicPlan]);
  assert.equal(deEnriched.minPrice, 1.18);
  assert.equal(lowestOfferRetailUsd([dePublicPlan]), 1.18);
  console.log("PASS starting_from_uses_offer_retail_matches_cost_band");

  const samples = [
    { code: "FR", name: "France", provider: 1.0, dataMB: 500, retail: 1.5 },
    { code: "US", name: "United States", provider: 2.0, dataMB: 200, retail: 2.6 },
    { code: "AU", name: "Australia", provider: 3.0, dataMB: 100, retail: 3.6 },
    { code: "IT", name: "Italy", provider: 0.68, dataMB: 502, retail: 1.18 },
  ] as const;
  for (const sample of samples) {
    const entryDest = normalizeDestination({
      code: sample.code,
      name: sample.name,
      minPrice: sample.provider,
    });
    const plan = parsePublicVesimOffers({
      offers: [
        toPublicVesimOffer(
          normalizeOffer({
            id: `${sample.code}-plan`,
            name: `${sample.code} plan`,
            price: sample.provider,
            dataMB: sample.dataMB,
          })!
        ),
      ],
    })[0];
    const dest = withLowestOfferRetailMinPrice(entryDest!, [plan]);
    const publicDest = parsePublicDestinations({
      destinations: [dest],
    })[0];
    assert.equal(plan.priceUSD, sample.retail);
    assert.equal(dest.minPrice, sample.retail);
    assert.equal(publicDest.minPrice, sample.retail);
    assert.equal(publicDest.minPrice, plan.priceUSD);
  }
  console.log("PASS starting_price_matches_cheapest_for_extra_countries");

  const regional = parsePublicDestinations({
    destinations: normalizeDestinations({
      destinations: [
        {
          code: "region-asia",
          name: "Asia",
          minPrice: 0.66,
          isRegional: true,
        },
      ],
    }),
  })[0];
  assert.ok(regional);
  assert.equal(regional.kind, "regional");
  assert.equal(regional.minPrice, 0.68);
  console.log("PASS regional_starting_price_no_double_markup");

  // Static emergency fallback maps provider snapshot → MAP retail exactly once.
  const staticPk = retailMinFromProviderStartingPrice("$0.66");
  assert.equal(staticPk.minPrice, 0.68);
  assert.match(staticPk.minPriceFormatted, /0\.68/);
  const staticSa = retailMinFromProviderStartingPrice("$1.43");
  assert.equal(staticSa.minPrice, 2.03); // 143¢ + 60¢
  const staticLow = retailMinFromProviderStartingPrice("$0.50");
  assert.equal(staticLow.minPrice, 1.0);

  // Public fallback pages call the helper once on countries.ts snapshots only —
  // never re-feed the helper's retail output (would double-mark 0.68 → 1.18).
  assert.match(countriesList, /retailMinFromProviderStartingPrice\(item\.startingPrice\)/);
  assert.match(
    read("app/plans/page.tsx"),
    /retailMinFromProviderStartingPrice\(item\.startingPrice\)/
  );
  assert.match(
    countryDetail,
    /retailMinFromProviderStartingPrice\(match\.startingPrice\)/
  );
  assert.doesNotMatch(
    countriesList,
    /retailMinFromProviderStartingPrice\([^\)]*minPrice/
  );
  assert.doesNotMatch(
    countryDetail,
    /retailMinFromProviderStartingPrice\([^\)]*minPriceFormatted/
  );
  assert.notEqual(
    retailMinFromProviderStartingPrice(staticPk.minPriceFormatted).minPrice,
    staticPk.minPrice
  );
  console.log("PASS static_provider_starting_price_maps_once_to_entry_retail");

  // PKR conversion from final USD retail × 293.
  assert.equal(formatMoney(0.68, "PKR"), "Rs 199");
  assert.equal(convertFromUsd(0.68, "PKR"), 0.68 * 293);
  assert.equal(
    formatMoney(displayDest!.minPrice, "PKR"),
    formatMoney(0.68, "PKR")
  );
  assert.notEqual(
    formatMoney(displayDest!.minPrice, "PKR"),
    formatMoney(1.18, "PKR")
  );
  console.log("PASS pkr_starting_price_uses_final_usd_retail");

  console.log("ALL_RETAIL_PRICING_CHECKS_PASSED");
}

main();
