/**
 * Offline QA for PG3-B Safepay Hosted Checkout creation + safe redirect foundation.
 * Does not call Safepay, mutate the database, reserve wallet, or create orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CARD_PAYMENT_UNAVAILABLE_MESSAGE,
  SPLIT_PAYMENT_UNAVAILABLE_MESSAGE,
} from "../app/lib/esim/walletPurchaseFormState";
import {
  ESIM_PURCHASE_PAYMENT_CANCEL_PATH,
  ESIM_PURCHASE_PAYMENT_RETURN_PATH,
} from "../app/lib/payments/safepayCheckoutPaths";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const gateway = read("app/lib/esim/esimPurchaseGatewayCheckout.ts");
  const actions = read("app/lib/esim/walletPurchaseActions.ts");
  const confirmForm = read(
    "app/components/account/WalletPurchaseConfirmForm.tsx"
  );
  const reviewPage = read("app/account/esim/buy/review/page.tsx");
  const returnPage = read("app/account/esim/buy/payment/return/page.tsx");
  const cancelPage = read("app/account/esim/buy/payment/cancel/page.tsx");
  const readSrc = read("app/lib/esim/walletPurchaseRead.ts");
  const adapter = read("app/lib/payments/safepayAdapter.ts");
  const http = read("app/lib/payments/safepayHttp.ts");
  const urls = read("app/lib/payments/safepayCheckoutUrls.ts");
  const disabled = read("app/lib/payments/disabledAdapter.ts");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const walletPurchase = read("app/lib/esim/walletPurchase.ts");
  const pkg = read("package.json");

  assert.match(gateway, /export async function startEsimPurchaseHostedCheckout/);
  assert.match(gateway, /isPaymentGatewayConfigured/);
  assert.match(gateway, /calculatePurchaseFunding/);
  assert.match(gateway, /gatewayAmountCents <= 0/);
  assert.match(gateway, /getActivePaymentAdapter/);
  assert.match(gateway, /createCheckoutSession/);
  assert.match(gateway, /purpose:\s*"ESIM_PURCHASE"/);
  assert.match(gateway, /chargeAmountMinor:\s*funding\.gatewayAmountCents/);
  assert.match(gateway, /chargeCurrency:\s*currency/);
  assert.match(gateway, /esimPurchasePaymentReturnPath/);
  assert.match(gateway, /esimPurchasePaymentCancelPath/);
  assert.match(gateway, /checkoutIdempotencyKey/);
  assert.match(gateway, /:esim-gw/);
  assert.match(gateway, /esimPurchasePaymentAttempt/);
  assert.match(gateway, /AWAITING_GATEWAY_PAYMENT/);
  assert.match(gateway, /resumeSafepayHostedCheckout/);
  assert.match(gateway, /reserveSplitWalletBeforeGatewayCheckout/);
  assert.match(gateway, /releaseSplitReservationAfterSessionFailure/);
  assert.doesNotMatch(gateway, /PARTIAL_WALLET_UNSUPPORTED/);
  assert.doesNotMatch(gateway, /confirmWalletEsimPurchase/);
  assert.doesNotMatch(gateway, /executeCreditCheckout/);
  console.log("PASS gateway_checkout_server_authoritative_and_split_reserve");

  assert.match(actions, /startEsimPurchaseHostedCheckout/);
  assert.match(actions, /isPaymentGatewayConfigured/);
  assert.match(actions, /CARD_PAYMENT_UNAVAILABLE_MESSAGE/);
  assert.doesNotMatch(actions, /SPLIT_PAYMENT_UNAVAILABLE_MESSAGE/);
  assert.match(actions, /void formData\.get\("walletAppliedCents"\)/);
  assert.match(actions, /void formData\.get\("gatewayAmountCents"\)/);
  assert.match(actions, /void formData\.get\("redirect_url"\)/);
  assert.match(actions, /void formData\.get\("cancel_url"\)/);
  assert.match(actions, /void formData\.get\("chargeAmount"\)/);
  assert.match(actions, /void formData\.get\("currency"\)/);
  assert.match(actions, /redirect\(checkout\.checkoutUrl\)/);
  assert.ok(
    actions.indexOf("startEsimPurchaseHostedCheckout") <
      actions.indexOf("confirmWalletEsimPurchase({")
  );
  console.log("PASS actions_gateway_only_branch_and_browser_money_rejected");

  assert.match(confirmForm, /Continue to Secure Payment/);
  assert.match(confirmForm, /paymentGatewayConfigured/);
  assert.match(confirmForm, /gatewayReady/);
  assert.match(confirmForm, /showGatewayUnavailable/);
  assert.match(
    confirmForm,
    /showGatewayUnavailable \? \([\s\S]*CARD_PAYMENT_UNAVAILABLE_MESSAGE/
  );
  assert.match(confirmForm, /CARD_PAYMENT_UNAVAILABLE_MESSAGE/);
  assert.match(confirmForm, /Buy eSIM with Wallet/);
  assert.match(confirmForm, /Continue to Payment/);
  assert.ok(!/createCheckoutSession/.test(confirmForm));
  console.log("PASS checkout_ui_wallet_gateway_partial_cases");

  assert.equal(
    ESIM_PURCHASE_PAYMENT_RETURN_PATH,
    "/account/esim/buy/payment/return"
  );
  assert.equal(
    ESIM_PURCHASE_PAYMENT_CANCEL_PATH,
    "/account/esim/buy/payment/cancel"
  );
  assert.match(returnPage, /Payment processing/);
  assert.match(returnPage, /does not confirm payment/);
  assert.match(returnPage, /void query\.tracker/);
  assert.match(returnPage, /getOwnedEsimPurchasePaymentAttempt/);
  assert.doesNotMatch(returnPage, /confirmWalletEsimPurchase|applyVerifiedTopup|executeCreditCheckout/);
  assert.doesNotMatch(returnPage, /prisma\.(wallet|order)|reserveWalletPurchaseFunds/);
  assert.match(cancelPage, /Payment not completed/);
  assert.match(cancelPage, /Back to checkout/);
  assert.match(cancelPage, /getOwnedEsimPurchasePaymentAttempt/);
  assert.match(cancelPage, /maybeReleasePendingGatewayReservation/);
  assert.doesNotMatch(cancelPage, /confirmWalletEsimPurchase|applyVerifiedTopup|executeCreditCheckout/);
  assert.doesNotMatch(cancelPage, /reserveWalletPurchaseFundsInTx/);
  console.log("PASS return_cancel_informational_no_funding_mutation");

  assert.match(reviewPage, /AWAITING_GATEWAY_PAYMENT stays on checkout/);
  assert.doesNotMatch(
    reviewPage,
    /AWAITING_GATEWAY_PAYMENT \|\|/
  );
  assert.match(readSrc, /AWAITING_GATEWAY_PAYMENT/);
  assert.match(readSrc, /DIRECT_PAYMENT/);
  console.log("PASS awaiting_gateway_can_resume_checkout");

  assert.match(adapter, /resumeSafepayHostedCheckout/);
  assert.match(adapter, /assertSafePaymentReturnPath/);
  assert.match(adapter, /Never logs tokens or full URL/);
  assert.match(urls, /assertSafePaymentReturnPath/);
  assert.match(http, /source:\s*"hosted"/);
  assert.match(http, /source:\s*"map-esim"/);
  assert.match(http, /order_id:\s*orderId/);
  assert.match(http, /entry_mode:\s*"raw"/);
  assert.match(http, /include_fees:\s*false/);
  assert.match(http, /"x-sfpy-merchant-secret"/);
  console.log("PASS safepay_session_and_hosted_url_contract");

  assert.match(disabled, /PAYMENT_GATEWAY_ENABLED/);
  assert.match(disabled, /getActivePaymentAdapter/);
  assert.match(disabled, /isPaymentGatewayConfigured/);
  assert.match(guestGate, /ENABLE_GUEST_VESIM_CHECKOUT === "true"/);
  assert.doesNotMatch(walletPurchase, /startEsimPurchaseHostedCheckout/);
  assert.equal(
    CARD_PAYMENT_UNAVAILABLE_MESSAGE,
    "Online payment will be available once payment setup is completed."
  );
  assert.equal(
    SPLIT_PAYMENT_UNAVAILABLE_MESSAGE,
    "Split payment is being finalized. Please deselect wallet to continue with card payment."
  );
  assert.match(pkg, /"qa:esim-purchase-hosted-checkout"/);
  console.log("PASS gateway_flag_and_guest_unchanged");

  // fetchTrackerStatus UNKNOWN mapping intentionally unused for funding authority.
  assert.match(http, /fetchTrackerStatus/);
  assert.doesNotMatch(returnPage, /fetchTrackerStatus|fetchPaymentStatus/);
  assert.doesNotMatch(cancelPage, /fetchTrackerStatus|fetchPaymentStatus/);
  assert.doesNotMatch(gateway, /fetchTrackerStatus|fetchPaymentStatus/);
  console.log("PASS status_fetch_not_used_for_funding_authority");

  console.log("ALL_PG3B_CHECKS_PASSED");
}

main();
