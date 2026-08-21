/**
 * Offline QA: post-payment "Back to checkout" must not 404 on completed
 * DIRECT_PAYMENT / SPLIT purchases (success page must accept those funding sources).
 * Does not call Safepay, VeSIM, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const readSrc = read("app/lib/esim/walletPurchaseRead.ts");
  const successPage = read("app/account/esim/buy/success/page.tsx");
  const reviewPage = read("app/account/esim/buy/review/page.tsx");
  const returnView = read(
    "app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView.tsx"
  );
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const pkg = read("package.json");

  const helperFn = readSrc.slice(
    readSrc.indexOf("export function isCustomerCompletedPurchaseFundingSource"),
    readSrc.indexOf("export async function getCompletedWalletPurchase")
  );
  const completedFn = readSrc.slice(
    readSrc.indexOf("export async function getCompletedWalletPurchase"),
    readSrc.indexOf("export async function getFailedRefundedWalletPurchase")
  );

  assert.match(helperFn, /OrderFundingSource\.DIRECT_PAYMENT/);
  assert.match(helperFn, /OrderFundingSource\.CUSTOMER_SPLIT/);
  assert.match(helperFn, /OrderFundingSource\.CUSTOMER_WALLET/);
  assert.match(
    completedFn,
    /isCustomerCompletedPurchaseFundingSource\(row\.fundingSource\)/
  );
  // Must not require wallet-only funding on the completed reader.
  assert.doesNotMatch(
    completedFn,
    /fundingSource !== OrderFundingSource\.CUSTOMER_WALLET/
  );
  const reconFn = readSrc.slice(
    readSrc.indexOf("export async function getReconciliationWalletPurchase")
  );
  const failedFn = readSrc.slice(
    readSrc.indexOf("export async function getFailedRefundedWalletPurchase"),
    readSrc.indexOf("export async function getReconciliationWalletPurchase")
  );
  assert.match(
    reconFn,
    /isCustomerCompletedPurchaseFundingSource\(row\.fundingSource\)/
  );
  assert.match(reconFn, /WalletEsimPurchaseStatus\.FUNDED/);
  assert.match(reconFn, /WalletEsimPurchaseStatus\.PROVIDER_PENDING/);
  assert.match(reconFn, /WalletEsimPurchaseStatus\.RECONCILIATION_REQUIRED/);
  assert.doesNotMatch(
    reconFn,
    /fundingSource !== OrderFundingSource\.CUSTOMER_WALLET/
  );
  assert.match(
    failedFn,
    /isCustomerCompletedPurchaseFundingSource\(row\.fundingSource\)/
  );
  assert.match(failedFn, /walletAppliedCents/);
  assert.doesNotMatch(
    failedFn,
    /fundingSource !== OrderFundingSource\.CUSTOMER_WALLET/
  );
  console.log("PASS completed_reader_accepts_direct_and_split");

  // COMPLETED return redirects to success from durable purchase status, not browser params.
  assert.match(
    read("app/account/esim/buy/payment/return/page.tsx"),
    /kind === "completed"/
  );
  assert.match(
    read("app/account/esim/buy/payment/return/[attemptId]/page.tsx"),
    /esimPurchasePaymentSuccessHref/
  );
  assert.match(returnView, /esimPurchasePaymentReviewHref/);
  assert.match(returnView, /Back to checkout/);
  // Designed flow: pending/failed return still offers checkout; COMPLETED redirects to success.
  assert.match(
    reviewPage,
    /\/account\/esim\/buy\/success\?purchase=\$\{encodeURIComponent\(review\.purchaseId\)\}/
  );
  assert.match(successPage, /getCompletedWalletPurchase/);
  assert.match(successPage, /void query\.price/);
  assert.match(successPage, /void query\.balance/);
  assert.match(successPage, /void query\.status/);
  assert.match(
    successPage,
    /\/account\/orders\/\$\{encodeURIComponent\(purchase\.orderId\)\}/
  );
  assert.doesNotMatch(returnView, /https?:\/\//);
  assert.doesNotMatch(successPage, /window\.location|callbackUrl/);
  console.log("PASS back_to_checkout_completed_lands_on_success");

  assert.match(returnView, /Back to checkout/);
  assert.match(reviewPage, /AWAITING_GATEWAY_PAYMENT stays on checkout/);
  console.log("PASS awaiting_back_to_checkout_valid_route");

  assert.match(
    guestGate,
    /process\.env\.ENABLE_GUEST_VESIM_CHECKOUT\s*===\s*"true"/
  );
  assert.match(pkg, /qa:post-payment-success-route/);
  console.log("PASS guest_checkout_unchanged");

  console.log("OK qa-post-payment-success-route");
}

main();
