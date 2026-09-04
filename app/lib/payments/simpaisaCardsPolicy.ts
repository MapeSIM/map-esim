/**
 * Simpaisa Cards V1 rail policy — provider-contract-independent foundation.
 * Pure module (no secrets, no I/O). Safe for offline QA.
 *
 * This rail is SEPARATE from Simpaisa wallet (Easypaisa/JazzCash).
 * Do not import or extend wallet simpaisaHttp / wallet webhook paths here.
 *
 * Provider create-session / webhook / inquiry field maps:
 *   WAITING_FOR_SIMPAISA — do not invent request/response fields.
 * Hosted Page availability still awaits Simpaisa confirmation.
 * Direct Cards API requires separate security/onboarding (out of scope).
 */

/** Distinct rail id — never aliased to wallet SIMPAISA. */
export const SIMPAISA_CARDS_RAIL_ID = "SIMPAISA_CARDS" as const;
export type SimpaisaCardsRailId = typeof SIMPAISA_CARDS_RAIL_ID;

/**
 * Marker for unfinished provider contracts.
 * Any create-session / webhook / inquiry implementation must remain blocked
 * until official Hosted Page (or Direct Cards) docs arrive.
 */
export const SIMPAISA_CARDS_CONTRACT_STATUS = "WAITING_FOR_SIMPAISA" as const;
export type SimpaisaCardsContractStatus =
  typeof SIMPAISA_CARDS_CONTRACT_STATUS;

/** Exact enable value — fail closed unless identical. */
export const SIMPAISA_CARDS_ENABLED_VALUE = "true" as const;

/**
 * Env NAMES only (fail-closed readers live in simpaisaCardsConfig).
 * Secrets are never logged; values are never invented here.
 */
export const SIMPAISA_CARDS_ENV_NAMES = {
  /** Exact "true" required to enable this rail (independent of wallet). */
  ENABLED: "SIMPAISA_CARDS_ENABLED",
  ENVIRONMENT: "SIMPAISA_CARDS_ENVIRONMENT",
  /** Merchant / MID once Simpaisa confirms Cards onboarding. */
  MERCHANT_ID: "SIMPAISA_CARDS_MERCHANT_ID",
  /** API base URL once Hosted Page / Cards API host is confirmed. */
  API_BASE_URL: "SIMPAISA_CARDS_API_BASE_URL",
  /** Webhook authenticity secret once callback signing is documented. */
  WEBHOOK_SECRET: "SIMPAISA_CARDS_WEBHOOK_SECRET",
  /**
   * Optional shared global gateway flag — Cards still requires
   * SIMPAISA_CARDS_ENABLED=true even when this is set.
   */
  PAYMENT_GATEWAY_ENABLED: "PAYMENT_GATEWAY_ENABLED",
} as const;

export const SIMPAISA_CARDS_ENVIRONMENTS = ["sandbox", "production"] as const;
export type SimpaisaCardsEnvironment =
  (typeof SIMPAISA_CARDS_ENVIRONMENTS)[number];

export type SimpaisaCardsConfigFailureCode =
  | "CARDS_DISABLED"
  | "INVALID_ENVIRONMENT"
  | "MISSING_MERCHANT_ID"
  | "MISSING_API_BASE_URL"
  | "MISSING_WEBHOOK_SECRET"
  | "PRODUCTION_NOT_ENABLED"
  | "PROVIDER_CONTRACT_WAITING";

export type SimpaisaCardsValidatedConfig = {
  environment: SimpaisaCardsEnvironment;
  merchantId: string;
  apiBaseUrl: string;
  /** Always WAITING_FOR_SIMPAISA until Hosted Page docs unlock HTTP. */
  contractStatus: SimpaisaCardsContractStatus;
};

export type SimpaisaCardsWebhookValidatedConfig = {
  webhookSecret: string;
  contractStatus: SimpaisaCardsContractStatus;
};

export type SimpaisaCardsPublicDiagnostics = {
  cardsEnabledFlag: boolean;
  environment: SimpaisaCardsEnvironment | null;
  merchantIdConfigured: boolean;
  apiBaseUrlConfigured: boolean;
  webhookSecretConfigured: boolean;
  adapterConfigOk: boolean;
  adapterFailureCode: SimpaisaCardsConfigFailureCode | null;
  contractStatus: SimpaisaCardsContractStatus;
  /** Explicit: this rail never handles PAN/CVV. */
  handlesPanOrCvv: false;
  /** Explicit: not the wallet Verify/Inquire rail. */
  isWalletRail: false;
};

/** Provider contracts still blocked — names only, no field schemas. */
export const SIMPAISA_CARDS_PROVIDER_CONTRACTS = {
  createHostedSession: SIMPAISA_CARDS_CONTRACT_STATUS,
  webhookAuthenticate: SIMPAISA_CARDS_CONTRACT_STATUS,
  webhookParse: SIMPAISA_CARDS_CONTRACT_STATUS,
  inquiry: SIMPAISA_CARDS_CONTRACT_STATUS,
  threeDsContinuation: SIMPAISA_CARDS_CONTRACT_STATUS,
} as const;

export function isSimpaisaCardsEnabledFlag(
  raw: string | undefined | null
): boolean {
  // Exact match only — do not trim.
  return raw === SIMPAISA_CARDS_ENABLED_VALUE;
}

export function parseSimpaisaCardsEnvironment(
  raw: string | undefined | null
): SimpaisaCardsEnvironment | null {
  const value = (raw ?? "").trim();
  if (value === "sandbox" || value === "production") return value;
  return null;
}

function nonEmptyTrimmed(
  raw: string | undefined | null,
  max = 512
): string | null {
  const value = (raw ?? "").trim();
  if (!value || value.length > max) return null;
  return value;
}

/**
 * Validate Cards adapter config from raw env strings.
 * Always fail-closed while provider contracts are WAITING_FOR_SIMPAISA,
 * even when enable flag + credentials look present.
 */
export function validateSimpaisaCardsAdapterConfig(input: {
  enabledRaw: string | undefined | null;
  environmentRaw: string | undefined | null;
  merchantIdRaw: string | undefined | null;
  apiBaseUrlRaw: string | undefined | null;
  allowProduction?: boolean;
  /**
   * Foundation default: contracts blocked.
   * Flip only after official Hosted Page docs are wired (not yet).
   */
  providerContractsReady?: boolean;
}):
  | { ok: true; config: SimpaisaCardsValidatedConfig }
  | { ok: false; code: SimpaisaCardsConfigFailureCode } {
  if (!isSimpaisaCardsEnabledFlag(input.enabledRaw)) {
    return { ok: false, code: "CARDS_DISABLED" };
  }

  const environment = parseSimpaisaCardsEnvironment(input.environmentRaw);
  if (!environment) {
    return { ok: false, code: "INVALID_ENVIRONMENT" };
  }

  if (environment === "production" && input.allowProduction !== true) {
    return { ok: false, code: "PRODUCTION_NOT_ENABLED" };
  }

  const merchantId = nonEmptyTrimmed(input.merchantIdRaw, 128);
  if (!merchantId) {
    return { ok: false, code: "MISSING_MERCHANT_ID" };
  }

  const apiBaseUrl = nonEmptyTrimmed(input.apiBaseUrlRaw, 256);
  if (!apiBaseUrl) {
    return { ok: false, code: "MISSING_API_BASE_URL" };
  }

  if (input.providerContractsReady !== true) {
    return { ok: false, code: "PROVIDER_CONTRACT_WAITING" };
  }

  return {
    ok: true,
    config: {
      environment,
      merchantId,
      apiBaseUrl,
      contractStatus: SIMPAISA_CARDS_CONTRACT_STATUS,
    },
  };
}

/** Webhook secret reader — still blocked until Simpaisa documents signing. */
export function validateSimpaisaCardsWebhookConfig(input: {
  webhookSecretRaw: string | undefined | null;
  providerContractsReady?: boolean;
}):
  | { ok: true; config: SimpaisaCardsWebhookValidatedConfig }
  | { ok: false; code: SimpaisaCardsConfigFailureCode } {
  const webhookSecret = nonEmptyTrimmed(input.webhookSecretRaw);
  if (!webhookSecret) {
    return { ok: false, code: "MISSING_WEBHOOK_SECRET" };
  }
  if (input.providerContractsReady !== true) {
    return { ok: false, code: "PROVIDER_CONTRACT_WAITING" };
  }
  return {
    ok: true,
    config: {
      webhookSecret,
      contractStatus: SIMPAISA_CARDS_CONTRACT_STATUS,
    },
  };
}
