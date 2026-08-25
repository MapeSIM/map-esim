/**
 * Offline QA for durable customer "payment received, eSIM still preparing" email.
 * Does not mutate wallets, call providers, or send SMTP mail.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAYMENT_RECEIVED_PENDING_EMAIL_SUBJECT,
  renderPaymentReceivedPendingEmailHtml,
  renderPaymentReceivedPendingEmailText,
} from "../app/lib/email/paymentReceivedPendingTemplate";
import {
  PAYMENT_RECEIVED_EMAIL_FAILED,
  PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED,
  PAYMENT_RECEIVED_EMAIL_SENDING,
  PAYMENT_RECEIVED_EMAIL_SENT,
  PAYMENT_RECEIVED_EMAIL_SKIPPED,
  applyPaymentReceivedEmailTransition,
  isPaymentReceivedEmailClaimable,
  shouldSendPaymentReceivedPendingEmail,
} from "../app/lib/esim/paymentReceivedPendingEmailClaim";
import { formatUsdCents } from "../app/lib/wallet/display";

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
    "webhookEventId",
    "IMEI",
    "EID",
    "VeSIM",
  ];
  for (const token of banned) {
    assert.equal(
      content.includes(token),
      false,
      `sensitive token leaked: ${token}`
    );
  }
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260826120000_add_payment_received_pending_email/migration.sql"
  );
  const notify = read("app/lib/esim/paymentReceivedPendingNotification.ts");
  const template = read("app/lib/email/paymentReceivedPendingTemplate.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const install = read("app/lib/esim/esimPurchaseInstallEmail.ts");
  const reconNotify = read("app/lib/esim/reconciliationRequiredNotification.ts");
  const failureNotify = read("app/lib/esim/paymentFailureNotification.ts");
  const pkg = read("package.json");

  console.log("1) Minimal nullable schema + migration");
  assert.match(schema, /paymentReceivedEmailNotificationStatus\s+String\?/);
  assert.match(schema, /paymentReceivedEmailNotifiedAt\s+DateTime\?/);
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS "paymentReceivedEmailNotificationStatus"/
  );
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS "paymentReceivedEmailNotifiedAt"/
  );
  assert.doesNotMatch(migration, /DROP COLUMN|DELETE FROM/i);
  console.log("   ok");

  console.log("2) Durable once-only claim + pending-fulfillment gate");
  assert.equal(isPaymentReceivedEmailClaimable(null), true);
  assert.equal(isPaymentReceivedEmailClaimable(PAYMENT_RECEIVED_EMAIL_FAILED), true);
  assert.equal(
    isPaymentReceivedEmailClaimable(PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED),
    true
  );
  assert.equal(isPaymentReceivedEmailClaimable(PAYMENT_RECEIVED_EMAIL_SENT), false);
  assert.equal(isPaymentReceivedEmailClaimable(PAYMENT_RECEIVED_EMAIL_SKIPPED), false);
  assert.equal(isPaymentReceivedEmailClaimable(PAYMENT_RECEIVED_EMAIL_SENDING), false);

  const claim = applyPaymentReceivedEmailTransition(null, "claim");
  assert.equal(claim.ok, true);
  if (claim.ok) assert.equal(claim.next, PAYMENT_RECEIVED_EMAIL_SENDING);
  const sent = applyPaymentReceivedEmailTransition(
    PAYMENT_RECEIVED_EMAIL_SENDING,
    "sent"
  );
  assert.equal(sent.ok, true);
  const dup = applyPaymentReceivedEmailTransition(
    PAYMENT_RECEIVED_EMAIL_SENT,
    "claim"
  );
  assert.equal(dup.ok, false);

  assert.equal(
    shouldSendPaymentReceivedPendingEmail({
      purchaseStatus: "FUNDED",
      emailDeliveryStatus: null,
    }),
    true
  );
  assert.equal(
    shouldSendPaymentReceivedPendingEmail({
      purchaseStatus: "PROVIDER_PENDING",
      emailDeliveryStatus: null,
    }),
    true
  );
  assert.equal(
    shouldSendPaymentReceivedPendingEmail({
      purchaseStatus: "COMPLETED",
      emailDeliveryStatus: "skipped_no_install_details",
    }),
    true
  );
  assert.equal(
    shouldSendPaymentReceivedPendingEmail({
      purchaseStatus: "COMPLETED",
      emailDeliveryStatus: "sent",
    }),
    false
  );
  assert.equal(
    shouldSendPaymentReceivedPendingEmail({
      purchaseStatus: "RECONCILIATION_REQUIRED",
      emailDeliveryStatus: null,
    }),
    false
  );
  assert.equal(
    shouldSendPaymentReceivedPendingEmail({
      purchaseStatus: "FAILED_REFUNDED",
      emailDeliveryStatus: null,
    }),
    false
  );

  assert.match(notify, /paymentReceivedEmailNotificationStatus:\s*null/);
  assert.match(notify, /updateMany/);
  assert.match(notify, /schedulePaymentReceivedPendingNotification/);
  assert.match(notify, /channel:\s*"billing"/);
  assert.match(notify, /PAYMENT_RECEIVED_PENDING_EMAIL_SUBJECT/);
  assert.ok(!/prisma\.\$transaction/.test(notify));
  console.log("   ok");

  console.log("3) Wired after funded fulfillment and missing install details");
  assert.match(apply, /schedulePaymentReceivedPendingNotification/);
  assert.match(apply, /fulfillFundedEsimPurchaseAfterPayment/);
  assert.match(
    apply,
    /finally \{[\s\S]{0,200}schedulePaymentReceivedPendingNotification/
  );
  assert.match(install, /schedulePaymentReceivedPendingNotification/);
  assert.match(
    install,
    /skipped_no_install_details[\s\S]{0,180}schedulePaymentReceivedPendingNotification/
  );
  assert.doesNotMatch(apply, /schedulePaymentReceivedPendingNotification\(options\.attemptId/);
  console.log("   ok");

  console.log("4) Does not replace recon or payment-failure emails");
  assert.match(reconNotify, /scheduleReconciliationRequiredNotification/);
  assert.doesNotMatch(reconNotify, /schedulePaymentReceivedPendingNotification/);
  assert.match(failureNotify, /schedulePaymentFailureNotification/);
  assert.doesNotMatch(failureNotify, /schedulePaymentReceivedPendingNotification/);
  console.log("   ok");

  console.log("5) Email content — payment received, eSIM not ready, no secrets");
  const payload = {
    customerName: "Ada Lovelace",
    purchaseReference: "purc…9f2a",
    planLabel: "1GB / 7 days",
    destinationLabel: "Turkey",
    amountLabel: formatUsdCents(1999),
    currencyLabel: "USD",
    accountOrdersUrl: "https://mapesim.com/account/orders",
  };
  const html = renderPaymentReceivedPendingEmailHtml(payload);
  const text = renderPaymentReceivedPendingEmailText(payload);
  assert.equal(
    PAYMENT_RECEIVED_PENDING_EMAIL_SUBJECT,
    "We received your MAP eSIM payment"
  );
  assert.match(html, /Payment received/);
  assert.match(html, /Your eSIM is being prepared/);
  assert.match(html, /separate email with QR code and install details/);
  assert.match(html, /No extra charge applies/);
  assert.match(html, /View my eSIMs/);
  assert.match(text, /We received your payment/);
  assert.match(text, /not ready to install yet/);
  assert.doesNotMatch(html, /localhost/);
  assert.doesNotMatch(html, /MAP-eSIM/);
  assertNoSensitive(html);
  assertNoSensitive(text);
  assertNoSensitive(template);
  assertNoSensitive(notify);
  console.log("   ok");

  console.log("6) Package script");
  assert.ok(existsSync(join(root, "app/lib/esim/paymentReceivedPendingNotification.ts")));
  assert.match(pkg, /"qa:payment-received-pending-email"/);
  console.log("   ok");

  console.log("\nAll payment-received pending email checks passed.");
}

main();
