/**
 * Offline QA for Phase 8G-B3B2 — controlled local finalization recovery.
 * Never places VeSIM orders, creates new wallet charges, refunds, or emails.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateLocalFinalizationEligibility,
  evaluateProviderFinalizationEvidence,
  FINALIZE_LOCAL_RECORD_PHRASE,
  isLocalFinalizationSourceType,
  localFinalizationBlockerLabel,
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
    orderId: null,
    providerOrderId: "PO-1",
    providerResultKind: "success",
    failureCategory: "local_finalize_failed",
    failureCode: "order_persist_error",
    offerId: "offer_1",
    customerUserId: "cust_1",
    customerEmail: "a@example.com",
    priceCents: 1500,
    debitStatus: "PENDING",
    debitTransactionId: "debit_1",
    refundTransactionId: null,
    providerRefreshInProgress: false,
    ...overrides,
  };
}

function main() {
  const shared = read("app/lib/admin/reconciliationCaseShared.ts");
  const service = read("app/lib/admin/reconciliationLocalFinalization.ts");
  const management = read("app/lib/admin/reconciliationCaseManagement.ts");
  const actions = read("app/lib/admin/reconciliationCaseActions.ts");
  const panel = read("app/components/admin/CaseManagementPanel.tsx");
  const persist = read("app/lib/orders/persistAssignedOrder.ts");
  const pkg = read("package.json");

  assert.equal(FINALIZE_LOCAL_RECORD_PHRASE, "FINALIZE LOCAL RECORD");
  assert.equal(
    parseConfirmPhrase("FINALIZE LOCAL RECORD", FINALIZE_LOCAL_RECORD_PHRASE).ok,
    true
  );
  assert.equal(
    parseConfirmPhrase("finalize local record", FINALIZE_LOCAL_RECORD_PHRASE).ok,
    false
  );
  assert.equal(parseCaseReason("").ok, false);
  assert.equal(parseCaseReason("fix").ok, false);
  assert.equal(parseCaseReason("Provider success, local order missing").ok, true);
  console.log("PASS confirmation_phrase_and_reason");

  assert.equal(isLocalFinalizationSourceType("wallet_purchase"), true);
  assert.equal(isLocalFinalizationSourceType("assignment"), true);
  assert.equal(isLocalFinalizationSourceType("iccid"), false);
  assert.equal(isLocalFinalizationSourceType("order_email"), false);
  assert.equal(isLocalFinalizationSourceType("topup"), false);

  const ok = evaluateLocalFinalizationEligibility(baseLocal());
  assert.equal(ok.allowed, true);
  assert.equal(ok.alreadyFinalized, false);

  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ alreadyResolved: true })
    ).blockers.includes("already_resolved")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ locked: false })
    ).blockers.includes("case_unlocked")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ lockedByAdminId: "other" })
    ).blockers.includes("lock_not_owned")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ providerOrderId: "" })
    ).blockers.includes("missing_provider_reference")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ providerResultKind: "uncertain" })
    ).blockers.includes("provider_success_not_recorded")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ failureCategory: "provider_timeout", failureCode: "x" })
    ).blockers.includes("not_local_finalize_failure")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ orderId: "ord_existing" })
    ).blockers.includes("conflicting_local_order_link")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ debitTransactionId: null, debitStatus: null })
    ).blockers.includes("missing_debit_reservation")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ refundTransactionId: "refund_1" })
    ).blockers.includes("refund_present")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ priceCents: null })
    ).blockers.includes("missing_pricing_evidence")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ offerId: "" })
    ).blockers.includes("missing_package_evidence")
  );
  assert.ok(
    evaluateLocalFinalizationEligibility(
      baseLocal({ sourceType: "iccid" as never })
    ).blockers.includes("unsupported_source")
  );

  const assignmentOk = evaluateLocalFinalizationEligibility(
    baseLocal({
      sourceType: "assignment",
      priceCents: null,
      debitTransactionId: null,
      debitStatus: null,
    })
  );
  assert.equal(assignmentOk.allowed, true);

  const idempotent = evaluateLocalFinalizationEligibility(
    baseLocal({
      status: "COMPLETED",
      orderId: "ord_1",
      failureCategory: null,
      failureCode: null,
    })
  );
  assert.equal(idempotent.allowed, true);
  assert.equal(idempotent.alreadyFinalized, true);
  console.log("PASS local_eligibility_gates");

  assert.equal(
    evaluateProviderFinalizationEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      safeProviderState: "COMPLETED",
      hasExpectedOfferId: true,
    }).ok,
    true
  );
  assert.equal(
    evaluateProviderFinalizationEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "unknown",
      safeProviderState: null,
      hasExpectedOfferId: true,
    }).ok,
    true
  );
  assert.equal(
    evaluateProviderFinalizationEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "no",
      safeProviderState: "COMPLETED",
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderFinalizationEvidence({
      lookupKind: "NOT_FOUND",
      orderExists: "no",
      offerMatch: "unknown",
      hasExpectedOfferId: false,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderFinalizationEvidence({
      lookupKind: "TIMEOUT",
      orderExists: "unknown",
      offerMatch: "unknown",
      hasExpectedOfferId: false,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderFinalizationEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      safeProviderState: "pending",
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  assert.equal(
    evaluateProviderFinalizationEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      safeProviderState: "cancelled",
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  assert.ok(localFinalizationBlockerLabel("provider_not_completed").length > 5);
  console.log("PASS provider_evidence_rules");

  assert.match(service, /assertSameOriginAdminRequest/);
  assert.match(service, /assertActiveAdmin|role !== Role\.ADMIN/);
  assert.match(service, /FINALIZE_LOCAL_RECORD_PHRASE/);
  assert.match(service, /consumeRateLimit/);
  assert.match(service, /reconciliation\.local_finalized/);
  assert.match(service, /reconciliation\.case_action_blocked/);
  assert.match(service, /\$transaction/);
  assert.match(service, /persistAssignedOrder/);
  assert.match(service, /updateMany/);
  assert.match(service, /method:\s*"GET"/);
  assert.match(service, /classifyProviderOrderResponse/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /finalizeReconciliationLocalRecordAction/);
  assert.match(management, /localFinalizationAllowed/);
  assert.match(management, /evaluateLocalFinalizationEligibility/);
  console.log("PASS auth_same_origin_cas_wiring");

  assert.doesNotMatch(service, /\/api\/checkout\/credit/);
  assert.doesNotMatch(service, /confirmWalletEsimPurchase|confirmAdminPackageAssignment/);
  assert.doesNotMatch(service, /placeOrder|retryCheckout|cancelOrder/i);
  assert.doesNotMatch(service, /refundReservedFunds|debitWallet|creditWallet/);
  assert.doesNotMatch(service, /balanceCents:\s*\{/);
  assert.doesNotMatch(service, /walletTransaction\.create/);
  assert.doesNotMatch(
    service,
    /sendOrderEmail|deliverOrderEmailAfterCheckout|scheduleWalletTransactionNotification|resendFailedWallet/
  );
  assert.doesNotMatch(
    service,
    /data:\s*\{[\s\S]{0,200}reconciliationResolvedAt:\s*(now|new Date)|data:\s*\{[\s\S]{0,200}reconciliationLockedAt:\s*null/
  );
  assert.doesNotMatch(service, /reconciliationEscalationPriority:/);
  assert.match(persist, /order\.upsert/);
  assert.match(service, /idempotent|already_finalized/);
  assert.match(service, /conflicting_order_record|assertOrderCompatible/);
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
  assert.match(shared, /FINALIZE_LOCAL_RECORD_PHRASE/);
  console.log("PASS audit_sanitization");

  assert.match(panel, /FINALIZE_LOCAL_RECORD_PHRASE|Finalize local record/);
  assert.match(panel, /localFinalizationAllowed/);
  assert.match(panel, /localFinalizationMessage/);
  assert.match(pkg, /qa:admin-reconciliation-local-finalization/);
  assert.ok(
    existsSync(join(root, "scripts/qa-admin-reconciliation-local-finalization.ts"))
  );
  console.log("PASS ui_and_package_script");

  console.log("ALL PASS qa-admin-reconciliation-local-finalization");
}

main();
