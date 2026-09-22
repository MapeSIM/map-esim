/**
 * Offline QA for admin Simpaisa claim_failed → FUNDED → fulfill recovery.
 * Does not call live Simpaisa, VeSIM, or mutate databases.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateFundFulfillRecoveryEligibility,
  fundFulfillRecoveryBlockerLabel,
  isFundFulfillRecoverySourceType,
  RECOVER_PAYMENT_CREATE_ESIM_PHRASE,
} from "../app/lib/admin/reconciliationFundFulfillRecoveryShared";
import {
  parseCaseReason,
  parseConfirmPhrase,
} from "../app/lib/admin/reconciliationCaseShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function baseLocal(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: "wallet_purchase" as const,
    alreadyResolved: false,
    locked: true,
    lockedByAdminId: "admin_1",
    currentAdminId: "admin_1",
    status: "RECONCILIATION_REQUIRED",
    failureCategory: "funding_finalize_failed",
    failureCode: "claim_failed",
    orderId: null,
    providerOrderId: null,
    refundTransactionId: null,
    walletAppliedCents: 0,
    debitTransactionId: null,
    debitStatus: null,
    gatewayProvider: "SIMPAISA",
    gatewayPaymentRef: "876916163",
    chargeAmountMinor: 300,
    gatewayAmountCents: 1,
    providerRefreshInProgress: false,
    ...overrides,
  };
}

function main() {
  const shared = read(
    "app/lib/admin/reconciliationFundFulfillRecoveryShared.ts"
  );
  const service = read("app/lib/admin/reconciliationFundFulfillRecovery.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const management = read("app/lib/admin/reconciliationCaseManagement.ts");
  const actions = read("app/lib/admin/reconciliationCaseActions.ts");
  const panel = read("app/components/admin/CaseManagementPanel.tsx");
  const pkg = read("package.json");

  assert.equal(
    RECOVER_PAYMENT_CREATE_ESIM_PHRASE,
    "RECOVER PAYMENT AND CREATE ESIM"
  );
  assert.equal(
    parseConfirmPhrase(
      "RECOVER PAYMENT AND CREATE ESIM",
      RECOVER_PAYMENT_CREATE_ESIM_PHRASE
    ).ok,
    true
  );
  assert.equal(
    parseConfirmPhrase(
      "recover payment and create esim",
      RECOVER_PAYMENT_CREATE_ESIM_PHRASE
    ).ok,
    false
  );
  assert.equal(parseCaseReason("").ok, false);
  assert.equal(parseCaseReason("ab").ok, false);
  assert.equal(
    parseCaseReason("Simpaisa paid; claim_failed; create eSIM").ok,
    true
  );
  console.log("PASS confirmation_phrase_and_reason");

  assert.equal(isFundFulfillRecoverySourceType("wallet_purchase"), true);
  assert.equal(isFundFulfillRecoverySourceType("partner_purchase"), false);
  assert.equal(isFundFulfillRecoverySourceType("assignment"), false);

  const ok = evaluateFundFulfillRecoveryEligibility(baseLocal());
  assert.equal(ok.allowed, true);
  assert.equal(ok.mode, "fund_and_fulfill");
  assert.equal(ok.alreadyCompleted, false);

  const fulfillOnly = evaluateFundFulfillRecoveryEligibility(
    baseLocal({
      status: "FUNDED",
      failureCategory: null,
      failureCode: null,
    })
  );
  assert.equal(fulfillOnly.allowed, true);
  assert.equal(fulfillOnly.mode, "fulfill_only");

  const already = evaluateFundFulfillRecoveryEligibility(
    baseLocal({
      status: "COMPLETED",
      orderId: "ord_1",
      providerOrderId: "PO-1",
      failureCategory: null,
      failureCode: null,
    })
  );
  assert.equal(already.allowed, true);
  assert.equal(already.alreadyCompleted, true);

  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({ alreadyResolved: true })
    ).blockers.includes("already_resolved")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({ locked: false })
    ).blockers.includes("case_unlocked")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({ lockedByAdminId: "other" })
    ).blockers.includes("lock_not_owned")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({ sourceType: "assignment" as never })
    ).blockers.includes("unsupported_source")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({ gatewayProvider: "SAFEPAY" })
    ).blockers.includes("not_simpaisa_provider")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({ gatewayPaymentRef: "" })
    ).blockers.includes("missing_gateway_payment_ref")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({ providerOrderId: "PO-1" })
    ).blockers.includes("provider_order_already_present")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({ orderId: "ord_1" })
    ).blockers.includes("local_order_already_present")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({
        failureCategory: "local_finalize_failed",
        failureCode: "order_persist_error",
      })
    ).blockers.includes("not_claim_failed_funding_signal")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({
        walletAppliedCents: 500,
        debitTransactionId: null,
        debitStatus: null,
      })
    ).blockers.includes("wallet_reservation_missing")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({
        walletAppliedCents: 500,
        debitTransactionId: "debit_1",
        debitStatus: "FAILED",
      })
    ).blockers.includes("wallet_reservation_released")
  );
  assert.equal(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({
        walletAppliedCents: 500,
        debitTransactionId: "debit_1",
        debitStatus: "PENDING",
      })
    ).allowed,
    true
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({ refundTransactionId: "r1" })
    ).blockers.includes("refund_present")
  );
  assert.ok(
    evaluateFundFulfillRecoveryEligibility(
      baseLocal({ status: "PROVIDER_PENDING" })
    ).blockers.includes("not_fund_fulfill_recovery_state")
  );
  assert.ok(
    fundFulfillRecoveryBlockerLabel("inquiry_not_confirmed").length > 5
  );
  console.log("PASS local_eligibility_gates");

  assert.match(service, /assertSameOriginAdminRequest/);
  assert.match(service, /assertActiveAdmin|role !== Role\.ADMIN/);
  assert.match(service, /RECOVER_PAYMENT_CREATE_ESIM_PHRASE/);
  assert.match(service, /consumeRateLimit/);
  assert.match(service, /validateSimpaisaAuthoritativeInquiry/);
  assert.match(service, /inquireTransaction|inquireFn/);
  assert.match(service, /fulfillFundedEsimPurchase/);
  assert.match(service, /WalletEsimPurchaseStatus\.FUNDED/);
  assert.match(service, /reconciliation\.fund_fulfill_recovered/);
  assert.match(service, /reconciliation\.case_action_blocked/);
  assert.match(apply, /export async function fulfillFundedEsimPurchase/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /recoverFundedEsimFulfillmentAction/);
  assert.match(actions, /assertAdminPermission\(admin\.id, "RECONCILIATION"\)/);
  assert.match(management, /fundFulfillRecoveryAllowed/);
  console.log("PASS auth_inquire_fulfill_wiring");

  assert.doesNotMatch(service, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(service, /applyVerifiedPaymentEvent/);
  assert.doesNotMatch(service, /formData\.get\("amount/);
  assert.doesNotMatch(
    service,
    /data:\s*\{[\s\S]{0,200}reconciliationResolvedAt:\s*(now|new Date)|data:\s*\{[\s\S]{0,200}reconciliationLockedAt:\s*null/
  );
  assert.doesNotMatch(service, /reconciliationLockedByAdminId:\s*null/);
  assert.match(service, /webhookEventId unchanged|Leave webhookEventId/);
  console.log("PASS safety_no_webhook_authority_bypass");

  assert.doesNotMatch(service, /metadata:\s*\{[^}]*\biccid\b\s*:/i);
  assert.doesNotMatch(
    service,
    /metadata:[\s\S]{0,240}(activationCode|qrValue|emailBody|iccidEncrypted)/i
  );
  assert.doesNotMatch(service, /LPA:1\$/);
  console.log("PASS audit_sanitization");

  assert.match(panel, /Recover Payment & Create eSIM/);
  assert.match(panel, /fundFulfillRecoveryAllowed/);
  assert.match(panel, /RECOVER_PAYMENT_CREATE_ESIM_PHRASE/);
  assert.match(panel, /props\.fundFulfillRecoverySupported\s*\?/);
  assert.match(shared, /evaluateFundFulfillRecoveryEligibility/);
  assert.match(pkg, /qa:admin-recon-fund-fulfill-recovery/);
  assert.ok(
    existsSync(join(root, "scripts/qa-admin-recon-fund-fulfill-recovery.ts"))
  );
  console.log("PASS ui_and_package_script");

  console.log("ALL PASS qa-admin-recon-fund-fulfill-recovery");
}

main();
