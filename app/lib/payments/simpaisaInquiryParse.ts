/**
 * Pure Simpaisa Inquire response parsing (no I/O).
 * Official sandbox shape nests authoritative fields under `transaction`:
 *   { merchantId, transactionId, userKey, transaction: { status, amount, ... } }
 * Do not invent funding authority here — callers still validate fail-closed.
 */

import {
  classifySimpaisaWalletResponseCode,
  mapSimpaisaClassificationToPaymentStatus,
  normalizeSimpaisaResponseCode,
  SIMPAISA_CHARGE_CURRENCY,
  simpaisaMinorAmountFromMajor,
} from "@/app/lib/payments/simpaisaPolicy";

export type SimpaisaInquiryParseResult = {
  responseCode: string;
  status: "confirmed" | "pending" | "failed" | "uncertain";
  providerTransactionId: string | null;
  chargeAmountMinor: number | null;
  chargeCurrency: string | null;
  merchantId: string | null;
  operatorId: string | null;
  userKey: string | null;
  transactionType: string | null;
  responseMessage: string | null;
  /** Diagnostics only — never log raw bodies. */
  amountSource: string | null;
  currencySource: "response" | "default_pkr" | "missing";
  usedNestedTransaction: boolean;
};

type SimpaisaJson = Record<string, unknown>;

const RESPONSE_CODE_KEYS = ["responseCode", "response_code", "status"];
const AMOUNT_KEYS = [
  "amount",
  "transactionAmount",
  "transAmount",
  "txnAmount",
  "transaction_amount",
  "paidAmount",
  "requestedAmount",
];
const CURRENCY_KEYS = ["currency", "currencyCode", "currency_code", "curr"];
const NEST_KEYS = ["transaction", "data", "result", "payload"] as const;

function asRecord(value: unknown): SimpaisaJson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SimpaisaJson;
}

function asString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).trim() || null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function recordKeyMap(record: SimpaisaJson): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    const lower = key.toLowerCase();
    if (!map.has(lower)) map.set(lower, value);
  }
  return map;
}

function pickUnknown(record: SimpaisaJson, keys: string[]): unknown {
  const map = recordKeyMap(record);
  for (const key of keys) {
    if (!map.has(key.toLowerCase())) continue;
    const value = map.get(key.toLowerCase());
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function pickStringCI(record: SimpaisaJson, keys: string[]): string | null {
  return asString(pickUnknown(record, keys) ?? null);
}

function firstRecord(value: unknown): SimpaisaJson | null {
  const record = asRecord(value);
  if (record) return record;
  if (Array.isArray(value) && value.length > 0) return asRecord(value[0]);
  return null;
}

/** Prefer nested `transaction` (official Inquire) over root. */
export function inquiryFieldRecords(json: SimpaisaJson): SimpaisaJson[] {
  const records: SimpaisaJson[] = [];
  const nested = firstRecord(pickUnknown(json, [...NEST_KEYS]));
  if (nested) {
    records.push(nested);
    const deeper = firstRecord(pickUnknown(nested, [...NEST_KEYS]));
    if (deeper && deeper !== nested) records.push(deeper);
  }
  records.push(json);
  return records;
}

export function nestedInquiryData(json: SimpaisaJson): SimpaisaJson {
  return firstRecord(pickUnknown(json, [...NEST_KEYS])) ?? json;
}

function pickStringFromRecords(
  records: SimpaisaJson[],
  keys: string[]
): string | null {
  for (const record of records) {
    const value = pickStringCI(record, keys);
    if (value) return value;
  }
  return null;
}

function coerceAmountRaw(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const inner = pickUnknown(record, [
    "amount",
    "value",
    "transactionAmount",
    "major",
  ]);
  if (typeof inner === "number" && Number.isFinite(inner)) return inner;
  if (typeof inner === "string") {
    const trimmed = inner.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

export function pickAmountRawFromRecords(
  records: SimpaisaJson[]
): { value: string | number | null; source: string | null; valueType: string } {
  for (const record of records) {
    for (const key of AMOUNT_KEYS) {
      const raw = pickUnknown(record, [key]);
      if (raw === undefined) continue;
      const coerced = coerceAmountRaw(raw);
      const valueType =
        raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw;
      if (coerced != null) {
        return { value: coerced, source: key, valueType };
      }
    }
  }
  return { value: null, source: null, valueType: "missing" };
}

/**
 * Parse an Inquire JSON body into normalized fields.
 * Returns null when responseCode/status cannot be read (caller treats as unavailable).
 */
export function parseSimpaisaInquiryResponse(
  json: unknown,
  fallback?: { userKey?: string | null; transactionId?: string | null }
): SimpaisaInquiryParseResult | null {
  const root = asRecord(json);
  if (!root) return null;

  const records = inquiryFieldRecords(root);
  const usedNestedTransaction = Boolean(asRecord(root.transaction));

  const responseCode = normalizeSimpaisaResponseCode(
    pickStringFromRecords(records, RESPONSE_CODE_KEYS)
  );
  if (!responseCode) return null;

  const classification = classifySimpaisaWalletResponseCode(responseCode);
  const status: SimpaisaInquiryParseResult["status"] = classification
    ? mapSimpaisaClassificationToPaymentStatus(classification)
    : "uncertain";

  const amountPick = pickAmountRawFromRecords(records);
  const currencyRaw = pickStringFromRecords(records, CURRENCY_KEYS);
  const currencySource: SimpaisaInquiryParseResult["currencySource"] = currencyRaw
    ? "response"
    : "default_pkr";

  const fallbackUserKey = (fallback?.userKey ?? "").trim() || null;
  const fallbackTxn = (fallback?.transactionId ?? "").trim() || null;

  return {
    responseCode,
    status,
    providerTransactionId:
      pickStringFromRecords(records, ["transactionId", "transaction_id"]) ??
      fallbackTxn,
    chargeAmountMinor: simpaisaMinorAmountFromMajor(amountPick.value),
    // Documented PK wallet Inquire may omit currency — default PKR for validation.
    chargeCurrency: currencyRaw
      ? currencyRaw.toUpperCase()
      : SIMPAISA_CHARGE_CURRENCY,
    merchantId: pickStringFromRecords(records, ["merchantId", "merchant_id"]),
    operatorId: pickStringFromRecords(records, [
      "operatorId",
      "operator_id",
      "operatorID",
    ]),
    userKey:
      pickStringFromRecords(records, ["userKey", "user_key"]) ?? fallbackUserKey,
    transactionType: pickStringFromRecords(records, [
      "transactionType",
      "transaction_type",
    ]),
    responseMessage: pickStringFromRecords(records, [
      "responseMessage",
      "response_message",
      "message",
      "msg",
    ]),
    amountSource: amountPick.source,
    currencySource,
    usedNestedTransaction,
  };
}

export const SIMPAISA_INQUIRY_PARSE_AMOUNT_KEYS = AMOUNT_KEYS;
export const SIMPAISA_INQUIRY_PARSE_CURRENCY_KEYS = CURRENCY_KEYS;
export const SIMPAISA_INQUIRY_PARSE_RESPONSE_CODE_KEYS = RESPONSE_CODE_KEYS;
