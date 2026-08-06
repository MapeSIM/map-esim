/**
 * Offline QA for Phase 8G-B2 reconciliation case lock / escalate / safe resolve.
 * Uses mocked fixtures only — never calls VeSIM, wallets, orders, email, or ICCID capture.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canRaiseOrKeepEscalation,
  CASE_REASON_MAX,
  CASE_REASON_MIN,
  ESCALATION_PRIORITIES,
  evaluateResolutionEligibility,
  LOCK_CASE_PHRASE,
  normalizeCaseManagementSourceType,
  parseCaseReason,
  parseConfirmPhrase,
  parseEscalationPriority,
  parseResolutionCode,
  RESOLUTION_CODES,
  RESOLVE_CASE_PHRASE,
  UNLOCK_CASE_PHRASE,
} from "../app/lib/admin/reconciliationCaseShared";
import {
  categoryMatchesFilter,
  RECONCILIATION_FILTERS,
} from "../app/lib/admin/reconciliationClassify";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migrationPath =
    "prisma/migrations/20260806220000_add_reconciliation_case_management/migration.sql";
  assert.ok(existsSync(join(root, migrationPath)));
  const migration = read(migrationPath);
  const shared = read("app/lib/admin/reconciliationCaseShared.ts");
  const service = read("app/lib/admin/reconciliationCaseManagement.ts");
  const actions = read("app/lib/admin/reconciliationCaseActions.ts");
  const panel = read("app/components/admin/CaseManagementPanel.tsx");
  const detail = read(
    "app/admin/reconciliation/[sourceType]/[attemptId]/page.tsx"
  );
  const list = read("app/admin/reconciliation/page.tsx");
  const refresh = read("app/lib/admin/providerRefresh.ts");
  const pkg = read("package.json");

  assert.match(schema, /reconciliationLockedByAdminId\s+String\?/);
  assert.match(schema, /reconciliationLockReason\s+String\?/);
  assert.match(schema, /reconciliationEscalatedAt\s+DateTime\?/);
  assert.match(schema, /reconciliationEscalationPriority\s+String\?/);
  assert.match(schema, /reconciliationResolutionCode\s+String\?/);
  assert.match(schema, /model WalletTopup[\s\S]*reconciliationLockedAt/);
  assert.match(schema, /model WalletTransaction[\s\S]*reconciliationEscalatedAt/);
  assert.match(schema, /model Order[\s\S]*reconciliationResolutionCode/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/i);
  assert.match(migration, /reconciliationEscalationPriority/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS/);
  console.log("PASS schema_and_nullable_migration");

  assert.equal(CASE_REASON_MIN, 5);
  assert.equal(CASE_REASON_MAX, 200);
  assert.equal(LOCK_CASE_PHRASE, "LOCK CASE");
  assert.equal(UNLOCK_CASE_PHRASE, "UNLOCK CASE");
  assert.equal(RESOLVE_CASE_PHRASE, "RESOLVE CASE");
  assert.deepEqual([...ESCALATION_PRIORITIES], [
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
  ]);
  assert.deepEqual([...RESOLUTION_CODES], [
    "NO_LONGER_ACTIONABLE",
    "ALREADY_RECOVERED",
    "DATA_CORRECTED",
    "DUPLICATE_TEST_DATA",
  ]);
  assert.equal(normalizeCaseManagementSourceType("wallet_topup"), "topup");
  assert.equal(
    normalizeCaseManagementSourceType("wallet_notification"),
    "wallet_email"
  );
  console.log("PASS shared_constants_and_aliases");

  assert.equal(parseCaseReason("abc").ok, false);
  assert.equal(parseCaseReason("valid reason text").ok, true);
  assert.equal(parseConfirmPhrase("LOCK CASE", LOCK_CASE_PHRASE).ok, true);
  assert.equal(parseConfirmPhrase("lock case", LOCK_CASE_PHRASE).ok, false);
  assert.equal(parseConfirmPhrase("UNLOCK CASE", UNLOCK_CASE_PHRASE).ok, true);
  assert.equal(parseConfirmPhrase("RESOLVE CASE", RESOLVE_CASE_PHRASE).ok, true);
  assert.equal(parseConfirmPhrase("RESOLVE", RESOLVE_CASE_PHRASE).ok, false);
  assert.equal(parseEscalationPriority("CRITICAL").ok, true);
  assert.equal(parseEscalationPriority("URGENT").ok, false);
  assert.equal(parseResolutionCode("ALREADY_RECOVERED").ok, true);
  assert.equal(parseResolutionCode("RESOLVED_EXTERNALLY").ok, false);
  assert.equal(canRaiseOrKeepEscalation("HIGH", "CRITICAL"), true);
  assert.equal(canRaiseOrKeepEscalation("CRITICAL", "HIGH"), false);
  assert.equal(canRaiseOrKeepEscalation("HIGH", "HIGH"), true);
  console.log("PASS validation_phrases_priority_codes");

  // Auth / admin gates in actions + service
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(service, /assertActiveAdmin/);
  assert.match(service, /assertSameOriginAdminRequest/);
  assert.match(service, /consumeRateLimit/);
  assert.match(service, /updateMany/);
  assert.match(service, /\$transaction/);
  assert.match(service, /CASE_LOCKED|reconciliation\.case_locked/);
  assert.match(service, /reconciliation\.case_unlocked/);
  assert.match(service, /reconciliation\.case_escalated/);
  assert.match(service, /reconciliation\.case_resolved/);
  assert.match(service, /reconciliation\.case_action_blocked/);
  assert.doesNotMatch(service, /lookupProviderOrderStatus|creditCheckout|\/api\/checkout/);
  assert.doesNotMatch(
    service,
    /debitWallet\(|creditWallet\(|refundReservedFunds|resendEmail\(|iccidEncrypted:/
  );
  assert.doesNotMatch(actions, /lookupProviderOrderStatus|creditCheckout/);
  console.log("PASS security_gates_no_provider_wallet_mutations");

  // Resolution eligibility fixtures
  const fundsReserved = evaluateResolutionEligibility({
    sourceType: "wallet_purchase",
    locked: false,
    alreadyResolved: false,
    status: "FUNDS_RESERVED",
    debitStatus: "COMPLETED",
  });
  assert.equal(fundsReserved.allowed, false);
  assert.ok(fundsReserved.blockers.includes("funds_or_provider_pending"));

  const uncertain = evaluateResolutionEligibility({
    sourceType: "wallet_purchase",
    locked: false,
    alreadyResolved: false,
    status: "RECONCILIATION_REQUIRED",
    providerResultKind: "uncertain",
    providerOrderId: "PO-ABC",
  });
  assert.equal(uncertain.allowed, false);
  assert.ok(uncertain.blockers.includes("provider_uncertain"));

  const finalizeFailed = evaluateResolutionEligibility({
    sourceType: "wallet_purchase",
    locked: false,
    alreadyResolved: false,
    status: "RECONCILIATION_REQUIRED",
    failureCategory: "local_finalize_failed",
    providerOrderId: "PO-ABC",
    providerResultKind: "success",
  });
  assert.equal(finalizeFailed.allowed, false);
  assert.ok(finalizeFailed.blockers.includes("finalization_failed"));

  const lockedCase = evaluateResolutionEligibility({
    sourceType: "wallet_purchase",
    locked: true,
    alreadyResolved: false,
    status: "RECONCILIATION_REQUIRED",
    orderId: "ord_1",
    providerOrderId: "PO-ABC",
    providerResultKind: "success",
  });
  assert.equal(lockedCase.allowed, false);
  assert.ok(lockedCase.blockers.includes("case_locked"));

  const failedEmail = evaluateResolutionEligibility({
    sourceType: "order_email",
    locked: false,
    alreadyResolved: false,
    emailDeliveryStatus: "failed",
  });
  assert.equal(failedEmail.allowed, false);
  assert.ok(failedEmail.blockers.includes("order_email_failed"));

  const iccidPending = evaluateResolutionEligibility({
    sourceType: "iccid",
    locked: false,
    alreadyResolved: false,
  });
  assert.equal(iccidPending.allowed, false);
  assert.ok(iccidPending.blockers.includes("iccid_pending"));

  const recovered = evaluateResolutionEligibility({
    sourceType: "wallet_purchase",
    locked: false,
    alreadyResolved: false,
    status: "RECONCILIATION_REQUIRED",
    orderId: "ord_recovered",
    providerOrderId: "PO-OK",
    providerResultKind: "success",
  });
  assert.equal(recovered.allowed, true);
  assert.deepEqual(recovered.blockers, []);

  const refunded = evaluateResolutionEligibility({
    sourceType: "wallet_purchase",
    locked: false,
    alreadyResolved: false,
    status: "FAILED_REFUNDED",
    refundTransactionId: "tx_refund",
    debitStatus: "COMPLETED",
  });
  assert.equal(refunded.allowed, true);
  console.log("PASS resolution_eligibility_classifier");

  // Filters / UI
  assert.ok(RECONCILIATION_FILTERS.includes("locked"));
  assert.ok(RECONCILIATION_FILTERS.includes("escalated"));
  assert.equal(
    categoryMatchesFilter("PROVIDER_UNKNOWN", "locked", {
      locked: true,
      escalated: false,
    }),
    true
  );
  assert.equal(
    categoryMatchesFilter("PROVIDER_UNKNOWN", "locked", {
      locked: false,
      escalated: false,
    }),
    false
  );
  assert.match(list, /Escalated/);
  assert.match(list, /Locked/);
  assert.match(detail, /CaseManagementPanel/);
  assert.match(panel, /LOCK_CASE_PHRASE/);
  assert.match(panel, /UNLOCK_CASE_PHRASE/);
  assert.match(panel, /RESOLVE_CASE_PHRASE/);
  assert.match(panel, /Mark resolved/);
  assert.doesNotMatch(panel, /iccidEncrypted|LPA:|activationCode|smtp/i);
  assert.doesNotMatch(detail, /iccidEncrypted|LPA:|qrValue/i);
  console.log("PASS ui_filters_and_safe_props");

  // Provider refresh still blocks locked/resolved
  assert.match(refresh, /reconciliationLockedAt/);
  assert.match(refresh, /reconciliationResolvedAt/);
  assert.match(refresh, /reasonCode: \"locked\"/);
  assert.match(refresh, /reasonCode: \"resolved\"/);
  assert.doesNotMatch(service, /refreshProviderOrderStatus\(/);
  console.log("PASS provider_refresh_integration_gates");

  // Audit metadata must stay sanitized in source
  assert.doesNotMatch(service, /emailBody|rawPayload|iccidEncrypted/);
  assert.match(service, /reason: reasonParsed\.reason\.slice\(0, 80\)/);
  console.log("PASS audit_safe_metadata");

  // Lock/unlock/escalate/resolve function presence + idempotency notes
  assert.match(service, /export async function lockReconciliationCase/);
  assert.match(service, /export async function unlockReconciliationCase/);
  assert.match(service, /export async function escalateReconciliationCase/);
  assert.match(service, /export async function resolveReconciliationCase/);
  assert.match(service, /idempotent:\s*true/);
  assert.match(service, /priority_downgrade_blocked/);
  assert.match(pkg, /qa:admin-reconciliation-case-management/);
  console.log("PASS case_management_api_surface");

  // Sensitive data absence from shared + service
  const combined = shared + service + actions + panel;
  assert.doesNotMatch(combined, /LPA:1\$/);
  assert.doesNotMatch(combined, /VESIM_API_KEY|smtpPassword|activation code/i);
  console.log("PASS no_sensitive_literals");

  console.log("ALL PASS qa-admin-reconciliation-case-management");
}

main();
