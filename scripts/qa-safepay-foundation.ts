/**
 * Offline QA for PG3-A Safepay adapter + fail-closed config foundation.
 * Does not call Safepay, mutate the database, reserve wallet, or create orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPaymentGatewayEnabledFlag,
  parseSafepayEnvironment,
  parseSafepayIntent,
  validateSafepayAdapterConfig,
  validateSafepayWebhookConfig,
  safepayApiBaseUrl,
  safepayCheckoutBaseUrl,
} from "../app/lib/payments/safepayPolicy";
import {
  ESIM_PURCHASE_PAYMENT_CANCEL_PATH,
  ESIM_PURCHASE_PAYMENT_RETURN_PATH,
} from "../app/lib/payments/safepayCheckoutPaths";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const policy = read("app/lib/payments/safepayPolicy.ts");
  const config = read("app/lib/payments/safepayConfig.ts");
  const adapter = read("app/lib/payments/safepayAdapter.ts");
  const http = read("app/lib/payments/safepayHttp.ts");
  const urls = read("app/lib/payments/safepayCheckoutUrls.ts");
  const paths = read("app/lib/payments/safepayCheckoutPaths.ts");
  const disabled = read("app/lib/payments/disabledAdapter.ts");
  const types = read("app/lib/payments/types.ts");
  const topup = read("app/lib/wallet/topup.ts");
  const actions = read("app/lib/esim/walletPurchaseActions.ts");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const pkg = read("package.json");

  assert.equal(isPaymentGatewayEnabledFlag(undefined), false);
  assert.equal(isPaymentGatewayEnabledFlag(""), false);
  assert.equal(isPaymentGatewayEnabledFlag("TRUE"), false);
  assert.equal(isPaymentGatewayEnabledFlag("true "), false);
  assert.equal(isPaymentGatewayEnabledFlag("true"), true);
  console.log("PASS exact_true_enable_flag");

  assert.equal(parseSafepayEnvironment("sandbox"), "sandbox");
  assert.equal(parseSafepayEnvironment("production"), "production");
  assert.equal(parseSafepayEnvironment("Sandbox"), null);
  assert.equal(parseSafepayEnvironment(""), null);
  assert.equal(parseSafepayIntent("CYBERSOURCE"), "CYBERSOURCE");
  assert.equal(parseSafepayIntent("MPGS"), "MPGS");
  assert.equal(parseSafepayIntent("cybersource"), null);
  assert.equal(parseSafepayIntent(""), null);
  assert.equal(parseSafepayIntent(undefined), null);
  console.log("PASS environment_and_intent_enums_no_default_intent");

  const disabledCfg = validateSafepayAdapterConfig({
    enabledRaw: undefined,
    environmentRaw: "sandbox",
    apiKeyRaw: "sec_test",
    secretKeyRaw: "sk_test",
    intentRaw: "CYBERSOURCE",
  });
  assert.equal(disabledCfg.ok, false);
  if (!disabledCfg.ok) assert.equal(disabledCfg.code, "GATEWAY_DISABLED");
  console.log("PASS gateway_disabled_by_default");

  const missingIntent = validateSafepayAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "sandbox",
    apiKeyRaw: "sec_test",
    secretKeyRaw: "sk_test",
    intentRaw: undefined,
  });
  assert.equal(missingIntent.ok, false);
  if (!missingIntent.ok) assert.equal(missingIntent.code, "INVALID_INTENT");

  const missingSecret = validateSafepayAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "sandbox",
    apiKeyRaw: "sec_test",
    secretKeyRaw: "",
    intentRaw: "MPGS",
  });
  assert.equal(missingSecret.ok, false);
  if (!missingSecret.ok) assert.equal(missingSecret.code, "MISSING_SECRET_KEY");

  const productionBlocked = validateSafepayAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "production",
    apiKeyRaw: "sec_test",
    secretKeyRaw: "sk_test",
    intentRaw: "CYBERSOURCE",
    allowProduction: false,
  });
  assert.equal(productionBlocked.ok, false);
  if (!productionBlocked.ok) {
    assert.equal(productionBlocked.code, "PRODUCTION_NOT_ENABLED");
  }

  const okSandbox = validateSafepayAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "sandbox",
    apiKeyRaw: "sec_test_public",
    secretKeyRaw: "sk_test_private",
    intentRaw: "CYBERSOURCE",
  });
  assert.equal(okSandbox.ok, true);
  if (okSandbox.ok) {
    assert.equal(okSandbox.config.apiBaseUrl, safepayApiBaseUrl("sandbox"));
    assert.equal(
      okSandbox.config.checkoutBaseUrl,
      safepayCheckoutBaseUrl("sandbox")
    );
    assert.equal(okSandbox.config.intent, "CYBERSOURCE");
  }
  console.log("PASS missing_config_and_production_fail_closed");

  const webhookMissing = validateSafepayWebhookConfig({
    webhookSecretRaw: undefined,
  });
  assert.equal(webhookMissing.ok, false);
  const webhookOk = validateSafepayWebhookConfig({
    webhookSecretRaw: "whsec_test",
  });
  assert.equal(webhookOk.ok, true);
  console.log("PASS webhook_config_reader_fail_closed");

  assert.match(config, /import "server-only"/);
  assert.match(adapter, /import "server-only"/);
  assert.match(http, /import "server-only"/);
  assert.match(urls, /import "server-only"/);
  assert.match(config, /getSafepayPublicDiagnostics/);
  assert.match(config, /secretKeyConfigured/);
  assert.match(config, /never log key material/);
  assert.match(policy, /Public diagnostics — never includes secrets/);
  assert.doesNotMatch(policy, /SAFEPAY_SECRET_KEY/);
  console.log("PASS secrets_server_only_public_diagnostics_safe");

  assert.match(types, /PaymentCheckoutPurpose/);
  assert.match(types, /WALLET_TOPUP/);
  assert.match(types, /ESIM_PURCHASE/);
  assert.match(types, /chargeAmountMinor/);
  assert.match(types, /chargeCurrency/);
  assert.match(types, /paymentAttemptId/);
  assert.match(types, /CreateEsimPurchaseCheckoutInput/);
  assert.match(topup, /purpose:\s*"WALLET_TOPUP"/);
  assert.match(topup, /chargeAmountMinor:\s*topup\.creditAmountCents/);
  assert.match(topup, /chargeCurrency:\s*"USD"/);
  assert.match(topup, /event\.purpose !== "WALLET_TOPUP"/);
  console.log("PASS esim_and_topup_checkout_input_generalized");

  assert.match(disabled, /PAYMENT_GATEWAY_ENABLED/);
  assert.match(disabled, /tryCreateSafepayAdapter/);
  assert.match(disabled, /misconfiguredPaymentAdapter/);
  assert.match(disabled, /Never falls back to a fake/);
  assert.match(adapter, /tryCreateSafepayAdapter/);
  assert.match(adapter, /verifyWebhookSignature/);
  assert.match(adapter, /verifySafepayCardWebhookSignature/);
  assert.match(adapter, /parseSafepayCardWebhookEvent/);
  assert.match(http, /createPaymentSession/);
  assert.match(http, /createPassportToken/);
  assert.match(http, /buildHostedCheckoutUrl/);
  assert.match(http, /fetchTrackerStatus/);
  assert.match(http, /source:\s*"hosted"/);
  assert.match(http, /"x-sfpy-merchant-secret":\s*this\.config\.secretKey/);
  assert.doesNotMatch(http, /Authorization:\s*this\.config\.secretKey/);
  assert.doesNotMatch(http, /Authorization:\s*this\.config/);
  assert.match(http, /entry_mode:\s*"raw"/);
  assert.match(http, /include_fees:\s*false/);
  assert.match(http, /source:\s*"map-esim"/);
  assert.match(http, /order_id:\s*orderId/);
  assert.match(http, /Safepay accepts only a narrow metadata allowlist/);
  assert.doesNotMatch(http, /checkout_idempotency_key/);
  assert.doesNotMatch(http, /local_topup_id/);
  assert.doesNotMatch(http, /payment_attempt_id/);
  assert.doesNotMatch(http, /purchase_id/);
  assert.doesNotMatch(http, /purpose:\s*input\.purpose/);
  assert.doesNotMatch(http, /\.\.\.\(input\.metadata/);
  assert.doesNotMatch(http, /customer_email|wallet_id|user_id/);
  assert.doesNotMatch(http, /console\.(log|info|debug)\([^)]*(secretKey|apiKey|passportToken|tbt)/i);
  assert.match(http, /never log request\/response bodies or tokens/);
  // Internal adapter/input contract still carries idempotency + purpose locally.
  assert.match(http, /checkoutIdempotencyKey:/);
  assert.match(http, /purpose:\s*PaymentCheckoutPurpose/);
  assert.match(adapter, /checkoutIdempotencyKey:\s*input\.checkoutIdempotencyKey/);
  assert.match(adapter, /localTopupId:/);
  assert.match(adapter, /paymentAttemptId:/);
  assert.match(adapter, /purpose === "WALLET_TOPUP"/);
  assert.match(adapter, /purpose === "ESIM_PURCHASE"/);
  assert.match(topup, /checkoutIdempotencyKey/);
  console.log("PASS adapter_contract_and_hosted_checkout_helpers");
  console.log("PASS safepay_merchant_secret_auth_header_contract");
  console.log("PASS safepay_session_body_entry_mode_and_include_fees");
  console.log("PASS safepay_metadata_allowlist_source_and_order_id_only");

  assert.equal(
    ESIM_PURCHASE_PAYMENT_RETURN_PATH,
    "/account/esim/buy/payment/return"
  );
  assert.equal(
    ESIM_PURCHASE_PAYMENT_CANCEL_PATH,
    "/account/esim/buy/payment/cancel"
  );
  assert.match(paths, /ESIM_PURCHASE_PAYMENT_RETURN_PATH/);
  assert.match(urls, /assertSafePaymentReturnPath/);
  assert.match(urls, /safeCallbackPath/);
  console.log("PASS return_cancel_path_helpers");

  // PG3-B wires checkout via startEsimPurchaseHostedCheckout (not raw Safepay HTTP in actions).
  assert.match(actions, /startEsimPurchaseHostedCheckout/);
  assert.ok(!/SafepayHttpClient/.test(actions));
  assert.ok(!/tryCreateSafepayAdapter\(/.test(actions));
  assert.ok(!/fetch\("https:\/\/sandbox\.api\.getsafepay\.com/.test(adapter));
  assert.match(guestGate, /ENABLE_GUEST_VESIM_CHECKOUT === "true"/);
  assert.doesNotMatch(pkg, /@sfpy\/node-core|@sfpy\/node-sdk/);
  assert.match(pkg, /"qa:safepay-foundation"/);
  console.log("PASS no_customer_route_network_or_sdk_dep");

  console.log("ALL_PG3A_CHECKS_PASSED");
}

main();
