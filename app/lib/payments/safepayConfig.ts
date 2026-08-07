import "server-only";

import {
  isPaymentGatewayEnabledFlag,
  parseSafepayEnvironment,
  parseSafepayIntent,
  validateSafepayAdapterConfig,
  validateSafepayWebhookConfig,
  type SafepayConfigFailureCode,
  type SafepayPublicDiagnostics,
  type SafepayValidatedConfig,
  type SafepayWebhookValidatedConfig,
} from "@/app/lib/payments/safepayPolicy";

export {
  PAYMENT_GATEWAY_ENABLED_VALUE,
  SAFEPAY_ENVIRONMENTS,
  SAFEPAY_INTENTS,
  isPaymentGatewayEnabledFlag,
  parseSafepayEnvironment,
  parseSafepayIntent,
  safepayApiBaseUrl,
  safepayCheckoutBaseUrl,
  validateSafepayAdapterConfig,
  validateSafepayWebhookConfig,
  type SafepayConfigFailureCode,
  type SafepayEnvironment,
  type SafepayIntent,
  type SafepayPublicDiagnostics,
  type SafepayValidatedConfig,
  type SafepayWebhookValidatedConfig,
} from "@/app/lib/payments/safepayPolicy";

function envBag(): NodeJS.ProcessEnv {
  return process.env;
}

/**
 * Resolve Safepay adapter config from process.env.
 * Fail-closed when gateway flag is off or credentials/intent invalid.
 * Production is fail-closed until allowProduction is explicitly enabled later.
 */
export function resolveSafepayAdapterConfig(
  env: NodeJS.ProcessEnv = envBag()
):
  | { ok: true; config: SafepayValidatedConfig }
  | { ok: false; code: SafepayConfigFailureCode } {
  return validateSafepayAdapterConfig({
    enabledRaw: env.PAYMENT_GATEWAY_ENABLED,
    environmentRaw: env.SAFEPAY_ENVIRONMENT,
    apiKeyRaw: env.SAFEPAY_API_KEY,
    secretKeyRaw: env.SAFEPAY_SECRET_KEY,
    intentRaw: env.SAFEPAY_INTENT,
    allowProduction: false,
  });
}

/** PG4 webhook secret reader — independent of adapter enable flag. */
export function resolveSafepayWebhookConfig(
  env: NodeJS.ProcessEnv = envBag()
):
  | { ok: true; config: SafepayWebhookValidatedConfig }
  | { ok: false; code: SafepayConfigFailureCode } {
  return validateSafepayWebhookConfig({
    webhookSecretRaw: env.SAFEPAY_WEBHOOK_SECRET,
  });
}

export function getSafepayPublicDiagnostics(
  env: NodeJS.ProcessEnv = envBag()
): SafepayPublicDiagnostics {
  const adapter = resolveSafepayAdapterConfig(env);
  return {
    paymentGatewayEnabledFlag: isPaymentGatewayEnabledFlag(
      env.PAYMENT_GATEWAY_ENABLED
    ),
    environment: parseSafepayEnvironment(env.SAFEPAY_ENVIRONMENT),
    intentConfigured: parseSafepayIntent(env.SAFEPAY_INTENT) !== null,
    apiKeyConfigured: Boolean((env.SAFEPAY_API_KEY ?? "").trim()),
    secretKeyConfigured: Boolean((env.SAFEPAY_SECRET_KEY ?? "").trim()),
    webhookSecretConfigured: Boolean((env.SAFEPAY_WEBHOOK_SECRET ?? "").trim()),
    adapterConfigOk: adapter.ok,
    adapterFailureCode: adapter.ok ? null : adapter.code,
  };
}

export function logSafepayConfigFailure(code: SafepayConfigFailureCode): void {
  // Safe code only — never log key material, tokens, or env values.
  console.error("safepay_config_guard", code);
}
