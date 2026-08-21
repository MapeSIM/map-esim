/**
 * Offline QA: customer unfinished-purchase inbox (Phase 2A Fix #3).
 * Display mapping and source checks only — no payment, VeSIM, or DB writes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOMER_PENDING_PURCHASE_STATUSES,
  CUSTOMER_PURCHASE_PROCESSING_MESSAGE,
  CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE,
  customerPendingPurchaseHref,
  resolveCustomerPendingPurchaseVisibility,
} from "../app/lib/esim/customerPurchaseStatusMessaging";
import { esimPurchaseReviewNeededHref } from "../app/lib/esim/esimPurchasePaymentReturnState";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.deepEqual([...CUSTOMER_PENDING_PURCHASE_STATUSES], [
    "READY",
    "AWAITING_GATEWAY_PAYMENT",
    "FUNDS_RESERVED",
    "FUNDED",
    "PROVIDER_PENDING",
    "RECONCILIATION_REQUIRED",
  ]);

  assert.equal(
    resolveCustomerPendingPurchaseVisibility("READY")?.action,
    "continue_checkout"
  );
  assert.equal(
    resolveCustomerPendingPurchaseVisibility("AWAITING_GATEWAY_PAYMENT")
      ?.action,
    "continue_checkout"
  );
  assert.equal(
    customerPendingPurchaseHref("READY", "p1"),
    "/account/esim/buy/review?purchase=p1"
  );
  assert.equal(
    customerPendingPurchaseHref("AWAITING_GATEWAY_PAYMENT", "p1"),
    "/account/esim/buy/review?purchase=p1"
  );

  for (const status of [
    "FUNDS_RESERVED",
    "FUNDED",
    "PROVIDER_PENDING",
  ] as const) {
    const vis = resolveCustomerPendingPurchaseVisibility(status);
    assert.equal(vis?.action, "view_status");
    assert.equal(vis?.ctaLabel, "View status");
    assert.equal(vis?.body, CUSTOMER_PURCHASE_PROCESSING_MESSAGE);
    assert.equal(
      customerPendingPurchaseHref(status, "p1"),
      "/account/esim/buy/review-needed?purchase=p1"
    );
  }

  const recon = resolveCustomerPendingPurchaseVisibility(
    "RECONCILIATION_REQUIRED"
  );
  assert.equal(recon?.action, "view_status");
  assert.equal(recon?.body, CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE);
  assert.equal(
    customerPendingPurchaseHref("RECONCILIATION_REQUIRED", "p1"),
    esimPurchaseReviewNeededHref("p1")
  );
  assert.equal(resolveCustomerPendingPurchaseVisibility("COMPLETED"), null);
  assert.equal(resolveCustomerPendingPurchaseVisibility("FAILED_REFUNDED"), null);
  console.log("PASS pending_status_action_mapping");

  const reader = read("app/lib/esim/walletPurchaseRead.ts");
  const listFn = reader.slice(
    reader.indexOf("export const CUSTOMER_PENDING_PURCHASES_LIMIT")
  );
  assert.match(listFn, /adminUserId:\s*null/);
  assert.match(listFn, /WalletEsimPurchaseStatus\.READY/);
  assert.match(listFn, /WalletEsimPurchaseStatus\.AWAITING_GATEWAY_PAYMENT/);
  assert.match(listFn, /WalletEsimPurchaseStatus\.FUNDS_RESERVED/);
  assert.match(listFn, /WalletEsimPurchaseStatus\.FUNDED/);
  assert.match(listFn, /WalletEsimPurchaseStatus\.PROVIDER_PENDING/);
  assert.match(listFn, /WalletEsimPurchaseStatus\.RECONCILIATION_REQUIRED/);
  assert.match(listFn, /Role\.CUSTOMER/);
  assert.doesNotMatch(listFn, /prepareWalletEsimPurchase|executeCreditCheckout|fulfillFundedEsimPurchase/);
  assert.doesNotMatch(listFn, /PAYMENT_GATEWAY_ENABLED|allowProduction/);
  console.log("PASS pending_reader_read_only");

  const accountPage = read("app/account/page.tsx");
  const ordersPage = read("app/account/orders/page.tsx");
  const buyPage = read("app/account/esim/buy/page.tsx");
  const listUi = read("app/components/account/CustomerPendingPurchases.tsx");
  assert.match(accountPage, /listCustomerPendingWalletPurchases/);
  assert.match(ordersPage, /listCustomerPendingWalletPurchases/);
  assert.match(buyPage, /listCustomerPendingWalletPurchases/);
  assert.match(listUi, /Continue checkout|\{purchase\.ctaLabel\}/);
  assert.match(listUi, /Unfinished purchases/);
  assert.doesNotMatch(accountPage, /prepareWalletEsimPurchase/);
  assert.doesNotMatch(ordersPage, /prepareWalletEsimPurchase|executeCreditCheckout/);
  assert.doesNotMatch(listUi, /prepareWalletEsimPurchase|executeCreditCheckout/);
  assert.match(buyPage, /newIdempotencyKey\(\)/);
  console.log("PASS account_surfaces_list_existing_only");

  const pkg = read("package.json");
  assert.match(pkg, /qa:customer-pending-purchases/);
  console.log("PASS package_script");

  console.log("ALL_QA_PASSED=customer-pending-purchases");
}

main();
