/**
 * Offline QA for PG4 verified Safepay funding + split wallet + exact-once VeSIM.
 * Does not call Safepay, VeSIM, or mutate the database.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifySafepayCardWebhookSignature } from "../app/lib/payments/safepayWebhookCrypto";
import { parseSafepayCardWebhookEvent } from "../app/lib/payments/safepayWebhookParse";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function sign(body: string, secret: string): string {
  return createHmac("sha512", secret).update(body, "utf8").digest("hex");
}

function main() {
  const secret = "whsec_qa_test_secret_value";
  const body = JSON.stringify({
    token: "evt_qa_1",
    type: "payment.succeeded",
    data: {
      tracker: "track_qa_1",
      success: true,
      amount: 10000,
      currency: "USD",
      metadata: { order_id: "attempt_qa_1" },
    },
  });
  const goodSig = sign(body, secret);
  assert.equal(
    verifySafepayCardWebhookSignature({
      rawBody: body,
      signatureHeader: goodSig,
      webhookSecret: secret,
    }),
    true
  );
  assert.equal(
    verifySafepayCardWebhookSignature({
      rawBody: body,
      signatureHeader: "deadbeef",
      webhookSecret: secret,
    }),
    false
  );
  assert.equal(
    verifySafepayCardWebhookSignature({
      rawBody: body + " ",
      signatureHeader: goodSig,
      webhookSecret: secret,
    }),
    false
  );
  console.log("PASS invalid_webhook_signature_rejected");

  const parsed = parseSafepayCardWebhookEvent({
    rawBody: body,
    headers: { "x-sfpy-signature": goodSig },
  });
  assert.ok(parsed);
  assert.equal(parsed!.signatureVerified, true);
  assert.equal(parsed!.paymentStatus, "confirmed");
  assert.equal(parsed!.providerPaymentRef, "track_qa_1");
  assert.equal(parsed!.eventId, "evt_qa_1");
  assert.equal(parsed!.chargeAmountMinor, 10000);
  assert.equal(parsed!.chargeCurrency, "USD");
  assert.equal(parsed!.paymentAttemptId, "attempt_qa_1");
  assert.equal(parsed!.purpose, "ESIM_PURCHASE");

  const failedBody = JSON.stringify({
    token: "evt_qa_fail",
    type: "payment.failed",
    data: { tracker: "track_qa_2", amount: 5000, currency: "USD" },
  });
  const failed = parseSafepayCardWebhookEvent({
    rawBody: failedBody,
    headers: {},
  });
  assert.ok(failed);
  assert.equal(failed!.paymentStatus, "failed");
  console.log("PASS webhook_event_parse_succeeded_and_failed");

  const route = read("app/api/payments/safepay/webhook/route.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const gateway = read("app/lib/esim/esimPurchaseGatewayCheckout.ts");
  const actions = read("app/lib/esim/walletPurchaseActions.ts");
  const confirmForm = read(
    "app/components/account/WalletPurchaseConfirmForm.tsx"
  );
  const returnPage = read("app/account/esim/buy/payment/return/page.tsx");
  const returnView = read(
    "app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView.tsx"
  );
  const cancelPage = read("app/account/esim/buy/payment/cancel/page.tsx");
  const cancelView = read(
    "app/account/esim/buy/payment/cancel/EsimPurchasePaymentCancelView.tsx"
  );
  const adapter = read("app/lib/payments/safepayAdapter.ts");
  const walletPurchase = read("app/lib/esim/walletPurchase.ts");
  const persist = read("app/lib/orders/persistAssignedOrder.ts");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const pkg = read("package.json");

  assert.match(route, /verifySafepayCardWebhookSignature/);
  assert.match(
    route,
    /applyVerifiedPaymentEvent|applyVerifiedEsimPurchasePaymentEvent/
  );
  assert.match(route, /status: 401/);
  assert.match(route, /Never logs raw body/);
  assert.match(route, /resolveSafepayWebhookConfig/);
  assert.match(route, /independently of PAYMENT_GATEWAY_ENABLED/);
  assert.doesNotMatch(route, /isPaymentGatewayConfigured|getActivePaymentAdapter/);
  console.log("PASS webhook_route_signature_before_mutation");

  assert.match(apply, /webhookEventId/);
  assert.match(apply, /duplicate_event/);
  assert.match(apply, /amount_currency_mismatch/);
  assert.match(apply, /PAYMENT_CONFIRMED/);
  assert.match(apply, /WalletEsimPurchaseStatus\.FUNDED/);
  assert.match(apply, /fulfillFundedEsimPurchase/);
  assert.match(apply, /deliverCompletedWalletPurchaseInstallEmail/);
  assert.match(apply, /reserveSplitWalletBeforeGatewayCheckout/);
  assert.match(apply, /splitReservationDebitIdempotencyKey/);
  assert.match(apply, /debit_\$\{purchaseId\}:\$\{priorCount \+ 1\}/);
  assert.match(apply, /reuse_pending/);
  assert.match(apply, /releaseSplitReservationAfterSessionFailure/);
  assert.match(apply, /restoreReady:\s*true/);
  assert.match(apply, /executeCreditCheckout/);
  assert.match(apply, /PROVIDER_PENDING/);
  assert.match(apply, /provider_declined_after_funding|local_finalize_failed/);
  assert.match(apply, /persistWalletPurchaseProviderObservation/);
  assert.match(apply, /runWalletPurchasePostCommitSideEffects/);
  assert.match(apply, /timeout:\s*15000/);
  assert.doesNotMatch(
    apply.slice(apply.indexOf("fulfillFundedEsimPurchaseAfterPayment")),
    /completePromoRedemptionInTx|completeRewardRedemptionInTx|awardCustomerPurchaseEarnInTx/
  );
  assert.match(apply, /maybeReleasePendingGatewayReservation/);
  assert.doesNotMatch(apply, /requestRefund\(/);
  // Completed split debit notifies post-commit; PENDING reservation must not.
  assert.match(
    apply,
    /completedDebitTransactionId[\s\S]*scheduleWalletTransactionNotification/
  );
  assert.match(
    apply,
    /releasedRefundId[\s\S]*scheduleWalletTransactionNotification/
  );
  assert.match(apply, /schedulePaymentFailureNotification/);
  assert.doesNotMatch(
    apply,
    /maybeReleasePendingGatewayReservation[\s\S]{0,200}schedulePaymentFailureNotification/
  );
  console.log("PASS funding_dedup_amount_split_vesim_contracts");

  // --- Launch-blocking success vs failure/cancel race contracts ---
  // A/B: funded/confirmed short-circuits before failure release path.
  assert.match(
    apply,
    /paymentAlreadyConfirmed[\s\S]*purchaseAlreadyFunded[\s\S]*event\.paymentStatus === "failed"/
  );
  assert.match(
    apply,
    /PAYMENT_CONFIRMED[\s\S]*FUNDED[\s\S]*PROVIDER_PENDING[\s\S]*COMPLETED/
  );
  assert.match(
    apply,
    /event\.paymentStatus === "failed"\s*\?\s*"ignored"\s*:\s*"duplicate"/
  );
  // C/D: failure release requires atomic attempt CAS; failed claim → no release.
  assert.match(
    apply,
    /async function releaseOnGatewayFailure[\s\S]*attemptClaim\.count !== 1[\s\S]*return;/
  );
  assert.match(
    apply,
    /releaseOnGatewayFailure[\s\S]*webhookEventId:\s*null[\s\S]*DRAFT[\s\S]*AWAITING_PAYMENT[\s\S]*PAYMENT_PENDING/
  );
  assert.match(apply, /if\s*\(\s*!claimed\s*\)/);
  // E/F: cancel eligibility + release share one transaction; restoreReady CAS.
  assert.match(
    apply,
    /maybeReleasePendingGatewayReservation[\s\S]*prisma\.\$transaction[\s\S]*findUnique[\s\S]*refundReservedFundsInTx/
  );
  assert.match(
    apply,
    /AWAITING_GATEWAY_PAYMENT[\s\S]*FUNDS_RESERVED[\s\S]*restoreReady:\s*true/
  );
  // Split late success after release → fund claim fails → reconciliation.
  assert.match(
    apply,
    /walletAppliedCents > 0[\s\S]*PURCHASE_FUND_CLAIM_FAILED/
  );
  assert.match(
    apply,
    /debitTransactionId:\s*purchaseNow\.debitTransactionId/
  );
  // Defense in wallet primitive.
  assert.match(
    walletPurchase,
    /restoreReady[\s\S]*AWAITING_GATEWAY_PAYMENT[\s\S]*FUNDS_RESERVED[\s\S]*already_refunded/
  );
  assert.match(
    walletPurchase,
    /claimedRelease\.count !== 1[\s\S]*already_refunded/
  );
  console.log("PASS success_failure_cancel_race_guards");

  assert.match(gateway, /reserveSplitWalletBeforeGatewayCheckout/);
  assert.match(gateway, /releaseSplitReservationAfterSessionFailure/);
  assert.doesNotMatch(gateway, /PARTIAL_WALLET_UNSUPPORTED/);
  assert.match(actions, /startEsimPurchaseHostedCheckout/);
  assert.doesNotMatch(actions, /SPLIT_PAYMENT_UNAVAILABLE_MESSAGE/);
  assert.match(confirmForm, /gatewayReady/);
  assert.doesNotMatch(confirmForm, /partialWalletSplit/);
  assert.match(confirmForm, /Continue to Secure Payment/);
  assert.match(confirmForm, /Buy eSIM with Wallet/);
  console.log("PASS split_unblocked_full_wallet_unchanged_ui");

  assert.match(returnView, /Payment processing/);
  assert.match(returnView, /Payment not completed/);
  assert.match(returnView, /Payment verified/);
  assert.match(returnPage, /parsePaymentAttemptId/);
  assert.match(returnPage, /resolveEsimPaymentReturnKind/);
  assert.doesNotMatch(returnPage, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(returnView, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.match(cancelPage, /maybeReleasePendingGatewayReservation/);
  assert.match(cancelView, /Payment not completed/);
  console.log("PASS browser_return_non_authoritative_cancel_safe_release");

  assert.match(adapter, /verifySafepayCardWebhookSignature/);
  assert.match(adapter, /parseSafepayCardWebhookEvent/);
  assert.match(walletPurchase, /release_gw_/);
  assert.match(
    walletPurchase,
    /release_gw_\$\{options\.purchaseId\}_\$\{purchase\.debitTransactionId\}/
  );
  assert.match(walletPurchase, /restoreReady/);
  assert.match(persist, /CUSTOMER_SPLIT/);
  assert.match(persist, /DIRECT_PAYMENT/);
  assert.match(guestGate, /ENABLE_GUEST_VESIM_CHECKOUT === "true"/);
  assert.match(pkg, /"qa:esim-purchase-pg4-funding"/);
  console.log("PASS adapter_wallet_guest_contracts");

  console.log("ALL_PG4_CHECKS_PASSED");
}

main();
