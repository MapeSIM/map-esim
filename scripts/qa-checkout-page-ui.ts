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
  assert.match(confirm, /Payment method/);
  assert.match(confirm, /Order summary/);
  assert.match(confirm, /Buy eSIM with Wallet/);
  assert.match(confirm, /Continue to Secure Payment/);
  assert.match(confirm, /confirmWalletEsimPurchaseAction/);
  assert.match(confirm, /setWalletPurchaseFundingChoiceAction/);
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
  console.log("PASS guest_checkout_two_column");

  assert.match(trust, /HOME_TRUST_ITEMS/);
  assert.match(trust, /aria-labelledby="checkout-trust-heading"/);
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
