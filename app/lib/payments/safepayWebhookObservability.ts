/**
 * Structured Safepay webhook observability (pure — no I/O besides console).
 * Never logs or returns raw body, signatures, secrets, or card data.
 * Does not apply payment events.
 */

import { normalizeSafepayHeader } from "@/app/lib/payments/safepayWebhookCrypto";

export const SAFEPAY_WEBHOOK_LOG_PREFIX = "safepay_webhook";

export const SAFEPAY_WEBHOOK_LOG_CODES = [
  "CONFIG_MISSING",
  "BODY_REJECTED",
  "SIGNATURE_REJECTED",
  "PARSE_IGNORED",
  "APPLY_RESULT",
  "APPLY_FAILED",
] as const;

export type SafepayWebhookLogCode = (typeof SAFEPAY_WEBHOOK_LOG_CODES)[number];

export type SafepayWebhookHttpOutcome =
  | "rejected"
  | "ignored"
  | "applied"
  | "failed";

export type SafepayWebhookParseIgnoreCategory =
  | "MALFORMED_JSON"
  | "NOT_OBJECT"
  | "UNSUPPORTED_TYPE"
  | "MISSING_TRACKER"
  | "MISSING_AMOUNT"
  | "MISSING_EVENT_ID"
  | "SUCCESS_FLAG_FALSE"
  | "UNCLASSIFIED";

export type SafepayWebhookLogInput = {
  code: SafepayWebhookLogCode;
  httpStatus: number;
  httpOutcome: SafepayWebhookHttpOutcome;
  errorCategory?: string | null;
  eventId?: string | null;
  tracker?: string | null;
  eventType?: string | null;
  kind?: string | null;
  outcome?: string | null;
  duplicate?: boolean | null;
};

export type SafepayWebhookLogPayload = {
  httpStatus: number;
  httpOutcome: SafepayWebhookHttpOutcome;
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
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return normalizeSafepayHeader(value);
    }
  }
  return "";
}

export function clipWebhookToken(
  value: string | null | undefined,
  max = 64
): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (raw.length > 190) return "opaque";
  if (/[\s"'{}\\]/.test(raw)) return "opaque";
  return raw.slice(0, max);
}

/**
 * Mask a tracker / payment reference. Never returns the full value when
 * longer than 8 characters. Empty → null (omit from logs).
 */
export function maskWebhookReference(
  ref: string | null | undefined
): string | null {
  const raw = (ref ?? "").trim();
  if (!raw) return null;
  if (raw.length <= 8) return "••••";
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

function extractTracker(data: Record<string, unknown>): string | null {
  const direct = asString(data.tracker);
  if (direct) return direct;
  const nested = asRecord(data.tracker);
  return asString(nested?.token);
}

function extractAmountCurrency(data: Record<string, unknown>): {
  amount: number | null;
  currency: string | null;
} {
  const directAmount = asNumber(data.amount);
  const directCurrency = asString(data.currency)?.toUpperCase() ?? null;
  if (directAmount != null && directCurrency) {
    return { amount: directAmount, currency: directCurrency };
  }

  const amountObj = asRecord(data.amount);
  if (amountObj) {
    const nestedAmount = asNumber(amountObj.amount);
    const nestedCurrency = asString(amountObj.currency)?.toUpperCase() ?? null;
    if (nestedAmount != null && nestedCurrency) {
      return { amount: nestedAmount, currency: nestedCurrency };
    }
  }

  const totals = asRecord(data.purchase_totals);
  const quote = asRecord(totals?.quote_amount);
  if (quote) {
    const quoteAmount = asNumber(quote.amount);
    const quoteCurrency = asString(quote.currency)?.toUpperCase() ?? null;
    if (quoteAmount != null && quoteCurrency) {
      return { amount: quoteAmount, currency: quoteCurrency };
    }
  }

  const charge = asRecord(data.charge);
  const chargeAmount = asRecord(charge?.amount);
  if (chargeAmount) {
    const amt = asNumber(chargeAmount.amount);
    const cur = asString(chargeAmount.currency)?.toUpperCase() ?? null;
    if (amt != null && cur) return { amount: amt, currency: cur };
  }

  return { amount: null, currency: null };
}

function isSupportedPaymentType(type: string): boolean {
  const t = type.trim().toLowerCase();
  return (
    t === "payment.succeeded" ||
    t === "payment.failed" ||
    t === "payment.cancelled" ||
    t === "payment.canceled" ||
    t === "payment.voided" ||
    t === "payment.rejected"
  );
}

function extractEventId(
  root: Record<string, unknown>,
  headers: Record<string, string | string[] | undefined>
): string | null {
  return (
    asString(root.token) ||
    asString(root.id) ||
    asString(root.event_id) ||
    headerValue(headers, "x-sfpy-event-id") ||
    null
  );
}

export type SafepayWebhookPeek = {
  eventId: string | null;
  eventType: string | null;
  tracker: string | null;
};

/**
 * Best-effort identifiers for logs. Never throws. Never returns raw body.
 */
export function peekSafepayWebhookLogFields(
  rawBody: string,
  headers: Record<string, string | string[] | undefined> = {}
): SafepayWebhookPeek {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { eventId: null, eventType: null, tracker: null };
  }
  const root = asRecord(json);
  if (!root) return { eventId: null, eventType: null, tracker: null };

  const eventType =
    asString(root.type) || headerValue(headers, "x-sfpy-event-type") || null;
  const data = asRecord(root.data) ?? root;
  return {
    eventId: extractEventId(root, headers),
    eventType,
    tracker: extractTracker(data),
  };
}

/**
 * Why parseSafepayCardWebhookEvent returned null. Mirrors parse order.
 * Logging only — does not change apply.
 */
export function classifySafepayWebhookParseIgnore(
  rawBody: string,
  headers: Record<string, string | string[] | undefined> = {}
): SafepayWebhookParseIgnoreCategory {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return "MALFORMED_JSON";
  }
  const root = asRecord(json);
  if (!root) return "NOT_OBJECT";

  const type =
    asString(root.type) || headerValue(headers, "x-sfpy-event-type") || "";
  if (!isSupportedPaymentType(type)) return "UNSUPPORTED_TYPE";

  const data = asRecord(root.data) ?? root;
  const tracker = extractTracker(data);
  if (!tracker || tracker.length > 190) return "MISSING_TRACKER";

  const { amount, currency } = extractAmountCurrency(data);
  if (amount == null || !currency || !Number.isInteger(amount) || amount <= 0) {
    return "MISSING_AMOUNT";
  }

  const eventId = extractEventId(root, headers);
  if (!eventId || eventId.length > 190) return "MISSING_EVENT_ID";

  const t = type.trim().toLowerCase();
  if (t === "payment.succeeded" && data.success === false) {
    return "SUCCESS_FLAG_FALSE";
  }

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

/**
 * Map apply exceptions to an opaque category. Never returns error.message
 * unless it is already an allowlisted uppercase code.
 */
export function classifySafepayWebhookApplyFailure(error: unknown): string {
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

export function webhookReceiptVerifyFlags(code: SafepayWebhookLogCode): {
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

export function formatSafepayWebhookLog(
  input: SafepayWebhookLogInput
): {
  prefix: typeof SAFEPAY_WEBHOOK_LOG_PREFIX;
  code: SafepayWebhookLogCode;
  payload: SafepayWebhookLogPayload;
} {
  const payload: SafepayWebhookLogPayload = {
    httpStatus: Number.isInteger(input.httpStatus) ? input.httpStatus : 0,
    httpOutcome: input.httpOutcome,
    errorCategory: clipWebhookToken(input.errorCategory, 64),
    eventId: clipWebhookToken(input.eventId, 64),
    trackerMasked: maskWebhookReference(input.tracker),
    eventType: clipWebhookToken(input.eventType, 64),
    kind: clipWebhookToken(input.kind, 32),
    outcome: clipWebhookToken(input.outcome, 64),
    duplicate:
      typeof input.duplicate === "boolean" ? input.duplicate : null,
  };

  for (const key of FORBIDDEN_LOG_KEYS) {
    if (key in payload) {
      throw new Error("WEBHOOK_LOG_FORBIDDEN_KEY");
    }
  }

  return {
    prefix: SAFEPAY_WEBHOOK_LOG_PREFIX,
    code: input.code,
    payload,
  };
}

export function logSafepayWebhook(input: SafepayWebhookLogInput): void {
  const formatted = formatSafepayWebhookLog(input);
  console.error(formatted.prefix, formatted.code, formatted.payload);
}
