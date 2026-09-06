/**
 * Pure Simpaisa PK wallet policy (no secrets, no I/O).
 * Card operators are intentionally omitted — wallet integration only.
 * Official v3 contract: verify + inquire + signed postback.
 */

import { isPaymentGatewayEnabledFlag } from "./safepayPolicy";

export { isPaymentGatewayEnabledFlag } from "./safepayPolicy";

export const SIMPAISA_ENVIRONMENTS = ["sandbox", "production"] as const;
export type SimpaisaEnvironment = (typeof SIMPAISA_ENVIRONMENTS)[number];

/** Wallet operator IDs from the official PK wallet contract. */
export const SIMPAISA_WALLET_OPERATORS = {
  EASYPAISA: "100007",
  JAZZCASH: "100008",
} as const;

/** Official sandbox merchant ID. Production still requires SIMPAISA_MERCHANT_ID. */
export const SIMPAISA_SANDBOX_MERCHANT_ID = "2001226";

/** Default sandbox host when SIMPAISA_API_BASE_URL is unset in sandbox. */
export const SIMPAISA_SANDBOX_API_BASE_URL = "https://sandbox.simpaisa.com";

export type SimpaisaWalletOperatorId =
  (typeof SIMPAISA_WALLET_OPERATORS)[keyof typeof SIMPAISA_WALLET_OPERATORS];

const WALLET_OPERATOR_SET = new Set<string>(
  Object.values(SIMPAISA_WALLET_OPERATORS)
);

/** Non-OTP async wallet collection (official v3 contract). */
export const SIMPAISA_WALLET_TRANSACTION_TYPE = "0";

export const SIMPAISA_RESPONSE = {
  SUCCESS: "0000",
  PENDING: "0037",
} as const;

export const SIMPAISA_PENDING_MESSAGE = "Transaction-Pending";

/** Official v2/v3 wallet API paths (relative to SIMPAISA_API_BASE_URL). */
export const SIMPAISA_VERIFY_PATH = "/v2/wallets/transaction/verify";
export const SIMPAISA_INQUIRY_PATH = "/v2/inquire/wallet/transaction/inquiry";

/** Refund path retained for future use — not wired in customer refund flow. */
export const SIMPAISA_REFUND_PATH = "/transaction/refund";

export const SIMPAISA_WEBHOOK_PATH = "/api/payments/simpaisa/webhook";
export const SIMPAISA_CHARGE_CURRENCY = "PKR";

/** Required Simpaisa wallet API headers (values only — no secrets). */
export const SIMPAISA_API_HEADER_MODE = "payin";
export const SIMPAISA_API_HEADER_REGION = "PK";
export const SIMPAISA_API_HEADER_VERSION = "3.0";

/**
 * Official Pay-In PK Wallet Status Codes (merchant-supplied).
 * Do not invent cancelled/expired categories or undocumented codes.
 */
export const SIMPAISA_OFFICIAL_STATUS_MEANINGS = {
  "0000": "Success",
  "0001": "Invalid-Operator",
  "0002": "Invalid-Product/Amount",
  "0003": "Invalid-Merchant",
  "0004": "Invalid-Value",
  "0005": "Invalid-Call",
  "0006": "Channel-Rejected-Transaction",
  "0007": "No-Response-From-Operator",
  "0008": "Invalid-Account",
  "0009": "Not-Enough-Balance",
  "0010": "OTP-Expired",
  "0011": "Invalid-OTP",
  "0012": "Transaction-Failed",
  "0015": "Invalid-Flow",
  "0016": "Threshold-Exceeded",
  "0018": "Request-In-Progress",
  "0019": "Invalid-UserKey",
  "0021": "Channel-Failed-Transaction",
  "0023": "Method-Not-Allowed",
  "0025": "Invalid-Mobile-No",
  "0026": "Operator-Disabled",
  "0027": "Amount-Beyond-Limit",
  "0028": "Token-Expired",
  "0033": "Channel-Invalid-Call",
  "0034": "Invalid-Token",
  "0036": "Token-Not-Found",
  "0037": "Transaction-Pending",
  "0039": "Invalid-CNIC",
  "0041": "Invalid-Account-Number",
  "0042": "Record-Not-Found",
  "0043": "Invalid-Account-Number",
  "0087": "No-Active-Subscription-Found",
  "0091": "User-didn't-approve-or-rejected-transaction",
  "0095": "Otp-Not-Entered",
  "0098": "Otp-Threshold-Exceeded",
  "9999": "System-Failure",
} as const;

/**
 * Ambiguous / in-flight / transport-risk codes — never fund or fulfill.
 * Also used for timeouts, 5xx, and undocumented/unknown codes.
 */
export const SIMPAISA_UNCERTAIN_RESPONSE_CODES = new Set([
  "0007",
  "0018",
  "9999",
]);

/**
 * Documented final rejection / invalid / failed outcomes (not pending/success/uncertain).
 */
export const SIMPAISA_FINAL_FAILURE_RESPONSE_CODES = new Set([
  "0001",
  "0002",
  "0003",
  "0004",
  "0005",
  "0006",
  "0008",
  "0009",
  "0010",
  "0011",
  "0012",
  "0015",
  "0016",
  "0019",
  "0021",
  "0023",
  "0025",
  "0026",
  "0027",
  "0028",
  "0033",
  "0034",
  "0036",
  "0039",
  "0041",
  "0042",
  "0043",
  "0087",
  "0091",
  "0095",
  "0098",
]);

export type SimpaisaWalletPaymentClassification =
  | "confirmed"
  | "pending"
  | "failed"
  | "uncertain";

export type SimpaisaConfigFailureCode =
  | "GATEWAY_DISABLED"
  | "INVALID_ENVIRONMENT"
  | "MISSING_API_BASE_URL"
  | "INVALID_API_BASE_URL"
  | "MISSING_MERCHANT_ID"
  | "MISSING_WEBHOOK_SECRET"
  | "PRODUCTION_NOT_ENABLED";

export type SimpaisaValidatedConfig = {
  environment: SimpaisaEnvironment;
  apiBaseUrl: string;
  merchantId: string;
};

export type SimpaisaWebhookValidatedConfig = {
  webhookSecret: string;
};

/**
 * Production webhook signature algorithm/secret is not yet available from Simpaisa.
 * Production postbacks stay fail-closed (HTTP 503) until this returns true with
 * the official algorithm implemented.
 *
 * Sandbox: merchant confirmed unsigned postbacks are acceptable — see
 * isSimpaisaSandboxUnsignedWebhookAllowed(). Unsigned sandbox triggers still
 * never fund without authoritative Inquire 0000 + field validation.
 */
export function isSimpaisaWebhookSignatureContractAvailable(): boolean {
  return false;
}

/** Official sandbox policy: unsigned postbacks allowed as Inquire triggers only. */
export function isSimpaisaSandboxUnsignedWebhookAllowed(
  environment: SimpaisaEnvironment | null | undefined
): boolean {
  return environment === "sandbox";
}

/**
 * Whether the webhook route may accept the postback body at all.
 * Sandbox → unsigned trigger OK. Production → signature contract required.
 */
export function isSimpaisaWebhookPostbackAcceptable(input: {
  environment: SimpaisaEnvironment | null | undefined;
}): boolean {
  if (isSimpaisaSandboxUnsignedWebhookAllowed(input.environment)) {
    return true;
  }
  if (input.environment === "production") {
    return isSimpaisaWebhookSignatureContractAvailable();
  }
  return false;
}

export function parseSimpaisaEnvironment(
  raw: string | undefined | null
): SimpaisaEnvironment | null {
  const value = (raw ?? "").trim();
  if (value === "sandbox" || value === "production") return value;
  return null;
}

export function isSimpaisaWalletOperatorId(
  raw: string | undefined | null
): raw is SimpaisaWalletOperatorId {
  return WALLET_OPERATOR_SET.has((raw ?? "").trim());
}

export function normalizeSimpaisaResponseCode(
  raw: string | undefined | null
): string {
  return (raw ?? "").trim();
}

export function isSimpaisaPendingCode(code: string): boolean {
  return normalizeSimpaisaResponseCode(code) === SIMPAISA_RESPONSE.PENDING;
}

export function isSimpaisaFinalSuccessCode(code: string): boolean {
  return normalizeSimpaisaResponseCode(code) === SIMPAISA_RESPONSE.SUCCESS;
}

/**
 * Non-OTP async Verify is accepted only on 0037 Transaction-Pending.
 * Unexpected 0000 (or any other code) is never treated as paid and is not
 * accepted as Verify finality — use Inquire / reconciliation.
 */
export function isSimpaisaAcceptedVerifyCode(code: string): boolean {
  return isSimpaisaPendingCode(code);
}

export function classifySimpaisaWalletResponseCode(
  raw: string | undefined | null
): SimpaisaWalletPaymentClassification | null {
  const code = normalizeSimpaisaResponseCode(raw);
  if (!code) return null;
  if (isSimpaisaFinalSuccessCode(code)) return "confirmed";
  if (isSimpaisaPendingCode(code)) return "pending";
  if (SIMPAISA_UNCERTAIN_RESPONSE_CODES.has(code)) return "uncertain";
  if (SIMPAISA_FINAL_FAILURE_RESPONSE_CODES.has(code)) return "failed";
  // Undocumented / ambiguous codes — never fund; require inquiry/reconciliation.
  return "uncertain";
}

export function mapSimpaisaClassificationToPaymentStatus(
  classification: SimpaisaWalletPaymentClassification
): "confirmed" | "pending" | "failed" | "uncertain" {
  return classification;
}

export function simpaisaFailureCategoryForCode(
  raw: string | undefined | null
): string | null {
  const classification = classifySimpaisaWalletResponseCode(raw);
  const code = normalizeSimpaisaResponseCode(raw);
  if (!classification || !code) return null;
  if (classification === "confirmed" || classification === "pending") {
    return null;
  }
  if (classification === "uncertain") return `simpaisa_uncertain_${code}`;
  return `simpaisa_failed_${code}`;
}

/**
 * PKR paisa → major-unit string for the Simpaisa `amount` field.
 * Example: 10000 → "100.00" = PKR 100. Never used to invent FX from USD.
 */
export function simpaisaMajorAmountFromMinor(minor: number): string | null {
  if (!Number.isInteger(minor) || minor <= 0 || minor > 99_999_999_99) {
    return null;
  }
  return (minor / 100).toFixed(2);
}

export function simpaisaMinorAmountFromMajor(
  raw: string | number | undefined | null
): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const minor = Math.round(raw * 100);
    return minor > 0 ? minor : null;
  }
  const value = (raw ?? "").trim();
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const minor = Math.round(Number(value) * 100);
  if (!Number.isInteger(minor) || minor <= 0) return null;
  return minor;
}

/**
 * Normalize Pakistani MSISDN to 10 digits without country code (3XXXXXXXXX).
 * Accepts 03XXXXXXXXX / 923XXXXXXXXX input and strips the prefix.
 */
export function normalizeSimpaisaMsisdn(
  raw: string | undefined | null
): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  let national: string | null = null;
  if (digits.length === 10 && digits.startsWith("3")) national = digits;
  else if (digits.length === 11 && digits.startsWith("03")) {
    national = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith("923")) {
    national = digits.slice(2);
  }
  if (!national || national.length !== 10 || !national.startsWith("3")) {
    return null;
  }
  return national;
}

/** Customer-safe MSISDN mask: 300****4567. Never returns the full number. */
export function maskSimpaisaMsisdn(
  raw: string | undefined | null
): string | null {
  const national = normalizeSimpaisaMsisdn(raw);
  if (!national) return null;
  return `${national.slice(0, 3)}****${national.slice(-4)}`;
}

function nonEmptySecret(raw: string | undefined | null, max = 512): string | null {
  const value = (raw ?? "").trim();
  if (!value || value.length > max) return null;
  return value;
}

function parseHttpsApiBaseUrl(raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value || value.length > 200) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname) return null;
  if (parsed.search || parsed.hash) return null;
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(
    /\/+$/,
    ""
  );
}

function resolveApiBaseUrl(input: {
  environment: SimpaisaEnvironment;
  apiBaseUrlRaw: string | undefined | null;
}): string | null {
  const parsed = parseHttpsApiBaseUrl(input.apiBaseUrlRaw);
  if (parsed) return parsed;
  if (input.environment === "sandbox" && !(input.apiBaseUrlRaw ?? "").trim()) {
    return SIMPAISA_SANDBOX_API_BASE_URL;
  }
  return null;
}

/**
 * Adapter credentials. Production stays fail-closed until allowProduction.
 * Does not require webhook secret (webhook is independently configured).
 * userKey in API bodies is the MAP payment reference — not an env secret.
 */
export function validateSimpaisaApiCredentials(input: {
  environmentRaw: string | undefined | null;
  apiBaseUrlRaw: string | undefined | null;
  merchantIdRaw: string | undefined | null;
  allowProduction?: boolean;
}):
  | { ok: true; config: SimpaisaValidatedConfig }
  | { ok: false; code: SimpaisaConfigFailureCode } {
  const environment = parseSimpaisaEnvironment(input.environmentRaw);
  if (!environment) {
    return { ok: false, code: "INVALID_ENVIRONMENT" };
  }
  if (environment === "production" && input.allowProduction !== true) {
    return { ok: false, code: "PRODUCTION_NOT_ENABLED" };
  }

  const apiBaseUrl = resolveApiBaseUrl({
    environment,
    apiBaseUrlRaw: input.apiBaseUrlRaw,
  });
  if (!apiBaseUrl) {
    return {
      ok: false,
      code: input.apiBaseUrlRaw?.trim()
        ? "INVALID_API_BASE_URL"
        : "MISSING_API_BASE_URL",
    };
  }

  let merchantId = nonEmptySecret(input.merchantIdRaw, 120);
  if (!merchantId && environment === "sandbox") {
    merchantId = SIMPAISA_SANDBOX_MERCHANT_ID;
  }
  if (!merchantId) return { ok: false, code: "MISSING_MERCHANT_ID" };

  return {
    ok: true,
    config: {
      environment,
      apiBaseUrl,
      merchantId,
    },
  };
}

/**
 * Checkout adapter credentials. Requires PAYMENT_GATEWAY_ENABLED exact "true".
 */
export function validateSimpaisaAdapterConfig(input: {
  enabledRaw: string | undefined | null;
  environmentRaw: string | undefined | null;
  apiBaseUrlRaw: string | undefined | null;
  merchantIdRaw: string | undefined | null;
  allowProduction?: boolean;
}):
  | { ok: true; config: SimpaisaValidatedConfig }
  | { ok: false; code: SimpaisaConfigFailureCode } {
  if (!isPaymentGatewayEnabledFlag(input.enabledRaw)) {
    return { ok: false, code: "GATEWAY_DISABLED" };
  }
  return validateSimpaisaApiCredentials(input);
}

export function validateSimpaisaWebhookConfig(input: {
  webhookSecretRaw: string | undefined | null;
}):
  | { ok: true; config: SimpaisaWebhookValidatedConfig }
  | { ok: false; code: SimpaisaConfigFailureCode } {
  const webhookSecret = nonEmptySecret(input.webhookSecretRaw);
  if (!webhookSecret) {
    return { ok: false, code: "MISSING_WEBHOOK_SECRET" };
  }
  return { ok: true, config: { webhookSecret } };
}

/** Public diagnostics — never includes secrets or tokens. */
export type SimpaisaPublicDiagnostics = {
  paymentGatewayEnabledFlag: boolean;
  environment: SimpaisaEnvironment | null;
  apiBaseUrlConfigured: boolean;
  merchantIdConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookSignatureContractAvailable: boolean;
  sandboxUnsignedWebhookAllowed: boolean;
  adapterConfigOk: boolean;
  adapterFailureCode: SimpaisaConfigFailureCode | null;
};
