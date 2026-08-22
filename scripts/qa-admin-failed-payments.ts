/**
 * Offline QA: admin failed/cancelled payment-attempt inbox (Phase 2B Fix #1).
 * Display mapping and source checks only — no payment apply, VeSIM, or DB writes.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FAILED_PAYMENT_ATTEMPT_STATUSES,
  FAILED_PAYMENT_ATTEMPTS_LIMIT,
  failedPaymentAttemptStatusLabel,
  failedPaymentOccurredAt,
  formatFailedPaymentReason,
} from "../app/lib/admin/failedPaymentAttemptsShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(existsSync(join(root, "app/lib/admin/failedPaymentAttempts.ts")));
  assert.ok(existsSync(join(root, "app/admin/payments/failed/page.tsx")));

  assert.deepEqual([...FAILED_PAYMENT_ATTEMPT_STATUSES], ["FAILED", "CANCELLED"]);
  assert.equal(FAILED_PAYMENT_ATTEMPTS_LIMIT, 50);
  assert.equal(failedPaymentAttemptStatusLabel("FAILED"), "Failed");
  assert.equal(failedPaymentAttemptStatusLabel("CANCELLED"), "Cancelled");
  assert.equal(
    formatFailedPaymentReason("payment_failed", "admin_reporter_verified"),
    "payment_failed · admin_reporter_verified"
  );
  assert.equal(formatFailedPaymentReason(null, null), "Not available");
  const failedAt = new Date("2026-08-22T12:00:00.000Z");
  assert.equal(
    failedPaymentOccurredAt({
      failedAt,
      cancelledAt: new Date("2026-08-21T12:00:00.000Z"),
      updatedAt: new Date("2026-08-20T12:00:00.000Z"),
      createdAt: new Date("2026-08-19T12:00:00.000Z"),
    }),
    failedAt
  );
  console.log("PASS failed_payment_display_helpers");

  const reader = read("app/lib/admin/failedPaymentAttempts.ts");
  const page = read("app/admin/payments/failed/page.tsx");
  const nav = read("app/components/admin/AdminNav.tsx");
  const pendingPage = read("app/admin/payments/pending/page.tsx");
  const pkg = read("package.json");

  assert.match(page, /requireRole\("ADMIN"\)/);
  assert.match(page, /listFailedGatewayPaymentAttempts/);
  assert.match(page, /customerLabel/);
  assert.match(page, /planLabel/);
  assert.match(page, /amountLabel/);
  assert.match(page, /statusLabel/);
  assert.match(page, /failureReason/);
  assert.match(page, /occurredAtLabel/);
  assert.match(page, /read-only/);
  assert.doesNotMatch(page, /verifyPendingGatewayPayment|applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(page, /fulfillFundedEsimPurchase|PAYMENT_GATEWAY_ENABLED/);
  console.log("PASS failed_inbox_admin_readonly_ui");

  assert.match(reader, /EsimPurchasePaymentAttemptStatus\.FAILED/);
  assert.match(reader, /EsimPurchasePaymentAttemptStatus\.CANCELLED/);
  assert.match(reader, /customerLabelFrom/);
  assert.match(reader, /formatFailedPaymentReason/);
  assert.match(reader, /maskAdminEmail/);
  assert.doesNotMatch(reader, /EXPIRED/);
  assert.doesNotMatch(reader, /\.update\(|\.delete\(|deleteMany/);
  assert.doesNotMatch(reader, /applyVerifiedEsimPurchasePaymentEvent|fulfillFundedEsimPurchase/);
  assert.doesNotMatch(reader, /PAYMENT_GATEWAY_ENABLED|allowProduction|simpaisa/i);
  assert.doesNotMatch(reader, /executeCreditCheckout|verifyPendingGatewayPayment/);
  console.log("PASS failed_reader_read_only");

  assert.match(nav, /href: "\/admin\/payments\/failed"/);
  assert.match(nav, /label: "Failed payments"/);
  assert.match(pendingPage, /\/admin\/payments\/failed/);
  assert.match(pkg, /qa:admin-failed-payments/);
  const pendingVerify = read("app/lib/admin/pendingPaymentVerify.ts");
  const listPending = pendingVerify.slice(
    pendingVerify.indexOf("export async function listPendingGatewayPaymentAttempts")
  );
  assert.match(listPending, /AWAITING_PAYMENT/);
  assert.doesNotMatch(
    listPending.slice(0, listPending.indexOf("export async function getPendingGatewayPaymentAttemptDetail")),
    /FAILED|CANCELLED/
  );
  console.log("PASS pending_list_unchanged");

  console.log("ALL_QA_PASSED=admin-failed-payments");
}

main();
