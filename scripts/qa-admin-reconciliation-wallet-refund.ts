/**
 * Offline QA for Phase 8G-B4 — confirmed-failure wallet refund recovery.
 * Never places VeSIM orders, creates new debits, finalizes orders, or writes ICCID.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateProviderRefundEvidence,
  evaluateWalletRefundLocalEligibility,
  isWalletRefundSourceType,
  parseCaseReason,
  parseConfirmPhrase,
  REFUND_WALLET_FUNDS_PHRASE,
  walletRefundBlockerLabel,
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
    fundingSource: "CUSTOMER_WALLET",
    orderId: null,
    orderStatus: null,
    providerOrderId: "PO-1",
    offerId: "offer_1",
    customerUserId: "cust_1",
    priceCents: 1500,
    debitAmountCents: 1500,
    debitStatus: "PENDING",
    debitTransactionId: "debit_1",
    refundTransactionId: null,
    fulfilmentIccidPresent: false,
    providerInstallDataPresent: false,
    providerRefreshInProgress: false,
    ...overrides,
  };
}

function main() {
  const shared = read("app/lib/admin/reconciliationCaseShared.ts");
  const service = read("app/lib/admin/reconciliationWalletRefund.ts");
  const walletPurchase = read("app/lib/esim/walletPurchase.ts");
  const management = read("app/lib/admin/reconciliationCaseManagement.ts");
  const actions = read("app/lib/admin/reconciliationCaseActions.ts");
  const panel = read("app/components/admin/CaseManagementPanel.tsx");
  const pkg = read("package.json");

  assert.equal(REFUND_WALLET_FUNDS_PHRASE, "REFUND WALLET FUNDS");
  assert.equal(
    parseConfirmPhrase("REFUND WALLET FUNDS", REFUND_WALLET_FUNDS_PHRASE).ok,
    true
  );
  assert.equal(
    parseConfirmPhrase("refund wallet funds", REFUND_WALLET_FUNDS_PHRASE).ok,
    false
  );
  assert.equal(parseCaseReason("").ok, false);
  assert.equal(parseCaseReason("ab").ok, false);
  assert.equal(parseCaseReason("Provider declined; restore reserved funds").ok, true);
  console.log("PASS confirmation_phrase_and_reason");

  assert.equal(isWalletRefundSourceType("wallet_purchase"), true);
  assert.equal(isWalletRefundSourceType("assignment"), false);
  assert.equal(isWalletRefundSourceType("iccid"), false);

  const ok = evaluateWalletRefundLocalEligibility(baseLocal());
  assert.equal(ok.allowed, true);
  assert.equal(ok.alreadyRefunded, false);

  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ alreadyResolved: true })
    ).blockers.includes("already_resolved")
  );
  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ locked: false })
    ).blockers.includes("case_unlocked")
  );
  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ lockedByAdminId: "other" })
    ).blockers.includes("lock_not_owned")
  );
  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ sourceType: "assignment" as never })
    ).blockers.includes("unsupported_source")
  );
  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ fundingSource: "COMPANY_FUNDED" })
    ).blockers.includes("not_customer_wallet_funded")
  );
  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ providerOrderId: "" })
    ).blockers.includes("missing_provider_reference")
  );
  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ debitTransactionId: null, debitStatus: null })
    ).blockers.includes("missing_debit_reservation")
  );
  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ debitAmountCents: 999 })
    ).blockers.includes("debit_amount_mismatch")
  );
  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ orderId: "ord_1", orderStatus: "COMPLETED" })
    ).blockers.includes("usable_local_order_exists")
  );
  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ fulfilmentIccidPresent: true })
    ).blockers.includes("fulfilment_iccid_present")
  );
  assert.ok(
    evaluateWalletRefundLocalEligibility(
      baseLocal({ refundTransactionId: "r1", status: "RECONCILIATION_REQUIRED" })
    ).blockers.includes("incomplete_or_conflicting_refund")
  );

  const already = evaluateWalletRefundLocalEligibility(
    baseLocal({
      status: "FAILED_REFUNDED",
      refundTransactionId: "r1",
    })
  );
  assert.equal(already.allowed, true);
  assert.equal(already.alreadyRefunded, true);
  console.log("PASS local_eligibility_gates");

  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      installDataPresent: "no",
      safeProviderState: "failed",
      hasExpectedOfferId: true,
    }).ok,
    true
  );
  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      installDataPresent: "no",
      safeProviderState: "cancelled",
      hasExpectedOfferId: true,
    }).ok,
    true
  );
  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      installDataPresent: "no",
      safeProviderState: "COMPLETED",
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      installDataPresent: "yes",
      safeProviderState: "failed",
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "NOT_FOUND",
      orderExists: "no",
      offerMatch: "unknown",
      installDataPresent: "unknown",
      hasExpectedOfferId: false,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "TIMEOUT",
      orderExists: "unknown",
      offerMatch: "unknown",
      installDataPresent: "unknown",
      hasExpectedOfferId: false,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "no",
      installDataPresent: "no",
      safeProviderState: "failed",
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderRefundEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      installDataPresent: "no",
      safeProviderState: "pending",
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  assert.ok(walletRefundBlockerLabel("provider_failure_not_conclusive").length > 5);
  console.log("PASS provider_failure_evidence_rules");

  assert.match(service, /assertSameOriginAdminRequest/);
  assert.match(service, /assertActiveAdmin|role !== Role\.ADMIN/);
  assert.match(service, /REFUND_WALLET_FUNDS_PHRASE/);
  assert.match(service, /consumeRateLimit/);
  assert.match(service, /reconciliation\.wallet_refunded/);
  assert.match(service, /reconciliation\.case_action_blocked/);
  assert.match(service, /\$transaction/);
  assert.match(service, /refundReservedFundsInTx/);
  assert.match(service, /method:\s*"GET"/);
  assert.match(service, /classifyProviderOrderResponse/);
  assert.match(walletPurchase, /export async function refundReservedFundsInTx/);
  assert.match(walletPurchase, /balanceCents:\s*\{\s*increment/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /refundReconciliationWalletPurchaseAction/);
  assert.match(actions, /void formData\.get\("amountCents"\)/);
  assert.match(management, /walletRefundAllowed/);
  console.log("PASS auth_same_origin_cas_wiring");

  assert.doesNotMatch(service, /\/api\/checkout\/credit/);
  assert.doesNotMatch(service, /confirmWalletEsimPurchase|confirmAdminPackageAssignment/);
  assert.doesNotMatch(service, /persistAssignedOrder/);
  assert.doesNotMatch(service, /captureIccidForProviderOrder/);
  assert.doesNotMatch(service, /walletTransaction\.create\(\s*\{[\s\S]*DEBIT/);
  assert.doesNotMatch(service, /formData\.get\("amount/);
  assert.doesNotMatch(
    service,
    /data:\s*\{[\s\S]{0,200}reconciliationResolvedAt:\s*(now|new Date)|data:\s*\{[\s\S]{0,200}reconciliationLockedAt:\s*null/
  );
  assert.match(service, /scheduleWalletTransactionNotification/);
  assert.doesNotMatch(service, /deliverOrderEmailAfterCheckout|sendOrderEmail/);
  assert.match(service, /idempotent|already_refunded/);
  console.log("PASS safety_no_mutations");

  assert.doesNotMatch(service, /metadata:\s*\{[^}]*\biccid\b\s*:/i);
  assert.doesNotMatch(
    service,
    /metadata:[\s\S]{0,240}(activationCode|qrValue|emailBody|iccidEncrypted)/i
  );
  assert.doesNotMatch(service, /LPA:1\$/);
  assert.doesNotMatch(
    service,
    /writeAuditLog\([\s\S]{0,500}accessToken|writeAuditLog\([\s\S]{0,500}activationCode/i
  );
  assert.doesNotMatch(panel, /iccidEncrypted|activationCode|LPA:1\$/i);
  assert.match(shared, /REFUND_WALLET_FUNDS_PHRASE/);
  console.log("PASS audit_sanitization");

  assert.match(panel, /REFUND_WALLET_FUNDS_PHRASE|Refund wallet funds/);
  assert.match(panel, /walletRefundAllowed/);
  assert.match(panel, /changes financial state/);
  assert.match(pkg, /qa:admin-reconciliation-wallet-refund/);
  assert.ok(
    existsSync(join(root, "scripts/qa-admin-reconciliation-wallet-refund.ts"))
  );
  console.log("PASS ui_and_package_script");

  console.log("ALL PASS qa-admin-reconciliation-wallet-refund");
}

main();
