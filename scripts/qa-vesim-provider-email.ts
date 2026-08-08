/**
 * Offline QA: VeSIM provider customerEmail is always orders@mapesim.com;
 * MAP branded order email still uses the real customer address.
 * Does not call VeSIM, SMTP, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const credit = read("app/lib/vesim/creditCheckout.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const adminAssign = read("app/lib/esim/adminPackageAssignment.ts");
  const guestCheckout = read("app/api/vesim/checkout/route.ts");
  const quote = read("app/api/vesim/quote/route.ts");
  const confirmForm = read(
    "app/components/account/WalletPurchaseConfirmForm.tsx"
  );
  const pkg = read("package.json");

  assert.match(
    credit,
    /export const VESIM_PROVIDER_CUSTOMER_EMAIL = "orders@mapesim\.com"/
  );
  assert.match(
    credit,
    /customerEmail:\s*VESIM_PROVIDER_CUSTOMER_EMAIL/
  );
  // Provider body must not use options.customerEmail
  const bodySlice = credit.slice(
    credit.indexOf("body: JSON.stringify"),
    credit.indexOf("cache: \"no-store\"")
  );
  assert.match(bodySlice, /VESIM_PROVIDER_CUSTOMER_EMAIL/);
  assert.doesNotMatch(bodySlice, /options\.customerEmail|customerEmail,\s*$/m);
  console.log("PASS vesim_credit_checkout_uses_orders_inbox");

  // Wallet + gateway apply: one provider call; MAP email uses customer.email
  assert.match(wallet, /executeCreditCheckout\(/);
  assert.equal((wallet.match(/executeCreditCheckout\(/g) || []).length, 1);
  assert.match(
    wallet,
    /deliverOrderEmailAfterCheckout\(\{[\s\S]*?customerEmail:\s*customer\.email/
  );
  assert.match(apply, /executeCreditCheckout\(/);
  assert.match(
    apply,
    /persistAssignedOrder\(tx, \{[\s\S]*?customerEmail:\s*purchase\.customer\.email/
  );
  console.log("PASS wallet_and_gateway_paths_consistent");

  // Admin assignment direct fetch also uses relay; MAP email keeps customer.email
  assert.match(adminAssign, /VESIM_PROVIDER_CUSTOMER_EMAIL/);
  assert.match(
    adminAssign,
    /customerEmail:\s*VESIM_PROVIDER_CUSTOMER_EMAIL/
  );
  assert.match(
    adminAssign,
    /deliverOrderEmailAfterCheckout\(\{[\s\S]*?customerEmail:\s*customer\.email/
  );
  console.log("PASS admin_assignment_provider_relay");

  // Guest route: VeSIM gets relay; MAP delivery + response keep real customerEmail
  assert.match(
    guestCheckout,
    /customerEmail:\s*VESIM_PROVIDER_CUSTOMER_EMAIL/
  );
  assert.match(
    guestCheckout,
    /deliverOrderEmailAfterCheckout\(\{[\s\S]*?customerEmail,/
  );
  assert.doesNotMatch(
    guestCheckout.slice(
      guestCheckout.indexOf("body: JSON.stringify"),
      guestCheckout.indexOf("cache: \"no-store\"")
    ),
    /customerEmail,\s*$/m
  );
  console.log("PASS guest_checkout_provider_relay_map_keeps_customer");

  // Quote: when email is sent to VeSIM, use relay only
  assert.match(
    quote,
    /customerEmail:\s*VESIM_PROVIDER_CUSTOMER_EMAIL/
  );
  console.log("PASS quote_uses_relay_when_email_present");

  // Do not surface internal relay in customer checkout UI
  assert.doesNotMatch(confirmForm, /orders@mapesim\.com/);
  assert.doesNotMatch(wallet, /orders@mapesim\.com/);
  assert.doesNotMatch(apply, /orders@mapesim\.com/);
  console.log("PASS relay_not_exposed_in_customer_purchase_ui");

  assert.match(pkg, /qa:vesim-provider-email/);
  console.log("OK qa-vesim-provider-email");
}

main();
