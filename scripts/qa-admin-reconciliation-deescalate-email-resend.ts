/**
 * Offline QA for Phase 8G-B3A — case de-escalation and safe email resend.
 * Never places VeSIM orders, mutates wallets, refunds, or writes ICCID.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canLowerEscalation,
  canRaiseOrKeepEscalation,
  DEESCALATE_CASE_PHRASE,
  emailResendBlockerLabel,
  evaluateEmailResendEligibility,
  evaluateClearStuckSendEligibility,
  lowerEscalationPriorities,
  parseConfirmPhrase,
  parseEscalationPriority,
  RESEND_EMAIL_PHRASE,
  CLEAR_STUCK_SEND_PHRASE,
} from "../app/lib/admin/reconciliationCaseShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const shared = read("app/lib/admin/reconciliationCaseShared.ts");
  const management = read("app/lib/admin/reconciliationCaseManagement.ts");
  const emailResend = read("app/lib/admin/reconciliationEmailResend.ts");
  const clearStuck = read("app/lib/admin/reconciliationClearStuckSend.ts");
  const actions = read("app/lib/admin/reconciliationCaseActions.ts");
  const panel = read("app/components/admin/CaseManagementPanel.tsx");
  const walletNotify = read("app/lib/wallet/transactionNotification.ts");
  const deliver = read("app/lib/email/deliverAfterCheckout.ts");
  const pkg = read("package.json");

  assert.equal(DEESCALATE_CASE_PHRASE, "DE-ESCALATE CASE");
  assert.equal(RESEND_EMAIL_PHRASE, "RESEND EMAIL");
  assert.equal(CLEAR_STUCK_SEND_PHRASE, "CLEAR STUCK SEND");
  assert.equal(parseConfirmPhrase("DE-ESCALATE CASE", DEESCALATE_CASE_PHRASE).ok, true);
  assert.equal(parseConfirmPhrase("DEESCALATE CASE", DEESCALATE_CASE_PHRASE).ok, false);
  assert.equal(parseConfirmPhrase("RESEND EMAIL", RESEND_EMAIL_PHRASE).ok, true);
  assert.equal(parseConfirmPhrase("resend email", RESEND_EMAIL_PHRASE).ok, false);
  assert.equal(parseConfirmPhrase("CLEAR STUCK SEND", CLEAR_STUCK_SEND_PHRASE).ok, true);
  assert.equal(parseConfirmPhrase("clear stuck send", CLEAR_STUCK_SEND_PHRASE).ok, false);
  console.log("PASS confirmation_phrases");

  assert.equal(canLowerEscalation("CRITICAL", "HIGH"), true);
  assert.equal(canLowerEscalation("HIGH", "CRITICAL"), false);
  assert.equal(canLowerEscalation("LOW", "LOW"), false);
  assert.equal(canLowerEscalation(null, "LOW"), false);
  assert.equal(canRaiseOrKeepEscalation("HIGH", "CRITICAL"), true);
  assert.deepEqual(lowerEscalationPriorities("CRITICAL"), [
    "LOW",
    "MEDIUM",
    "HIGH",
  ]);
  assert.deepEqual(lowerEscalationPriorities("LOW"), []);
  assert.equal(parseEscalationPriority("MEDIUM").ok, true);
  console.log("PASS deescalation_priority_rules");

  const failedEmailOk = evaluateEmailResendEligibility({
    sourceType: "order_email",
    alreadyResolved: false,
    status: "COMPLETED",
    orderId: "ord_1",
    orderStatus: "COMPLETED",
    providerOrderId: "PO-ABC",
    emailDeliveryStatus: "failed",
    customerEmail: "a@example.com",
  });
  assert.equal(failedEmailOk.allowed, true);

  const resolvedBlocked = evaluateEmailResendEligibility({
    sourceType: "order_email",
    alreadyResolved: true,
    status: "COMPLETED",
    orderId: "ord_1",
    orderStatus: "COMPLETED",
    providerOrderId: "PO-ABC",
    emailDeliveryStatus: "failed",
    customerEmail: "a@example.com",
  });
  assert.equal(resolvedBlocked.allowed, false);
  assert.ok(resolvedBlocked.blockers.includes("already_resolved"));

  const sendingBlocked = evaluateEmailResendEligibility({
    sourceType: "order_email",
    alreadyResolved: false,
    status: "COMPLETED",
    orderId: "ord_1",
    orderStatus: "COMPLETED",
    providerOrderId: "PO-ABC",
    emailDeliveryStatus: "sending",
    customerEmail: "a@example.com",
  });
  assert.equal(sendingBlocked.allowed, false);
  assert.ok(sendingBlocked.blockers.includes("email_send_in_progress"));

  const now = new Date("2026-08-19T12:00:00.000Z");
  const staleAt = new Date(now.getTime() - 15 * 60 * 1000);
  const freshAt = new Date(now.getTime() - 14 * 60 * 1000);
  const staleClear = evaluateClearStuckSendEligibility({
    sourceType: "order_email",
    alreadyResolved: false,
    status: "COMPLETED",
    emailDeliveryStatus: "sending",
    updatedAt: staleAt,
    now,
  });
  assert.equal(staleClear.allowed, true);
  assert.equal(staleClear.supported, true);

  const freshClear = evaluateClearStuckSendEligibility({
    sourceType: "order_email",
    alreadyResolved: false,
    status: "COMPLETED",
    emailDeliveryStatus: "sending",
    updatedAt: freshAt,
    now,
  });
  assert.equal(freshClear.allowed, false);
  assert.ok(freshClear.blockers.includes("email_send_in_progress"));

  const failedClear = evaluateClearStuckSendEligibility({
    sourceType: "order_email",
    alreadyResolved: false,
    status: "COMPLETED",
    emailDeliveryStatus: "failed",
    updatedAt: staleAt,
    now,
  });
  assert.equal(failedClear.allowed, false);
  assert.ok(failedClear.blockers.includes("email_not_sending"));

  const walletClear = evaluateClearStuckSendEligibility({
    sourceType: "wallet_email",
    alreadyResolved: false,
    status: "COMPLETED",
    emailDeliveryStatus: "sending",
    updatedAt: staleAt,
    now,
  });
  assert.equal(walletClear.supported, false);
  assert.equal(walletClear.allowed, false);

  const invalidEmail = evaluateEmailResendEligibility({
    sourceType: "order_email",
    alreadyResolved: false,
    status: "COMPLETED",
    orderId: "ord_1",
    providerOrderId: "PO-ABC",
    emailDeliveryStatus: "invalid_email",
    customerEmail: "bad",
  });
  assert.equal(invalidEmail.allowed, false);

  const incompleteOrder = evaluateEmailResendEligibility({
    sourceType: "order_email",
    alreadyResolved: false,
    status: "RECONCILIATION_REQUIRED",
    orderId: null,
    providerOrderId: "PO-ABC",
    emailDeliveryStatus: "failed",
    customerEmail: "a@example.com",
  });
  assert.equal(incompleteOrder.allowed, false);

  const walletOk = evaluateEmailResendEligibility({
    sourceType: "wallet_email",
    alreadyResolved: false,
    emailNotificationStatus: "failed",
    walletTransactionStatus: "COMPLETED",
    amountCents: 500,
    balanceAfterCents: 1000,
    customerEmail: "a@example.com",
  });
  assert.equal(walletOk.allowed, true);

  const walletIncomplete = evaluateEmailResendEligibility({
    sourceType: "wallet_email",
    alreadyResolved: false,
    emailNotificationStatus: "failed",
    walletTransactionStatus: "PENDING",
    amountCents: 500,
    balanceAfterCents: 1000,
    customerEmail: "a@example.com",
  });
  assert.equal(walletIncomplete.allowed, false);
  assert.ok(emailResendBlockerLabel("missing_local_order").length > 5);
  console.log("PASS email_resend_eligibility");

  assert.match(management, /requireRole|assertActiveAdmin/);
  assert.match(management, /assertSameOriginAdminRequest/);
  assert.match(management, /deescalateReconciliationCase/);
  assert.match(management, /CASE_DEESCALATED|reconciliation\.case_deescalated/);
  assert.match(management, /canLowerEscalation|priority_not_lower/);
  assert.match(management, /updateMany/);
  assert.match(management, /idempotent:\s*true/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /deescalateReconciliationCaseAction/);
  assert.match(actions, /resendReconciliationEmailAction/);
  assert.match(actions, /clearStuckReconciliationSendAction/);
  console.log("PASS auth_same_origin_cas_deescalate");

  assert.match(emailResend, /assertSameOriginAdminRequest/);
  assert.match(emailResend, /assertActiveAdmin|role !== Role\.ADMIN/);
  assert.match(emailResend, /RESEND_EMAIL_PHRASE/);
  assert.match(emailResend, /reconciliation\.email_resent/);
  assert.match(emailResend, /reconciliation\.case_action_blocked/);
  assert.match(emailResend, /consumeRateLimit/);
  assert.match(emailResend, /sendOrderEmail/);
  assert.match(emailResend, /resendFailedWalletTransactionNotification/);
  assert.match(emailResend, /method:\s*"GET"/);
  assert.doesNotMatch(emailResend, /\/api\/checkout\/credit/);
  assert.doesNotMatch(emailResend, /captureIccid|iccidEncrypted|refundReservedFunds/);
  assert.doesNotMatch(emailResend, /balanceCents:\s*\{|debitWallet|creditWallet/);
  assert.doesNotMatch(emailResend, /qrValue:|activationCode:|emailBody/);
  assert.match(walletNotify, /resendFailedWalletTransactionNotification/);
  assert.match(walletNotify, /WALLET_TX_EMAIL_FAILED/);
  // Original deliver path still captures ICCID; resend path must not call it.
  assert.match(deliver, /captureIccidForProviderOrder/);
  assert.doesNotMatch(emailResend, /captureIccidForProviderOrder/);
  console.log("PASS email_resend_safety_no_mutations");

  assert.match(panel, /DEESCALATE_CASE_PHRASE|De-escalate/);
  assert.match(panel, /RESEND_EMAIL_PHRASE|Resend email/);
  assert.match(panel, /CLEAR_STUCK_SEND_PHRASE|Clear stuck send/);
  assert.match(panel, /deescalatePriorityOptions/);
  assert.match(panel, /emailResendAllowed/);
  assert.match(panel, /clearStuckSendAllowed/);
  assert.match(panel, /props\.clearStuckSendAllowed\s*\?/);
  assert.doesNotMatch(panel, /clear-stuck-reason/);
  assert.match(panel, /duplicate installation details/);
  assert.match(emailResend, /parseCaseReason/);
  assert.match(management, /parseCaseReason/);
  assert.doesNotMatch(clearStuck, /parseCaseReason/);
  assert.doesNotMatch(clearStuck, /reason:\s/);
  assert.doesNotMatch(panel, /iccidEncrypted|LPA:|activationCode/i);
  assert.match(pkg, /qa:admin-reconciliation-deescalate-email-resend/);
  assert.ok(existsSync(join(root, "scripts/qa-admin-reconciliation-deescalate-email-resend.ts")));
  console.log("PASS ui_and_package_script");

  assert.doesNotMatch(shared + management + emailResend + actions + clearStuck, /LPA:1\$/);
  assert.doesNotMatch(
    emailResend,
    /providerOrderId:\s*row\.providerOrderId,\s*\n\s*reason/
  );
  console.log("PASS audit_sanitization_markers");

  console.log("ALL PASS qa-admin-reconciliation-deescalate-email-resend");
}

main();
