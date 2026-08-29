/**
 * Offline QA for Admin → VeSIM refund-review email (V1).
 * Does NOT send SMTP mail, mutate Production, or move money.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderVesimRefundReviewEmailHtml,
  renderVesimRefundReviewEmailText,
  vesimRefundReviewEmailSubject,
} from "../app/lib/email/vesimRefundReviewTemplate";
import { normalizeOptionalCc } from "../app/lib/email/transport";
import {
  REFUND_AUDIT,
  VESIM_REVIEW_ALREADY_SENT_MESSAGE,
  VESIM_REVIEW_ICCID_UNAVAILABLE_MESSAGE,
  VESIM_REVIEW_PROVIDER_REF_UNAVAILABLE_MESSAGE,
  VESIM_REVIEW_SENT_SUCCESS_MESSAGE,
} from "../app/lib/refunds/refundRequestConstants";
import {
  parseVesimRefundReviewRecipients,
  VESIM_REFUND_REVIEW_CC_ENV,
  VESIM_REFUND_REVIEW_EMAIL_ENV,
} from "../app/lib/refunds/vesimRefundReviewRecipients";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const service = read("app/lib/refunds/refundRequest.ts");
  const notifyCustomer = read("app/lib/refunds/refundRequestNotification.ts");
  const vesimReview = read("app/lib/refunds/refundRequestVesimReview.ts");
  const recipients = read("app/lib/refunds/vesimRefundReviewRecipients.ts");
  const template = read("app/lib/email/vesimRefundReviewTemplate.ts");
  const transport = read("app/lib/email/transport.ts");
  const adminActions = read("app/lib/refunds/refundRequestAdminActions.ts");
  const adminDetail = read("app/lib/refunds/refundRequestAdmin.ts");
  const page = read("app/admin/refund-requests/[id]/page.tsx");
  const ui = read("app/components/admin/AdminVesimRefundReviewSend.tsx");
  const constants = read("app/lib/refunds/refundRequestConstants.ts");
  const envExample = read(".env.example");
  const pkg = read("package.json");

  console.log("1) No migration / no RefundRequest schema fields for VeSIM send");
  assert.doesNotMatch(schema, /vesimReviewSentAt|vesimReviewSentByAdminId/);
  assert.doesNotMatch(
    schema,
    /enum RefundRequestStatus[\s\S]{0,400}VESIM/
  );
  assert.doesNotMatch(
    vesimReview,
    /prisma\.migrate|ALTER TABLE "RefundRequest"|vesimReviewSentAt/
  );
  console.log("   ok");

  console.log("2) Customer create does NOT send VeSIM review email");
  assert.match(
    service,
    /scheduleRefundStatusNotification\(created\.id,\s*"received"\)/
  );
  assert.doesNotMatch(service, /sendVesimRefundReviewEmail|vesim_refund_review/);
  assert.doesNotMatch(
    notifyCustomer,
    /sendVesimRefundReviewEmail|VESIM_REFUND_REVIEW/
  );
  console.log("   ok");

  console.log("3) Admin authorization + separate action");
  assert.match(adminActions, /adminSendVesimRefundReviewAction/);
  assert.match(adminActions, /requireRole\("ADMIN"\)/);
  assert.match(adminActions, /sendVesimRefundReviewEmail/);
  assert.match(vesimReview, /role !== Role\.ADMIN/);
  assert.match(vesimReview, /adminDisabledAt/);
  assert.match(page, /AdminVesimRefundReviewSend/);
  assert.match(ui, /Send to VeSIM for Review/);
  assert.match(ui, /VESIM_REVIEW_CONFIRM_MESSAGE|window\.confirm/);
  assert.doesNotMatch(ui, /iccidEncrypted|fullIccid|ICCID:\s*\{/);
  console.log("   ok");

  console.log("4) Billing channel + optional CC transport");
  assert.match(vesimReview, /channel:\s*"billing"/);
  assert.match(vesimReview, /sendChannelMail|mailSender/);
  assert.match(transport, /cc\?:/);
  assert.match(transport, /normalizeOptionalCc/);
  assert.match(recipients, /VESIM_REFUND_REVIEW_EMAIL/);
  assert.match(recipients, /VESIM_REFUND_REVIEW_CC/);
  assert.match(envExample, /VESIM_REFUND_REVIEW_EMAIL=/);
  assert.match(envExample, /VESIM_REFUND_REVIEW_CC=/);
  assert.doesNotMatch(vesimReview, /support@vesim\.global/);
  assert.doesNotMatch(recipients, /support@vesim\.global/);
  assert.doesNotMatch(template, /support@vesim\.global/);
  console.log("   ok");

  console.log("5) Recipient config fail-closed");
  assert.equal(
    parseVesimRefundReviewRecipients({ toRaw: "", ccRaw: "" }).ok,
    false
  );
  assert.equal(
    parseVesimRefundReviewRecipients({ toRaw: "not-an-email", ccRaw: "" }).ok,
    false
  );
  assert.equal(
    parseVesimRefundReviewRecipients({
      toRaw: "support@example.com",
      ccRaw: "bad-cc",
    }).ok,
    false
  );
  const good = parseVesimRefundReviewRecipients({
    toRaw: "support@example.com",
    ccRaw: "a@example.com, b@example.com, a@example.com",
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.to, "support@example.com");
    assert.deepEqual(good.cc, ["a@example.com", "b@example.com"]);
  }
  assert.equal(VESIM_REFUND_REVIEW_EMAIL_ENV, "VESIM_REFUND_REVIEW_EMAIL");
  assert.equal(VESIM_REFUND_REVIEW_CC_ENV, "VESIM_REFUND_REVIEW_CC");
  console.log("   ok");

  console.log("6) Transport CC normalize (omit = empty; invalid fails)");
  assert.deepEqual(normalizeOptionalCc(undefined), { ok: true, cc: [] });
  assert.deepEqual(normalizeOptionalCc([]), { ok: true, cc: [] });
  assert.equal(normalizeOptionalCc(["bad"]).ok, false);
  assert.deepEqual(normalizeOptionalCc(["A@Example.com", "a@example.com"]), {
    ok: true,
    cc: ["a@example.com"],
  });
  console.log("   ok");

  console.log("7) Email payload includes required fields; excludes secrets");
  const payload = {
    mapOrderId: "ord_map_123",
    providerOrderId: "vesim_prov_999",
    iccid: "8944501234567890123",
    destination: "Pakistan",
    planName: "1GB / 7 Days",
    purchaseDateLabel: "28 Aug 2026, 12:00 UTC",
    refundReasonLabel: "Technical issue",
    requestedAmountLabel: "$10.00 USD",
    orderStatusLabel: "COMPLETED",
    usageSummary: "0.40 GB remaining · 3 day(s) remaining",
    adminNote: "Please check cancellation eligibility",
  };
  const subject = vesimRefundReviewEmailSubject(payload.mapOrderId);
  const text = renderVesimRefundReviewEmailText(payload);
  const html = renderVesimRefundReviewEmailHtml(payload);
  assert.match(subject, /Refund Review Request/);
  assert.match(subject, /ord_map_123/);
  for (const body of [text, html]) {
    assert.match(body, /ord_map_123/);
    assert.match(body, /vesim_prov_999/);
    assert.match(body, /8944501234567890123/);
    assert.match(body, /Pakistan/);
    assert.match(body, /1GB \/ 7 Days/);
    assert.match(body, /Technical issue/);
    assert.match(body, /\$10\.00 USD/);
    assert.match(body, /COMPLETED/);
    assert.match(body, /0\.40 GB remaining/);
    assert.match(body, /Please check cancellation eligibility/);
    assert.doesNotMatch(body, /LPA:/i);
    assert.doesNotMatch(body, /SM-DP\+/i);
    assert.doesNotMatch(body, /activationCode/i);
    assert.doesNotMatch(body, /qrValue|QR payload|ESIM_QR_CID/i);
    assert.doesNotMatch(body, /SMTP_PASSWORD|passwordHash|AUTH_SECRET/i);
    assert.doesNotMatch(body, /webhookEventId|providerPayload/i);
  }
  console.log("   ok");

  console.log("8) ICCID + provider ref fail-safe messaging");
  assert.match(vesimReview, /decryptIccid/);
  assert.match(vesimReview, /iccidEncrypted/);
  assert.match(vesimReview, /NO_ICCID/);
  assert.match(vesimReview, /NO_PROVIDER_ORDER/);
  assert.match(constants, /VESIM_REVIEW_ICCID_UNAVAILABLE_MESSAGE/);
  assert.equal(
    VESIM_REVIEW_ICCID_UNAVAILABLE_MESSAGE.includes("ICCID is not available"),
    true
  );
  assert.equal(
    VESIM_REVIEW_PROVIDER_REF_UNAVAILABLE_MESSAGE.includes(
      "provider order reference"
    ),
    true
  );
  assert.doesNotMatch(vesimReview, /metadata:[\s\S]{0,200}iccid:/);
  assert.doesNotMatch(vesimReview, /console\.(log|info|error)\([^)]*iccid/i);
  assert.doesNotMatch(adminActions, /iccid:/);
  console.log("   ok");

  console.log("9) Duplicate / audit actions; no status mutation");
  assert.match(constants, /VESIM_REVIEW_EMAIL_SENDING/);
  assert.match(constants, /VESIM_REVIEW_EMAIL_SENT/);
  assert.match(constants, /VESIM_REVIEW_EMAIL_FAILED/);
  assert.equal(
    REFUND_AUDIT.VESIM_REVIEW_EMAIL_SENT,
    "refund.vesim_review_email_sent"
  );
  assert.match(vesimReview, /hasSuccessfulVesimReviewEmail|already_sent/);
  assert.match(vesimReview, /inFlightClaims/);
  assert.match(vesimReview, /refundStatusChanged:\s*false/);
  assert.match(vesimReview, /moneyMoved:\s*false/);
  assert.doesNotMatch(
    vesimReview,
    /RefundRequestStatus\.|status:\s*RefundRequestStatus|refundRequest\.update/
  );
  assert.match(adminDetail, /vesimReviewAlreadySent/);
  assert.equal(
    VESIM_REVIEW_ALREADY_SENT_MESSAGE.includes("already been sent"),
    true
  );
  assert.equal(
    VESIM_REVIEW_SENT_SUCCESS_MESSAGE.includes("sent to VeSIM successfully"),
    true
  );
  console.log("   ok");

  console.log("10) Package script wired");
  assert.match(pkg, /"qa:vesim-refund-review-email"/);
  console.log("   ok");

  console.log("ALL_VESIM_REFUND_REVIEW_EMAIL_CHECKS_PASSED");
}

main();
