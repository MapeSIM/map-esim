/**
 * Offline QA for Partner refund-status email notifications.
 * Does not mutate DB, call gateways, credit wallets, or send SMTP mail.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  partnerRefundStatusEmailSubject,
  renderPartnerRefundStatusEmailHtml,
  renderPartnerRefundStatusEmailText,
} from "../app/lib/email/partnerRefundStatusTemplate";
import {
  PARTNER_REFUND_AUDIT,
  PARTNER_REFUND_STATUS_EMAIL_EVENTS,
  partnerRefundStatusLabel,
} from "../app/lib/partner/partnerRefundRequestConstants";
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
    "provider cost",
    "IMEI",
    "EID",
    "VeSIM",
    "simpaisa",
    "Simpaisa",
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
  const create = read("app/lib/partner/partnerRefundRequest.ts");
  const admin = read("app/lib/partner/partnerRefundRequestAdmin.ts");
  const execution = read("app/lib/partner/partnerRefundRequestExecution.ts");
  const sync = read("app/lib/partner/partnerRefundRequestSync.ts");
  const recon = read("app/lib/admin/reconciliationPartnerRefund.ts");
  const notify = read("app/lib/partner/partnerRefundRequestNotification.ts");
  const template = read("app/lib/email/partnerRefundStatusTemplate.ts");
  const constants = read("app/lib/partner/partnerRefundRequestConstants.ts");
  const customerNotify = read("app/lib/refunds/refundRequestNotification.ts");
  const customerExec = read("app/lib/refunds/refundRequestExecution.ts");
  const pkg = read("package.json");

  console.log("1) No PartnerRefundRequest email-status columns / no migration");
  assert.doesNotMatch(
    schema,
    /model PartnerRefundRequest[\s\S]{0,1200}emailNotificationStatus/
  );
  assert.doesNotMatch(notify, /prisma\.migrate|ALTER TABLE "PartnerRefundRequest"/);
  console.log("   ok");

  console.log("2) Billing channel + Partner template");
  assert.match(notify, /channel:\s*"billing"/);
  assert.match(notify, /partner_refund_status/);
  assert.match(notify, /sendChannelMail/);
  assert.match(notify, /schedulePartnerRefundStatusNotification/);
  assert.match(notify, /renderPartnerRefundStatusEmailHtml/);
  assert.match(template, /renderTransactionalEmailLayoutHtml/);
  assert.match(template, /renderEmailFooterText/);
  assert.match(pkg, /"qa:partner-refund-status-email"/);
  console.log("   ok");

  console.log("3) Hooks after successful create / review / approve / reject / completed");
  assert.match(
    create,
    /schedulePartnerRefundStatusNotification\(created\.id,\s*"received"\)/
  );
  assert.match(
    admin,
    /schedulePartnerRefundStatusNotification\(current\.id,\s*"under_review"\)/
  );
  assert.match(
    admin,
    /schedulePartnerRefundStatusNotification\(\s*current\.id,\s*"approved_pending_execution"\s*\)/
  );
  assert.match(
    admin,
    /schedulePartnerRefundStatusNotification\(current\.id,\s*"rejected"\)/
  );
  assert.match(
    execution,
    /schedulePartnerRefundStatusNotification\(request\.id,\s*"completed"\)/
  );
  assert.match(execution, /schedulePartnerRefundCompletedNotifications/);
  assert.match(recon, /schedulePartnerRefundCompletedNotifications/);
  assert.match(sync, /completedRequestIds/);
  assert.doesNotMatch(create, /DUPLICATE|existingOpen[\s\S]{0,80}schedulePartnerRefundStatusNotification/);
  console.log("   ok");

  console.log("4) Duplicate protection + non-blocking failure");
  assert.match(notify, /alreadyEmailed|already_emailed/);
  assert.match(notify, /inFlightClaims/);
  assert.match(notify, /EMAIL_RECEIVED|partner_refund\.email_received/);
  assert.match(notify, /EMAIL_COMPLETED|partner_refund\.email_completed/);
  assert.match(notify, /Never throws|never affects Partner refund/i);
  assert.deepEqual([...PARTNER_REFUND_STATUS_EMAIL_EVENTS], [
    "received",
    "under_review",
    "approved_pending_execution",
    "rejected",
    "completed",
  ]);
  assert.equal(PARTNER_REFUND_AUDIT.EMAIL_RECEIVED, "partner_refund.email_received");
  assert.equal(
    PARTNER_REFUND_AUDIT.EMAIL_UNDER_REVIEW,
    "partner_refund.email_under_review"
  );
  assert.equal(
    PARTNER_REFUND_AUDIT.EMAIL_APPROVED_PENDING,
    "partner_refund.email_approved_pending_execution"
  );
  assert.equal(PARTNER_REFUND_AUDIT.EMAIL_REJECTED, "partner_refund.email_rejected");
  assert.equal(PARTNER_REFUND_AUDIT.EMAIL_COMPLETED, "partner_refund.email_completed");
  assert.doesNotMatch(constants, /EMAIL_EXECUTION_FAILED/);
  assert.ok(!PARTNER_REFUND_STATUS_EMAIL_EVENTS.includes("execution_failed" as never));
  console.log("   ok");

  console.log("5) Partner-safe wording + amount = partnerChargeCents");
  assert.match(notify, /partnerChargeCents/);
  assert.match(notify, /Role\.PARTNER/);
  assert.equal(
    partnerRefundStatusLabel("APPROVED_PENDING_EXECUTION"),
    "Approved — pending wallet credit"
  );

  const sample = {
    kind: "approved_pending_execution" as const,
    partnerName: "Alex Partner",
    purchaseReference: "abcd…wxyz",
    amountLabel: formatUsdCents(2500),
    currencyLabel: "USD",
    ordersUrl: "https://mapesim.com/partner/orders",
    eventAtLabel: "26 Aug 2026, 12:00 UTC",
  };
  const htmlApproved = renderPartnerRefundStatusEmailHtml(sample);
  const textApproved = renderPartnerRefundStatusEmailText(sample);
  const htmlReceived = renderPartnerRefundStatusEmailHtml({
    ...sample,
    kind: "received",
  });
  const textReceived = renderPartnerRefundStatusEmailText({
    ...sample,
    kind: "received",
  });
  const htmlUnderReview = renderPartnerRefundStatusEmailHtml({
    ...sample,
    kind: "under_review",
  });
  const textUnderReview = renderPartnerRefundStatusEmailText({
    ...sample,
    kind: "under_review",
  });
  const htmlRejected = renderPartnerRefundStatusEmailHtml({
    ...sample,
    kind: "rejected",
    decisionNote: "Purchase already delivered",
  });
  const textRejected = renderPartnerRefundStatusEmailText({
    ...sample,
    kind: "rejected",
    decisionNote: "Purchase already delivered",
  });
  const htmlCompleted = renderPartnerRefundStatusEmailHtml({
    ...sample,
    kind: "completed",
    walletCreditedLabel: formatUsdCents(2500),
  });
  const textCompleted = renderPartnerRefundStatusEmailText({
    ...sample,
    kind: "completed",
    walletCreditedLabel: formatUsdCents(2500),
  });

  for (const content of [
    htmlApproved,
    textApproved,
    htmlReceived,
    textReceived,
    htmlUnderReview,
    textUnderReview,
  ]) {
    assert.doesNotMatch(content, /Partner MAP Wallet credited:/i);
    assert.doesNotMatch(content, /was credited to your Partner MAP Wallet/i);
  }
  assert.match(textApproved, /Funds have NOT been credited/i);
  assert.match(textReceived, /No Partner MAP Wallet funds have been moved/i);
  assert.match(textUnderReview, /no Partner MAP Wallet credit has been issued yet/i);
  assert.match(textRejected, /Decision note: Purchase already delivered/);
  assert.match(htmlRejected, /Decision note/);
  assert.match(textCompleted, /Partner MAP Wallet credited/i);
  assert.match(htmlCompleted, /Partner MAP Wallet credited/i);
  assert.match(textCompleted, /\$25\.00/);
  assert.equal(
    partnerRefundStatusEmailSubject("completed"),
    "Your MAP eSIM Partner refund is completed — MAP Wallet credited"
  );
  for (const content of [
    htmlApproved,
    textApproved,
    htmlReceived,
    textReceived,
    htmlUnderReview,
    textUnderReview,
    htmlRejected,
    textRejected,
    htmlCompleted,
    textCompleted,
  ]) {
    assertNoSensitive(content);
  }
  console.log("   ok");

  console.log("6) Customer refunds + Simpaisa untouched by this module");
  assert.doesNotMatch(notify, /scheduleRefundStatusNotification/);
  assert.doesNotMatch(notify, /from ["']@\/app\/lib\/refunds\//);
  assert.doesNotMatch(customerNotify, /schedulePartnerRefundStatusNotification/);
  assert.doesNotMatch(customerExec, /schedulePartnerRefundStatusNotification/);
  assert.doesNotMatch(notify, /simpaisa|Simpaisa|requestRefund/i);
  assert.doesNotMatch(execution, /EXECUTION_FAILED/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=partner-refund-status-email");
}

main();
