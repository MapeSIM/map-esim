import "server-only";

import {
  isPaymentGatewayEnabledFlag,
  isSimpaisaSandboxUnsignedWebhookAllowed,
  isSimpaisaWebhookSignatureContractAvailable,
  parseSimpaisaEnvironment,
  validateSimpaisaAdapterConfig,
  validateSimpaisaApiCredentials,
  validateSimpaisaWebhookConfig,
  type SimpaisaConfigFailureCode,
  type SimpaisaPublicDiagnostics,
  type SimpaisaValidatedConfig,
  type SimpaisaWebhookValidatedConfig,
} from "@/app/lib/payments/simpaisaPolicy";

export {
  SIMPAISA_API_HEADER_MODE,
  SIMPAISA_API_HEADER_REGION,
  SIMPAISA_API_HEADER_VERSION,
  SIMPAISA_CHARGE_CURRENCY,
  SIMPAISA_ENVIRONMENTS,
  SIMPAISA_INQUIRY_PATH,
  SIMPAISA_REFUND_PATH,
  SIMPAISA_RESPONSE,
  SIMPAISA_SANDBOX_API_BASE_URL,
  SIMPAISA_SANDBOX_MERCHANT_ID,
  SIMPAISA_VERIFY_PATH,
  SIMPAISA_WALLET_OPERATORS,
  SIMPAISA_WALLET_TRANSACTION_TYPE,
  SIMPAISA_WEBHOOK_PATH,
  classifySimpaisaWalletResponseCode,
  isPaymentGatewayEnabledFlag,
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
  simpaisaFailureCategoryForCode,
  simpaisaMajorAmountFromMinor,
  simpaisaMinorAmountFromMajor,
  validateSimpaisaAdapterConfig,
  validateSimpaisaApiCredentials,
  validateSimpaisaWebhookConfig,
  type SimpaisaConfigFailureCode,
  type SimpaisaEnvironment,
  type SimpaisaPublicDiagnostics,
  type SimpaisaValidatedConfig,
  type SimpaisaWalletOperatorId,
  type SimpaisaWalletPaymentClassification,
  type SimpaisaWebhookValidatedConfig,
} from "@/app/lib/payments/simpaisaPolicy";

function envBag(): NodeJS.ProcessEnv {
  return process.env;
}

/**
 * Resolve Simpaisa adapter config from process.env.
 * Fail-closed when gateway flag is off or credentials/environment invalid.
 * Production remains blocked until explicitly allowed in code.
 */
export function resolveSimpaisaAdapterConfig(
  env: NodeJS.ProcessEnv = envBag()
):
  | { ok: true; config: SimpaisaValidatedConfig }
  | { ok: false; code: SimpaisaConfigFailureCode } {
  return validateSimpaisaAdapterConfig({
    enabledRaw: env.PAYMENT_GATEWAY_ENABLED,
    environmentRaw: env.SIMPAISA_ENVIRONMENT,
    apiBaseUrlRaw: env.SIMPAISA_API_BASE_URL,
    merchantIdRaw: env.SIMPAISA_MERCHANT_ID,
    allowProduction: false,
  });
}

/** Inquiry credentials after a signed payin postback — independent of checkout enable flag. */
export function resolveSimpaisaInquiryConfig(
  env: NodeJS.ProcessEnv = envBag()
):
  | { ok: true; config: SimpaisaValidatedConfig }
  | { ok: false; code: SimpaisaConfigFailureCode } {
  return validateSimpaisaApiCredentials({
    environmentRaw: env.SIMPAISA_ENVIRONMENT,
    apiBaseUrlRaw: env.SIMPAISA_API_BASE_URL,
    merchantIdRaw: env.SIMPAISA_MERCHANT_ID,
    allowProduction: false,
  });
}

export function resolveSimpaisaWebhookConfig(
  env: NodeJS.ProcessEnv = envBag()
):
  | { ok: true; config: SimpaisaWebhookValidatedConfig }
  | { ok: false; code: SimpaisaConfigFailureCode } {
  return validateSimpaisaWebhookConfig({
    webhookSecretRaw: env.SIMPAISA_WEBHOOK_SECRET,
  });
}

export function getSimpaisaPublicDiagnostics(
  env: NodeJS.ProcessEnv = envBag()
): SimpaisaPublicDiagnostics {
  const adapter = resolveSimpaisaAdapterConfig(env);
  return {
    paymentGatewayEnabledFlag: isPaymentGatewayEnabledFlag(
      env.PAYMENT_GATEWAY_ENABLED
    ),
    environment: parseSimpaisaEnvironment(env.SIMPAISA_ENVIRONMENT),
    apiBaseUrlConfigured: Boolean((env.SIMPAISA_API_BASE_URL ?? "").trim()),
    merchantIdConfigured: Boolean((env.SIMPAISA_MERCHANT_ID ?? "").trim()),
    webhookSecretConfigured: Boolean((env.SIMPAISA_WEBHOOK_SECRET ?? "").trim()),
    webhookSignatureContractAvailable:
      isSimpaisaWebhookSignatureContractAvailable(),
    sandboxUnsignedWebhookAllowed: isSimpaisaSandboxUnsignedWebhookAllowed(
      parseSimpaisaEnvironment(env.SIMPAISA_ENVIRONMENT)
    ),
    adapterConfigOk: adapter.ok,
    adapterFailureCode: adapter.ok ? null : adapter.code,
  };
}

export function logSimpaisaConfigFailure(code: SimpaisaConfigFailureCode): void {
  // Safe code only — never log key material, tokens, or env values.
  console.error("simpaisa_config_guard", code);
}
