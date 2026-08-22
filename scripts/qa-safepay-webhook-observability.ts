/**
 * Offline QA for Phase 2B Fix #2A — structured Safepay webhook observability.
 * Does not call Safepay, mutate the database, apply payments, or enable the gateway.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifySafepayWebhookApplyFailure,
  classifySafepayWebhookParseIgnore,
  formatSafepayWebhookLog,
  maskWebhookReference,
  peekSafepayWebhookLogFields,
  SAFEPAY_WEBHOOK_LOG_CODES,
  SAFEPAY_WEBHOOK_LOG_PREFIX,
} from "../app/lib/payments/safepayWebhookObservability";
import { parseSafepayCardWebhookEvent } from "../app/lib/payments/safepayWebhookParse";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.deepEqual([...SAFEPAY_WEBHOOK_LOG_CODES], [
    "CONFIG_MISSING",
    "BODY_REJECTED",
    "SIGNATURE_REJECTED",
    "PARSE_IGNORED",
    "APPLY_RESULT",
    "APPLY_FAILED",
  ]);
  assert.equal(SAFEPAY_WEBHOOK_LOG_PREFIX, "safepay_webhook");
  assert.equal(maskWebhookReference(""), null);
  assert.equal(maskWebhookReference("short"), "••••");
  assert.equal(maskWebhookReference("track_qa_long_ref"), "trac…_ref");
  console.log("PASS log_codes_and_mask");

  const succeeded = JSON.stringify({
    token: "evt_qa_obs_1",
    type: "payment.succeeded",
    data: {
      tracker: "track_qa_observability_1",
      success: true,
      amount: 10000,
      currency: "USD",
      metadata: { order_id: "attempt_qa_1" },
    },
  });
  assert.ok(parseSafepayCardWebhookEvent({ rawBody: succeeded, headers: {} }));
  const peek = peekSafepayWebhookLogFields(succeeded, {});
  assert.equal(peek.eventId, "evt_qa_obs_1");
  assert.equal(peek.eventType, "payment.succeeded");
  assert.equal(peek.tracker, "track_qa_observability_1");

  assert.equal(classifySafepayWebhookParseIgnore("{"), "MALFORMED_JSON");
  assert.equal(classifySafepayWebhookParseIgnore("[]"), "NOT_OBJECT");
  assert.equal(
    classifySafepayWebhookParseIgnore(
      JSON.stringify({ type: "payment.updated", data: {} })
    ),
    "UNSUPPORTED_TYPE"
  );
  assert.equal(
    classifySafepayWebhookParseIgnore(
      JSON.stringify({
        token: "evt_x",
        type: "payment.succeeded",
        data: { amount: 1, currency: "USD" },
      })
    ),
    "MISSING_TRACKER"
  );
  assert.equal(
    classifySafepayWebhookParseIgnore(
      JSON.stringify({
        token: "evt_x",
        type: "payment.succeeded",
        data: { tracker: "track_1" },
      })
    ),
    "MISSING_AMOUNT"
  );
  assert.equal(
    classifySafepayWebhookParseIgnore(
      JSON.stringify({
        type: "payment.failed",
        data: { tracker: "track_1", amount: 5000, currency: "USD" },
      })
    ),
    "MISSING_EVENT_ID"
  );
  assert.equal(
    classifySafepayWebhookParseIgnore(
      JSON.stringify({
        token: "evt_x",
        type: "payment.succeeded",
        data: {
          tracker: "track_1",
          amount: 5000,
          currency: "USD",
          success: false,
        },
      })
    ),
    "SUCCESS_FLAG_FALSE"
  );
  console.log("PASS peek_and_parse_ignore_categories");

  assert.equal(
    classifySafepayWebhookApplyFailure(new Error("UNSIGNED_PAYMENT_EVENT")),
    "UNSIGNED_PAYMENT_EVENT"
  );
  assert.equal(
    classifySafepayWebhookApplyFailure({ code: "P2002" }),
    "UNIQUE_CONSTRAINT"
  );
  assert.equal(
    classifySafepayWebhookApplyFailure({ code: "TOPUP_UNAVAILABLE" }),
    "TOPUP_UNAVAILABLE"
  );
  assert.equal(
    classifySafepayWebhookApplyFailure(new Error("customer email leaked")),
    "APPLY_EXCEPTION"
  );
  console.log("PASS apply_failure_categories_no_message_leak");

  const formatted = formatSafepayWebhookLog({
    code: "APPLY_RESULT",
    httpStatus: 200,
    httpOutcome: "applied",
    eventId: "evt_qa_obs_1",
    tracker: "track_qa_observability_1",
    eventType: "payment.succeeded",
    kind: "esim_purchase",
    outcome: "funded",
    duplicate: false,
  });
  assert.equal(formatted.prefix, "safepay_webhook");
  assert.equal(formatted.code, "APPLY_RESULT");
  assert.equal(formatted.payload.eventId, "evt_qa_obs_1");
  assert.equal(formatted.payload.trackerMasked, "trac…ty_1");
  assert.equal(formatted.payload.httpStatus, 200);
  assert.equal(formatted.payload.httpOutcome, "applied");
  assert.equal(formatted.payload.kind, "esim_purchase");
  assert.equal(formatted.payload.outcome, "funded");
  const serialized = JSON.stringify(formatted);
  assert.doesNotMatch(serialized, /track_qa_observability_1/);
  assert.doesNotMatch(serialized, /rawBody|signatureHeader|webhookSecret/);
  assert.ok(!("rawBody" in formatted.payload));
  assert.ok(!("signature" in formatted.payload));
  console.log("PASS formatted_log_masks_and_omits_secrets");

  const route = read("app/api/payments/safepay/webhook/route.ts");
  const obs = read("app/lib/payments/safepayWebhookObservability.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const parse = read("app/lib/payments/safepayWebhookParse.ts");
  const pkg = read("package.json");
  const healthShared = read("app/lib/admin/operationsHealthShared.ts");
  const health = read("app/lib/admin/operationsHealth.ts");
  const alerts = read("app/lib/admin/monitoringAlerts.ts");
  const alertShared = read("app/lib/admin/monitoringAlertShared.ts");

  for (const code of SAFEPAY_WEBHOOK_LOG_CODES) {
    assert.match(route, new RegExp(`code: "${code}"`));
  }
  assert.match(route, /observeSafepayWebhookDelivery/);
  assert.match(route, /verifySafepayCardWebhookSignature/);
  assert.match(route, /applyVerifiedPaymentEvent/);
  assert.match(route, /parseSafepayCardWebhookEvent/);
  assert.match(route, /independently of PAYMENT_GATEWAY_ENABLED/);
  assert.match(route, /Never logs raw body/);
  assert.match(route, /classifySafepayWebhookApplyFailure\(error\)/);
  assert.doesNotMatch(route, /console\.error\([^)]*rawBody/);
  assert.doesNotMatch(obs, /payload\.rawBody|rawBody:\s*input/);
  assert.match(obs, /Never logs or returns raw body, signatures, secrets/);
  console.log("PASS route_logs_all_codes_no_raw_body");

  assert.match(apply, /export async function applyVerifiedPaymentEvent/);
  assert.match(parse, /export function parseSafepayCardWebhookEvent/);
  assert.doesNotMatch(route, /simpaisa/i);
  assert.doesNotMatch(obs, /simpaisa/i);
  assert.doesNotMatch(route, /PAYMENT_GATEWAY_ENABLED\s*===\s*"true"/);
  assert.match(route, /never VeSIM from top-up/i);
  console.log("PASS apply_parse_untouched_no_gateway_enable");

  assert.match(healthShared, /paymentWebhookVerificationStatus/);
  assert.match(health, /webhookSecretConfigured/);
  assert.doesNotMatch(healthShared, /webhookVerification:\s*"NOT_IMPLEMENTED"/);
  assert.doesNotMatch(alerts, /PAYMENT_WEBHOOK_NOT_IMPLEMENTED/);
  assert.doesNotMatch(alertShared, /PAYMENT_WEBHOOK_NOT_IMPLEMENTED/);
  assert.match(alerts, /PAYMENT_WEBHOOK_SECRET_NOT_CONFIGURED/);
  assert.match(alertShared, /PAYMENT_WEBHOOK_SECRET_NOT_CONFIGURED/);
  assert.match(alerts, /signature verification is implemented/);
  assert.doesNotMatch(health, /return process\.env\.SAFEPAY_WEBHOOK_SECRET/);
  console.log("PASS admin_webhook_health_copy_corrected");

  assert.match(pkg, /"qa:safepay-webhook-observability"/);
  console.log("PASS package_script");

  console.log("ALL PASS qa-safepay-webhook-observability");
}

main();
