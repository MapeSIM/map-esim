/**
 * Offline QA: checkout page presentation (layout only).
 * Does not mutate payments, APIs, wallets, or the checkout flow.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  assert.match(confirm, /stickyShowConfirm/);
  assert.match(confirm, /confirmStickyId/);
  assert.doesNotMatch(confirm, /Confirm the purchase above to continue/);
  // Mobile: hide duplicate Order summary; keep early Amount due + sticky due.
  assert.match(confirm, /hidden lg:block/);
  assert.match(confirm, /Desktop\/tablet: full order summary|Mobile uses early Amount due/);
  console.log("PASS logged_in_checkout_two_column");

  assert.match(review, />Checkout</);
  assert.match(review, /Review your plan and choose how to fund/);
  assert.match(review, /WalletPurchaseConfirmForm/);
  console.log("PASS review_page_heading_preserved");

  assert.match(guest, /lg:grid-cols-\[minmax\(0,1\.2fr\)_minmax\(18rem,0\.8fr\)\]/);
  assert.match(guest, /CheckoutTrustPanel/);
  assert.match(guest, /\/api\/vesim\/checkout/);
  assert.match(guest, /Purchase eSIM/);
  assert.match(guest, /customerEmail/);
  assert.match(guest, /guestCheckoutEnabled/);
  // Sprint B0: guest Pay CTA before trust (parity with logged-in).
  assert.match(guest, /Purchase eSIM[\s\S]*?CheckoutTrustPanel/);
  console.log("PASS guest_checkout_two_column");

  assert.match(trust, /HOME_TRUST_ITEMS/);
  assert.match(trust, /aria-labelledby="checkout-trust-heading"/);
  assert.match(trust, /Verified Payments|Support Available/);
  assert.match(trust, /return "\/support"/);
  // Compact trust: titles only (no description paragraphs under each item).
  assert.doesNotMatch(trust, /item\.description/);
  assert.match(trust, /grid-cols-1 gap-2 sm:grid-cols-2/);
  assert.doesNotMatch(trust, /applyVerifiedPaymentEvent|PAYMENT_GATEWAY_ENABLED/);
  console.log("PASS trust_panel_display_only");

  assert.doesNotMatch(apply, /CheckoutTrustPanel|lg:grid-cols-\[minmax\(0,1\.2fr\)/);
  assert.doesNotMatch(credit, /CheckoutTrustPanel/);
  assert.doesNotMatch(actions, /CheckoutTrustPanel|lg:grid-cols/);
  assert.match(pkg, /qa:checkout-page-ui/);
  assert.match(prelaunch, /qa:checkout-page-ui/);
  console.log("PASS payment_flow_untouched");

  console.log("ALL PASS qa-checkout-page-ui");
}

main();
