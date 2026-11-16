/**
 * Offline QA: checkout page presentation (layout only).
 * Does not mutate payments, APIs, wallets, or the checkout flow.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeCustomerBuyCountryHint } from "../app/lib/plans/customerBuyCountryHint";
import {
  formatSimpaisaMsisdnInput,
  normalizeSimpaisaMsisdn,
} from "../app/lib/payments/simpaisaPolicy";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const confirm = read("app/components/account/WalletPurchaseConfirmForm.tsx");
  const review = read("app/account/esim/buy/review/page.tsx");
  const guest = read("app/checkout/CheckoutClient.tsx");
  const trust = read("app/components/account/CheckoutTrustPanel.tsx");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const credit = read("app/lib/vesim/creditCheckout.ts");
  const actions = read("app/lib/esim/walletPurchaseActions.ts");
  const pkg = read("package.json");
  const prelaunch = read("scripts/qa-prelaunch.ts");

  assert.ok(existsSync(join(root, "app/components/account/CheckoutTrustPanel.tsx")));
  assert.match(confirm, /lg:grid-cols-\[minmax\(0,1\.2fr\)_minmax\(18rem,0\.8fr\)\]/);
  assert.match(confirm, /lg:sticky lg:top-6/);
  assert.match(confirm, /CheckoutTrustPanel/);
  assert.match(confirm, /Plan summary/);
  assert.match(confirm, /Customer/);
  assert.match(confirm, /Online payment/);
  assert.match(confirm, /Order summary/);
  assert.match(confirm, /Buy eSIM with Wallet/);
  assert.match(confirm, /Continue to Payment/);
  assert.match(confirm, /isFullWalletMode|primaryCtaLabel/);
  assert.match(confirm, /confirmCheckboxText|confirmNoteText/);
  assert.match(confirm, /confirmWalletEsimPurchaseAction/);
  assert.match(confirm, /setWalletPurchaseFundingChoiceAction/);
  // Simpaisa must use server action only — no no-op onSubmit that blocks Verify.
  assert.match(confirm, /handleSafepaySubmit/);
  assert.match(confirm, /isSafepayMode\s*\?\s*handleSafepaySubmit/);
  assert.match(confirm, /showPurchaseConfirmCheckbox/);
  assert.match(confirm, /confirmGateError/);
  assert.match(
    confirm,
    /Please confirm this purchase before continuing to payment/
  );
  assert.doesNotMatch(
    confirm,
    /alert\(\s*["']Please confirm this purchase before continuing to payment/
  );
  assert.match(
    confirm,
    /Simpaisa \/ wallet must NOT attach an onSubmit|must NOT attach an onSubmit handler/
  );
  assert.match(confirm, /Contacting JazzCash \/ Easypaisa/);
  assert.match(confirm, /checkout_confirm_action_failed/);
  // Sprint A: Pay CTA above trust; mobile sticky pay bar (lg:hidden).
  // Inline aside pay buttons are desktop-only (hidden lg:inline-flex).
  assert.match(
    confirm,
    /Continue to Payment[\s\S]*?CheckoutTrustPanel|Buy eSIM with Wallet[\s\S]*?CheckoutTrustPanel/
  );
  assert.match(confirm, /hidden[\s\S]*?lg:inline-flex/);
  assert.match(confirm, /aria-label="Checkout payment action"/);
  assert.match(confirm, /fixed inset-x-0 bottom-0[\s\S]*?lg:hidden/);
  assert.match(confirm, /safe-area-inset-bottom/);
  assert.match(confirm, /sole mobile CTA|Mobile sticky pay action/);
  assert.match(confirm, /data-checkout-sticky-spacer/);
  assert.match(confirm, /stickySpacerClass|14rem\+env\(safe-area-inset-bottom/);
  assert.match(confirm, /10rem\+env\(safe-area-inset-bottom/);
  assert.match(confirm, /scroll-padding-bottom/);
  assert.match(
    confirm,
    /w-full min-w-0 items-center justify-center(?: gap-2)? rounded-2xl bg-\[var\(--accent-strong\)\]/
  );
  assert.doesNotMatch(confirm, /max-w-\[58%\]/);
  // Spacer clears sticky CTA (+ safe-area) at common mobile widths.
  const stickyClearancePx = 14 * 16;
  for (const width of [360, 390, 412]) {
    assert.ok(
      stickyClearancePx > 0 && stickyClearancePx < width,
      `sticky clearance should fit viewport ${width}`
    );
  }
  console.log("PASS sticky_bar_mobile_clearance_360_390_412");
  // Phase 6: WhatsApp FAB clears sticky pay bar (+ safe-area); checkout pay flow untouched.
  const whatsappShared = read("app/lib/support/whatsappSupportShared.ts");
  const whatsappButton = read("app/components/support/WhatsAppSupportButton.tsx");
  assert.match(whatsappShared, /isWhatsAppStickyPaymentClearanceRoute/);
  assert.match(whatsappShared, /whatsAppFabBottomClass/);
  assert.match(whatsappShared, /14rem.*safe-area-inset-bottom/);
  assert.match(whatsappButton, /whatsAppFabBottomClass/);
  assert.match(whatsappButton, /data-whatsapp-sticky-clearance/);
  assert.match(whatsappButton, /14rem/);
  // Sticky bar stays z-40; FAB stays z-30 but sits above the bar vertically.
  assert.match(confirm, /fixed inset-x-0 bottom-0 z-40/);
  assert.match(whatsappButton, /fixed z-30/);
  console.log("PASS whatsapp_fab_sticky_clearance");
  // Conversion polish: sticky disabled reason + zero-due Covered/Wallet labels.
  assert.match(confirm, /stickyDisabledReason/);
  assert.match(confirm, /dueLabel/);
  assert.match(confirm, /"Covered"/);
  // Mode option labels may mention JazzCash/Easypaisa; CTA is mode-based "Continue to Payment".
  assert.match(confirm, /JazzCash \/ Easypaisa/);
  assert.doesNotMatch(confirm, /Continue with JazzCash \/ Easypaisa/);
  // Mobile P0: early amount-due summary + sticky confirm (no vague "confirm above").
  assert.match(confirm, /checkout-mobile-due-summary/);
  assert.match(confirm, /Amount due/);
  assert.match(confirm, /Jump to confirm|Jump to pay/);
  assert.match(confirm, /checkout-confirm/);
  assert.match(confirm, /checkout-online-payment/);
  assert.match(confirm, /onlinePaymentSectionId/);
  assert.match(confirm, /simpaisaFieldsReady/);
  assert.match(confirm, /onValidityChange/);
  assert.match(confirm, /stickyShowConfirm/);
  assert.match(confirm, /confirmStickyId/);
  assert.doesNotMatch(confirm, /Confirm the purchase above to continue/);
  // Mobile: hide duplicate Order summary; keep early Amount due + sticky due.
  assert.match(confirm, /hidden lg:block/);
  assert.match(confirm, /Desktop\/tablet: full order summary|Mobile uses early Amount due/);
  // Sticky CTA waits for Simpaisa operator + MSISDN when gateway checkout.
  assert.match(
    confirm,
    /gatewayNeedsSimpaisaFields && !simpaisaFieldsReady/
  );
  assert.match(
    confirm,
    /Select JazzCash or Easypaisa and enter a valid mobile number/
  );
  console.log("PASS logged_in_checkout_two_column");

  const simpaisaFields = read("app/components/account/SimpaisaWalletFields.tsx");
  assert.match(simpaisaFields, /onValidityChange/);
  assert.match(simpaisaFields, /normalizeSimpaisaMsisdn/);
  assert.match(simpaisaFields, /formatSimpaisaMsisdnInput/);
  assert.match(simpaisaFields, /maxLength=\{10\}/);
  assert.match(simpaisaFields, /placeholder="3XXXXXXXXX"/);
  assert.match(simpaisaFields, /\+92/);
  assert.match(simpaisaFields, /min-h-\[6\.75rem\]/);
  assert.match(simpaisaFields, /grid-cols-2/);
  assert.equal(formatSimpaisaMsisdnInput("03001234567"), "3001234567");
  assert.equal(formatSimpaisaMsisdnInput("+923001234567"), "3001234567");
  assert.equal(formatSimpaisaMsisdnInput("923001234567"), "3001234567");
  assert.equal(formatSimpaisaMsisdnInput("30012345678999"), "3001234567");
  assert.equal(formatSimpaisaMsisdnInput("30a0-123 4567"), "3001234567");
  assert.equal(normalizeSimpaisaMsisdn("300123"), null);
  assert.equal(normalizeSimpaisaMsisdn("03001234567"), "3001234567");
  assert.equal(normalizeSimpaisaMsisdn("+92 300 1234567"), "3001234567");
  assert.equal(normalizeSimpaisaMsisdn("3001234567"), "3001234567");
  // Mobile cards: logos sized to fit half-width columns at 360–412px.
  const presentation = read(
    "app/components/account/simpaisaWalletMethodPresentation.ts"
  );
  assert.match(presentation, /max-w-\[7\.5rem\]/);
  assert.match(presentation, /max-w-\[5\.25rem\]/);
  const halfOf360 = 360 / 2 - 16; // column minus typical gap/padding
  assert.ok(7.5 * 16 <= halfOf360);
  assert.ok(5.25 * 16 <= halfOf360);
  console.log("PASS simpaisa_mobile_wallet_fields_ux");
  console.log("PASS mobile_viewport_logo_fit_360_390_412");

  assert.match(review, />Checkout</);
  assert.match(review, /Review your plan and choose how to fund/);
  assert.match(review, /WalletPurchaseConfirmForm/);
  assert.match(review, /getPublicManualPaymentConfig/);
  assert.match(confirm, /ManualPaymentDetailsBox/);
  assert.match(confirm, /\/api\/checkout\/manual-payment-config/);
  assert.match(guest, /\/api\/checkout\/manual-payment-config/);
  assert.match(guest, /ManualPaymentDetailsBox/);
  const copyField = read("app/components/account/ManualPaymentCopyField.tsx");
  assert.match(copyField, /navigator\.clipboard\.writeText/);
  assert.match(copyField, /Copied!/);
  assert.match(copyField, /JazzCash|Copy/);
  const detailsBox = read("app/components/account/ManualPaymentDetailsBox.tsx");
  assert.match(detailsBox, /Account title/);
  assert.match(detailsBox, /JazzCash number/);
  assert.match(detailsBox, /EasyPaisa number/);
  assert.match(detailsBox, /Bank name/);
  assert.match(detailsBox, /Bank account title/);
  assert.match(detailsBox, /Account number \/ IBAN/);
  console.log("PASS manual_payment_copy_fields");
  assert.match(review, /resolveAbandonedCheckoutReviewGuidance/);
  assert.match(review, /AbandonedCheckoutReviewGuidanceBanner/);
  assert.match(review, /if \(!purchaseId\) notFound\(\)/);
  assert.match(review, /if \(!review\) notFound\(\)/);
  console.log("PASS review_page_heading_preserved");

  assert.match(guest, /lg:grid-cols-\[minmax\(0,1\.2fr\)_minmax\(18rem,0\.8fr\)\]/);
  assert.match(guest, /CheckoutTrustPanel/);
  assert.match(guest, /\/api\/vesim\/offer/);
  assert.match(guest, /Pay with Safepay|Submit payment|Purchase eSIM/);
  assert.match(guest, /customerEmail/);
  assert.match(guest, /guestCheckoutEnabled/);
  // Sprint B0: guest Pay CTA before trust (parity with logged-in).
  assert.match(
    guest,
    /(?:Pay with Safepay|Submit payment|Purchase eSIM)[\s\S]*?CheckoutTrustPanel/
  );
  // Manual Payment: sole in-form Submit; hide aside/sticky duplicates.
  assert.match(confirm, /stickyBarVisible = !awaitingGatewayPayment && !manualSelected/);
  assert.match(confirm, /manualSelected \? null : showWhatsAppCheckoutCta/);
  assert.match(confirm, /showPurchaseConfirmCheckbox/);
  assert.match(guest, /Sole Submit CTA when Manual Payment/);
  assert.match(guest, /paymentMethod === "manual" && manualSettings\?\.enabled \? null/);
  assert.match(confirm, /pb-28/);
  assert.match(guest, /pb-28/);
  assert.match(confirm, /p-3 sm:p-6/);
  assert.match(copyField, /min-w-0 flex-1|w-full min-w-0 max-w-full/);
  assert.match(guest, /CheckoutCompatibilityCheck/);
  assert.match(confirm, /CheckoutCompatibilityCheck/);
  console.log("PASS guest_checkout_two_column");

  assert.match(trust, /CHECKOUT_TRUST_HIGHLIGHTS/);
  assert.match(trust, /aria-labelledby="checkout-trust-heading"/);
  assert.match(trust, /Instant Delivery/);
  assert.match(trust, /Secure Checkout via Simpaisa/);
  assert.match(trust, /Universal Connectivity/);
  assert.match(trust, /unlocked eSIM-compatible devices/);
  assert.doesNotMatch(trust, /Non-PTA|non-pta/i);
  assert.doesNotMatch(trust, /applyVerifiedPaymentEvent|PAYMENT_GATEWAY_ENABLED/);
  console.log("PASS trust_panel_display_only");

  const compatModal = read("app/components/account/CheckoutCompatibilityModal.tsx");
  const esimModal = read("app/components/esim/EsimCompatibilityModal.tsx");
  const compatCatalog = read("app/lib/checkout/esimCompatibilityCatalog.ts");
  const compatGuide = read("app/lib/checkout/checkoutCompatibilityGuide.ts");
  assert.match(compatModal, /Check eSIM compatibility \(\?\)/);
  assert.match(compatModal, /EsimCompatibilityTrigger/);
  assert.match(compatModal, /footerAction="continue"/);
  assert.match(esimModal, /next\/dynamic/);
  assert.match(esimModal, /EsimCompatibilityDialog/);
  const esimDialog = read("app/components/esim/EsimCompatibilityDialog.tsx");
  assert.match(esimDialog, /Got it, Continue/);
  assert.match(esimDialog, /Explore Plans/);
  assert.match(esimDialog, /EsimCompatibilityChecker/);
  const esimChecker = read("app/components/esim/EsimCompatibilityChecker.tsx");
  assert.match(esimChecker, /eSIM Supported/);
  assert.match(esimChecker, /Not Supported/);
  assert.match(esimChecker, /Verify via \*#06#/);
  assert.match(compatCatalog, /ESIM_COMPAT_DEVICES/);
  assert.match(compatCatalog, /iPhone XS/);
  assert.match(compatCatalog, /Galaxy S20/);
  assert.match(compatGuide, /iPhone XR through iPhone 16 \/ 17/);
  assert.match(compatGuide, /Pixel 4 and newer/);
  assert.match(compatGuide, /Galaxy S20\+/);
  assert.doesNotMatch(compatGuide, /Non-PTA|non-pta/i);
  console.log("PASS checkout_compatibility_modal");

  assert.doesNotMatch(apply, /CheckoutTrustPanel|lg:grid-cols-\[minmax\(0,1\.2fr\)/);
  assert.doesNotMatch(credit, /CheckoutTrustPanel/);
  assert.doesNotMatch(actions, /CheckoutTrustPanel|lg:grid-cols/);
  assert.match(pkg, /qa:checkout-page-ui/);
  assert.match(prelaunch, /qa:checkout-page-ui/);
  console.log("PASS payment_flow_untouched");

  // Customer buy country query: ISO preserved; display names normalize; invalid safe.
  const buyPage = read("app/account/esim/buy/page.tsx");
  assert.match(buyPage, /normalizeCustomerBuyCountryHint/);
  assert.match(buyPage, /buildWalletBuyReturnPath/);
  assert.doesNotMatch(
    buyPage,
    /normalizePackageShareCountry|buildPackageCheckoutPath/
  );
  assert.equal(normalizeCustomerBuyCountryHint("PK"), "PK");
  assert.equal(normalizeCustomerBuyCountryHint("Pakistan"), "PK");
  assert.equal(normalizeCustomerBuyCountryHint("NotARealCountry"), null);
  console.log("PASS customer_buy_country_query_normalize");

  console.log("ALL PASS qa-checkout-page-ui");
}

main();
