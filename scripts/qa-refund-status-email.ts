/**
 * Offline QA for customer refund-status email notifications.
 * Does not mutate DB, call gateways, credit wallets, or send SMTP mail.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  refundStatusEmailSubject,
  renderRefundStatusEmailHtml,
  renderRefundStatusEmailText,
} from "../app/lib/email/refundStatusTemplate";
import {
  REFUND_AUDIT,
  REFUND_STATUS_EMAIL_EVENTS,
} from "../app/lib/refunds/refundRequestConstants";
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
    "adminDecisionNote",
    "provider cost",
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
  const service = read("app/lib/refunds/refundRequest.ts");
  const execution = read("app/lib/refunds/refundRequestExecution.ts");
  const notify = read("app/lib/refunds/refundRequestNotification.ts");
  const template = read("app/lib/email/refundStatusTemplate.ts");
  const constants = read("app/lib/refunds/refundRequestConstants.ts");
  const actions = read("app/lib/refunds/refundRequestActions.ts");
  const adminActions = read("app/lib/refunds/refundRequestAdminActions.ts");
  const purchase = read("app/lib/esim/walletPurchase.ts");
  const pg4 = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const pkg = read("package.json");

  console.log("1) No email-status columns on RefundRequest");
  assert.doesNotMatch(schema, /RefundRequest[\s\S]{0,800}emailNotificationStatus/);
  assert.doesNotMatch(
    service,
    /prisma\.migrate|CREATE TABLE|ALTER TABLE "RefundRequest"/
  );
  console.log("   ok");

  console.log("2) Reuses billing channel + branded template");
  assert.match(notify, /channel:\s*"billing"/);
  assert.match(notify, /X-MAP-ESIM-Billing-Kind":\s*"refund_status"/);
  assert.match(notify, /sendChannelMail/);
  assert.match(notify, /scheduleRefundStatusNotification/);
  assert.match(notify, /renderRefundStatusEmailHtml/);
  assert.match(template, /renderTransactionalEmailLayoutHtml/);
  assert.match(template, /renderEmailFooterText/);
  assert.match(pkg, /"qa:refund-status-email"/);
  console.log("   ok");

  console.log("3) Hook after create / under_review / approve / reject / completed");
  assert.match(
    service,
    /scheduleRefundStatusNotification\(created\.id,\s*"received"\)/
  );
  assert.match(
    service,
    /fromStatus === RefundRequestStatus\.REQUESTED[\s\S]{0,120}scheduleRefundStatusNotification\(current\.id,\s*"under_review"\)/
  );
  assert.match(
    service,
    /scheduleRefundStatusNotification\(current\.id,\s*"approved_pending_execution"\)/
  );
  assert.match(
    service,
    /scheduleRefundStatusNotification\(current\.id,\s*"rejected"\)/
  );
  assert.match(
    execution,
    /scheduleRefundStatusNotification\([\s\S]{0,40}"completed"\)/
  );
  assert.doesNotMatch(
    service,
    /DUPLICATE_OPEN[\s\S]{0,200}scheduleRefundStatusNotification/
  );
  assert.doesNotMatch(actions, /scheduleRefundStatusNotification/);
  assert.doesNotMatch(adminActions, /scheduleRefundStatusNotification/);
  console.log("   ok");

  console.log("4) Duplicate protection + non-blocking failure");
  assert.match(notify, /alreadyEmailed|already_emailed/);
  assert.match(notify, /inFlightClaims/);
  assert.match(notify, /REFUND_AUDIT\.EMAIL_RECEIVED|refund\.email_received/);
  assert.match(notify, /REFUND_AUDIT\.EMAIL_UNDER_REVIEW|refund\.email_under_review/);
  assert.match(notify, /EMAIL_COMPLETED|email_completed/);
  assert.match(notify, /Never throws|never affects refund/i);
  assert.match(constants, /EMAIL_RECEIVED/);
  assert.match(constants, /EMAIL_UNDER_REVIEW/);
  assert.match(constants, /EMAIL_APPROVED_PENDING/);
  assert.match(constants, /EMAIL_REJECTED/);
  assert.match(constants, /EMAIL_COMPLETED/);
  assert.deepEqual([...REFUND_STATUS_EMAIL_EVENTS], [
    "received",
    "under_review",
    "approved_pending_execution",
    "rejected",
    "completed",
  ]);
  assert.equal(REFUND_AUDIT.EMAIL_RECEIVED, "refund.email_received");
  assert.equal(REFUND_AUDIT.EMAIL_UNDER_REVIEW, "refund.email_under_review");
  assert.equal(REFUND_AUDIT.EMAIL_COMPLETED, "refund.email_completed");
  console.log("   ok");

  console.log("5) Customer-safe wording");
  const sample = {
    kind: "approved_pending_execution" as const,
    customerName: "Alex",
    orderReference: "abcd…wxyz",
    amountLabel: formatUsdCents(1299),
    currencyLabel: "USD",
    orderUrl: "https://mapesim.com/account/orders/test",
    requestedAtLabel: "9 Aug 2026, 12:00 UTC",
  };
  const htmlApproved = renderRefundStatusEmailHtml(sample);
  const textApproved = renderRefundStatusEmailText(sample);
  const htmlReceived = renderRefundStatusEmailHtml({
    ...sample,
    kind: "received",
  });
  const textReceived = renderRefundStatusEmailText({
    ...sample,
    kind: "received",
  });
  const htmlUnderReview = renderRefundStatusEmailHtml({
    ...sample,
    kind: "under_review",
  });
  const textUnderReview = renderRefundStatusEmailText({
    ...sample,
    kind: "under_review",
  });
  const htmlRejected = renderRefundStatusEmailHtml({
    ...sample,
    kind: "rejected",
  });
  const textRejected = renderRefundStatusEmailText({
    ...sample,
    kind: "rejected",
  });
  const htmlCompleted = renderRefundStatusEmailHtml({
    ...sample,
    kind: "completed",
    walletCreditedLabel: formatUsdCents(1299),
  });
  const textCompleted = renderRefundStatusEmailText({
    ...sample,
    kind: "completed",
    walletCreditedLabel: formatUsdCents(1299),
  });

  for (const content of [
    htmlApproved,
    textApproved,
    htmlReceived,
    textReceived,
    htmlUnderReview,
    textUnderReview,
    htmlRejected,
    textRejected,
  ]) {
    assert.doesNotMatch(content, /Money refunded|has been refunded to your card/i);
    assert.doesNotMatch(content, /adminDecisionNote/);
  }
  assert.match(textReceived, /not confirmation that a refund has been approved or issued/i);
  assert.match(textReceived, /No refund has been completed yet/i);
  assert.match(textUnderReview, /under review/i);
  assert.match(textUnderReview, /no refund has been completed yet/i);
  assert.match(textApproved, /has been approved/i);
  assert.match(textApproved, /Actual funds have not yet been returned/i);
  assert.doesNotMatch(
    textApproved,
    /another confirmation only after refund execution succeeds/i
  );
  assert.match(textApproved, /refund-completed notice|MAP Wallet/i);
  assert.match(textRejected, /not approved/i);
  assert.match(textRejected, /support@mapesim\.com|\/contact/i);
  assert.match(textCompleted, /Refund completed|MAP Wallet credited/i);
  assert.match(textCompleted, /MAP Wallet credited/i);
  assert.match(textCompleted, /No Simpaisa|not a Simpaisa/i);
  assert.match(htmlCompleted, /MAP Wallet credited/i);
  assert.match(refundStatusEmailSubject("received"), /refund request/i);
  assert.match(refundStatusEmailSubject("under_review"), /under review/i);
  assert.match(
    refundStatusEmailSubject("approved_pending_execution"),
    /approved/i
  );
  assert.match(
    refundStatusEmailSubject("approved_pending_execution"),
    /not returned yet|funds not returned/i
  );
  assert.match(refundStatusEmailSubject("completed"), /completed/i);
  assertNoSensitive(htmlApproved);
  assertNoSensitive(textApproved);
  assertNoSensitive(htmlUnderReview);
  assertNoSensitive(textUnderReview);
  assertNoSensitive(htmlRejected);
  assertNoSensitive(textRejected);
  assertNoSensitive(htmlCompleted);
  assertNoSensitive(textCompleted);
  console.log("   ok");

  console.log("6) Review path has no money movement; execution owns COMPLETED email");
  assert.doesNotMatch(notify, /requestRefund\(|executeCreditCheckout/);
  assert.doesNotMatch(service, /REFUND_CREDIT|requestRefund\(/);
  assert.doesNotMatch(purchase, /scheduleRefundStatusNotification/);
  assert.doesNotMatch(pg4, /scheduleRefundStatusNotification/);
  assert.match(execution, /scheduleRefundStatusNotification\([\s\S]*"completed"/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=refund-status-email");
}

main();
