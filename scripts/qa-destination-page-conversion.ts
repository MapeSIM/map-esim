/**
 * Offline QA: destination listing conversion UX (display only).
 * Does not start a server, mutate payments, or change checkout/API logic.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAN_CARD_BENEFITS,
  PLAN_CARD_RECOMMENDED_LABEL,
  PLAN_PURCHASE_TRUST_LINE,
  PLAN_PURCHASE_TRUST_LINE_AUTHENTICATED,
  PLAN_PURCHASE_TRUST_LINE_GUEST,
  PLAN_STICKY_TRUST_LINE,
  planPurchaseTrustLine,
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
  assert.deepEqual([...PLAN_CARD_BENEFITS], [
    "Digital eSIM",
    "Keep your SIM",
    "QR after purchase",
  ]);
  assert.equal(
    PLAN_PURCHASE_TRUST_LINE_GUEST,
    "Sign in to buy. QR and install details arrive after purchase."
  );
  assert.equal(
    PLAN_PURCHASE_TRUST_LINE_AUTHENTICATED,
    "QR and install details arrive after purchase."
  );
  assert.equal(PLAN_PURCHASE_TRUST_LINE, PLAN_PURCHASE_TRUST_LINE_GUEST);
  assert.equal(planPurchaseTrustLine(false), PLAN_PURCHASE_TRUST_LINE_GUEST);
  assert.equal(
    planPurchaseTrustLine(true),
    PLAN_PURCHASE_TRUST_LINE_AUTHENTICATED
  );
  assert.doesNotMatch(PLAN_PURCHASE_TRUST_LINE_AUTHENTICATED, /Sign in to buy/);
  assert.match(PLAN_STICKY_TRUST_LINE, /Digital delivery/);
  assert.equal(planCardLineLabel("validity"), "Validity");
  assert.equal(planCardLineLabel("coverage"), "Coverage");
  assert.equal(planCardLineLabel("voice"), "Voice & SMS");
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
  // Sprint B1.4: auth-aware purchase trust (display only).
  assert.match(listing, /planPurchaseTrustLine/);
  assert.match(listing, /purchaseTrustLine/);
  assert.match(listing, /setSignedIn/);
  // Sprint B1.4 Phase 2: controlled benefits micro-row (existing constant only).
  assert.match(listing, /PLAN_CARD_BENEFITS/);
  assert.match(listing, /aria-label="Plan benefits"/);
  assert.match(listing, /formatValidityCardValue/);
  assert.match(listing, /text-xs leading-snug text-\[var\(--text-muted\)\]/);
  // Sprint B1.4: mobile Buy Now first via order utilities.
  assert.match(listing, /order-1[\s\S]*?Buy Now|Buy Now[\s\S]*?order-1/);
  assert.match(listing, /min-\[400px\]:order-2/);
  assert.match(listing, /min-\[400px\]:order-1/);
  // Sprint B1.3: neutral related regional section (existing data only).
  assert.doesNotMatch(listing, /Helpful destination links/);
  assert.match(listing, /Related regional plans/);
  assert.match(listing, /related-regional-heading/);
  assert.match(listing, /destinationPath\(relatedRegional\)/);
  assert.doesNotMatch(listing, /_relatedRegional/);
  assert.match(listing, /Buy Now/);
  // Sprint B0: show existing coverage lines on cards (no inventing).
  assert.doesNotMatch(
    listing,
    /line\.kind === "validity" \|\| line\.kind === "operator"/
  );
  // Sprint B0: hero From price from existing destination.minPrice + plan count.
  assert.match(listing, /destination\.minPrice/);
  assert.match(listing, /From \$\{heroFromPrice\}/);
  assert.match(listing, /planCountLabel/);
  // Sprint A: Plan Details uses design tokens (no theme-breaking bg-white).
  assert.match(
    listing,
    /border-\[var\(--border-strong\)\][\s\S]*?bg-\[var\(--surface\)\][\s\S]*?Plan Details|Coverage details/
  );
  assert.doesNotMatch(listing, /bg-white/);
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
  // Country page still resolves + passes relatedRegional (display wired in listing).
  const countryPage = read("app/countries/[id]/page.tsx");
  assert.match(countryPage, /findRelatedRegionalDestination/);
  assert.match(countryPage, /relatedRegional=\{relatedRegional\}/);
  console.log("PASS listing_conversion_ux");

  assert.match(modal, /purchaseTrustLine/);
  assert.match(modal, /PLAN_PURCHASE_TRUST_LINE_GUEST/);
  assert.match(modal, /Buy Now/);
  assert.match(modal, /Available networks/);
  assert.match(modal, /label="Coverage"/);
  assert.match(modal, /Package information/);
  // Sprint B1.4 Phase 2: consistent modal title/eyebrow.
  assert.match(modal, /destinationDisplayName/);
  assert.match(modal, /planDetailsExtraName/);
  assert.match(modal, /displayDestinationName/);
  assert.match(
    modal,
    /offer\.dataFormatted\} · \$\{formatValidityPhrase\(offer\.durationDays\)\}/
  );
  assert.doesNotMatch(modal, /coverageFocused \? "Coverage details"/);
  assert.doesNotMatch(modal, /coverageFocused\s*\?\s*`\$\{offer\.dataFormatted\}/);
  console.log("PASS modal_simple_layout");

  const offer = { id: "ESIM-QA-CONV-1" } as VesimOffer;
  assert.equal(
    buildCheckoutHref(offer, "JP"),
    "/account/esim/buy?offerId=ESIM-QA-CONV-1&country=JP"
  );
  assert.doesNotMatch(helpers, /providerPriceUSD/);
  assert.doesNotMatch(conversion, /providerPriceUSD|PAYMENT_GATEWAY_ENABLED/);
  assert.match(helpers, /planCardVoiceSmsLine/);
  assert.match(helpers, /planDetailsExtraName/);
  assert.match(helpers, /kind: "voice"/);
  assert.match(pkg, /qa:destination-page-conversion/);
  assert.match(prelaunch, /qa:destination-page-conversion/);
  assert.doesNotMatch(apply, /PLAN_CARD_RECOMMENDED_LABEL|data-plan-sticky-cta/);
  assert.doesNotMatch(checkout, /PLAN_CARD_RECOMMENDED_LABEL|data-plan-sticky-cta/);
  console.log("PASS payments_checkout_untouched");

  console.log("ALL PASS qa-destination-page-conversion");
}

main();
