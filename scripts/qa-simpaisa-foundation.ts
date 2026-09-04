/**
 * Offline QA for Simpaisa PK wallet adapter + fail-closed config foundation.
 * Does not call Simpaisa, mutate the database, reserve wallet, or create orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePaymentGatewayProvider } from "../app/lib/payments/gatewaySelect";
import {
  classifySimpaisaWalletResponseCode,
  isSimpaisaAcceptedVerifyCode,
  isSimpaisaFinalSuccessCode,
  isSimpaisaPendingCode,
  isSimpaisaWalletOperatorId,
  isSimpaisaSandboxUnsignedWebhookAllowed,
  isSimpaisaWebhookPostbackAcceptable,
  isSimpaisaWebhookSignatureContractAvailable,
  mapSimpaisaClassificationToPaymentStatus,
  normalizeSimpaisaMsisdn,
  parseSimpaisaEnvironment,
  SIMPAISA_CHARGE_CURRENCY,
  SIMPAISA_INQUIRY_PATH,
  SIMPAISA_RESPONSE,
  SIMPAISA_SANDBOX_API_BASE_URL,
  SIMPAISA_SANDBOX_MERCHANT_ID,
  SIMPAISA_VERIFY_PATH,
  SIMPAISA_WALLET_OPERATORS,
  SIMPAISA_WALLET_TRANSACTION_TYPE,
  SIMPAISA_WEBHOOK_PATH,
  simpaisaFailureCategoryForCode,
  simpaisaMajorAmountFromMinor,
  simpaisaMinorAmountFromMajor,
  validateSimpaisaAdapterConfig,
  validateSimpaisaWebhookConfig,
} from "../app/lib/payments/simpaisaPolicy";
import {
  parseSimpaisaWalletCheckoutFields,
  quoteSimpaisaPkrChargeFromUsdCents,
  SIMPAISA_PKR_USD_RATE,
  simpaisaChargeMatchesQuote,
} from "../app/lib/payments/simpaisaPkrQuote";
import { convertFromUsd } from "../app/lib/currency/format";
import { FALLBACK_USD_RATES } from "../app/lib/currency/currencies";
import { parseSimpaisaWebhookEvent } from "../app/lib/payments/simpaisaWebhookParse";
import { validateSimpaisaAuthoritativeInquiry } from "../app/lib/payments/simpaisaInquiryValidate";
import { parseSimpaisaInquiryResponse } from "../app/lib/payments/simpaisaInquiryParse";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const policy = read("app/lib/payments/simpaisaPolicy.ts");
  const config = read("app/lib/payments/simpaisaConfig.ts");
  const adapter = read("app/lib/payments/simpaisaAdapter.ts");
  const http = read("app/lib/payments/simpaisaHttp.ts");
  const route = read("app/api/payments/simpaisa/webhook/route.ts");
  const disabled = read("app/lib/payments/disabledAdapter.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const gateway = read("app/lib/esim/esimPurchaseGatewayCheckout.ts");
  const pkg = read("package.json");
  const safepayRoute = read("app/api/payments/safepay/webhook/route.ts");
  const safepayAdapter = read("app/lib/payments/safepayAdapter.ts");
  const webhookCrypto = read("app/lib/payments/simpaisaWebhookCrypto.ts");

  assert.equal(parsePaymentGatewayProvider(undefined), "SIMPAISA");
  assert.equal(parsePaymentGatewayProvider(""), "SIMPAISA");
  assert.equal(parsePaymentGatewayProvider("SAFEPAY"), "SAFEPAY");
  assert.equal(parsePaymentGatewayProvider("SIMPAISA"), "SIMPAISA");
  assert.equal(parsePaymentGatewayProvider("JAZZCASH"), null);
  console.log("PASS provider_select_defaults_to_simpaisa");

  assert.equal(parseSimpaisaEnvironment("sandbox"), "sandbox");
  assert.equal(parseSimpaisaEnvironment("production"), "production");
  assert.equal(parseSimpaisaEnvironment("Sandbox"), null);
  assert.equal(SIMPAISA_WALLET_OPERATORS.EASYPAISA, "100007");
  assert.equal(SIMPAISA_WALLET_OPERATORS.JAZZCASH, "100008");
  assert.equal(SIMPAISA_SANDBOX_MERCHANT_ID, "2001226");
  assert.equal(SIMPAISA_SANDBOX_API_BASE_URL, "https://sandbox.simpaisa.com");
  assert.equal(SIMPAISA_VERIFY_PATH, "/v2/wallets/transaction/verify");
  assert.equal(SIMPAISA_INQUIRY_PATH, "/v2/inquire/wallet/transaction/inquiry");
  assert.equal(SIMPAISA_WALLET_TRANSACTION_TYPE, "0");
  assert.equal(isSimpaisaWalletOperatorId("100007"), true);
  assert.equal(isSimpaisaWalletOperatorId("100008"), true);
  assert.equal(isSimpaisaWalletOperatorId("100014"), false);
  assert.equal(isSimpaisaWalletOperatorId("100012"), false);
  assert.equal(isSimpaisaWalletOperatorId("100001"), false);
  assert.equal(SIMPAISA_CHARGE_CURRENCY, "PKR");
  assert.equal(SIMPAISA_WEBHOOK_PATH, "/api/payments/simpaisa/webhook");
  assert.doesNotMatch(policy, /100014|100012|HBL_KONNECT|\bALFA\b/);
  console.log("PASS wallet_operators_and_environment");

  assert.equal(isSimpaisaPendingCode("0037"), true);
  assert.equal(isSimpaisaFinalSuccessCode("0000"), true);
  assert.equal(isSimpaisaAcceptedVerifyCode("0000"), false);
  assert.equal(isSimpaisaAcceptedVerifyCode("0037"), true);
  assert.equal(isSimpaisaFinalSuccessCode("0037"), false);
  assert.equal(isSimpaisaPendingCode(SIMPAISA_RESPONSE.PENDING), true);
  assert.equal(classifySimpaisaWalletResponseCode("0000"), "confirmed");
  assert.equal(classifySimpaisaWalletResponseCode("0037"), "pending");
  assert.equal(classifySimpaisaWalletResponseCode("0007"), "uncertain");
  assert.equal(classifySimpaisaWalletResponseCode("0018"), "uncertain");
  assert.equal(classifySimpaisaWalletResponseCode("9999"), "uncertain");
  assert.equal(classifySimpaisaWalletResponseCode("0011"), "failed");
  assert.equal(classifySimpaisaWalletResponseCode("0012"), "failed");
  assert.equal(classifySimpaisaWalletResponseCode("0043"), "failed");
  assert.equal(classifySimpaisaWalletResponseCode("0010"), "failed");
  assert.equal(classifySimpaisaWalletResponseCode("0044"), "uncertain");
  assert.equal(classifySimpaisaWalletResponseCode("0053"), "uncertain");
  assert.equal(classifySimpaisaWalletResponseCode("0054"), "uncertain");
  assert.equal(mapSimpaisaClassificationToPaymentStatus("pending"), "pending");
  assert.equal(
    mapSimpaisaClassificationToPaymentStatus("uncertain"),
    "uncertain"
  );
  assert.equal(mapSimpaisaClassificationToPaymentStatus("failed"), "failed");
  assert.equal(simpaisaFailureCategoryForCode("0010"), "simpaisa_failed_0010");
  assert.equal(
    simpaisaFailureCategoryForCode("0007"),
    "simpaisa_uncertain_0007"
  );
  assert.doesNotMatch(policy, /SIMPAISA_CANCELLED_RESPONSE_CODES|SIMPAISA_EXPIRED_RESPONSE_CODES|"0044"|"0053"|"0054"/);
  assert.match(policy, /SIMPAISA_OFFICIAL_STATUS_MEANINGS/);
  assert.match(policy, /SIMPAISA_UNCERTAIN_RESPONSE_CODES/);
  assert.match(policy, /SIMPAISA_FINAL_FAILURE_RESPONSE_CODES/);
  assert.equal(simpaisaMajorAmountFromMinor(1050), "10.50");
  assert.equal(simpaisaMajorAmountFromMinor(10000), "100.00");
  assert.equal(simpaisaMinorAmountFromMajor("100.00"), 10000);
  assert.equal(simpaisaMinorAmountFromMajor("10.50"), 1050);
  assert.equal(normalizeSimpaisaMsisdn("3001234567"), "3001234567");
  assert.equal(normalizeSimpaisaMsisdn("03001234567"), "3001234567");
  assert.equal(normalizeSimpaisaMsisdn("923001234567"), "3001234567");
  assert.equal(normalizeSimpaisaMsisdn("123"), null);
  console.log("PASS pending_is_not_final_success");

  const disabledCfg = validateSimpaisaAdapterConfig({
    enabledRaw: undefined,
    environmentRaw: "sandbox",
    apiBaseUrlRaw: "https://sandbox.example.com",
    merchantIdRaw: "merchant",
  });
  assert.equal(disabledCfg.ok, false);
  if (!disabledCfg.ok) assert.equal(disabledCfg.code, "GATEWAY_DISABLED");

  const productionBlocked = validateSimpaisaAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "production",
    apiBaseUrlRaw: "https://api.example.com",
    merchantIdRaw: "merchant",
    allowProduction: false,
  });
  assert.equal(productionBlocked.ok, false);
  if (!productionBlocked.ok) {
    assert.equal(productionBlocked.code, "PRODUCTION_NOT_ENABLED");
  }

  const okProduction = validateSimpaisaAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "production",
    apiBaseUrlRaw: "https://api.example.com",
    merchantIdRaw: "merchant",
    allowProduction: true,
  });
  assert.equal(okProduction.ok, true);

  const httpRejected = validateSimpaisaAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "sandbox",
    apiBaseUrlRaw: "http://sandbox.example.com",
    merchantIdRaw: "merchant",
  });
  assert.equal(httpRejected.ok, false);

  const okSandbox = validateSimpaisaAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "sandbox",
    apiBaseUrlRaw: "https://sandbox.example.com/api/",
    merchantIdRaw: "merchant",
  });
  assert.equal(okSandbox.ok, true);
  if (okSandbox.ok) {
    assert.equal(okSandbox.config.apiBaseUrl, "https://sandbox.example.com/api");
  }

  const sandboxDefaultMid = validateSimpaisaAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "sandbox",
    apiBaseUrlRaw: "https://sandbox.example.com",
    merchantIdRaw: undefined,
  });
  assert.equal(sandboxDefaultMid.ok, true);
  if (sandboxDefaultMid.ok) {
    assert.equal(sandboxDefaultMid.config.merchantId, "2001226");
  }

  const sandboxDefaultHost = validateSimpaisaAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "sandbox",
    apiBaseUrlRaw: undefined,
    merchantIdRaw: "merchant",
  });
  assert.equal(sandboxDefaultHost.ok, true);
  if (sandboxDefaultHost.ok) {
    assert.equal(
      sandboxDefaultHost.config.apiBaseUrl,
      SIMPAISA_SANDBOX_API_BASE_URL
    );
  }

  const productionNeedsMid = validateSimpaisaAdapterConfig({
    enabledRaw: "true",
    environmentRaw: "production",
    apiBaseUrlRaw: "https://api.example.com",
    merchantIdRaw: undefined,
    allowProduction: true,
  });
  assert.equal(productionNeedsMid.ok, false);
  if (!productionNeedsMid.ok) {
    assert.equal(productionNeedsMid.code, "MISSING_MERCHANT_ID");
  }

  const webhookMissing = validateSimpaisaWebhookConfig({
    webhookSecretRaw: undefined,
  });
  assert.equal(webhookMissing.ok, false);
  const webhookOk = validateSimpaisaWebhookConfig({
    webhookSecretRaw: "whsec_test",
  });
  assert.equal(webhookOk.ok, true);
  assert.equal(isSimpaisaWebhookSignatureContractAvailable(), false);
  assert.equal(isSimpaisaSandboxUnsignedWebhookAllowed("sandbox"), true);
  assert.equal(isSimpaisaSandboxUnsignedWebhookAllowed("production"), false);
  assert.equal(isSimpaisaWebhookPostbackAcceptable({ environment: "sandbox" }), true);
  assert.equal(
    isSimpaisaWebhookPostbackAcceptable({ environment: "production" }),
    false
  );
  console.log("PASS config_fail_closed_and_webhook_independent");

  const merchantId = "2001226";
  const body = JSON.stringify({
    responseCode: "0000",
    status: "0000",
    transactionId: "sp_txn_qa_1",
    userKey: "attempt_qa_1",
    merchantId,
    operatorId: "100007",
    amount: "100.00",
    currency: "PKR",
  });
  const confirmed = parseSimpaisaWebhookEvent({
    rawBody: body,
    headers: {},
    expectedConfig: { merchantId },
    signatureVerified: true,
  });
  assert.ok(confirmed);
  assert.equal(confirmed!.provider, "SIMPAISA");
  assert.equal(confirmed!.paymentStatus, "confirmed");
  assert.equal(confirmed!.chargeCurrency, "PKR");
  assert.equal(confirmed!.chargeAmountMinor, 10000);
  assert.equal(confirmed!.eventId, "sp_txn_qa_1:0000");
  assert.equal(confirmed!.signatureVerified, true);
  assert.equal(confirmed!.paymentAttemptId, "attempt_qa_1");
  assert.equal(confirmed!.walletOperatorId, "100007");

  const badTxnType = parseSimpaisaWebhookEvent({
    rawBody: JSON.stringify({
      responseCode: "0000",
      transactionId: "sp_txn_qa_1",
      userKey: "attempt_qa_1",
      merchantId,
      operatorId: "100007",
      amount: "100.00",
      currency: "PKR",
      transactionType: "1",
    }),
    headers: {},
    expectedConfig: { merchantId },
    signatureVerified: false,
  });
  assert.equal(badTxnType, null);

  const unsigned = parseSimpaisaWebhookEvent({
    rawBody: body,
    headers: {},
    expectedConfig: { merchantId },
    signatureVerified: false,
  });
  assert.ok(unsigned);
  assert.equal(unsigned!.signatureVerified, false);

  const pending = parseSimpaisaWebhookEvent({
    rawBody: JSON.stringify({
      responseCode: "0037",
      responseMessage: "Transaction-Pending",
      transactionId: "sp_txn_qa_1",
      userKey: "attempt_qa_1",
      merchantId,
      operatorId: "100008",
      amount: "100.00",
      currency: "PKR",
    }),
    headers: {},
    expectedConfig: { merchantId },
    signatureVerified: true,
  });
  assert.ok(pending);
  assert.equal(pending!.paymentStatus, "pending");
  assert.equal(pending!.eventId, "sp_txn_qa_1:0037");

  const wrongMerchant = parseSimpaisaWebhookEvent({
    rawBody: body,
    headers: {},
    expectedConfig: { merchantId: "other" },
    signatureVerified: true,
  });
  assert.equal(wrongMerchant, null);

  const formIgnored = parseSimpaisaWebhookEvent({
    rawBody: "responseCode=0000&transactionId=attempt_qa_1&amount=100.00",
    headers: {},
    expectedConfig: { merchantId },
    signatureVerified: true,
  });
  assert.equal(formIgnored, null);
  console.log("PASS webhook_parse_pending_vs_confirmed");

  assert.match(config, /import "server-only"/);
  assert.match(adapter, /import "server-only"/);
  assert.match(http, /import "server-only"/);
  assert.match(config, /allowProduction:\s*false/);
  assert.match(config, /never log key material/);
  assert.match(policy, /Public diagnostics — never includes secrets/);
  assert.doesNotMatch(policy, /SIMPAISA_USER_KEY|SIMPAISA_USER_ID/);
  assert.doesNotMatch(config, /SIMPAISA_USER_KEY|SIMPAISA_USER_ID/);
  assert.match(http, /verifyWalletTransaction/);
  assert.match(http, /operatorID:/);
  assert.match(http, /Request-Id/);
  assert.match(http, /transactionType: SIMPAISA_WALLET_TRANSACTION_TYPE/);
  assert.match(http, /userKey:/);
  assert.match(http, /productReference/);
  assert.doesNotMatch(http, /userId:\s*this\.config/);
  assert.doesNotMatch(http, /userKey:\s*this\.config/);
  assert.match(http, /HTTP_RETRY_DELAYS_MS/);
  assert.match(http, /never log request\/response bodies, MSISDN, or tokens/);
  assert.match(http, /amountSource/);
  assert.match(http, /hasResponseCode/);
  assert.match(http, /SIMPAISA_INQUIRY_PATH/);
  assert.match(http, /parseSimpaisaInquiryResponse/);
  assert.match(http, /operatorID = operatorIdInput/);
  assert.doesNotMatch(http, /JSON\.stringify\(json\)/);
  assert.match(route, /INQUIRY_UNAVAILABLE/);
  assert.match(route, /inquiryErrorCode/);
  assert.match(route, /operatorId: event.walletOperatorId/);
  assert.match(
    read("app/lib/payments/simpaisaInquiryParse.ts"),
    /AMOUNT_KEYS/
  );
  assert.match(http, /Non-OTP Verify accepts only 0037/);
  assert.match(http, /simpaisaMajorAmountFromMinor/);
  assert.match(adapter, /createCheckoutSession/);
  assert.match(adapter, /verifyWebhookSignature/);
  assert.match(adapter, /isSimpaisaWebhookSignatureContractAvailable/);
  assert.match(adapter, /parseWebhookEvent/);
  assert.match(adapter, /fetchPaymentStatus/);
  assert.match(adapter, /requestRefund/);
  assert.match(adapter, /Non-OTP Verify is not final/);
  assert.match(adapter, /verifyWalletTransaction/);
  assert.match(adapter, /merchantUserKey/);
  assert.match(adapter, /productReference/);
  assert.doesNotMatch(adapter, /applyVerifiedPaymentEvent/);
  assert.doesNotMatch(adapter, /PromoCode|promoDiscount/);
  assert.match(webhookCrypto, /isSimpaisaWebhookSignatureContractAvailable/);
  assert.match(webhookCrypto, /Do NOT invent or claim HMAC-SHA256/);
  assert.doesNotMatch(webhookCrypto, /createHmac/);
  assert.doesNotMatch(http, /100001|cardOperator|card_number/i);
  console.log("PASS adapter_contract_no_card_no_initiate_funding");

  assert.match(route, /isSimpaisaSandboxUnsignedWebhookAllowed/);
  assert.match(route, /validateSimpaisaAuthoritativeInquiry/);
  assert.match(route, /signatureVerified:\s*false/);
  assert.match(route, /signatureVerified:\s*true/);
  assert.match(route, /mapesim\.com\/api\/payments\/simpaisa\/webhook/);
  assert.match(route, /share with Simpaisa only when ready/i);
  assert.match(route, /Never fund on webhook payload alone/);
  assert.doesNotMatch(route, /No signature header required/);
  assert.match(route, /JSON payload|payin postback/);
  assert.match(route, /applyVerifiedPaymentEvent/);
  assert.match(route, /inquireTransaction/);
  assert.match(route, /PENDING_NOT_PAID/);
  assert.match(route, /UNCERTAIN_NOT_PAID/);
  assert.match(route, /FAILED_NOT_PAID/);
  assert.match(route, /status: 200/);
  assert.match(route, /INQUIRY_PENDING/);
  assert.match(route, /inquiry_field_mismatch/);
  assert.match(route, /status: 503/);
  assert.doesNotMatch(route, /markPaid/i);
  assert.match(route, /Never logs raw body/);
  console.log("PASS webhook_route_sandbox_unsigned_inquire_before_fund");

  const inquiryValidate = read("app/lib/payments/simpaisaInquiryValidate.ts");
  assert.match(inquiryValidate, /INQUIRY_NOT_CONFIRMED/);
  assert.match(inquiryValidate, /TRANSACTION_TYPE_MISMATCH/);
  const okInquiry = validateSimpaisaAuthoritativeInquiry({
    inquiry: {
      status: "confirmed",
      merchantId: "2001226",
      operatorId: "100007",
      userKey: "attempt_qa_1",
      providerTransactionId: "sp_txn_qa_1",
      chargeAmountMinor: 10000,
      chargeCurrency: "PKR",
      transactionType: "0",
    },
    expected: {
      merchantId: "2001226",
      operatorId: "100007",
      userKey: "attempt_qa_1",
      transactionId: "sp_txn_qa_1",
      chargeAmountMinor: 10000,
      chargeCurrency: "PKR",
    },
  });
  assert.equal(okInquiry.ok, true);
  const badAmount = validateSimpaisaAuthoritativeInquiry({
    inquiry: {
      status: "confirmed",
      merchantId: "2001226",
      operatorId: "100007",
      userKey: "attempt_qa_1",
      providerTransactionId: "sp_txn_qa_1",
      chargeAmountMinor: 9999,
      chargeCurrency: "PKR",
      transactionType: "0",
    },
    expected: {
      merchantId: "2001226",
      operatorId: "100007",
      userKey: "attempt_qa_1",
      transactionId: "sp_txn_qa_1",
      chargeAmountMinor: 10000,
    },
  });
  assert.equal(badAmount.ok, false);
  if (!badAmount.ok) assert.equal(badAmount.reason, "AMOUNT_MISMATCH");
  console.log("PASS authoritative_inquiry_validation");

  // Exact sandbox Inquire envelope from merchant screenshot (nested transaction).
  const screenshotInquiry = {
    merchantId: "2001226",
    transactionId: "95271258",
    userKey: "cmtlvl6x20001l505aoxmwn4r",
    transaction: {
      status: "0000",
      message: "Success",
      operatorId: "100007",
      merchantId: "2001226",
      transactionId: "95271258",
      amount: "29",
      userKey: "cmtlvl6x20001l505aoxmwn4r",
      transactionType: "0",
    },
  };
  const parsedScreenshot = parseSimpaisaInquiryResponse(screenshotInquiry);
  assert.ok(parsedScreenshot);
  assert.equal(parsedScreenshot!.responseCode, "0000");
  assert.equal(parsedScreenshot!.status, "confirmed");
  assert.equal(parsedScreenshot!.chargeAmountMinor, 2900);
  assert.equal(parsedScreenshot!.chargeCurrency, "PKR");
  assert.equal(parsedScreenshot!.currencySource, "default_pkr");
  assert.equal(parsedScreenshot!.usedNestedTransaction, true);
  assert.equal(parsedScreenshot!.amountSource, "amount");
  assert.equal(parsedScreenshot!.operatorId, "100007");
  assert.equal(parsedScreenshot!.userKey, "cmtlvl6x20001l505aoxmwn4r");
  assert.equal(parsedScreenshot!.providerTransactionId, "95271258");
  assert.equal(parsedScreenshot!.transactionType, "0");
  assert.equal(parsedScreenshot!.responseMessage, "Success");
  const screenshotValidate = validateSimpaisaAuthoritativeInquiry({
    inquiry: {
      status: parsedScreenshot!.status,
      merchantId: parsedScreenshot!.merchantId,
      operatorId: parsedScreenshot!.operatorId,
      userKey: parsedScreenshot!.userKey,
      providerTransactionId: parsedScreenshot!.providerTransactionId,
      chargeAmountMinor: parsedScreenshot!.chargeAmountMinor,
      chargeCurrency: parsedScreenshot!.chargeCurrency,
      transactionType: parsedScreenshot!.transactionType,
    },
    expected: {
      merchantId: "2001226",
      operatorId: "100007",
      userKey: "cmtlvl6x20001l505aoxmwn4r",
      transactionId: "95271258",
      chargeAmountMinor: 2900,
      chargeCurrency: "PKR",
    },
  });
  assert.equal(screenshotValidate.ok, true);
  const nestedWebhook = parseSimpaisaWebhookEvent({
    rawBody: JSON.stringify(screenshotInquiry),
    headers: {},
    expectedConfig: { merchantId: "2001226" },
    signatureVerified: false,
  });
  assert.ok(nestedWebhook);
  assert.equal(nestedWebhook!.paymentStatus, "confirmed");
  assert.equal(nestedWebhook!.chargeAmountMinor, 2900);
  assert.equal(nestedWebhook!.providerPaymentRef, "95271258");
  assert.equal(nestedWebhook!.paymentAttemptId, "cmtlvl6x20001l505aoxmwn4r");
  assert.equal(nestedWebhook!.walletOperatorId, "100007");
  assert.match(read("app/lib/payments/simpaisaHttp.ts"), /parseSimpaisaInquiryResponse/);
  assert.match(read("app/lib/payments/simpaisaInquiryParse.ts"), /usedNestedTransaction/);
  console.log("PASS inquire_nested_transaction_screenshot_shape");

  assert.match(disabled, /PAYMENT_GATEWAY_ENABLED/);
  assert.match(disabled, /tryCreateSafepayAdapter/);
  assert.match(disabled, /tryCreateSimpaisaAdapter/);
  assert.match(disabled, /misconfiguredPaymentAdapter/);
  assert.match(disabled, /Never falls back to a fake/);
  assert.match(disabled, /PAYMENT_GATEWAY_PROVIDER/);
  assert.ok(
    /export function isPaymentGatewayConfigured\(\): boolean \{[\s\S]*PAYMENT_GATEWAY_ENABLED[\s\S]*tryCreateSafepayAdapter[\s\S]*return created\.ok;[\s\S]*\}/.test(
      disabled
    )
  );
  console.log("PASS selection_defaults_to_simpaisa");

  assert.match(apply, /provider === "SIMPAISA"/);
  assert.match(apply, /provider === "SAFEPAY"/);
  assert.match(gateway, /resumeSafepayHostedCheckout/);
  assert.match(gateway, /resumeSimpaisaWalletCheckout/);
  assert.doesNotMatch(safepayRoute, /simpaisa/i);
  assert.doesNotMatch(safepayAdapter, /simpaisa/i);
  assert.match(pkg, /"qa:simpaisa-foundation"/);
  console.log("PASS safepay_path_untouched");

  assert.equal(SIMPAISA_PKR_USD_RATE, 293);
  assert.equal(FALLBACK_USD_RATES.PKR, 293);
  assert.equal(convertFromUsd(10, "PKR"), 10 * 293);
  const tenUsd = quoteSimpaisaPkrChargeFromUsdCents(1000);
  assert.ok(tenUsd);
  assert.equal(tenUsd!.chargeCurrency, "PKR");
  assert.equal(tenUsd!.pkrRupees, 2930);
  assert.equal(tenUsd!.chargeAmountMinor, 293000);
  assert.equal(tenUsd!.fxRateSnapshot, "USD:PKR:293");
  const catalog = quoteSimpaisaPkrChargeFromUsdCents(1299);
  assert.ok(catalog);
  assert.equal(catalog!.pkrRupees, Math.round(12.99 * 293));
  assert.equal(catalog!.chargeAmountMinor, Math.round(12.99 * 293) * 100);
  assert.equal(
    simpaisaChargeMatchesQuote({
      usdCents: 1299,
      chargeCurrency: "PKR",
      chargeAmountMinor: catalog!.chargeAmountMinor,
    }),
    true
  );
  assert.equal(
    simpaisaChargeMatchesQuote({
      usdCents: 1299,
      chargeCurrency: "USD",
      chargeAmountMinor: 1299,
    }),
    false
  );
  const parsedWallet = parseSimpaisaWalletCheckoutFields({
    walletOperatorId: "100007",
    customerMsisdn: "03001234567",
  });
  assert.equal(parsedWallet.ok, true);
  if (parsedWallet.ok) {
    assert.equal(parsedWallet.customerMsisdn, "3001234567");
  }
  assert.equal(
    parseSimpaisaWalletCheckoutFields({
      walletOperatorId: "100014",
      customerMsisdn: "3001234567",
    }).ok,
    false
  );
  assert.equal(
    parseSimpaisaWalletCheckoutFields({
      walletOperatorId: "card",
      customerMsisdn: "03001234567",
    }).ok,
    false
  );
  const quoteSrc = read("app/lib/payments/simpaisaPkrQuote.ts");
  assert.match(quoteSrc, /convertFromUsd/);
  assert.match(quoteSrc, /FALLBACK_USD_RATES/);
  assert.doesNotMatch(http, /chargeCurrency:\s*"USD"/);
  assert.match(adapter, /SIMPAISA_CHARGE_CURRENCY/);
  assert.match(gateway, /quoteSimpaisaPkrChargeFromUsdCents/);
  assert.match(gateway, /simpaisaChargeMatchesQuote/);
  assert.match(gateway, /chargeCurrency:\s*currency/);
  const confirmForm = read(
    "app/components/account/WalletPurchaseConfirmForm.tsx"
  );
  const walletFields = read("app/components/account/SimpaisaWalletFields.tsx");
  const actions = read("app/lib/esim/walletPurchaseActions.ts");
  assert.match(confirmForm, /SimpaisaWalletFields/);
  assert.match(walletFields, /Easypaisa/);
  assert.match(walletFields, /JazzCash/);
  assert.doesNotMatch(walletFields, /HBL Konnect|\bAlfa\b/);
  assert.match(walletFields, /walletOperatorId/);
  assert.match(walletFields, /customerMsisdn/);
  assert.match(walletFields, /3XXXXXXXXX/);
  assert.match(actions, /parseSimpaisaWalletCheckoutFields/);
  assert.match(actions, /walletOperatorId:/);
  assert.match(actions, /customerMsisdn:/);
  console.log("PASS pkr_quote_matches_charge_and_wallet_ui");

  console.log("ALL_SIMPAISA_FOUNDATION_CHECKS_PASSED");
}

main();
