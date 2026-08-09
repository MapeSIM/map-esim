/**
 * Offline QA for authoritative MAP eSIM retail pricing.
 * Does not call VeSIM, mutate DB, or place orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calculateRetailPriceCents,
  calculateRetailPriceUsd,
  MARKUP_10_TO_30,
  MARKUP_OVER_30,
  MARKUP_UNDER_10,
  markupRateForProviderCostCents,
  roundUpToRetailEndingCents,
} from "../app/lib/pricing/retailPrice";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function endingOk(cents: number): boolean {
  const rem = cents % 100;
  return rem === 49 || rem === 99;
}

function main() {
  assert.equal(MARKUP_UNDER_10, 0.2);
  assert.equal(MARKUP_10_TO_30, 0.18);
  assert.equal(MARKUP_OVER_30, 0.15);
  assert.equal(markupRateForProviderCostCents(999), 0.2);
  assert.equal(markupRateForProviderCostCents(1000), 0.18);
  assert.equal(markupRateForProviderCostCents(3000), 0.18);
  assert.equal(markupRateForProviderCostCents(3001), 0.15);
  console.log("PASS markup_tiers_and_boundaries");

  // Live sample expectations from policy examples.
  assert.equal(calculateRetailPriceCents(66), 99); // $0.66 → $0.99
  assert.equal(calculateRetailPriceCents(1042), 1249); // $10.42 → $12.49
  assert.equal(calculateRetailPriceCents(3276), 3799); // $32.76 → $37.99
  assert.equal(calculateRetailPriceUsd(0.66), 0.99);
  assert.equal(calculateRetailPriceUsd(10.42), 12.49);
  assert.equal(calculateRetailPriceUsd(32.76), 37.99);
  console.log("PASS live_sample_retail_targets");

  // Exact boundaries.
  const at10 = calculateRetailPriceCents(1000);
  const at30 = calculateRetailPriceCents(3000);
  assert.ok(at10 != null && endingOk(at10));
  assert.ok(at30 != null && endingOk(at30));
  assert.ok(at10! >= Math.ceil(1000 * 1.18));
  assert.ok(at30! >= Math.ceil(3000 * 1.18));
  console.log("PASS boundary_10_and_30");

  // Rounding never reduces markup amount.
  for (const provider of [1, 66, 500, 999, 1000, 1042, 2500, 3000, 3001, 3276, 9999]) {
    const rate = markupRateForProviderCostCents(provider)!;
    const markedUp = Math.ceil(provider * (1 + rate));
    const retail = calculateRetailPriceCents(provider)!;
    assert.ok(retail >= markedUp, `retail ${retail} < markedUp ${markedUp}`);
    assert.ok(endingOk(retail), `ending not .49/.99 for ${retail}`);
    assert.equal(roundUpToRetailEndingCents(markedUp), retail);
  }
  console.log("PASS rounding_never_reduces_and_ends_49_or_99");

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
  const currencyFormat = read("app/lib/currency/format.ts");
  const pkg = read("package.json");

  assert.match(pricing, /calculateRetailPriceCents/);
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
  assert.match(persist, /providerAmount:\s*options\.verifiedOffer\.providerPriceUSD/);
  assert.match(persist, /displayAmount:\s*options\.verifiedOffer\.priceUSD/);
  assert.match(destinations, /calculateRetailPriceUsd/);
  assert.match(currencyFormat, /convertFromUsd/);
  assert.match(pkg, /"qa:retail-pricing"/);
  assert.doesNotMatch(offersRoute, /providerPriceUSD/);
  console.log("PASS catalog_checkout_wallet_gateway_public_strip_contracts");

  // Client tampering: browser money fields ignored in wallet actions.
  assert.match(actions, /Never trust browser money/);
  assert.match(actions, /void formData\.get\("price"\)/);
  console.log("PASS client_price_tampering_blocked");

  console.log("ALL_RETAIL_PRICING_CHECKS_PASSED");
}

main();
