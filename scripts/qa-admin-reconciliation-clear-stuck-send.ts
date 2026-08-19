/**
 * Offline QA for Admin clear-stuck-send (stale emailDeliveryStatus sending → failed).
 * Never sends email, calls VeSIM, or mutates wallets/payments/orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLEAR_STUCK_SEND_PHRASE,
  evaluateClearStuckSendEligibility,
  parseConfirmPhrase,
} from "../app/lib/admin/reconciliationCaseShared";
import { RECONCILIATION_STUCK_AGE_MS } from "../app/lib/admin/reconciliationClassify";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const clearStuck = read("app/lib/admin/reconciliationClearStuckSend.ts");
  const helper = read("app/lib/esim/esimPurchaseInstallEmail.ts");
  const statusSrc = read("app/lib/esim/esimPurchaseInstallEmailStatus.ts");
  const actions = read("app/lib/admin/reconciliationCaseActions.ts");
  const panel = read("app/components/admin/CaseManagementPanel.tsx");
  const pkg = read("package.json");

  assert.equal(CLEAR_STUCK_SEND_PHRASE, "CLEAR STUCK SEND");
  assert.equal(
    parseConfirmPhrase("CLEAR STUCK SEND", CLEAR_STUCK_SEND_PHRASE).ok,
    true
  );
  assert.equal(
    parseConfirmPhrase("CLEAR STUCK SENT", CLEAR_STUCK_SEND_PHRASE).ok,
    false
  );

  const now = new Date("2026-08-19T12:00:00.000Z");
  const staleAt = new Date(now.getTime() - RECONCILIATION_STUCK_AGE_MS);
  const freshAt = new Date(now.getTime() - RECONCILIATION_STUCK_AGE_MS + 1);

  const purchaseStale = evaluateClearStuckSendEligibility({
    sourceType: "order_email",
    alreadyResolved: false,
    status: "COMPLETED",
    emailDeliveryStatus: "sending",
    updatedAt: staleAt,
    now,
  });
  assert.equal(purchaseStale.allowed, true);

  const assignmentFresh = evaluateClearStuckSendEligibility({
    sourceType: "order_email",
    alreadyResolved: false,
    status: "COMPLETED",
    emailDeliveryStatus: "sending",
    updatedAt: freshAt,
    now,
  });
  assert.equal(assignmentFresh.allowed, false);
  assert.ok(assignmentFresh.blockers.includes("email_send_in_progress"));
  console.log("PASS eligibility_stale_vs_fresh");

  assert.match(clearStuck, /assertSameOriginAdminRequest/);
  assert.match(clearStuck, /role !== Role\.ADMIN/);
  assert.match(clearStuck, /CLEAR_STUCK_SEND_PHRASE/);
  assert.match(clearStuck, /consumeRateLimit/);
  assert.match(clearStuck, /emailDeliveryStatus:\s*"sending"/);
  assert.match(clearStuck, /updatedAt:\s*\{\s*lte:\s*staleBefore\s*\}/);
  assert.match(clearStuck, /emailDeliveryStatus:\s*"failed"/);
  assert.match(clearStuck, /WalletEsimPurchaseStatus\.COMPLETED/);
  assert.match(clearStuck, /AdminPackageAssignmentStatus\.COMPLETED/);
  assert.match(clearStuck, /adminPackageAssignment\.updateMany/);
  assert.match(clearStuck, /walletEsimPurchase\.updateMany/);
  assert.match(clearStuck, /claimed\.count !== 1/);
  assert.match(clearStuck, /stale_sending_released/);
  assert.match(clearStuck, /auditMeta\("stale_sending_released"\)/);
  assert.match(clearStuck, /failureCode,/);
  assert.doesNotMatch(clearStuck, /parseCaseReason/);
  assert.doesNotMatch(clearStuck, /reasonParsed/);
  assert.doesNotMatch(clearStuck, /reason:\s/);
  assert.doesNotMatch(clearStuck, /options\.reason/);
  assert.doesNotMatch(clearStuck, /metadata:[\s\S]*?\breason\b/);
  assert.doesNotMatch(clearStuck, /sendOrderEmail|deliverOrderEmailAfterCheckout/);
  assert.doesNotMatch(clearStuck, /executeCreditCheckout|\/api\/checkout\/credit/);
  assert.doesNotMatch(clearStuck, /debitWallet|creditWallet|refundReservedFunds/);
  assert.doesNotMatch(clearStuck, /balanceCents:\s*\{/);
  assert.doesNotMatch(clearStuck, /prisma\.promo|prisma\.reward|creditReward/i);
  assert.doesNotMatch(clearStuck, /prisma\.order\.(update|create)/);
  assert.doesNotMatch(clearStuck, /qrValue|activationCode|LPA:1\$|emailBody/);
  assert.doesNotMatch(clearStuck, /customerEmail|alternateDeliveryEmail/);
  assert.doesNotMatch(clearStuck, /reconciliationResolvedAt:\s*new Date/);
  assert.doesNotMatch(
    clearStuck,
    /data:\s*\{[^}]*reconciliationLockedAt:\s*null/
  );
  console.log("PASS cas_no_smtp_no_side_effects");

  assert.match(statusSrc, /uncertain_sending/);
  assert.match(helper, /classified === "uncertain_sending"/);
  assert.match(helper, /decision:\s*"skipped_sending_in_progress"/);
  console.log("PASS automatic_path_still_skips_sending");

  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /clearStuckReconciliationSendAction/);
  const clearAction = actions.slice(
    actions.indexOf("export async function clearStuckReconciliationSendAction"),
    actions.indexOf("export async function backfillReconciliationIccidAction")
  );
  assert.ok(clearAction.length > 80);
  assert.match(clearAction, /void formData\.get\("reason"\)/);
  assert.doesNotMatch(clearAction, /reason:\s*String\(formData\.get\("reason"/);
  assert.match(panel, /CLEAR_STUCK_SEND_PHRASE/);
  assert.match(panel, /Clear stuck send/);
  assert.match(panel, /props\.clearStuckSendAllowed\s*\?/);
  assert.match(panel, /The original delivery may already have succeeded/);
  assert.match(panel, /does not send an email/);
  assert.match(
    panel,
    /customer may receive duplicate installation details/
  );
  assert.doesNotMatch(panel, /clear-stuck-reason/);
  assert.match(panel, /RESEND_EMAIL_PHRASE/);
  assert.match(panel, /emailResendSupported/);
  assert.doesNotMatch(panel, /qrValue|activationCode|LPA:/i);
  const classify = read("app/lib/admin/reconciliationClassify.ts");
  assert.match(
    classify,
    /emailDeliveryStatus:\s*"sending",[\s\S]*?status:\s*"COMPLETED",[\s\S]*?reconciliationResolvedAt:\s*null/
  );
  assert.match(pkg, /qa:admin-reconciliation-clear-stuck-send/);
  assert.ok(
    existsSync(join(root, "scripts/qa-admin-reconciliation-clear-stuck-send.ts"))
  );
  console.log("PASS ui_admin_only");

  console.log("ALL PASS qa-admin-reconciliation-clear-stuck-send");
}

main();
