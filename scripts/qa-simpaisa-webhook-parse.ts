/**
 * Offline QA for Simpaisa wallet payin postback parsing.
 * Covers JSON + application/x-www-form-urlencoded bodies, shared parser wiring,
 * and webhook route Inquire-before-apply gates. No network or DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifySimpaisaWebhookParseIgnore,
  peekSimpaisaWebhookLogFields,
} from "../app/lib/payments/simpaisaWebhookObservability";
import {
  parseSimpaisaWebhookEvent,
  peekSimpaisaWebhookResponseCode,
} from "../app/lib/payments/simpaisaWebhookParse";
import { parseSimpaisaPostbackBody } from "../app/lib/payments/simpaisaPostbackBody";
import {
  SIMPAISA_SANDBOX_MERCHANT_ID,
  SIMPAISA_WALLET_OPERATORS,
} from "../app/lib/payments/simpaisaPolicy";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const MERCHANT = SIMPAISA_SANDBOX_MERCHANT_ID;
const OPERATOR = SIMPAISA_WALLET_OPERATORS.JAZZCASH;

function successFields(overrides: Record<string, string> = {}) {
  return {
    merchantId: MERCHANT,
    operatorId: OPERATOR,
    userKey: "attempt_qa_esim_1",
    transactionId: "txn_qa_simpaisa_1",
    responseCode: "0000",
    amount: "1500.00",
    currency: "PKR",
    transactionType: "0",
    ...overrides,
  };
}

function toForm(fields: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    params.set(key, value);
  }
  return params.toString();
}

function main() {
  const parseSrc = read("app/lib/payments/simpaisaWebhookParse.ts");
  const obsSrc = read("app/lib/payments/simpaisaWebhookObservability.ts");
  const postbackSrc = read("app/lib/payments/simpaisaPostbackBody.ts");
  const routeSrc = read("app/api/payments/simpaisa/webhook/route.ts");
  const configSrc = read("app/lib/payments/simpaisaConfig.ts");
  const envExample = read(".env.example");
  const pkg = read("package.json");

  assert.match(postbackSrc, /Accepts JSON objects and form-urlencoded/);
  assert.match(parseSrc, /parseSimpaisaPostbackBody/);
  assert.match(obsSrc, /parseSimpaisaPostbackBody/);
  assert.doesNotMatch(parseSrc, /function parseBody\(/);
  assert.doesNotMatch(obsSrc, /function parseBody\(/);
  assert.match(routeSrc, /inquireTransaction/);
  assert.match(routeSrc, /applyVerifiedPaymentEvent/);
  assert.match(routeSrc, /PENDING_NOT_PAID/);
  assert.match(routeSrc, /validateSimpaisaAuthoritativeInquiry/);
  assert.match(configSrc, /SIMPAISA_ENVIRONMENT/);
  assert.match(configSrc, /SIMPAISA_API_BASE_URL/);
  assert.match(configSrc, /SIMPAISA_MERCHANT_ID/);
  assert.match(envExample, /SIMPAISA_ENVIRONMENT/);
  assert.match(envExample, /SIMPAISA_API_BASE_URL/);
  assert.match(envExample, /SIMPAISA_MERCHANT_ID/);
  assert.match(envExample, /SIMPAISA_WEBHOOK_SECRET/);
  assert.match(envExample, /SIMPAISA_OUTBOUND_PROXY_URL/);
  assert.match(pkg, /qa:simpaisa-webhook-parse/);
  console.log("PASS source_wiring");

  const jsonBody = JSON.stringify(successFields());
  const jsonRoot = parseSimpaisaPostbackBody(jsonBody);
  assert.ok(jsonRoot);
  assert.equal(jsonRoot.merchantId, MERCHANT);

  const formBody = toForm(successFields());
  const formRoot = parseSimpaisaPostbackBody(formBody);
  assert.ok(formRoot);
  assert.equal(formRoot.responseCode, "0000");
  assert.equal(formRoot.transactionId, "txn_qa_simpaisa_1");
  assert.equal(formRoot.amount, "1500.00");
  assert.equal(parseSimpaisaPostbackBody(""), null);
  assert.equal(parseSimpaisaPostbackBody("{"), null);
  console.log("PASS shared_postback_body_parser");

  const expectedConfig = { merchantId: MERCHANT };
  const jsonEvent = parseSimpaisaWebhookEvent({
    rawBody: jsonBody,
    headers: {},
    expectedConfig,
    signatureVerified: false,
  });
  assert.ok(jsonEvent);
  assert.equal(jsonEvent.provider, "SIMPAISA");
  assert.equal(jsonEvent.paymentStatus, "confirmed");
  assert.equal(jsonEvent.providerPaymentRef, "txn_qa_simpaisa_1");
  assert.equal(jsonEvent.paymentAttemptId, "attempt_qa_esim_1");
  assert.equal(jsonEvent.chargeAmountMinor, 150_000);
  assert.equal(jsonEvent.chargeCurrency, "PKR");
  assert.equal(jsonEvent.walletOperatorId, OPERATOR);
  assert.equal(jsonEvent.purpose, "ESIM_PURCHASE");
  console.log("PASS json_success_parse");

  const formEvent = parseSimpaisaWebhookEvent({
    rawBody: formBody,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    expectedConfig,
    signatureVerified: false,
  });
  assert.ok(
    formEvent,
    "form-urlencoded success postback must parse (was JSON-only historically)"
  );
  assert.equal(formEvent.paymentStatus, "confirmed");
  assert.equal(formEvent.providerPaymentRef, "txn_qa_simpaisa_1");
  assert.equal(formEvent.chargeAmountMinor, 150_000);
  assert.equal(formEvent.eventId, "txn_qa_simpaisa_1:0000");
  assert.equal(peekSimpaisaWebhookResponseCode(formBody), "0000");
  console.log("PASS form_urlencoded_success_parse");

  const pendingForm = toForm(successFields({ responseCode: "0037" }));
  const pendingEvent = parseSimpaisaWebhookEvent({
    rawBody: pendingForm,
    headers: {},
    expectedConfig,
    signatureVerified: false,
  });
  assert.ok(pendingEvent);
  assert.equal(pendingEvent.paymentStatus, "pending");
  console.log("PASS form_urlencoded_pending_not_paid");

  const partnerForm = toForm(
    successFields({ userKey: "ptop_partner_topup_1" })
  );
  const partnerEvent = parseSimpaisaWebhookEvent({
    rawBody: partnerForm,
    headers: {},
    expectedConfig,
    signatureVerified: false,
  });
  assert.ok(partnerEvent);
  assert.equal(partnerEvent.purpose, "PARTNER_WALLET_TOPUP");
  assert.equal(partnerEvent.localTopupId, "partner_topup_1");
  console.log("PASS form_urlencoded_partner_topup");

  const nestedJson = JSON.stringify({
    merchantId: MERCHANT,
    transaction: successFields({
      merchantId: MERCHANT,
      responseCode: "0000",
      amount: "99.50",
    }),
  });
  const nestedEvent = parseSimpaisaWebhookEvent({
    rawBody: nestedJson,
    headers: {},
    expectedConfig,
    signatureVerified: false,
  });
  assert.ok(nestedEvent);
  assert.equal(nestedEvent.chargeAmountMinor, 9950);
  console.log("PASS nested_transaction_envelope");

  const badMerchant = toForm(successFields({ merchantId: "wrong-merchant" }));
  assert.equal(
    parseSimpaisaWebhookEvent({
      rawBody: badMerchant,
      headers: {},
      expectedConfig,
      signatureVerified: false,
    }),
    null
  );
  assert.equal(classifySimpaisaWebhookParseIgnore(badMerchant), "UNCLASSIFIED");
  assert.equal(classifySimpaisaWebhookParseIgnore("{"), "MALFORMED_BODY");
  assert.equal(
    classifySimpaisaWebhookParseIgnore(toForm({ foo: "bar" })),
    "MISSING_RESPONSE_CODE"
  );

  const formPeek = peekSimpaisaWebhookLogFields(formBody, {});
  assert.equal(formPeek.tracker, "txn_qa_simpaisa_1");
  assert.equal(formPeek.eventType, "0000");
  assert.equal(formPeek.eventId, "txn_qa_simpaisa_1:0000");
  console.log("PASS observability_form_peek");

  console.log("ALL_SIMPAISA_WEBHOOK_PARSE_CHECKS_PASSED");
}

main();
