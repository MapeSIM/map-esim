/**
 * Offline QA: destination listing conversion UX (display only).
 * Does not start a server, mutate payments, or change checkout/API logic.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAN_CARD_BENEFITS,
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
  assert.equal(PLAN_CARD_BENEFITS.length, 3);
  assert.ok(PLAN_CARD_BENEFITS.includes("Digital eSIM"));
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
  assert.match(listing, /PLAN_CARD_BENEFITS/);
  assert.match(listing, /PLAN_PURCHASE_TRUST_LINE/);
  assert.match(listing, />\s*Data\s*</);
  assert.match(listing, />\s*Price\s*</);
  assert.match(listing, /Buy now/);
  assert.match(listing, /href="\/install\/iphone"/);
  assert.match(listing, /href="\/install\/android"/);
  assert.match(listing, /href="\/how-it-works"/);
  assert.match(listing, /href="\/countries"/);
  assert.match(listing, /relatedRegional/);
  assert.match(listing, /data-plan-sticky-cta/);
  assert.match(listing, /md:hidden/);
  assert.match(
    listing,
    /bottom-\[calc\(5\.25rem\+env\(safe-area-inset-bottom\)\)\]/
  );
  assert.match(listing, /pr-\[max\(1rem,env\(safe-area-inset-right\)\)\]/);
  assert.doesNotMatch(
    listing,
    /data-plan-sticky-cta[\s\S]{0,400}bottom-0/
  );
  assert.match(listing, /resolveCheckoutHref\(stickyOffer, destination\.code\)/);
  assert.doesNotMatch(listing, /offer\.packageInfo/);
  assert.doesNotMatch(listing, /providerPriceUSD/);
  console.log("PASS listing_conversion_ux");

  assert.match(modal, /PLAN_PURCHASE_TRUST_LINE/);
  assert.match(modal, /Buy Now/);
  console.log("PASS modal_trust_near_cta");

  const offer = { id: "ESIM-QA-CONV-1" } as VesimOffer;
  assert.equal(
    buildCheckoutHref(offer, "JP"),
    "/account/esim/buy?offerId=ESIM-QA-CONV-1&country=JP"
  );
  assert.doesNotMatch(helpers, /providerPriceUSD/);
  assert.doesNotMatch(conversion, /providerPriceUSD|PAYMENT_GATEWAY_ENABLED/);
  assert.match(pkg, /qa:destination-page-conversion/);
  assert.match(prelaunch, /qa:destination-page-conversion/);
  assert.doesNotMatch(apply, /PLAN_CARD_BENEFITS|data-plan-sticky-cta/);
  assert.doesNotMatch(checkout, /PLAN_CARD_BENEFITS|data-plan-sticky-cta/);
  console.log("PASS payments_checkout_untouched");

  console.log("ALL PASS qa-destination-page-conversion");
}

main();
