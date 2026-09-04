/**
 * Server-only Simpaisa Cards config readers (env NAMES from policy).
 * Fail-closed. Never logs secrets. Provider HTTP remains WAITING_FOR_SIMPAISA.
 */
import "server-only";

import {
  SIMPAISA_CARDS_CONTRACT_STATUS,
  SIMPAISA_CARDS_ENV_NAMES,
  isSimpaisaCardsEnabledFlag,
  parseSimpaisaCardsEnvironment,
  validateSimpaisaCardsAdapterConfig,
  validateSimpaisaCardsWebhookConfig,
  type SimpaisaCardsConfigFailureCode,
  type SimpaisaCardsPublicDiagnostics,
  type SimpaisaCardsValidatedConfig,
  type SimpaisaCardsWebhookValidatedConfig,
} from "@/app/lib/payments/simpaisaCardsPolicy";

export {
  SIMPAISA_CARDS_CONTRACT_STATUS,
  SIMPAISA_CARDS_ENABLED_VALUE,
  SIMPAISA_CARDS_ENV_NAMES,
  SIMPAISA_CARDS_ENVIRONMENTS,
  SIMPAISA_CARDS_PROVIDER_CONTRACTS,
  SIMPAISA_CARDS_RAIL_ID,
  isSimpaisaCardsEnabledFlag,
  parseSimpaisaCardsEnvironment,
  validateSimpaisaCardsAdapterConfig,
  validateSimpaisaCardsWebhookConfig,
  type SimpaisaCardsConfigFailureCode,
  type SimpaisaCardsContractStatus,
  type SimpaisaCardsEnvironment,
  type SimpaisaCardsPublicDiagnostics,
  type SimpaisaCardsRailId,
  type SimpaisaCardsValidatedConfig,
  type SimpaisaCardsWebhookValidatedConfig,
} from "@/app/lib/payments/simpaisaCardsPolicy";

function envBag(): NodeJS.ProcessEnv {
  return process.env;
}

/**
 * Resolve Cards adapter config from process.env.
 * Always fail-closed while Hosted Page contracts are WAITING_FOR_SIMPAISA.
 */
export function resolveSimpaisaCardsAdapterConfig(
  env: NodeJS.ProcessEnv = envBag()
):
  | { ok: true; config: SimpaisaCardsValidatedConfig }
  | { ok: false; code: SimpaisaCardsConfigFailureCode } {
  return validateSimpaisaCardsAdapterConfig({
    enabledRaw: env[SIMPAISA_CARDS_ENV_NAMES.ENABLED],
    environmentRaw: env[SIMPAISA_CARDS_ENV_NAMES.ENVIRONMENT],
    merchantIdRaw: env[SIMPAISA_CARDS_ENV_NAMES.MERCHANT_ID],
    apiBaseUrlRaw: env[SIMPAISA_CARDS_ENV_NAMES.API_BASE_URL],
    allowProduction: false,
    providerContractsReady: false,
  });
}

export function resolveSimpaisaCardsWebhookConfig(
  env: NodeJS.ProcessEnv = envBag()
):
  | { ok: true; config: SimpaisaCardsWebhookValidatedConfig }
  | { ok: false; code: SimpaisaCardsConfigFailureCode } {
  return validateSimpaisaCardsWebhookConfig({
    webhookSecretRaw: env[SIMPAISA_CARDS_ENV_NAMES.WEBHOOK_SECRET],
    providerContractsReady: false,
  });
}

export function getSimpaisaCardsPublicDiagnostics(
  env: NodeJS.ProcessEnv = envBag()
): SimpaisaCardsPublicDiagnostics {
  const adapter = resolveSimpaisaCardsAdapterConfig(env);
  return {
    cardsEnabledFlag: isSimpaisaCardsEnabledFlag(
      env[SIMPAISA_CARDS_ENV_NAMES.ENABLED]
    ),
    environment: parseSimpaisaCardsEnvironment(
      env[SIMPAISA_CARDS_ENV_NAMES.ENVIRONMENT]
    ),
    merchantIdConfigured: Boolean(
      (env[SIMPAISA_CARDS_ENV_NAMES.MERCHANT_ID] ?? "").trim()
    ),
    apiBaseUrlConfigured: Boolean(
      (env[SIMPAISA_CARDS_ENV_NAMES.API_BASE_URL] ?? "").trim()
    ),
    webhookSecretConfigured: Boolean(
      (env[SIMPAISA_CARDS_ENV_NAMES.WEBHOOK_SECRET] ?? "").trim()
    ),
    adapterConfigOk: adapter.ok,
    adapterFailureCode: adapter.ok ? null : adapter.code,
    contractStatus: SIMPAISA_CARDS_CONTRACT_STATUS,
    handlesPanOrCvv: false,
    isWalletRail: false,
  };
}

export function logSimpaisaCardsConfigFailure(
  code: SimpaisaCardsConfigFailureCode
): void {
  console.error("simpaisa_cards_config_guard", code);
}
