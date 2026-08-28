/**
 * Offline QA for PG5-A pending payment / missed-webhook recovery foundation.
 * Does not call Safepay, mutate DB, fund purchases, or create VeSIM orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decidePendingPaymentVerify,
  decideSimpaisaPendingPaymentVerify,
  shouldReleaseSplitReservationOnDecision,
  SUCCESS_WEBHOOK_REQUIRED_MESSAGE,
  parsePendingPaymentVerifyReason,
} from "../app/lib/admin/pendingPaymentVerifyShared";
import {
  parseSafepayReporterPaymentPayload,
  maskSafepayTrackerRef,
} from "../app/lib/payments/safepayReporterParse";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function sampleEvidence(overrides: Record<string, unknown> = {}) {
  return parseSafepayReporterPaymentPayload({
    data: {
      token: "track_ec118420-b4a0-45fb-a6ac-2f44a8ad8347",
      state: "TRACKER_ENDED",
      purchase_totals: {
        quote_amount: { amount: 252, currency: "USD" },
      },
      events: [{ type: "AUTHORIZATION" }, { type: "CAPTURE" }],
      metadata: {
        order_id: {
          value: "cmsjdsxm2001rtti0bna3w66f",
        },
      },
      ...overrides,
    },
  });
}

function main() {
  assert.ok(
    existsSync(join(root, "app/lib/admin/pendingPaymentVerify.ts"))
  );
  assert.ok(
    existsSync(join(root, "app/lib/admin/pendingPaymentVerifyActions.ts"))
  );
  assert.ok(
    existsSync(
      join(root, "app/components/admin/PendingPaymentVerifyForm.tsx")
    )
  );
  assert.ok(
    existsSync(join(root, "app/admin/payments/pending/page.tsx"))
  );
  assert.ok(
    existsSync(
      join(root, "app/admin/payments/pending/[attemptId]/page.tsx")
    )
  );

  const service = read("app/lib/admin/pendingPaymentVerify.ts");
  const actions = read("app/lib/admin/pendingPaymentVerifyActions.ts");
  const form = read("app/components/admin/PendingPaymentVerifyForm.tsx");
  const http = read("app/lib/payments/safepayHttp.ts");
  const shared = read("app/lib/admin/pendingPaymentVerifyShared.ts");
  const pkg = read("package.json");

  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(service, /assertActiveAdmin/);
  assert.match(service, /assertSameOriginAdminRequest/);
  assert.match(service, /consumeRateLimit/);
  assert.match(service, /Not authorized/);
  assert.doesNotMatch(actions, /requireRole\("CUSTOMER"\)/);
  console.log("PASS unauthorized_admin_cannot_verify_without_admin_role");

  assert.match(service, /fetchTrackerEvidence|lookupFn/);
  assert.match(service, /inquireTransaction|simpaisaLookupFn|defaultSimpaisaInquiry/);
  assert.match(http, /fetchTrackerEvidence/);
  assert.match(http, /parseSafepayReporterPaymentPayload/);
  assert.doesNotMatch(service, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(actions, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(form, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(service, /status:\s*WalletEsimPurchaseStatus\.FUNDED/);
  assert.doesNotMatch(service, /PAYMENT_CONFIRMED/);
  assert.match(shared, /SUCCESS_WEBHOOK_REQUIRED_MESSAGE/);
  assert.match(form, /SUCCESS_WEBHOOK_REQUIRED_MESSAGE/);
  assert.match(
    form,
    /never marks a purchase funded|Never marks a purchase funded|never creates an eSIM/i
  );
  console.log("PASS success_tracker_evidence_does_not_fund_without_webhook");

  const success = decidePendingPaymentVerify({
    localAttemptId: "cmsjdsxm2001rtti0bna3w66f",
    localGatewayPaymentRef: "track_ec118420-b4a0-45fb-a6ac-2f44a8ad8347",
    localExpectedAmountMinor: 252,
    localExpectedCurrency: "USD",
    evidence: sampleEvidence(),
  });
  assert.equal(success.decision, "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED");
  assert.equal(success.message, SUCCESS_WEBHOOK_REQUIRED_MESSAGE);
  assert.equal(
    shouldReleaseSplitReservationOnDecision(success.decision, 100),
    false
  );
  assert.equal(
    shouldReleaseSplitReservationOnDecision(success.decision, 0),
    false
  );
  console.log("PASS success_decision_never_releases_or_funds");

  const amountMismatch = decidePendingPaymentVerify({
    localAttemptId: "cmsjdsxm2001rtti0bna3w66f",
    localGatewayPaymentRef: "track_ec118420-b4a0-45fb-a6ac-2f44a8ad8347",
    localExpectedAmountMinor: 252,
    localExpectedCurrency: "USD",
    evidence: sampleEvidence({
      purchase_totals: {
        quote_amount: { amount: 999, currency: "USD" },
      },
    }),
  });
  assert.equal(amountMismatch.decision, "AMOUNT_MISMATCH");
  assert.equal(
    shouldReleaseSplitReservationOnDecision(amountMismatch.decision, 150),
    false
  );

  const currencyMismatch = decidePendingPaymentVerify({
    localAttemptId: "cmsjdsxm2001rtti0bna3w66f",
    localGatewayPaymentRef: "track_ec118420-b4a0-45fb-a6ac-2f44a8ad8347",
    localExpectedAmountMinor: 252,
    localExpectedCurrency: "USD",
    evidence: sampleEvidence({
      purchase_totals: {
        quote_amount: { amount: 252, currency: "PKR" },
      },
    }),
  });
  assert.equal(currencyMismatch.decision, "CURRENCY_MISMATCH");
  assert.equal(
    shouldReleaseSplitReservationOnDecision(currencyMismatch.decision, 150),
    false
  );

  const trackerMismatch = decidePendingPaymentVerify({
    localAttemptId: "cmsjdsxm2001rtti0bna3w66f",
    localGatewayPaymentRef: "track_other",
    localExpectedAmountMinor: 252,
    localExpectedCurrency: "USD",
    evidence: sampleEvidence(),
  });
  assert.equal(trackerMismatch.decision, "TRACKER_MISMATCH");
  assert.equal(
    shouldReleaseSplitReservationOnDecision(trackerMismatch.decision, 150),
    false
  );
  console.log("PASS mismatch_never_funds_or_releases");

  const failed = decidePendingPaymentVerify({
    localAttemptId: "cmsjdsxm2001rtti0bna3w66f",
    localGatewayPaymentRef: "track_ec118420-b4a0-45fb-a6ac-2f44a8ad8347",
    localExpectedAmountMinor: 252,
    localExpectedCurrency: "USD",
    evidence: sampleEvidence({
      state: "TRACKER_FAILED",
      events: [{ type: "AUTHORIZATION" }],
    }),
  });
  assert.equal(failed.decision, "VERIFIED_FAILED");
  assert.equal(
    shouldReleaseSplitReservationOnDecision(failed.decision, 150),
    true
  );
  assert.equal(
    shouldReleaseSplitReservationOnDecision(failed.decision, 0),
    false
  );
  assert.match(service, /maybeReleasePendingGatewayReservation/);
  assert.match(service, /shouldReleaseSplitReservationOnDecision/);
  assert.match(service, /PENDING_PAYMENT_RELEASE_AUDIT/);
  console.log("PASS terminal_failure_releases_split_reservation_once_candidate");

  // Idempotency: release primitive itself is exact-once; service may call it
  // repeatedly without inventing a second wallet mutation path.
  assert.match(service, /releaseFn \?\? maybeReleasePendingGatewayReservation/);
  assert.doesNotMatch(service, /balanceCents\s*:/);
  assert.doesNotMatch(service, /walletAccount\.update/);
  console.log("PASS repeated_release_uses_existing_exact_once_primitive");

  assert.equal(
    shouldReleaseSplitReservationOnDecision("VERIFIED_FAILED", 0),
    false
  );
  assert.equal(
    shouldReleaseSplitReservationOnDecision(
      "VERIFIED_CANCELLED_OR_EXPIRED",
      0
    ),
    false
  );
  console.log("PASS gateway_only_failure_does_not_touch_wallet");

  const unavailable = decidePendingPaymentVerify({
    localAttemptId: "cmsjdsxm2001rtti0bna3w66f",
    localGatewayPaymentRef: "track_ec118420-b4a0-45fb-a6ac-2f44a8ad8347",
    localExpectedAmountMinor: 252,
    localExpectedCurrency: "USD",
    providerUnavailable: true,
    evidence: null,
  });
  assert.equal(unavailable.decision, "PROVIDER_UNAVAILABLE");
  assert.equal(
    shouldReleaseSplitReservationOnDecision(unavailable.decision, 150),
    false
  );
  assert.match(service, /providerUnavailable/);
  console.log("PASS provider_lookup_failure_fails_closed");

  const parsedTopLevel = parseSafepayReporterPaymentPayload({
    data: {
      token: "track_abc123456789",
      state: "TRACKER_ENDED",
      purchase_totals: { quote_amount: { amount: 252, currency: "USD" } },
      events: [{ type: "CAPTURE" }],
      metadata: { order_id: { value: "attempt1" } },
    },
  });
  assert.ok(parsedTopLevel);
  assert.equal(parsedTopLevel?.status, "confirmed");
  assert.equal(parsedTopLevel?.quoteAmountMinor, 252);
  assert.equal(parsedTopLevel?.hasCaptureEvidence, true);
  assert.equal(maskSafepayTrackerRef("track_abc123456789").includes("…"), true);
  assert.ok(!maskSafepayTrackerRef("track_abc123456789").includes("123456789"));

  const reasonBad = parsePendingPaymentVerifyReason("no");
  assert.equal(reasonBad.ok, false);
  const reasonOk = parsePendingPaymentVerifyReason("Missed webhook recovery check");
  assert.equal(reasonOk.ok, true);

  assert.match(pkg, /"qa:admin-pending-payment-verify"/);
  assert.match(service, /fundingApplied:\s*false/);
  assert.match(shared, /fundingApplied:\s*false/);
  assert.doesNotMatch(service, /fulfillFundedEsimPurchase/);
  assert.match(service, /schedulePaymentFailureNotification/);
  assert.match(service, /VERIFIED_FAILED|VERIFIED_CANCELLED_OR_EXPIRED/);
  assert.doesNotMatch(
    service,
    /applyVerifiedEsimPurchasePaymentEvent[\s\S]{0,40}schedulePaymentFailureNotification/
  );
  console.log("PASS contracts_and_reporter_parse");

  const simpaisaSuccess = decideSimpaisaPendingPaymentVerify({
    localGatewayPaymentRef: "txn_simpaisa_1",
    localExpectedAmountMinor: 293000,
    localExpectedCurrency: "PKR",
    evidence: {
      status: "confirmed",
      providerTransactionId: "txn_simpaisa_1",
      chargeAmountMinor: 293000,
      chargeCurrency: "PKR",
    },
  });
  assert.equal(
    simpaisaSuccess.decision,
    "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED"
  );
  assert.equal(simpaisaSuccess.message, SUCCESS_WEBHOOK_REQUIRED_MESSAGE);
  assert.equal(
    shouldReleaseSplitReservationOnDecision(simpaisaSuccess.decision, 100),
    false
  );

  const simpaisaFailed = decideSimpaisaPendingPaymentVerify({
    localGatewayPaymentRef: "txn_simpaisa_1",
    localExpectedAmountMinor: 293000,
    localExpectedCurrency: "PKR",
    evidence: {
      status: "failed",
      providerTransactionId: "txn_simpaisa_1",
      chargeAmountMinor: 293000,
      chargeCurrency: "PKR",
    },
  });
  assert.equal(simpaisaFailed.decision, "VERIFIED_FAILED");
  assert.equal(
    shouldReleaseSplitReservationOnDecision(simpaisaFailed.decision, 150),
    true
  );

  const simpaisaMismatch = decideSimpaisaPendingPaymentVerify({
    localGatewayPaymentRef: "txn_simpaisa_1",
    localExpectedAmountMinor: 293000,
    localExpectedCurrency: "PKR",
    evidence: {
      status: "confirmed",
      providerTransactionId: "txn_other",
      chargeAmountMinor: 293000,
      chargeCurrency: "PKR",
    },
  });
  assert.equal(simpaisaMismatch.decision, "TRACKER_MISMATCH");
  console.log("PASS simpaisa_inquiry_never_funds");

  console.log("ALL_PG5A_CHECKS_PASSED");
}

main();
