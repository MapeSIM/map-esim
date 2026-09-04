/**
 * Safe structured logging for Partner purchase pre-claim failures.
 * Never throws. Never logs secrets, credentials, ICCID/QR, tokens, or raw bodies.
 * Pure helpers are safe for offline QA (no Prisma / no env reads).
 */

export const PARTNER_PROVIDER_PRECLAIM_ERROR_EVENT =
  "partner_provider_preclaim_error" as const;

export type PartnerProviderPreclaimStage =
  | "pre_provider_gate"
  | "before_claim"
  | "claim"
  | "after_claim";

export type PartnerProviderPreclaimLogPayload = {
  event: typeof PARTNER_PROVIDER_PRECLAIM_ERROR_EVENT;
  purchaseId: string;
  stage: PartnerProviderPreclaimStage;
  executionClaimed: boolean;
  errorName: string;
  errorCode: string | null;
  errorClassification: string;
};

const SAFE_CODE_MAX = 80;
const SAFE_CLASS_MAX = 160;
const SAFE_NAME_MAX = 80;
const PURCHASE_ID_MAX = 64;

/** Allowlist-ish safe code extraction — never dumps arbitrary objects. */
export function safeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  if (!("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") {
    const trimmed = code.trim();
    if (!trimmed || trimmed.length > SAFE_CODE_MAX) return null;
    // Codes only — reject URLs / DSNs / whitespace blobs.
    if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) return null;
    return trimmed;
  }
  if (typeof code === "number" && Number.isFinite(code)) {
    return String(code).slice(0, SAFE_CODE_MAX);
  }
  return null;
}

export function safeErrorName(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name.trim().slice(0, SAFE_NAME_MAX) || "Error";
  }
  if (error === null) return "null";
  if (error === undefined) return "undefined";
  return typeof error;
}

/**
 * Short classification from public/safe message text only.
 * Strips emails, URLs, and long opaque strings.
 */
export function safeErrorClassification(error: unknown): string {
  let raw = "";
  if (error instanceof Error) {
    raw = error.message || error.name || "error";
  } else if (typeof error === "string") {
    raw = error;
  } else {
    raw = safeErrorName(error);
  }
  const cleaned = raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted_email]")
    .replace(/https?:\/\/\S+/gi, "[redacted_url]")
    .replace(/postgres(ql)?:\/\/\S+/gi, "[redacted_dsn]")
    .replace(/\b(iccid|lpa|qr|password|token|secret|authorization)\b[:\s=]*\S+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "unknown_error";
  return cleaned.slice(0, SAFE_CLASS_MAX);
}

export function buildPartnerProviderPreclaimLogPayload(options: {
  purchaseId: string;
  stage: PartnerProviderPreclaimStage;
  executionClaimed: boolean;
  error: unknown;
}): PartnerProviderPreclaimLogPayload {
  const purchaseId = (options.purchaseId ?? "").trim().slice(0, PURCHASE_ID_MAX);
  return {
    event: PARTNER_PROVIDER_PRECLAIM_ERROR_EVENT,
    purchaseId: purchaseId || "unknown",
    stage: options.stage,
    executionClaimed: Boolean(options.executionClaimed),
    errorName: safeErrorName(options.error),
    errorCode: safeErrorCode(options.error),
    errorClassification: safeErrorClassification(options.error),
  };
}

/**
 * Emit one structured console.error line. Never throws; never mutates control flow.
 */
export function logPartnerProviderPreclaimError(options: {
  purchaseId: string;
  stage: PartnerProviderPreclaimStage;
  executionClaimed: boolean;
  error: unknown;
}): PartnerProviderPreclaimLogPayload {
  const payload = buildPartnerProviderPreclaimLogPayload(options);
  try {
    console.error(PARTNER_PROVIDER_PRECLAIM_ERROR_EVENT, payload);
  } catch {
    // Logging must never affect purchase control flow.
  }
  return payload;
}
