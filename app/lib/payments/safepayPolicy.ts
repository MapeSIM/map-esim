/**
 * Pure Safepay Card Payments policy (no secrets, no I/O).
 * Safe to import from offline QA scripts.
 */

export const SAFEPAY_ENVIRONMENTS = ["sandbox", "production"] as const;
export type SafepayEnvironment = (typeof SAFEPAY_ENVIRONMENTS)[number];

export const SAFEPAY_INTENTS = ["CYBERSOURCE", "MPGS"] as const;
export type SafepayIntent = (typeof SAFEPAY_INTENTS)[number];

export const PAYMENT_GATEWAY_ENABLED_VALUE = "true";

export type SafepayConfigFailureCode =
  | "GATEWAY_DISABLED"
  | "INVALID_ENVIRONMENT"
  | "MISSING_API_KEY"
  | "MISSING_SECRET_KEY"
  | "INVALID_INTENT"
  | "MISSING_WEBHOOK_SECRET"
  | "PRODUCTION_NOT_ENABLED";

export type SafepayValidatedConfig = {
  environment: SafepayEnvironment;
  apiKey: string;
  secretKey: string;
  intent: SafepayIntent;
  apiBaseUrl: string;
  checkoutBaseUrl: string;
};

export type SafepayWebhookValidatedConfig = {
  webhookSecret: string;
};

/** Official Card Payments API hosts — not user-configurable. */
export function safepayApiBaseUrl(environment: SafepayEnvironment): string {
  return environment === "production"
    ? "https://api.getsafepay.com"
    : "https://sandbox.api.getsafepay.com";
}

/**
 * Hosted Checkout redirect base (Express Checkout / hosted source).
 * Matches official Safepay Checkout::constructURL hosts + `/embedded` path.
 * Query must still include validated `environment` (sandbox|production).
 */
export function safepayCheckoutBaseUrl(environment: SafepayEnvironment): string {
  return environment === "production"
    ? "https://getsafepay.com/embedded"
    : "https://sandbox.api.getsafepay.com/embedded";
}

export function isPaymentGatewayEnabledFlag(
  raw: string | undefined | null
): boolean {
  // Exact match only — do not trim. Mirrors guest-checkout fail-closed style.
  return raw === PAYMENT_GATEWAY_ENABLED_VALUE;
}

export function parseSafepayEnvironment(
  raw: string | undefined | null
): SafepayEnvironment | null {
  const value = (raw ?? "").trim();
  if (value === "sandbox" || value === "production") return value;
  return null;
}

export function parseSafepayIntent(
  raw: string | undefined | null
): SafepayIntent | null {
  const value = (raw ?? "").trim();
  if (value === "CYBERSOURCE" || value === "MPGS") return value;
  return null;
}

function nonEmptySecret(raw: string | undefined | null, max = 512): string | null {
  const value = (raw ?? "").trim();
  if (!value || value.length > max) return null;
  return value;
}

/**
 * Validate adapter credentials. Does not require webhook secret (PG4).
 * Production remains fail-closed until explicitly allowed by caller policy.
 */
export function validateSafepayAdapterConfig(input: {
  enabledRaw: string | undefined | null;
  environmentRaw: string | undefined | null;
  apiKeyRaw: string | undefined | null;
  secretKeyRaw: string | undefined | null;
  intentRaw: string | undefined | null;
  allowProduction?: boolean;
}):
  | { ok: true; config: SafepayValidatedConfig }
  | { ok: false; code: SafepayConfigFailureCode } {
  if (!isPaymentGatewayEnabledFlag(input.enabledRaw)) {
    return { ok: false, code: "GATEWAY_DISABLED" };
  }

  const environment = parseSafepayEnvironment(input.environmentRaw);
  if (!environment) {
    return { ok: false, code: "INVALID_ENVIRONMENT" };
  }

  if (environment === "production" && input.allowProduction !== true) {
    return { ok: false, code: "PRODUCTION_NOT_ENABLED" };
  }

  const intent = parseSafepayIntent(input.intentRaw);
  if (!intent) {
    return { ok: false, code: "INVALID_INTENT" };
  }

  const apiKey = nonEmptySecret(input.apiKeyRaw);
  if (!apiKey) {
    return { ok: false, code: "MISSING_API_KEY" };
  }

  const secretKey = nonEmptySecret(input.secretKeyRaw);
  if (!secretKey) {
    return { ok: false, code: "MISSING_SECRET_KEY" };
  }

  return {
    ok: true,
    config: {
      environment,
      apiKey,
      secretKey,
      intent,
      apiBaseUrl: safepayApiBaseUrl(environment),
      checkoutBaseUrl: safepayCheckoutBaseUrl(environment),
    },
  };
}

/** Separate fail-closed reader for PG4 webhook verification. */
export function validateSafepayWebhookConfig(input: {
  webhookSecretRaw: string | undefined | null;
}):
  | { ok: true; config: SafepayWebhookValidatedConfig }
  | { ok: false; code: SafepayConfigFailureCode } {
  const webhookSecret = nonEmptySecret(input.webhookSecretRaw);
  if (!webhookSecret) {
    return { ok: false, code: "MISSING_WEBHOOK_SECRET" };
  }
  return { ok: true, config: { webhookSecret } };
}

/** Public diagnostics — never includes secrets or tokens. */
export type SafepayPublicDiagnostics = {
  paymentGatewayEnabledFlag: boolean;
  environment: SafepayEnvironment | null;
  intentConfigured: boolean;
  apiKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  adapterConfigOk: boolean;
  adapterFailureCode: SafepayConfigFailureCode | null;
};
