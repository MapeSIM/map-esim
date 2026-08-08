/**
 * Offline QA for durable customer payment-failure email notifications.
 * Does not mutate wallets, call providers, or send SMTP mail.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderPaymentFailureEmailHtml,
  renderPaymentFailureEmailText,
} from "../app/lib/email/paymentFailureTemplate";
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
    "prisma/migrations/20260809010000_add_payment_failure_email_notification/migration.sql"
  );
  const notify = read("app/lib/esim/paymentFailureNotification.ts");
  const template = read("app/lib/email/paymentFailureTemplate.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const cancelPage = read("app/account/esim/buy/payment/cancel/page.tsx");
  const returnPage = read("app/account/esim/buy/payment/return/page.tsx");
  const pendingVerify = read("app/lib/admin/pendingPaymentVerify.ts");
  const walletNotify = read("app/lib/wallet/transactionNotification.ts");
  const orderEmail = read("app/lib/email/deliverAfterCheckout.ts");
  const vesimEmail = read("app/lib/vesim/creditCheckout.ts");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const pkg = read("package.json");

  console.log("1) Minimal nullable schema + migration");
  assert.match(schema, /failureEmailNotificationStatus\s+String\?/);
  assert.match(schema, /failureEmailNotifiedAt\s+DateTime\?/);
  assert.match(schema, /failureEmailWalletReturned\s+Boolean\?/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "failureEmailNotificationStatus"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "failureEmailNotifiedAt"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "failureEmailWalletReturned"/);
  assert.doesNotMatch(migration, /DROP COLUMN|DELETE FROM/i);
  console.log("   ok");

  console.log("2) Durable once-only claim + terminal gate");
  assert.match(notify, /failureEmailNotificationStatus:\s*null/);
  assert.match(notify, /updateMany/);
  assert.match(notify, /FAILED/);
  assert.match(notify, /CANCELLED/);
  assert.match(notify, /EXPIRED/);
  assert.match(notify, /schedulePaymentFailureNotification/);
  assert.match(notify, /channel:\s*"billing"/);
  assert.match(
    notify,
    /Your MAP eSIM payment wasn.t completed|Your MAP eSIM payment wasn’t completed/
  );
  assert.ok(!/prisma\.\$transaction/.test(notify));
  console.log("   ok");

  console.log("3) Terminal authority wiring (webhook + admin verify)");
  assert.match(apply, /releaseOnGatewayFailure/);
  assert.match(
    apply,
    /schedulePaymentFailureNotification\(options\.attemptId/
  );
  assert.match(
    apply,
    /event\.paymentStatus === "failed"[\s\S]*schedulePaymentFailureNotification\(byEvent\.id\)/
  );
  assert.match(pendingVerify, /VERIFIED_FAILED/);
  assert.match(pendingVerify, /VERIFIED_CANCELLED_OR_EXPIRED/);
  assert.match(pendingVerify, /schedulePaymentFailureNotification/);
  assert.match(pendingVerify, /admin_reporter_verified/);
  console.log("   ok");

  console.log("4) Browser cancel / pending / success must not schedule failure email");
  assert.match(cancelPage, /maybeReleasePendingGatewayReservation/);
  assert.doesNotMatch(cancelPage, /schedulePaymentFailureNotification/);
  assert.doesNotMatch(returnPage, /schedulePaymentFailureNotification/);
  assert.doesNotMatch(
    apply,
    /maybeReleasePendingGatewayReservation[\s\S]{0,200}schedulePaymentFailureNotification/
  );
  assert.doesNotMatch(
    apply,
    /PAYMENT_CONFIRMED[\s\S]{0,120}schedulePaymentFailureNotification/
  );
  console.log("   ok");

  console.log("5) Email content — gateway-only vs split wallet wording");
  const gatewayPayload = {
    customerName: "Ada Lovelace",
    purchaseReference: "purc…9f2a",
    planLabel: "1GB / 7 days",
    destinationLabel: "Turkey",
    amountLabel: formatUsdCents(1999),
    currencyLabel: "USD",
    occurredAtLabel: "9 Aug 2026, 10:00 UTC",
    walletFundsReturned: false,
    retryUrl: "https://mapesim.com/account/esim/buy/review?purchase=p1",
  };
  const gatewayHtml = renderPaymentFailureEmailHtml(gatewayPayload);
  const gatewayText = renderPaymentFailureEmailText(gatewayPayload);
  assert.match(gatewayHtml, /Payment wasn’t completed|Payment wasn.t completed/);
  assert.match(gatewayHtml, /No new eSIM was created/);
  assert.match(gatewayHtml, /Retry checkout/);
  assert.doesNotMatch(gatewayHtml, /reserved wallet funds have been returned/i);
  assert.doesNotMatch(gatewayHtml, /card refund|gateway refund/i);
  assertNoSensitive(gatewayHtml);
  assertNoSensitive(gatewayText);

  const splitPayload = {
    ...gatewayPayload,
    walletFundsReturned: true,
  };
  const splitHtml = renderPaymentFailureEmailHtml(splitPayload);
  const splitText = renderPaymentFailureEmailText(splitPayload);
  assert.match(splitHtml, /Your reserved wallet funds have been returned/);
  assert.match(splitText, /Your reserved wallet funds have been returned/);
  assert.doesNotMatch(splitHtml, /card refund|gateway refund/i);
  assertNoSensitive(splitHtml);
  assertNoSensitive(template);
  console.log("   ok");

  console.log("6) Regressions — order / wallet / VeSIM isolation / guest");
  assert.match(walletNotify, /scheduleWalletTransactionNotification/);
  assert.doesNotMatch(walletNotify, /schedulePaymentFailureNotification/);
  assert.match(orderEmail, /deliverOrderEmailAfterCheckout/);
  assert.doesNotMatch(orderEmail, /schedulePaymentFailureNotification/);
  assert.ok(existsSync(join(root, "app/lib/email/deliverAfterCheckout.ts")));
  assert.match(vesimEmail, /VESIM_PROVIDER_CUSTOMER_EMAIL|orders@mapesim\.com/);
  assert.match(guestGate, /ENABLE_GUEST_VESIM_CHECKOUT === "true"/);
  assert.match(pkg, /"qa:payment-failure-email"/);
  console.log("   ok");

  console.log("PASS payment_failure_email_offline_qa");
}

main();
