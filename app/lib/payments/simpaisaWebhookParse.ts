/**
 * Pure Simpaisa wallet webhook → NormalizedPaymentEvent mapping.
 * Postback payload is a trigger only — never authoritative for funding.
 * 0037 Transaction-Pending is never treated as paid.
 */
import {
  classifySimpaisaWalletResponseCode,
  mapSimpaisaClassificationToPaymentStatus,
  normalizeSimpaisaResponseCode,
  SIMPAISA_CHARGE_CURRENCY,
  SIMPAISA_RESPONSE,
  SIMPAISA_WALLET_TRANSACTION_TYPE,
  simpaisaFailureCategoryForCode,
  simpaisaMinorAmountFromMajor,
  type SimpaisaValidatedConfig,
} from "@/app/lib/payments/simpaisaPolicy";
import type {
  NormalizedPaymentEvent,
  NormalizedPaymentStatus,
  PaymentCheckoutPurpose,
} from "@/app/lib/payments/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).trim() || null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstString(
  record: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return null;
}

function parseBody(rawBody: string): Record<string, unknown> | null {
  const trimmed = rawBody.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function resolvePurpose(_userKey: string): PaymentCheckoutPurpose {
  // applyVerifiedPaymentEvent resolves wallet top-up vs eSIM by DB lookup on userKey.
  return "ESIM_PURCHASE";
}

/**
 * Parse a JSON Simpaisa payin postback payload.
 * Returns null for malformed bodies or missing required fields.
 * signatureVerified on the returned event reflects caller verification only.
 */
export function parseSimpaisaWebhookEvent(input: {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
  expectedConfig: Pick<SimpaisaValidatedConfig, "merchantId">;
  signatureVerified: boolean;
}): NormalizedPaymentEvent | null {
  void input.headers;
  const root = parseBody(input.rawBody);
  if (!root) return null;
  const data = asRecord(root.data) ?? root;

  const responseCode = normalizeSimpaisaResponseCode(
    firstString(data, ["responseCode", "response_code", "status"]) ??
      firstString(root, ["responseCode", "response_code", "status"])
  );
  const classification = classifySimpaisaWalletResponseCode(responseCode);
  if (!classification) return null;
  const paymentStatus: NormalizedPaymentStatus =
    mapSimpaisaClassificationToPaymentStatus(classification);

  const merchantId =
    firstString(data, ["merchantId", "merchant_id"]) ??
    firstString(root, ["merchantId", "merchant_id"]);
  if (!merchantId || merchantId !== input.expectedConfig.merchantId.trim()) {
    return null;
  }

  const operatorId =
    firstString(data, ["operatorId", "operator_id", "operatorID"]) ??
    firstString(root, ["operatorId", "operator_id", "operatorID"]);
  if (!operatorId) return null;

  const transactionTypeRaw =
    firstString(data, ["transactionType", "transaction_type"]) ??
    firstString(root, ["transactionType", "transaction_type"]);
  if (
    transactionTypeRaw &&
    transactionTypeRaw.trim() !== SIMPAISA_WALLET_TRANSACTION_TYPE
  ) {
    return null;
  }

  const userKey =
    firstString(data, ["userKey", "user_key"]) ??
    firstString(root, ["userKey", "user_key"]);
  if (!userKey || userKey.length > 64) return null;

  const transactionId =
    firstString(data, ["transactionId", "transaction_id"]) ??
    firstString(root, ["transactionId", "transaction_id"]);
  if (!transactionId || transactionId.length > 190) return null;

  const amountRaw =
    data.amount ??
    data.transactionAmount ??
    root.amount ??
    root.transactionAmount;
  const chargeAmountMinor = simpaisaMinorAmountFromMajor(
    typeof amountRaw === "number" || typeof amountRaw === "string"
      ? amountRaw
      : null
  );
  const currency = (
    firstString(data, ["currency"]) ??
    firstString(root, ["currency"]) ??
    SIMPAISA_CHARGE_CURRENCY
  ).toUpperCase();
  if (
    chargeAmountMinor == null ||
    currency !== SIMPAISA_CHARGE_CURRENCY ||
    !Number.isInteger(chargeAmountMinor) ||
    chargeAmountMinor <= 0
  ) {
    return null;
  }

  const eventId = `${transactionId}:${responseCode}`;
  if (eventId.length > 190) return null;

  const purpose = resolvePurpose(userKey);

  return {
    signatureVerified: input.signatureVerified,
    provider: "SIMPAISA",
    purpose,
    eventId,
    providerPaymentRef: transactionId,
    localTopupId: null,
    paymentAttemptId: userKey,
    purchaseId: null,
    paymentStatus,
    chargeCurrency: currency,
    chargeAmountMinor,
    confirmedAt: paymentStatus === "confirmed" ? new Date() : null,
    failureCategory:
      paymentStatus === "failed" || paymentStatus === "uncertain"
        ? simpaisaFailureCategoryForCode(responseCode) ??
          `simpaisa_${responseCode || SIMPAISA_RESPONSE.PENDING}`
        : null,
    walletOperatorId: operatorId,
  };
}

export function peekSimpaisaWebhookResponseCode(rawBody: string): string | null {
  const root = parseBody(rawBody);
  if (!root) return null;
  const data = asRecord(root.data) ?? root;
  return normalizeSimpaisaResponseCode(
    firstString(data, ["responseCode", "response_code", "status"]) ??
      firstString(root, ["responseCode", "response_code", "status"])
  );
}
