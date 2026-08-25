/**
 * Offline QA: destination listing conversion UX (display only).
 * Does not start a server, mutate payments, or change checkout/API logic.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAN_CARD_RECOMMENDED_LABEL,
  PLAN_PURCHASE_TRUST_LINE,
  PLAN_STICKY_TRUST_LINE,
} from "../app/lib/plans/planCardConversion";
import { planCardLineLabel } from "../app/lib/plans/planOfferPresentation";
import { buildCheckoutHref } from "../app/lib/plans/plan-utils";
import type { VesimOffer } from "../app/lib/vesim/offers";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(PLAN_CARD_RECOMMENDED_LABEL, "Recommended");
  assert.match(PLAN_PURCHASE_TRUST_LINE, /QR and install details/);
  assert.match(PLAN_STICKY_TRUST_LINE, /Digital delivery/);
  assert.equal(planCardLineLabel("validity"), "Validity");
  assert.equal(planCardLineLabel("coverage"), "Coverage");
  assert.equal(planCardLineLabel("operator"), "Network");
  console.log("PASS conversion_copy");

  assert.ok(existsSync(join(root, "app/lib/plans/planCardConversion.ts")));
  const listing = read("app/components/plans/PlansListing.tsx");
  const modal = read("app/components/plans/PlanDetailsModal.tsx");
  const helpers = read("app/lib/plans/planOfferPresentation.ts");
  const conversion = read("app/lib/plans/planCardConversion.ts");
  const pkg = read("package.json");
  const prelaunch = read("scripts/qa-prelaunch.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const checkout = read("app/lib/vesim/creditCheckout.ts");

  assert.match(listing, /planCardSecondaryLines/);
  assert.match(listing, /planCardLineLabel/);
  assert.doesNotMatch(listing, /PLAN_CARD_RECOMMENDED_LABEL/);
  assert.doesNotMatch(listing, /data-plan-recommended/);
  assert.doesNotMatch(listing, /PLAN_PURCHASE_TRUST_LINE/);
  assert.doesNotMatch(listing, /PLAN_CARD_BENEFITS/);
  assert.doesNotMatch(listing, /Helpful destination links/);
  assert.match(listing, /Buy Now/);
  assert.match(listing, /bg-white/);
  assert.doesNotMatch(listing, /Need more options\?/);
  assert.match(listing, /href="\/device-compatibility"/);
  assert.match(listing, /Check compatibility/);
  assert.doesNotMatch(listing, /href="\/install\/iphone"/);
  assert.doesNotMatch(listing, /href="\/install\/android"/);
  assert.doesNotMatch(listing, /How MAP eSIM works/);
  assert.doesNotMatch(listing, /More destinations/);
  assert.doesNotMatch(listing, /how-it-works/);
  assert.doesNotMatch(listing, /data-plan-sticky-cta/);
  assert.doesNotMatch(listing, /showStickyBuy/);
  assert.doesNotMatch(listing, /stickyOffer/);
  assert.doesNotMatch(listing, /PLAN_STICKY_TRUST_LINE/);
  assert.doesNotMatch(listing, /pb-44/);
  assert.doesNotMatch(listing, /Digital delivery after checkout/);
  assert.match(
    listing,
    /resolveCheckoutHref\(\s*offer,\s*destination\.code\s*\)/
  );
  assert.doesNotMatch(listing, /offer\.packageInfo/);
  assert.doesNotMatch(listing, /providerPriceUSD/);
  console.log("PASS listing_conversion_ux");

  assert.doesNotMatch(modal, /PLAN_PURCHASE_TRUST_LINE/);
  assert.match(modal, /Buy Now/);
  assert.match(modal, /Available networks/);
  assert.match(modal, /label="Coverage"/);
  assert.match(modal, /Package information/);
  console.log("PASS modal_simple_layout");

  const offer = { id: "ESIM-QA-CONV-1" } as VesimOffer;
  assert.equal(
    buildCheckoutHref(offer, "JP"),
    "/account/esim/buy?offerId=ESIM-QA-CONV-1&country=JP"
  );
  assert.doesNotMatch(helpers, /providerPriceUSD/);
  assert.doesNotMatch(conversion, /providerPriceUSD|PAYMENT_GATEWAY_ENABLED/);
  assert.match(pkg, /qa:destination-page-conversion/);
  assert.match(prelaunch, /qa:destination-page-conversion/);
  assert.doesNotMatch(apply, /PLAN_CARD_RECOMMENDED_LABEL|data-plan-sticky-cta/);
  assert.doesNotMatch(checkout, /PLAN_CARD_RECOMMENDED_LABEL|data-plan-sticky-cta/);
  console.log("PASS payments_checkout_untouched");

  console.log("ALL PASS qa-destination-page-conversion");
}

main();
