/**
 * Structured Simpaisa webhook observability (pure — no I/O besides console).
 * Never logs or returns raw body, signatures, secrets, MSISDN, or card data.
 * Does not apply payment events.
 */

import { normalizeSimpaisaHeader } from "@/app/lib/payments/simpaisaWebhookCrypto";
import { normalizeSimpaisaResponseCode } from "@/app/lib/payments/simpaisaPolicy";

export const SIMPAISA_WEBHOOK_LOG_PREFIX = "simpaisa_webhook";

export const SIMPAISA_WEBHOOK_LOG_CODES = [
  "CONFIG_MISSING",
  "BODY_REJECTED",
  "SIGNATURE_REJECTED",
  "PARSE_IGNORED",
  "APPLY_RESULT",
  "APPLY_FAILED",
] as const;

export type SimpaisaWebhookLogCode = (typeof SIMPAISA_WEBHOOK_LOG_CODES)[number];

export type SimpaisaWebhookHttpOutcome =
  | "rejected"
  | "ignored"
  | "applied"
  | "failed";

export type SimpaisaWebhookParseIgnoreCategory =
  | "MALFORMED_BODY"
  | "NOT_OBJECT"
  | "MISSING_RESPONSE_CODE"
  | "MISSING_TRANSACTION_ID"
  | "MISSING_AMOUNT"
  | "UNCLASSIFIED";

export type SimpaisaWebhookLogInput = {
  code: SimpaisaWebhookLogCode;
  httpStatus: number;
  httpOutcome: SimpaisaWebhookHttpOutcome;
  errorCategory?: string | null;
  eventId?: string | null;
  tracker?: string | null;
  eventType?: string | null;
  kind?: string | null;
  outcome?: string | null;
  duplicate?: boolean | null;
};

export type SimpaisaWebhookLogPayload = {
  httpStatus: number;
  httpOutcome: SimpaisaWebhookHttpOutcome;
  errorCategory: string | null;
  eventId: string | null;
  trackerMasked: string | null;
  eventType: string | null;
  kind: string | null;
  outcome: string | null;
  duplicate: boolean | null;
};

const FORBIDDEN_LOG_KEYS = [
  "rawBody",
  "body",
  "signature",
  "signatureHeader",
  "webhookSecret",
  "secret",
  "headers",
  "msisdn",
  "userKey",
] as const;

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
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      return asRecord(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  try {
    const params = new URLSearchParams(rawBody);
    const record: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) {
      if (key) record[key] = value;
    }
    return Object.keys(record).length > 0 ? record : null;
  } catch {
    return null;
  }
}

export function clipSimpaisaWebhookToken(
  value: string | null | undefined,
  max = 64
): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (raw.length > 190) return "opaque";
  if (/[\s"'{}\\]/.test(raw)) return "opaque";
  return raw.slice(0, max);
}

export function maskSimpaisaWebhookReference(
  ref: string | null | undefined
): string | null {
  const raw = (ref ?? "").trim();
  if (!raw) return null;
  if (raw.length <= 8) return "••••";
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

export type SimpaisaWebhookPeek = {
  eventId: string | null;
  eventType: string | null;
  tracker: string | null;
};

/**
 * Best-effort identifiers for logs. Never throws. Never returns raw body or MSISDN.
 */
export function peekSimpaisaWebhookLogFields(
  rawBody: string,
  headers: Record<string, string | string[] | undefined> = {}
): SimpaisaWebhookPeek {
  void headers;
  const root = parseBody(rawBody);
  if (!root) return { eventId: null, eventType: null, tracker: null };
  const data = asRecord(root.data) ?? root;
  const transactionId =
    firstString(data, ["transactionId", "transaction_id"]) ??
    firstString(root, ["transactionId", "transaction_id"]);
  const responseCode = normalizeSimpaisaResponseCode(
    firstString(data, ["responseCode", "response_code"]) ??
      firstString(root, ["responseCode", "response_code"])
  );
  return {
    eventId:
      transactionId && responseCode
        ? `${transactionId}:${responseCode}`
        : transactionId,
    eventType: responseCode || null,
    tracker: transactionId,
  };
}

export function classifySimpaisaWebhookParseIgnore(
  rawBody: string,
  headers: Record<string, string | string[] | undefined> = {}
): SimpaisaWebhookParseIgnoreCategory {
  void headers;
  const trimmed = rawBody.trim();
  if (!trimmed) return "MALFORMED_BODY";
  const root = parseBody(rawBody);
  if (!root) return "MALFORMED_BODY";
  const data = asRecord(root.data) ?? root;
  const responseCode = normalizeSimpaisaResponseCode(
    firstString(data, ["responseCode", "response_code", "status"]) ??
      firstString(root, ["responseCode", "response_code", "status"])
  );
  if (!responseCode) return "MISSING_RESPONSE_CODE";
  const transactionId =
    firstString(data, [
      "transactionId",
      "transaction_id",
      "merchantTransactionId",
      "merchant_transaction_id",
    ]) ??
    firstString(root, [
      "transactionId",
      "transaction_id",
      "merchantTransactionId",
      "merchant_transaction_id",
    ]);
  if (!transactionId || transactionId.length > 190) {
    return "MISSING_TRANSACTION_ID";
  }
  const userKey =
    firstString(data, ["userKey", "user_key"]) ??
    firstString(root, ["userKey", "user_key"]);
  if (!userKey || userKey.length > 64) {
    return "MISSING_TRANSACTION_ID";
  }
  const merchantId =
    firstString(data, ["merchantId", "merchant_id"]) ??
    firstString(root, ["merchantId", "merchant_id"]);
  if (!merchantId) return "MISSING_AMOUNT";
  const operatorId =
    firstString(data, ["operatorId", "operator_id", "operatorID"]) ??
    firstString(root, ["operatorId", "operator_id", "operatorID"]);
  if (!operatorId) return "MISSING_AMOUNT";
  const amountRaw =
    data.amount ??
    data.transactionAmount ??
    root.amount ??
    root.transactionAmount;
  if (amountRaw == null || amountRaw === "") return "MISSING_AMOUNT";
  return "UNCLASSIFIED";
}

const KNOWN_APPLY_CODES = new Set([
  "UNSIGNED_PAYMENT_EVENT",
  "ATTEMPT_CLAIM_FAILED",
  "PURCHASE_FUND_CLAIM_FAILED",
  "INVALID_FINALIZE_STATE",
  "INVALID_WALLET_AMOUNT",
  "PURCHASE_UNAVAILABLE",
  "INVALID_PURCHASE_STATE",
  "RESERVE_CLAIM_FAILED",
  "CUSTOMER_UNAVAILABLE",
  "WALLET_UNAVAILABLE",
  "INVALID_AMOUNT",
  "INVALID_IDEMPOTENCY",
  "GATEWAY_UNAVAILABLE",
  "TOPUP_UNAVAILABLE",
  "UNAVAILABLE",
  "UNIQUE_CONSTRAINT",
]);

export function classifySimpaisaWebhookApplyFailure(error: unknown): string {
  if (error && typeof error === "object") {
    const code = "code" in error ? error.code : undefined;
    if (code === "P2002") return "UNIQUE_CONSTRAINT";
    if (typeof code === "string" && KNOWN_APPLY_CODES.has(code)) return code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)) {
      return code;
    }
  }
  if (error instanceof Error) {
    const msg = error.message.trim();
    if (KNOWN_APPLY_CODES.has(msg)) return msg;
    if (/^[A-Z][A-Z0-9_]{1,63}$/.test(msg)) return msg;
  }
  return "APPLY_EXCEPTION";
}

export function simpaisaWebhookReceiptVerifyFlags(
  code: SimpaisaWebhookLogCode
): {
  signatureOk: boolean;
  parseOk: boolean;
} {
  if (code === "APPLY_RESULT" || code === "APPLY_FAILED") {
    return { signatureOk: true, parseOk: true };
  }
  if (code === "PARSE_IGNORED") {
    return { signatureOk: true, parseOk: false };
  }
  return { signatureOk: false, parseOk: false };
}

export function formatSimpaisaWebhookLog(input: SimpaisaWebhookLogInput): {
  prefix: typeof SIMPAISA_WEBHOOK_LOG_PREFIX;
  code: SimpaisaWebhookLogCode;
  payload: SimpaisaWebhookLogPayload;
} {
  const payload: SimpaisaWebhookLogPayload = {
    httpStatus: Number.isInteger(input.httpStatus) ? input.httpStatus : 0,
    httpOutcome: input.httpOutcome,
    errorCategory: clipSimpaisaWebhookToken(input.errorCategory, 64),
    eventId: clipSimpaisaWebhookToken(input.eventId, 64),
    trackerMasked: maskSimpaisaWebhookReference(input.tracker),
    eventType: clipSimpaisaWebhookToken(input.eventType, 64),
    kind: clipSimpaisaWebhookToken(input.kind, 32),
    outcome: clipSimpaisaWebhookToken(input.outcome, 64),
    duplicate: typeof input.duplicate === "boolean" ? input.duplicate : null,
  };

  for (const key of FORBIDDEN_LOG_KEYS) {
    if (key in payload) {
      throw new Error("WEBHOOK_LOG_FORBIDDEN_KEY");
    }
  }

  return {
    prefix: SIMPAISA_WEBHOOK_LOG_PREFIX,
    code: input.code,
    payload,
  };
}

export function logSimpaisaWebhook(input: SimpaisaWebhookLogInput): void {
  const formatted = formatSimpaisaWebhookLog(input);
  console.error(formatted.prefix, formatted.code, formatted.payload);
}

export function simpaisaSignatureHeader(
  headers: Record<string, string | string[] | undefined>
): string {
  const lower = "x-simpaisa-signature";
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return normalizeSimpaisaHeader(value);
    }
  }
  return "";
}
