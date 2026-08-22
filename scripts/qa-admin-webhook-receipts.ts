/**
 * Offline QA for Phase 2B Fix #2B — PaymentWebhookReceipt + admin inbox.
 * Does not apply payments, call gateways, or enable checkout.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAYMENT_WEBHOOK_RECEIPTS_LIMIT,
  formatWebhookReceiptOutcome,
  webhookReceiptParseLabel,
  webhookReceiptSignatureLabel,
} from "../app/lib/admin/paymentWebhookReceiptsShared";
import { webhookReceiptVerifyFlags } from "../app/lib/payments/safepayWebhookObservability";

const root = join(__dirname, "..");
const MIGRATION =
  "prisma/migrations/20260822160000_add_payment_webhook_receipt/migration.sql";

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(PAYMENT_WEBHOOK_RECEIPTS_LIMIT, 50);
  assert.equal(webhookReceiptSignatureLabel(true), "verified");
  assert.equal(webhookReceiptSignatureLabel(false), "rejected");
  assert.equal(webhookReceiptParseLabel(true), "parsed");
  assert.equal(webhookReceiptParseLabel(false), "not parsed");
  assert.equal(
    formatWebhookReceiptOutcome("APPLY_RESULT", "funded", null),
    "funded"
  );
  assert.equal(
    formatWebhookReceiptOutcome("SIGNATURE_REJECTED", null, "INVALID"),
    "INVALID"
  );
  assert.deepEqual(webhookReceiptVerifyFlags("APPLY_RESULT"), {
    signatureOk: true,
    parseOk: true,
  });
  assert.deepEqual(webhookReceiptVerifyFlags("PARSE_IGNORED"), {
    signatureOk: true,
    parseOk: false,
  });
  assert.deepEqual(webhookReceiptVerifyFlags("SIGNATURE_REJECTED"), {
    signatureOk: false,
    parseOk: false,
  });
  console.log("PASS receipt_display_and_verify_flags");

  assert.ok(existsSync(join(root, MIGRATION)));
  const schema = read("prisma/schema.prisma");
  const migration = read(MIGRATION);
  assert.match(schema, /model PaymentWebhookReceipt/);
  assert.match(schema, /trackerMasked/);
  assert.match(schema, /Never stores raw body, signatures, secrets/);
  assert.match(schema, /no FK so unknown references still persist/);
  assert.doesNotMatch(schema, /model PaymentWebhookReceipt[\s\S]*rawBody/);
  assert.doesNotMatch(schema, /model PaymentWebhookReceipt[\s\S]*signature /);
  assert.doesNotMatch(migration, /rawBody|raw_body|signatureHeader|webhookSecret/i);
  assert.doesNotMatch(migration, /UNIQUE INDEX "PaymentWebhookReceipt_eventId/);
  assert.match(migration, /CREATE TABLE "PaymentWebhookReceipt"/);
  assert.match(migration, /"signatureOk"/);
  assert.match(migration, /"parseOk"/);
  assert.match(migration, /"logCode"/);
  assert.match(migration, /"applyOutcome"/);
  assert.match(migration, /"trackerMasked"/);
  console.log("PASS schema_migration_no_payload_or_unique_event");

  const writer = read("app/lib/payments/paymentWebhookReceipt.ts");
  const route = read("app/api/payments/safepay/webhook/route.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const applyEsim = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const page = read("app/admin/payments/webhooks/page.tsx");
  const reader = read("app/lib/admin/paymentWebhookReceipts.ts");
  const nav = read("app/components/admin/AdminNav.tsx");
  const pkg = read("package.json");

  assert.match(writer, /import "server-only"/);
  assert.match(writer, /paymentWebhookReceipt\.create/);
  assert.match(writer, /RECEIPT_WRITE_FAILED/);
  assert.match(writer, /observeSafepayWebhookDelivery/);
  assert.doesNotMatch(writer, /applyVerifiedPaymentEvent|fulfillFundedEsimPurchase/);
  assert.doesNotMatch(writer, /rawBody|signatureHeader|webhookSecret/);
  console.log("PASS receipt_writer_fail_open_no_apply");

  for (const code of [
    "CONFIG_MISSING",
    "BODY_REJECTED",
    "SIGNATURE_REJECTED",
    "PARSE_IGNORED",
    "APPLY_RESULT",
    "APPLY_FAILED",
  ]) {
    assert.match(route, new RegExp(`code: "${code}"`));
  }
  assert.match(route, /observeSafepayWebhookDelivery/);
  assert.match(route, /applyVerifiedPaymentEvent/);
  assert.match(route, /Never logs raw body/);
  assert.doesNotMatch(route, /simpaisa/i);
  assert.doesNotMatch(route, /PAYMENT_GATEWAY_ENABLED\s*===\s*"true"/);
  assert.doesNotMatch(route, /replayWebhook|markPaid/i);
  console.log("PASS route_observes_all_branches");

  assert.match(apply, /export async function applyVerifiedPaymentEvent/);
  assert.doesNotMatch(apply, /PaymentWebhookReceipt|recordPaymentWebhookReceipt/);
  assert.doesNotMatch(applyEsim, /PaymentWebhookReceipt|recordPaymentWebhookReceipt/);
  console.log("PASS apply_modules_unchanged");

  assert.match(page, /requireRole\("ADMIN"\)/);
  assert.match(page, /listPaymentWebhookReceipts/);
  assert.match(page, /read-only/);
  assert.match(page, /does not replay/);
  assert.doesNotMatch(page, /replayWebhook|markPaid|applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(page, /fulfillFundedEsimPurchase|PAYMENT_GATEWAY_ENABLED/);
  assert.match(reader, /paymentWebhookReceipt\.findMany/);
  assert.doesNotMatch(reader, /\.update\(|\.delete\(|\.create\(/);
  assert.doesNotMatch(reader, /applyVerifiedPaymentEvent|fulfillFundedEsimPurchase/);
  assert.match(nav, /href: "\/admin\/payments\/webhooks"/);
  assert.match(nav, /label: "Webhook receipts"/);
  assert.match(pkg, /qa:admin-webhook-receipts/);
  console.log("PASS admin_inbox_readonly");

  console.log("ALL PASS qa-admin-webhook-receipts");
}

main();
