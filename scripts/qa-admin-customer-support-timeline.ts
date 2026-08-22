/**
 * Offline QA for Phase 2B Fix #3 — admin customer support timeline.
 * Compose-don't-store: no timeline table, no payment apply, no VeSIM, no secrets.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_CUSTOMER_SUPPORT_TIMELINE_AUDIT_ACTIONS,
  ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT,
  ADMIN_CUSTOMER_SUPPORT_TIMELINE_SOURCES,
  clipSupportTimelineDetail,
  humanizeSupportTimelineStatus,
  isAdminCustomerSupportTimelineAuditAction,
  selectNewestSupportTimelineEvents,
  supportTimelinePaymentAttemptTitle,
  supportTimelinePurchaseTitle,
  supportTimelineSourceLabel,
} from "../app/lib/admin/customerSupportTimelineShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT, 50);
  assert.deepEqual([...ADMIN_CUSTOMER_SUPPORT_TIMELINE_SOURCES], [
    "purchase",
    "payment_attempt",
    "webhook_receipt",
    "order",
    "wallet_transaction",
    "refund_request",
    "email",
    "audit",
  ]);
  assert.equal(supportTimelineSourceLabel("purchase"), "Wallet purchase");
  assert.equal(
    supportTimelinePurchaseTitle("RECONCILIATION_REQUIRED"),
    "eSIM purchase needs reconciliation"
  );
  assert.equal(supportTimelinePaymentAttemptTitle("FAILED"), "Payment failed");
  assert.equal(humanizeSupportTimelineStatus("AWAITING_GATEWAY_PAYMENT"), "Awaiting Gateway Payment");
  assert.equal(clipSupportTimelineDetail("  hello   world  "), "hello world");
  assert.equal(clipSupportTimelineDetail("x".repeat(200)).length, 120);
  assert.ok(isAdminCustomerSupportTimelineAuditAction("esim.payment_confirmed"));
  assert.ok(!isAdminCustomerSupportTimelineAuditAction("auth.login"));
  assert.ok(
    ADMIN_CUSTOMER_SUPPORT_TIMELINE_AUDIT_ACTIONS.includes(
      "esim.payment_webhook_duplicate"
    )
  );

  const sorted = selectNewestSupportTimelineEvents([
    { id: "a", occurredAtMs: 1 },
    { id: "c", occurredAtMs: 3 },
    { id: "b", occurredAtMs: 3 },
    { id: "d", occurredAtMs: 2 },
  ]);
  assert.deepEqual(
    sorted.map((row) => row.id),
    ["c", "b", "d", "a"]
  );

  const overflow = selectNewestSupportTimelineEvents(
    Array.from({ length: 60 }, (_, i) => ({
      id: String(i).padStart(3, "0"),
      occurredAtMs: i,
    })),
    200
  );
  assert.equal(overflow.length, 50);
  assert.equal(overflow[0]?.id, "059");
  console.log("PASS timeline_helpers_limit_and_sort");

  const schema = read("prisma/schema.prisma");
  assert.doesNotMatch(schema, /model CustomerSupportTimeline/);
  assert.doesNotMatch(schema, /model SupportTimeline/);
  assert.doesNotMatch(schema, /model CustomerTimeline/);
  console.log("PASS no_timeline_table");

  assert.ok(existsSync(join(root, "app/lib/admin/customerSupportTimeline.ts")));
  assert.ok(
    existsSync(join(root, "app/admin/customers/[id]/timeline/page.tsx"))
  );

  const reader = read("app/lib/admin/customerSupportTimeline.ts");
  const page = read("app/admin/customers/[id]/timeline/page.tsx");
  const customerPage = read("app/admin/customers/[id]/page.tsx");
  const shared = read("app/lib/admin/customerSupportTimelineShared.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const applyEsim = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const pkg = read("package.json");
  const prelaunch = read("scripts/qa-prelaunch.ts");

  assert.match(reader, /import "server-only"/);
  assert.match(reader, /getAdminCustomerSupportTimeline/);
  assert.match(reader, /Role\.CUSTOMER/);
  assert.match(reader, /walletEsimPurchase\.findMany/);
  assert.match(reader, /esimPurchasePaymentAttempt\.findMany/);
  assert.match(reader, /paymentWebhookReceipt\.findMany/);
  assert.match(reader, /order\.findMany/);
  assert.match(reader, /walletAccount\.findFirst/);
  assert.match(reader, /refundRequest\.findMany/);
  assert.match(reader, /auditLog\.findMany/);
  assert.match(reader, /selectNewestSupportTimelineEvents/);
  assert.doesNotMatch(reader, /\.update\(|\.create\(|\.delete\(|deleteMany/);
  assert.doesNotMatch(reader, /applyVerifiedPaymentEvent|applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(reader, /fulfillFundedEsimPurchase|executeCreditCheckout/);
  assert.doesNotMatch(reader, /PAYMENT_GATEWAY_ENABLED|allowProduction|simpaisa/i);
  assert.doesNotMatch(reader, /replayWebhook|markPaid|verifyPendingGatewayPayment/);
  assert.doesNotMatch(reader, /iccid|qrCode|qrPayload|rawBody|passwordHash|alternateDeliveryEmail|gatewayPaymentRef/i);
  console.log("PASS reader_readonly_no_secrets");

  assert.match(page, /requireRole\("ADMIN"\)/);
  assert.match(page, /getAdminCustomerSupportTimeline/);
  assert.match(page, /read-only/);
  assert.match(page, /does not replay webhooks/);
  assert.match(page, /No support timeline events for this customer yet/);
  assert.doesNotMatch(page, /replayWebhook|markPaid|applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(page, /fulfillFundedEsimPurchase|PAYMENT_GATEWAY_ENABLED/);
  assert.doesNotMatch(page, /PendingPaymentVerifyForm|verifyPendingGatewayPayment/);
  assert.doesNotMatch(page, /iccid|qrCode|rawBody/i);
  console.log("PASS timeline_page_admin_readonly");

  assert.match(customerPage, /Support timeline/);
  assert.match(
    customerPage,
    /\/admin\/customers\/\$\{encodeURIComponent\(detail\.id\)\}\/timeline/
  );
  console.log("PASS customer_detail_links_timeline");

  assert.match(shared, /ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT = 50/);
  assert.match(pkg, /qa:admin-customer-support-timeline/);
  assert.match(prelaunch, /qa:admin-customer-support-timeline/);
  assert.doesNotMatch(apply, /getAdminCustomerSupportTimeline|CustomerSupportTimeline/);
  assert.doesNotMatch(applyEsim, /getAdminCustomerSupportTimeline|CustomerSupportTimeline/);
  console.log("PASS wiring_and_apply_unchanged");

  console.log("ALL PASS qa-admin-customer-support-timeline");
}

main();
