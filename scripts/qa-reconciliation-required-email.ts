/**
 * Offline QA: customer email when wallet eSIM purchase enters RECONCILIATION_REQUIRED
 * with funds still held (not returned).
 * Does not mutate wallets, call providers, or send SMTP mail.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RECON_REQUIRED_EMAIL_SUBJECT,
  renderReconciliationRequiredEmailHtml,
  renderReconciliationRequiredEmailText,
} from "../app/lib/email/reconciliationRequiredTemplate";
import {
  RECON_REQUIRED_EMAIL_FAILED,
  RECON_REQUIRED_EMAIL_NOT_CONFIGURED,
  RECON_REQUIRED_EMAIL_SENDING,
  RECON_REQUIRED_EMAIL_SENT,
  RECON_REQUIRED_EMAIL_SKIPPED,
  applyReconRequiredEmailTransition,
  isReconRequiredEmailClaimable,
} from "../app/lib/esim/reconciliationRequiredEmailClaim";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function assertNoSensitive(content: string) {
  const banned = [
    "ICCID",
    "iccid",
    "LPA:",
    "SM-DP+",
    "activationCode",
    "SMTP_PASSWORD",
    "providerPayload",
    "providerOrderId",
    "safeProviderStatusCode",
    "failureCategory",
    "failureCode",
    "webhookEventId",
    "IMEI",
    "EID",
    "VeSIM",
    "awaiting_manual_review",
    "RECONCILIATION_REQUIRED",
  ];
  for (const token of banned) {
    assert.equal(
      content.includes(token),
      false,
      `sensitive/internal token leaked: ${token}`
    );
  }
}

function main() {
  const schema = read("prisma/schema.prisma");
  const notifyPath = "app/lib/esim/reconciliationRequiredNotification.ts";
  const claimPath = "app/lib/esim/reconciliationRequiredEmailClaim.ts";
  const templatePath = "app/lib/email/reconciliationRequiredTemplate.ts";
  const migrationGlobHint =
    "prisma/migrations/20260813010000_add_recon_required_email_notification/migration.sql";
  const purchase = read("app/lib/esim/walletPurchase.ts");
  const pkg = read("package.json");
  const walletNotify = read("app/lib/wallet/transactionNotification.ts");

  console.log("1) Schema + migration for durable once-only claim (additive only)");
  assert.match(schema, /model WalletEsimPurchase/);
  assert.match(schema, /reconRequiredEmailNotificationStatus\s+String\?/);
  assert.match(schema, /reconRequiredEmailNotifiedAt\s+DateTime\?/);
  assert.ok(
    existsSync(join(root, migrationGlobHint)),
    `missing migration ${migrationGlobHint}`
  );
  const migration = read(migrationGlobHint);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "reconRequiredEmailNotificationStatus"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "reconRequiredEmailNotifiedAt"/);
  assert.doesNotMatch(migration, /DROP COLUMN|DELETE FROM|TRUNCATE|UPDATE .* SET/i);
  assert.doesNotMatch(migration, /NOT NULL|DEFAULT '/i);
  console.log("   ok");

  console.log("2) markReconciliationRequired: best-effort schedule; recon immune to email failure");
  assert.match(purchase, /async function markReconciliationRequired/);
  assert.match(
    purchase,
    /scheduleReconciliationRequiredNotification\(options\.purchaseId\)/
  );
  const marker = purchase.indexOf("async function markReconciliationRequired");
  const fn = purchase.slice(marker, marker + 4500);
  const txEnd = fn.indexOf("});");
  const scheduleAt = fn.indexOf(
    "scheduleReconciliationRequiredNotification(options.purchaseId)"
  );
  const throwAt = fn.indexOf('throw new WalletEsimPurchaseError');
  assert.ok(scheduleAt > txEnd, "schedule after durable transaction");
  assert.ok(throwAt > scheduleAt, "schedule before throw");
  // Must not await notify / wrap schedule in try that mutates recon status.
  assert.doesNotMatch(
    fn.slice(scheduleAt - 80, throwAt + 200),
    /await\s+notifyReconciliationRequiredEmail|await\s+scheduleReconciliation/
  );
  assert.match(fn, /reconciliationState:\s*"awaiting_manual_review"/);
  assert.match(fn, /WalletEsimPurchaseStatus\.RECONCILIATION_REQUIRED/);
  // Schedule is fire-and-forget; failure only logs.
  const notifySrc = read(notifyPath);
  assert.match(
    notifySrc,
    /void notifyReconciliationRequiredEmail\(purchaseId\)\.catch/
  );
  assert.match(
    notifySrc,
    /never affects purchase\/reconciliation|Email failure must not roll back/i
  );
  console.log("   ok");

  console.log("3) Failed-send retry safety (wallet-style claimable set)");
  assert.ok(existsSync(join(root, claimPath)), `missing ${claimPath}`);
  assert.equal(isReconRequiredEmailClaimable(null), true);
  assert.equal(isReconRequiredEmailClaimable(RECON_REQUIRED_EMAIL_FAILED), true);
  assert.equal(
    isReconRequiredEmailClaimable(RECON_REQUIRED_EMAIL_NOT_CONFIGURED),
    true
  );
  assert.equal(isReconRequiredEmailClaimable(RECON_REQUIRED_EMAIL_SENDING), false);
  assert.equal(isReconRequiredEmailClaimable(RECON_REQUIRED_EMAIL_SENT), false);
  assert.equal(isReconRequiredEmailClaimable(RECON_REQUIRED_EMAIL_SKIPPED), false);

  // A) first send fails → B) retryable failed
  const c1 = applyReconRequiredEmailTransition(null, "claim");
  assert.equal(c1.ok, true);
  if (!c1.ok) throw new Error("unreachable");
  assert.equal(c1.next, RECON_REQUIRED_EMAIL_SENDING);
  const f1 = applyReconRequiredEmailTransition(c1.next, "failed");
  assert.equal(f1.ok, true);
  if (!f1.ok) throw new Error("unreachable");
  assert.equal(f1.next, RECON_REQUIRED_EMAIL_FAILED);
  assert.equal(isReconRequiredEmailClaimable(f1.next), true);

  // C) later invocation can claim and succeed
  const c2 = applyReconRequiredEmailTransition(f1.next, "claim");
  assert.equal(c2.ok, true);
  if (!c2.ok) throw new Error("unreachable");
  assert.equal(c2.next, RECON_REQUIRED_EMAIL_SENDING);
  const s1 = applyReconRequiredEmailTransition(c2.next, "sent");
  assert.equal(s1.ok, true);
  if (!s1.ok) throw new Error("unreachable");
  assert.equal(s1.next, RECON_REQUIRED_EMAIL_SENT);

  // D) duplicate successful invocation does not re-claim
  const c3 = applyReconRequiredEmailTransition(s1.next, "claim");
  assert.equal(c3.ok, false);
  if (c3.ok) throw new Error("unreachable");
  assert.equal(c3.reason, "already_sent");

  // Implementation wires wallet-style retry claim OR + release sending→failed
  assert.match(notifySrc, /RECON_REQUIRED_EMAIL_FAILED/);
  assert.match(notifySrc, /RECON_REQUIRED_EMAIL_NOT_CONFIGURED/);
  assert.match(notifySrc, /reconRequiredEmailNotificationStatus:\s*null/);
  assert.match(notifySrc, /releaseSendingClaimToFailed|RECON_REQUIRED_EMAIL_SENDING/);
  assert.match(
    notifySrc,
    /reconRequiredEmailNotificationStatus:\s*RECON_REQUIRED_EMAIL_FAILED/
  );
  // Wallet convention referenced for retryable failed/not_configured
  assert.match(
    walletNotify,
    /WALLET_TX_EMAIL_FAILED,\s*WALLET_TX_EMAIL_NOT_CONFIGURED/
  );
  console.log("   ok");

  console.log("4) Notification module gates + funds-returned skip");
  assert.ok(existsSync(join(root, notifyPath)), `missing ${notifyPath}`);
  assert.match(notifySrc, /export async function notifyReconciliationRequiredEmail/);
  assert.match(notifySrc, /export function scheduleReconciliationRequiredNotification/);
  assert.match(notifySrc, /WalletEsimPurchaseStatus\.RECONCILIATION_REQUIRED/);
  assert.match(notifySrc, /updateMany/);
  assert.match(notifySrc, /refundTransactionId/);
  assert.match(notifySrc, /WALLET_ESIM_PURCHASE_REFUND|funds_already_returned/);
  assert.match(notifySrc, /channel:\s*"billing"/);
  assert.doesNotMatch(notifySrc, /providerOrderId|safeProviderStatusCode|failureCode/);
  assert.ok(!/prisma\.\$transaction/.test(notifySrc));
  console.log("   ok");

  console.log("5) Template: customer meaning, no sensitive internals");
  assert.ok(existsSync(join(root, templatePath)), `missing ${templatePath}`);
  const template = read(templatePath);
  assert.match(template, /We’re reviewing your MAP eSIM order|We're reviewing your MAP eSIM order/);
  assert.match(template, /Please do not place the same order again/i);
  assert.equal(RECON_REQUIRED_EMAIL_SUBJECT.includes("reviewing"), true);
  const sample = {
    customerName: "Alex",
    purchaseReference: "ab12…xy89",
    planLabel: "1 GB · 7 Days",
    destinationLabel: "Pakistan",
    amountLabel: "$5.00",
    currencyLabel: "USD",
    supportUrl: "https://mapesim.com/support",
    accountOrdersUrl: "https://mapesim.com/account/orders",
  };
  const html = renderReconciliationRequiredEmailHtml(sample);
  const text = renderReconciliationRequiredEmailText(sample);
  assert.match(html, /under review/i);
  assert.match(text, /under review/i);
  assert.match(html + text, /do not/i);
  assert.match(html + text, /reserved|held|safely/i);
  assert.match(html + text, /update you|confirm/i);
  assertNoSensitive(html);
  assertNoSensitive(text);
  assertNoSensitive(template);
  console.log("   ok");

  console.log("6) Existing purchase/refund/wallet paths unchanged structurally");
  assert.match(purchase, /scheduleWalletTransactionNotification/);
  assert.match(purchase, /deliverCompletedWalletPurchaseInstallEmail/);
  assert.match(purchase, /refundReservedFunds/);
  const paymentFailure = read("app/lib/esim/paymentFailureNotification.ts");
  assert.match(paymentFailure, /schedulePaymentFailureNotification/);
  const refundNotify = read("app/lib/refunds/refundRequestNotification.ts");
  assert.match(refundNotify, /scheduleRefundStatusNotification/);
  assert.match(walletNotify, /scheduleWalletTransactionNotification/);
  assert.match(pkg, /"qa:reconciliation-required-email"/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=reconciliation-required-email");
}

main();
