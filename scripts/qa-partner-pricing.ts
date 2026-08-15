/**
 * Offline QA: Partner purchase pricing (cent-safe, provider-cost floor).
 * No DB, network, wallet, or provider calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PARTNER_DISCOUNT_BPS_MAX,
  PARTNER_DISCOUNT_BPS_MIN,
} from "../app/lib/partner/discount";
import {
  PARTNER_PRICING_INVALID_INPUT_MESSAGE,
  PARTNER_PRICING_UNAVAILABLE_MESSAGE,
  calculatePartnerPurchasePricing,
  partnerChargeCentsFromRetail,
} from "../app/lib/partner/partnerPricing";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const src = read("app/lib/partner/partnerPricing.ts");
  assert.match(src, /BigInt|bigint/);
  assert.match(src, /HALF_UP_BIAS|BigInt\(5_000\)/);
  assert.doesNotMatch(src, /\*\s*0\.\d+|toFixed\(/);
  assert.match(src, /PARTNER_DISCOUNT_BPS_MAX|PARTNER_DISCOUNT_BPS_MIN/);
  assert.doesNotMatch(
    PARTNER_PRICING_UNAVAILABLE_MESSAGE,
    /provider|cost|\$|cent/i
  );
  assert.doesNotMatch(
    PARTNER_PRICING_INVALID_INPUT_MESSAGE,
    /provider|cost|\$/i
  );
  console.log("PASS source_integer_only_no_provider_leak");

  // A. 5%
  {
    const r = calculatePartnerPurchasePricing({
      retailPriceCents: 1000,
      discountBps: 500,
      providerCostCents: 800,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.partnerChargeCents, 950);
      assert.equal(r.retailPriceCents, 1000);
      assert.equal(r.discountBps, 500);
      assert.equal(r.providerCostCents, 800);
    }
  }
  console.log("PASS five_percent_1000_to_950");

  // B. 7.5%
  {
    const r = calculatePartnerPurchasePricing({
      retailPriceCents: 1000,
      discountBps: 750,
      providerCostCents: 800,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.partnerChargeCents, 925);
  }
  console.log("PASS seven_point_five_percent_1000_to_925");

  // C. no discount
  {
    const r = calculatePartnerPurchasePricing({
      retailPriceCents: 1000,
      discountBps: 0,
      providerCostCents: 800,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.partnerChargeCents, 1000);
  }
  console.log("PASS zero_discount_unchanged");

  // D. cent rounding boundary (half-up)
  // 1001 * 9250 = 9_259_250 → +5000 → /10000 = 926 (0.425 rounds? 925.925 → nearest 926)
  assert.equal(partnerChargeCentsFromRetail(1001, 750), 926);
  // Exact half: need remainder 5000. 1 * 5000 = 5000 with keepBps... use retail=2, discount such that
  // 2 * keep = 5000 → keep=2500 → discount=7500 → charge = round(5000/10000)=1 (half-up from 0.5)
  assert.equal(partnerChargeCentsFromRetail(2, 7500), 1);
  // Just below half: 2 * 2499 = 4998 → +5000 = 9998 / 10000 = 0
  assert.equal(partnerChargeCentsFromRetail(2, 7501), 0);
  console.log("PASS cent_rounding_boundaries");

  // E. provider cost exactly equal charge → PASS
  {
    const r = calculatePartnerPurchasePricing({
      retailPriceCents: 1000,
      discountBps: 500,
      providerCostCents: 950,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.partnerChargeCents, 950);
  }
  console.log("PASS floor_equal_allowed");

  // F. provider cost 1 cent above charge → REJECT
  {
    const r = calculatePartnerPurchasePricing({
      retailPriceCents: 1000,
      discountBps: 500,
      providerCostCents: 951,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "BELOW_PROVIDER_COST");
      assert.equal(r.error, PARTNER_PRICING_UNAVAILABLE_MESSAGE);
      assert.doesNotMatch(r.error, /951|provider|cost|floor/i);
    }
  }
  console.log("PASS floor_one_cent_above_rejects");

  // G. invalid negative/zero retail
  for (const retail of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = calculatePartnerPurchasePricing({
      retailPriceCents: retail as number,
      discountBps: 0,
      providerCostCents: 1,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "INVALID_INPUT");
  }
  console.log("PASS invalid_retail_rejects");

  // H. invalid discount
  for (const discountBps of [
    -1,
    PARTNER_DISCOUNT_BPS_MAX + 1,
    10000,
    1.5,
    Number.NaN,
  ]) {
    const r = calculatePartnerPurchasePricing({
      retailPriceCents: 1000,
      discountBps: discountBps as number,
      providerCostCents: 1,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "INVALID_INPUT");
      assert.equal(r.error, PARTNER_PRICING_INVALID_INPUT_MESSAGE);
    }
  }
  assert.equal(PARTNER_DISCOUNT_BPS_MIN, 0);
  assert.equal(PARTNER_DISCOUNT_BPS_MAX, 9900);
  console.log("PASS invalid_discount_rejects");

  // I. large but realistic price (e.g. $500.00 retail, 7.5%)
  {
    const r = calculatePartnerPurchasePricing({
      retailPriceCents: 50_000,
      discountBps: 750,
      providerCostCents: 40_000,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.partnerChargeCents, 46_250);
      assert.ok(Number.isSafeInteger(r.partnerChargeCents));
    }
  }
  // Stress: high retail still safe
  {
    const r = calculatePartnerPurchasePricing({
      retailPriceCents: 1_000_000,
      discountBps: 500,
      providerCostCents: 100,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.partnerChargeCents, 950_000);
  }
  console.log("PASS large_realistic_prices");

  // J. deterministic repeated calls
  const input = {
    retailPriceCents: 1999,
    discountBps: 750,
    providerCostCents: 1000,
  };
  const a = calculatePartnerPurchasePricing(input);
  const b = calculatePartnerPurchasePricing(input);
  assert.deepEqual(a, b);
  assert.equal(partnerChargeCentsFromRetail(1999, 750), partnerChargeCentsFromRetail(1999, 750));
  console.log("PASS deterministic_repeat");

  // charge <= 0 rejected even if floor would pass
  {
    const r = calculatePartnerPurchasePricing({
      retailPriceCents: 1,
      discountBps: 9900,
      providerCostCents: 0,
    });
    // 1 * 100 / 10000 = 0.01 → rounds to 0 → INVALID
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "INVALID_INPUT");
  }
  console.log("PASS zero_charge_rejects");

  console.log("ALL PASS qa-partner-pricing");
}

main();
