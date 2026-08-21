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
  CUSTOMER_PURCHASE_PROCESSING_MESSAGE,
  CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE,
} from "../app/lib/esim/customerPurchaseStatusMessaging";
import {
  resolveEsimPaymentReturnKind,
} from "../app/lib/esim/esimPurchasePaymentReturnState";
import {
  ESIM_PURCHASE_PAYMENT_CANCEL_PATH,
  ESIM_PURCHASE_PAYMENT_RETURN_PATH,
  esimPurchasePaymentCancelPath,
  esimPurchasePaymentReturnPath,
  parsePaymentAttemptId,
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
  const returnAttemptPage = read(
    "app/account/esim/buy/payment/return/[attemptId]/page.tsx"
  );
  const cancelPage = read("app/account/esim/buy/payment/cancel/page.tsx");
  const cancelAttemptPage = read(
    "app/account/esim/buy/payment/cancel/[attemptId]/page.tsx"
  );
  const pathsSrc = read("app/lib/payments/safepayCheckoutPaths.ts");
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
  assert.match(
    read("app/lib/esim/esimPurchasePaymentApply.ts"),
    /splitReservationDebitIdempotencyKey/
  );
  assert.match(
    read("app/lib/esim/esimPurchasePaymentApply.ts"),
    /deliverCompletedWalletPurchaseInstallEmail/
  );
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
  assert.match(actions, /Must stay outside try\/catch/);
  assert.match(actions, /NEXT_REDIRECT/);
  // redirect() must not be inside the startEsimPurchaseHostedCheckout try/catch.
  {
    const gatewayStart = actions.indexOf("startEsimPurchaseHostedCheckout({");
    const firstRedirect = actions.indexOf("redirect(checkout.checkoutUrl)");
    const catchAfterStart = actions.indexOf("} catch (error) {", gatewayStart);
    assert.ok(gatewayStart >= 0 && firstRedirect >= 0 && catchAfterStart >= 0);
    assert.ok(
      firstRedirect > catchAfterStart,
      "redirect(checkoutUrl) must follow the checkout try/catch, not sit inside it"
    );
  }
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
  assert.equal(
    esimPurchasePaymentReturnPath("cmsjdsxm2001rtti0bna3w66f"),
    "/account/esim/buy/payment/return/cmsjdsxm2001rtti0bna3w66f"
  );
  assert.equal(
    esimPurchasePaymentCancelPath("cmsjdsxm2001rtti0bna3w66f"),
    "/account/esim/buy/payment/cancel/cmsjdsxm2001rtti0bna3w66f"
  );
  assert.equal(
    parsePaymentAttemptId(
      "cmsjdsxm2001rtti0bna3w66f?tracker=track_ec118420-b4a0-45fb-a6ac-2f44a8ad8347"
    ),
    "cmsjdsxm2001rtti0bna3w66f"
  );
  assert.match(pathsSrc, /parsePaymentAttemptId/);
  assert.match(pathsSrc, /must not include a query string/);
  assert.equal(
    resolveEsimPaymentReturnKind({
      purchaseStatus: "COMPLETED",
      attemptStatus: "PAYMENT_CONFIRMED",
    }),
    "completed"
  );
  assert.equal(
    resolveEsimPaymentReturnKind({
      purchaseStatus: "FUNDED",
      attemptStatus: "PAYMENT_CONFIRMED",
    }),
    "verified"
  );
  assert.equal(
    resolveEsimPaymentReturnKind({
      purchaseStatus: "PROVIDER_PENDING",
      attemptStatus: "PAYMENT_CONFIRMED",
    }),
    "verified"
  );
  assert.equal(
    resolveEsimPaymentReturnKind({
      purchaseStatus: "AWAITING_GATEWAY_PAYMENT",
      attemptStatus: "PAYMENT_PENDING",
    }),
    "pending"
  );
  assert.equal(
    resolveEsimPaymentReturnKind({
      purchaseStatus: "READY",
      attemptStatus: "FAILED",
    }),
    "not_completed"
  );
  assert.equal(
    resolveEsimPaymentReturnKind({
      purchaseStatus: "READY",
      attemptStatus: "CANCELLED",
    }),
    "not_completed"
  );
  assert.equal(
    resolveEsimPaymentReturnKind({
      purchaseStatus: "READY",
      attemptStatus: "EXPIRED",
    }),
    "not_completed"
  );
  assert.equal(
    resolveEsimPaymentReturnKind({
      purchaseStatus: "RECONCILIATION_REQUIRED",
      attemptStatus: "PAYMENT_CONFIRMED",
    }),
    "under_review"
  );
  assert.equal(
    resolveEsimPaymentReturnKind({
      purchaseStatus: "COMPLETED",
      attemptStatus: "FAILED",
    }),
    "completed"
  );
  console.log("PASS return_kind_mapping");

  assert.match(returnPage, /parsePaymentAttemptId/);
  assert.match(returnPage, /void query\.tracker/);
  assert.match(returnPage, /getOwnedEsimPurchasePaymentAttempt/);
  assert.match(returnPage, /resolveEsimPaymentReturnKind/);
  assert.match(returnPage, /esimPurchasePaymentSuccessHref/);
  assert.match(returnAttemptPage, /parsePaymentAttemptId/);
  assert.match(returnAttemptPage, /getOwnedEsimPurchasePaymentAttempt/);
  assert.match(returnAttemptPage, /resolveEsimPaymentReturnKind/);
  assert.match(returnAttemptPage, /kind === "completed"/);
  assert.match(
    read("app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView.tsx"),
    /Payment processing/
  );
  assert.match(
    read("app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView.tsx"),
    /does not confirm payment/
  );
  assert.match(
    read("app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView.tsx"),
    /Payment not completed/
  );
  assert.match(
    read("app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView.tsx"),
    /Payment verified/
  );
  assert.match(
    read("app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView.tsx"),
    /CUSTOMER_PURCHASE_PROCESSING_MESSAGE/
  );
  assert.match(
    read("app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView.tsx"),
    /CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE/
  );
  assert.equal(
    CUSTOMER_PURCHASE_PROCESSING_MESSAGE,
    "Your payment is confirmed. Your eSIM is being prepared. We'll notify you once it's ready."
  );
  assert.equal(
    CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE,
    "Your payment is under review. Please do not make another purchase. We'll update you once the review is complete."
  );
  assert.match(
    read("app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView.tsx"),
    /Refresh status/
  );
  assert.doesNotMatch(returnPage, /confirmWalletEsimPurchase|applyVerifiedTopup|executeCreditCheckout/);
  assert.doesNotMatch(returnAttemptPage, /confirmWalletEsimPurchase|applyVerifiedTopup|executeCreditCheckout/);
  assert.doesNotMatch(returnPage, /prisma\.(wallet|order)|reserveWalletPurchaseFunds/);
  assert.doesNotMatch(returnAttemptPage, /prisma\.(wallet|order)|reserveWalletPurchaseFunds/);
  assert.doesNotMatch(returnPage, /fetchTrackerStatus|fetchPaymentStatus|applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(returnAttemptPage, /fetchTrackerStatus|fetchPaymentStatus|applyVerifiedEsimPurchasePaymentEvent/);
  assert.match(cancelPage, /parsePaymentAttemptId/);
  assert.match(cancelPage, /getOwnedEsimPurchasePaymentAttempt/);
  assert.match(cancelPage, /maybeReleasePendingGatewayReservation/);
  assert.match(cancelAttemptPage, /maybeReleasePendingGatewayReservation/);
  assert.match(
    read("app/account/esim/buy/payment/cancel/EsimPurchasePaymentCancelView.tsx"),
    /Payment not completed/
  );
  assert.match(
    read("app/account/esim/buy/payment/cancel/EsimPurchasePaymentCancelView.tsx"),
    /Back to checkout/
  );
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
  // Completed DIRECT_PAYMENT must resolve on success (no 404 after Back to checkout).
  assert.match(readSrc, /isCustomerCompletedPurchaseFundingSource/);
  assert.match(
    read("app/account/esim/buy/success/page.tsx"),
    /getCompletedWalletPurchase/
  );
  console.log("PASS awaiting_gateway_can_resume_checkout");

  assert.match(adapter, /resumeSafepayHostedCheckout/);
  assert.match(adapter, /assertSafePaymentReturnPath/);
  assert.match(adapter, /Never logs tokens or full URL/);
  assert.match(urls, /assertSafePaymentReturnPath/);
  assert.match(http, /params\.set\("source", "hosted"\)/);
  assert.match(http, /params\.set\("environment", environment\)/);
  assert.match(http, /this\.config\.environment/);
  assert.match(http, /source:\s*"map-esim"/);
  assert.match(http, /order_id:\s*orderId/);
  assert.match(http, /entry_mode:\s*"raw"/);
  assert.match(http, /include_fees:\s*false/);
  assert.match(http, /"x-sfpy-merchant-secret"/);
  assert.match(
    read("app/lib/payments/safepayPolicy.ts"),
    /sandbox\.api\.getsafepay\.com\/embedded/
  );
  assert.match(
    read("app/lib/payments/safepayPolicy.ts"),
    /getsafepay\.com\/embedded/
  );
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
