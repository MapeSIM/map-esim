/**
 * Offline QA for Admin Simpaisa pending payment investigation.
 * Does not call Simpaisa, mutate DB, fund purchases, or create VeSIM orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canOfferSimpaisaReservationRelease,
  decideSimpaisaPendingInvestigate,
  parsePendingPaymentVerifyReason,
  SIMPAISA_SUCCESS_WEBHOOK_REQUIRED_MESSAGE,
} from "../app/lib/admin/pendingSimpaisaPaymentInvestigateShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(
    existsSync(
      join(root, "app/lib/admin/pendingSimpaisaPaymentInvestigate.ts")
    )
  );
  assert.ok(
    existsSync(
      join(root, "app/lib/admin/pendingSimpaisaPaymentInvestigateActions.ts")
    )
  );
  assert.ok(
    existsSync(
      join(root, "app/lib/admin/pendingSimpaisaPaymentInvestigateShared.ts")
    )
  );
  assert.ok(
    existsSync(
      join(root, "app/components/admin/PendingSimpaisaInvestigateForm.tsx")
    )
  );

  const service = read("app/lib/admin/pendingSimpaisaPaymentInvestigate.ts");
  const actions = read(
    "app/lib/admin/pendingSimpaisaPaymentInvestigateActions.ts"
  );
  const shared = read(
    "app/lib/admin/pendingSimpaisaPaymentInvestigateShared.ts"
  );
  const form = read("app/components/admin/PendingSimpaisaInvestigateForm.tsx");
  const detail = read("app/admin/payments/pending/[attemptId]/page.tsx");
  const safepayService = read("app/lib/admin/pendingPaymentVerify.ts");
  const safepayActions = read("app/lib/admin/pendingPaymentVerifyActions.ts");
  const safepayForm = read("app/components/admin/PendingPaymentVerifyForm.tsx");
  const pkg = read("package.json");
  const webhook = read("app/api/payments/simpaisa/webhook/route.ts");
  const adapter = read("app/lib/payments/simpaisaAdapter.ts");

  // Identity mapping contracts from checkout + webhook.
  assert.match(adapter, /merchantUserKey\(input\)/);
  assert.match(adapter, /return input\.paymentAttemptId\.trim\(\)/);
  assert.match(
    webhook,
    /inquireTransaction\(\{\s*userKey:\s*event\.paymentAttemptId,\s*transactionId:\s*event\.providerPaymentRef/
  );
  assert.match(
    service,
    /userKey:\s*attempt\.id[\s\S]*transactionId:\s*attempt\.gatewayPaymentRef/
  );
  assert.match(shared, /userKey = EsimPurchasePaymentAttempt\.id/);
  console.log("PASS inquire_identity_mapping_matches_checkout_webhook");

  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(service, /assertActiveAdmin/);
  assert.match(service, /assertSameOriginAdminRequest/);
  assert.match(service, /consumeRateLimit/);
  assert.match(service, /Not authorized/);
  assert.doesNotMatch(actions, /requireRole\("CUSTOMER"\)/);
  console.log("PASS unauthorized_admin_cannot_investigate_without_admin_role");

  assert.match(service, /inquireTransaction|inquireFn/);
  assert.match(service, /validateSimpaisaAuthoritativeInquiry/);
  assert.match(service, /resolveSimpaisaInquiryConfig/);
  assert.doesNotMatch(service, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(actions, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(form, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(service, /status:\s*WalletEsimPurchaseStatus\.FUNDED/);
  assert.doesNotMatch(service, /PAYMENT_CONFIRMED/);
  assert.doesNotMatch(service, /fulfillFundedEsimPurchase/);
  assert.match(shared, /fundingApplied:\s*false/);
  assert.match(service, /fundingApplied:\s*false/);
  assert.match(form, /never marks a purchase funded/i);
  console.log("PASS check_never_funds_or_marks_paid");

  // Safepay path must remain intact and separate.
  assert.match(safepayActions, /verifyPendingGatewayPaymentAction/);
  assert.match(safepayForm, /Verify with Safepay|Verify payment/);
  assert.match(detail, /PendingPaymentVerifyForm/);
  assert.match(detail, /PendingSimpaisaInvestigateForm/);
  assert.match(detail, /gatewayProvider === "SIMPAISA"/);
  assert.doesNotMatch(
    safepayService,
    /checkSimpaisaPendingPaymentStatus|releaseSimpaisaPendingReservation/
  );
  console.log("PASS safepay_path_unchanged_and_branched");

  const confirmed = decideSimpaisaPendingInvestigate({
    inquiryStatus: "confirmed",
    validationOk: true,
    localUserKey: "attempt_abc",
    inquiryUserKey: "attempt_abc",
    localTransactionId: "txn_123",
    inquiryTransactionId: "txn_123",
    localExpectedAmountMinor: 1000,
    inquiryAmountMinor: 1000,
    localExpectedCurrency: "PKR",
    inquiryCurrency: "PKR",
    walletAppliedCents: 250,
  });
  assert.equal(confirmed.decision, "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED");
  assert.equal(confirmed.message, SIMPAISA_SUCCESS_WEBHOOK_REQUIRED_MESSAGE);
  assert.equal(confirmed.releaseEligible, false);
  assert.equal(
    canOfferSimpaisaReservationRelease({
      decision: confirmed.decision,
      walletAppliedCents: 250,
    }),
    false
  );
  console.log("PASS confirmed_success_webhook_required_never_releases");

  const failed = decideSimpaisaPendingInvestigate({
    inquiryStatus: "failed",
    localUserKey: "attempt_abc",
    inquiryUserKey: "attempt_abc",
    localTransactionId: "txn_123",
    inquiryTransactionId: "txn_123",
    localExpectedAmountMinor: 1000,
    inquiryAmountMinor: 1000,
    localExpectedCurrency: "PKR",
    inquiryCurrency: "PKR",
    walletAppliedCents: 250,
  });
  assert.equal(failed.decision, "VERIFIED_FAILED");
  assert.equal(failed.releaseEligible, true);
  assert.equal(
    canOfferSimpaisaReservationRelease({
      decision: failed.decision,
      walletAppliedCents: 250,
    }),
    true
  );
  assert.equal(
    canOfferSimpaisaReservationRelease({
      decision: failed.decision,
      walletAppliedCents: 0,
    }),
    false
  );
  console.log("PASS failed_terminal_offers_release_only_with_wallet");

  const pending = decideSimpaisaPendingInvestigate({
    inquiryStatus: "pending",
    localUserKey: "attempt_abc",
    inquiryUserKey: "attempt_abc",
    localTransactionId: "txn_123",
    inquiryTransactionId: "txn_123",
    localExpectedAmountMinor: 1000,
    inquiryAmountMinor: null,
    localExpectedCurrency: "PKR",
    inquiryCurrency: null,
    walletAppliedCents: 250,
  });
  assert.equal(pending.decision, "PENDING");
  assert.equal(pending.releaseEligible, false);
  console.log("PASS pending_never_releases");

  const amountMismatch = decideSimpaisaPendingInvestigate({
    inquiryStatus: "confirmed",
    validationOk: false,
    validationReason: "AMOUNT_MISMATCH",
    localUserKey: "attempt_abc",
    inquiryUserKey: "attempt_abc",
    localTransactionId: "txn_123",
    inquiryTransactionId: "txn_123",
    localExpectedAmountMinor: 1000,
    inquiryAmountMinor: 999,
    localExpectedCurrency: "PKR",
    inquiryCurrency: "PKR",
    walletAppliedCents: 250,
  });
  assert.equal(amountMismatch.decision, "AMOUNT_MISMATCH");
  assert.equal(amountMismatch.releaseEligible, false);
  console.log("PASS mismatch_never_releases_or_funds");

  // Two-step: check path must not call release helper; release path must.
  const checkFnStart = service.indexOf(
    "export async function checkSimpaisaPendingPaymentStatus"
  );
  const releaseFnStart = service.indexOf(
    "export async function releaseSimpaisaPendingReservation"
  );
  assert.ok(checkFnStart >= 0 && releaseFnStart > checkFnStart);
  const checkBody = service.slice(checkFnStart, releaseFnStart);
  const releaseBody = service.slice(releaseFnStart);
  assert.doesNotMatch(
    checkBody,
    /maybeReleasePendingGatewayReservation\s*\(|releaseFn\s*\?\?/
  );
  assert.match(
    releaseBody,
    /maybeReleasePendingGatewayReservation|releaseFn\s*\?\?/
  );
  assert.match(form, /Check Simpaisa Status/);
  assert.match(form, /Release Reservation/);
  assert.match(form, /releaseEligible/);
  console.log("PASS two_step_release_only_after_failed_check");

  assert.match(service, /SIMPAISA_PENDING_INVESTIGATE_AUDIT/);
  assert.match(service, /SIMPAISA_PENDING_RELEASE_AUDIT/);
  assert.doesNotMatch(service, /allowProduction:\s*true/);
  assert.match(pkg, /"qa:admin-pending-simpaisa-investigate"/);

  const reasonBad = parsePendingPaymentVerifyReason("no");
  assert.equal(reasonBad.ok, false);
  const reasonOk = parsePendingPaymentVerifyReason(
    "Missed Simpaisa webhook recovery check"
  );
  assert.equal(reasonOk.ok, true);

  console.log("ALL_ADMIN_SIMPAISA_PENDING_INVESTIGATE_CHECKS_PASSED");
}

main();
