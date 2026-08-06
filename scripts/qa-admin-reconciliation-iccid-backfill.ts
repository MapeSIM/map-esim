/**
 * Offline QA for Phase 8G-B3B1 — provider-evidence ICCID capture/backfill.
 * Never places VeSIM orders, mutates wallets, refunds, or resends email.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BACKFILL_ICCID_PHRASE,
  evaluateIccidBackfillLocalEligibility,
  evaluateProviderIccidEvidence,
  iccidBackfillBlockerLabel,
  isIccidBackfillSourceType,
  parseConfirmPhrase,
  parseCaseReason,
} from "../app/lib/admin/reconciliationCaseShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function baseLocal(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: "iccid" as const,
    alreadyResolved: false,
    locked: true,
    lockedByAdminId: "admin_1",
    currentAdminId: "admin_1",
    providerOrderId: "PO-1",
    localOrderId: "ord_1",
    orderProviderOrderId: "PO-1",
    orderStatus: "COMPLETED",
    providerRefreshInProgress: false,
    localIccidPresent: false,
    ...overrides,
  };
}

function main() {
  const shared = read("app/lib/admin/reconciliationCaseShared.ts");
  const backfill = read("app/lib/admin/reconciliationIccidBackfill.ts");
  const management = read("app/lib/admin/reconciliationCaseManagement.ts");
  const actions = read("app/lib/admin/reconciliationCaseActions.ts");
  const panel = read("app/components/admin/CaseManagementPanel.tsx");
  const capture = read("app/lib/orders/iccidCaptureCore.ts");
  const pkg = read("package.json");

  assert.equal(BACKFILL_ICCID_PHRASE, "BACKFILL ICCID");
  assert.equal(parseConfirmPhrase("BACKFILL ICCID", BACKFILL_ICCID_PHRASE).ok, true);
  assert.equal(parseConfirmPhrase("backfill iccid", BACKFILL_ICCID_PHRASE).ok, false);
  assert.equal(parseConfirmPhrase("BACKFILL", BACKFILL_ICCID_PHRASE).ok, false);
  assert.equal(parseCaseReason("").ok, false);
  assert.equal(parseCaseReason("need").ok, false);
  assert.equal(parseCaseReason("Provider evidence confirms ICCID").ok, true);
  console.log("PASS confirmation_phrase_and_reason");

  assert.equal(isIccidBackfillSourceType("iccid"), true);
  assert.equal(isIccidBackfillSourceType("wallet_purchase"), true);
  assert.equal(isIccidBackfillSourceType("assignment"), true);
  assert.equal(isIccidBackfillSourceType("order_email"), false);
  assert.equal(isIccidBackfillSourceType("wallet_email"), false);
  assert.equal(isIccidBackfillSourceType("topup"), false);

  const ok = evaluateIccidBackfillLocalEligibility(baseLocal());
  assert.equal(ok.allowed, true);
  assert.equal(ok.supported, true);

  assert.equal(
    evaluateIccidBackfillLocalEligibility(
      baseLocal({ alreadyResolved: true })
    ).allowed,
    false
  );
  assert.ok(
    evaluateIccidBackfillLocalEligibility(
      baseLocal({ alreadyResolved: true })
    ).blockers.includes("already_resolved")
  );

  assert.ok(
    evaluateIccidBackfillLocalEligibility(
      baseLocal({ locked: false })
    ).blockers.includes("case_unlocked")
  );

  assert.ok(
    evaluateIccidBackfillLocalEligibility(
      baseLocal({ lockedByAdminId: "other_admin" })
    ).blockers.includes("lock_not_owned")
  );

  assert.ok(
    evaluateIccidBackfillLocalEligibility(
      baseLocal({
        sourceType: "wallet_purchase",
        localOrderId: null,
      })
    ).blockers.includes("missing_local_order")
  );

  assert.ok(
    evaluateIccidBackfillLocalEligibility(
      baseLocal({ providerOrderId: "" })
    ).blockers.includes("missing_provider_reference")
  );

  assert.ok(
    evaluateIccidBackfillLocalEligibility(
      baseLocal({
        sourceType: "wallet_purchase",
        orderProviderOrderId: "PO-OTHER",
      })
    ).blockers.includes("provider_reference_mismatch")
  );

  assert.ok(
    evaluateIccidBackfillLocalEligibility(
      baseLocal({
        sourceType: "wallet_purchase",
        providerRefreshInProgress: true,
      })
    ).blockers.includes("provider_refresh_in_progress")
  );

  assert.equal(
    evaluateIccidBackfillLocalEligibility(
      baseLocal({ sourceType: "topup" as never })
    ).supported,
    false
  );
  console.log("PASS local_eligibility_lock_and_record_gates");

  const evidenceOk = evaluateProviderIccidEvidence({
    lookupKind: "FOUND",
    orderExists: "yes",
    offerMatch: "yes",
    safeProviderState: "COMPLETED",
    extractedIccid: "8944501234567890123",
    hasExpectedOfferId: true,
  });
  assert.equal(evidenceOk.ok, true);

  assert.equal(
    evaluateProviderIccidEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "unknown",
      safeProviderState: "pending",
      extractedIccid: "8944501234567890123",
      hasExpectedOfferId: false,
    }).ok,
    false
  );

  assert.equal(
    evaluateProviderIccidEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "no",
      safeProviderState: "COMPLETED",
      extractedIccid: "8944501234567890123",
      hasExpectedOfferId: true,
    }).ok,
    false
  );

  assert.equal(
    evaluateProviderIccidEvidence({
      lookupKind: "NOT_FOUND",
      orderExists: "no",
      offerMatch: "unknown",
      extractedIccid: "8944501234567890123",
      hasExpectedOfferId: false,
    }).ok,
    false
  );

  assert.equal(
    evaluateProviderIccidEvidence({
      lookupKind: "TIMEOUT",
      orderExists: "unknown",
      offerMatch: "unknown",
      extractedIccid: "8944501234567890123",
      hasExpectedOfferId: false,
    }).ok,
    false
  );

  assert.equal(
    evaluateProviderIccidEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      safeProviderState: "cancelled",
      extractedIccid: "8944501234567890123",
      hasExpectedOfferId: true,
    }).ok,
    false
  );

  assert.equal(
    evaluateProviderIccidEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      safeProviderState: "COMPLETED",
      extractedIccid: null,
      hasExpectedOfferId: true,
    }).ok,
    false
  );

  assert.equal(
    evaluateProviderIccidEvidence({
      lookupKind: "FOUND",
      orderExists: "yes",
      offerMatch: "yes",
      safeProviderState: "COMPLETED",
      extractedIccid: "12345",
      hasExpectedOfferId: true,
    }).ok,
    false
  );
  assert.ok(iccidBackfillBlockerLabel("provider_iccid_missing").length > 5);
  console.log("PASS provider_evidence_rules");

  assert.match(backfill, /requireRole|assertActiveAdmin|role !== Role\.ADMIN/);
  assert.match(backfill, /assertSameOriginAdminRequest/);
  assert.match(backfill, /BACKFILL_ICCID_PHRASE/);
  assert.match(backfill, /consumeRateLimit/);
  assert.match(backfill, /reconciliation\.iccid_backfilled/);
  assert.match(backfill, /reconciliation\.case_action_blocked/);
  assert.match(backfill, /\$transaction/);
  assert.match(backfill, /captureIccidForProviderOrder/);
  assert.match(backfill, /method:\s*"GET"/);
  assert.match(backfill, /classifyProviderOrderResponse/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /backfillReconciliationIccidAction/);
  assert.match(management, /iccidBackfillAllowed/);
  assert.match(management, /lock_not_owned|evaluateIccidBackfillLocalEligibility/);
  console.log("PASS auth_same_origin_cas_wiring");

  assert.doesNotMatch(backfill, /\/api\/checkout\/credit/);
  assert.doesNotMatch(backfill, /placeOrder|retryCheckout|cancelOrder/i);
  assert.doesNotMatch(backfill, /refundReservedFunds|debitWallet|creditWallet/);
  assert.doesNotMatch(backfill, /balanceCents:\s*\{/);
  assert.doesNotMatch(backfill, /sendOrderEmail|resendFailedWallet|resendReconciliationEmail/);
  assert.doesNotMatch(backfill, /adminPackageAssignment\.create|walletEsimPurchase\.create/);
  assert.doesNotMatch(backfill, /persistAssignedOrder|persistGuestOrder/);
  assert.doesNotMatch(
    backfill,
    /reconciliationResolvedAt:\s*(now|new Date)|reconciliationLockedAt:\s*null/
  );
  assert.match(capture, /iccidHash:\s*null/);
  assert.match(capture, /already_same/);
  assert.match(capture, /conflict/);
  assert.match(backfill, /already_same|idempotent/);
  assert.match(backfill, /iccid_conflict|conflict/);
  console.log("PASS safety_no_mutations_and_conflict_idempotency");

  // Audit metadata must never include full ICCID / install secrets.
  assert.doesNotMatch(backfill, /metadata:\s*\{[^}]*\biccid\b\s*:/i);
  assert.doesNotMatch(
    backfill,
    /metadata:[\s\S]{0,240}(activationCode|qrValue|emailBody|iccidEncrypted|iccidLast4)/i
  );
  assert.doesNotMatch(backfill, /LPA:1\$/);
  assert.doesNotMatch(panel, /iccidEncrypted|activationCode|LPA:1\$/i);
  assert.match(backfill, /idempotent/);
  assert.match(shared, /BACKFILL_ICCID_PHRASE/);
  // Must not write secrets into audit metadata objects.
  assert.doesNotMatch(
    backfill,
    /writeAuditLog\([\s\S]{0,500}accessToken|writeAuditLog\([\s\S]{0,500}activationCode/i
  );
  console.log("PASS audit_sanitization_no_full_iccid");

  assert.match(panel, /BACKFILL_ICCID_PHRASE|Backfill ICCID/);
  assert.match(panel, /iccidBackfillAllowed/);
  assert.match(panel, /iccidBackfillMessage/);
  assert.match(pkg, /qa:admin-reconciliation-iccid-backfill/);
  assert.ok(
    existsSync(join(root, "scripts/qa-admin-reconciliation-iccid-backfill.ts"))
  );
  console.log("PASS ui_and_package_script");

  console.log("ALL PASS qa-admin-reconciliation-iccid-backfill");
}

main();
