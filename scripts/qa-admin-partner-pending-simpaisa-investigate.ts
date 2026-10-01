/**
 * Offline QA for Admin Partner Simpaisa pending payment investigation parity.
 * Does not call Simpaisa, mutate DB, or create VeSIM orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canOfferSimpaisaReservationRelease,
  decideSimpaisaPendingInvestigate,
  SIMPAISA_PARTNER_SUCCESS_APPLIED_MESSAGE,
  SIMPAISA_SUCCESS_WEBHOOK_REQUIRED_MESSAGE,
} from "../app/lib/admin/pendingSimpaisaPaymentInvestigateShared";
import {
  partnerEsimPurchaseMerchantUserKey,
  PARTNER_ESIM_PURCHASE_USER_KEY_PREFIX,
} from "../app/lib/partner/partnerEsimPurchasePaymentConstants";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(
    existsSync(join(root, "app/lib/admin/pendingSimpaisaPaymentInvestigate.ts"))
  );
  const service = read("app/lib/admin/pendingSimpaisaPaymentInvestigate.ts");
  const actions = read(
    "app/lib/admin/pendingSimpaisaPaymentInvestigateActions.ts"
  );
  const shared = read(
    "app/lib/admin/pendingSimpaisaPaymentInvestigateShared.ts"
  );
  const form = read("app/components/admin/PendingSimpaisaInvestigateForm.tsx");
  const dashboard = read("app/lib/admin/paymentDashboard.ts");
  const detail = read("app/admin/payments/[attemptId]/page.tsx");
  const pendingPage = read("app/admin/payments/pending/page.tsx");
  const pkg = read("package.json");

  // Eligible partner pending attempt surfaces investigate UI.
  assert.match(
    dashboard,
    /investigationAvailable:[\s\S]{0,120}isSimpaisa && isPaymentDashboardPendingAttemptStatus/
  );
  assert.match(detail, /ownerKind=\{detail\.ownerKind === "partner"/);
  assert.match(form, /ownerKind/);
  assert.match(pendingPage, /partner apply\s+path/i);
  console.log("PASS eligible_partner_pending_attempt_ui");

  // Identity: partner Inquire uses pesim_ merchant user key.
  assert.equal(
    partnerEsimPurchaseMerchantUserKey("attempt_abc"),
    `${PARTNER_ESIM_PURCHASE_USER_KEY_PREFIX}attempt_abc`
  );
  assert.match(service, /partnerEsimPurchaseMerchantUserKey\(partner\.id\)/);
  assert.match(service, /inquireUserKey:\s*partnerEsimPurchaseMerchantUserKey/);
  console.log("PASS partner_inquire_user_key_pesim_prefix");

  // Successful authoritative verification → existing partner apply (not generic mark paid).
  assert.match(service, /applyVerifiedPartnerEsimPurchasePaymentEvent/);
  assert.match(service, /purpose:\s*"PARTNER_ESIM_PURCHASE"/);
  assert.match(service, /signatureVerified:\s*true/);
  assert.match(service, /CONFIRMED_SUCCESS_APPLIED/);
  assert.match(shared, /SIMPAISA_PARTNER_SUCCESS_APPLIED_MESSAGE/);
  assert.equal(
    SIMPAISA_PARTNER_SUCCESS_APPLIED_MESSAGE.includes("existing partner"),
    true
  );
  assert.doesNotMatch(service, /markPaid|mark_paid|MARK_PAID/);
  // Browser markPaid is explicitly ignored — never an authority field.
  assert.match(actions, /formData\.get\("markPaid"\)/);
  assert.doesNotMatch(form, /Mark paid|name="markPaid"/i);
  console.log("PASS successful_authoritative_verification_uses_partner_apply");

  // Still-pending / failed / cancelled semantics via shared decisions.
  const pending = decideSimpaisaPendingInvestigate({
    inquiryStatus: "pending",
    localUserKey: "pesim_attempt_abc",
    inquiryUserKey: "pesim_attempt_abc",
    localTransactionId: "txn_123",
    inquiryTransactionId: "txn_123",
    localExpectedAmountMinor: 1000,
    inquiryAmountMinor: 1000,
    localExpectedCurrency: "PKR",
    inquiryCurrency: "PKR",
    walletAppliedCents: 250,
  });
  assert.equal(pending.decision, "PENDING");
  assert.equal(pending.releaseEligible, false);
  console.log("PASS still_pending_verification");

  const failed = decideSimpaisaPendingInvestigate({
    inquiryStatus: "failed",
    localUserKey: "pesim_attempt_abc",
    inquiryUserKey: "pesim_attempt_abc",
    localTransactionId: "txn_123",
    inquiryTransactionId: "txn_123",
    localExpectedAmountMinor: 1000,
    inquiryAmountMinor: 1000,
    localExpectedCurrency: "PKR",
    inquiryCurrency: "PKR",
    walletAppliedCents: 250,
  });
  assert.equal(failed.decision, "VERIFIED_FAILED");
  assert.equal(
    canOfferSimpaisaReservationRelease({
      decision: failed.decision,
      walletAppliedCents: 250,
    }),
    true
  );
  console.log("PASS failed_cancelled_provider_result_release_gate");

  const unavailable = decideSimpaisaPendingInvestigate({
    providerUnavailable: true,
    inquiryStatus: null,
    localUserKey: "pesim_attempt_abc",
    inquiryUserKey: null,
    localTransactionId: "txn_123",
    inquiryTransactionId: null,
    localExpectedAmountMinor: 1000,
    inquiryAmountMinor: null,
    localExpectedCurrency: "PKR",
    inquiryCurrency: null,
    walletAppliedCents: 250,
  });
  assert.equal(unavailable.decision, "PROVIDER_UNAVAILABLE");
  assert.equal(unavailable.releaseEligible, false);
  assert.match(service, /provider_unavailable/);
  assert.match(
    service,
    /Simpaisa Inquire is unavailable\. Reservation was not released/
  );
  console.log("PASS provider_network_error_does_not_release");

  const amountMismatch = decideSimpaisaPendingInvestigate({
    inquiryStatus: "confirmed",
    validationOk: false,
    validationReason: "AMOUNT_MISMATCH",
    localUserKey: "pesim_attempt_abc",
    inquiryUserKey: "pesim_attempt_abc",
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
  console.log("PASS amount_mismatch");

  // Duplicate / already-confirmed / stale eligibility guards.
  assert.match(service, /isPartnerApplyEligible/);
  assert.match(service, /webhookEventId/);
  assert.match(service, /AWAITING_GATEWAY_PAYMENT/);
  assert.match(service, /not_open_pending/);
  assert.match(service, /PARTNER_OPEN_ATTEMPT|PAYMENT_CONFIRMED/);
  console.log("PASS already_confirmed_and_stale_guards");

  // Split + full gateway: apply uses chargeAmountMinor ?? gatewayAmountCents.
  assert.match(service, /chargeAmountMinor \?\? .*gatewayAmountCents/);
  assert.match(service, /walletAppliedCents/);
  console.log("PASS split_and_full_gateway_amount_basis");

  // Duplicate wallet/fulfillment prevention via existing apply path.
  assert.match(service, /applyVerifiedPartnerEsimPurchasePaymentEvent/);
  assert.match(service, /eventId.*tracker.*responseCode|responseCode.*tracker/);
  assert.match(service, /applyDuplicate|duplicate:\s*applied\.duplicate/);
  assert.doesNotMatch(
    service,
    /prisma\.\$transaction\([\s\S]{0,200}inquireTransaction/
  );
  console.log("PASS duplicate_apply_and_no_http_inside_prisma_tx");

  // Security: admin + PAYMENTS_MANAGE + same-origin + rate limit.
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /assertAdminPermission\(admin\.id, "PAYMENTS_MANAGE"\)/);
  assert.match(service, /assertSameOriginAdminRequest/);
  assert.match(service, /consumeRateLimit/);
  assert.match(service, /assertActiveAdmin/);
  assert.match(service, /ignoreForgedBrowserAuthority|ownerKind/);
  assert.match(actions, /void formData\.get\("amount"\)/);
  assert.match(actions, /void formData\.get\("markPaid"\)/);
  console.log("PASS permission_same_origin_rate_limit");

  // Customer decision still webhook-required (unchanged).
  const customerConfirmed = decideSimpaisaPendingInvestigate({
    inquiryStatus: "confirmed",
    validationOk: true,
    localUserKey: "attempt_customer",
    inquiryUserKey: "attempt_customer",
    localTransactionId: "txn_c",
    inquiryTransactionId: "txn_c",
    localExpectedAmountMinor: 500,
    inquiryAmountMinor: 500,
    localExpectedCurrency: "PKR",
    inquiryCurrency: "PKR",
    walletAppliedCents: 0,
  });
  assert.equal(
    customerConfirmed.decision,
    "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED"
  );
  assert.equal(
    customerConfirmed.message,
    SIMPAISA_SUCCESS_WEBHOOK_REQUIRED_MESSAGE
  );
  assert.match(service, /ownerKind === "customer"[\s\S]{0,120}fundingApplied = false/);
  console.log("PASS customer_behavior_unchanged_webhook_required");

  assert.match(pkg, /"qa:admin-partner-pending-simpaisa-investigate"/);
  console.log("ALL_ADMIN_PARTNER_PENDING_SIMPAISA_INVESTIGATE_CHECKS_PASSED");
}

main();
