/**
 * Pure validation helpers for ADMIN package assignment (no DB I/O).
 */

export const ASSIGNMENT_REASON_MIN = 5;
export const ASSIGNMENT_REASON_MAX = 200;
export const ASSIGNMENT_REFERENCE_MAX = 100;
export const ASSIGNMENT_CONFIRM_PHRASE = "ASSIGN";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parseAssignmentReason(raw: unknown): ParseResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "A reason is required." };
  }
  const reason = raw.trim();
  if (reason.length < ASSIGNMENT_REASON_MIN) {
    return {
      ok: false,
      error: `Enter a reason of at least ${ASSIGNMENT_REASON_MIN} characters.`,
    };
  }
  if (reason.length > ASSIGNMENT_REASON_MAX) {
    return {
      ok: false,
      error: `Reason must be at most ${ASSIGNMENT_REASON_MAX} characters.`,
    };
  }
  return { ok: true, value: reason };
}

export function parseAssignmentInternalReference(
  raw: unknown
): ParseResult<string | null> {
  if (raw == null || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Internal reference is invalid." };
  }
  const reference = raw.trim();
  if (!reference) {
    return { ok: true, value: null };
  }
  if (reference.length > ASSIGNMENT_REFERENCE_MAX) {
    return {
      ok: false,
      error: `Internal reference must be at most ${ASSIGNMENT_REFERENCE_MAX} characters.`,
    };
  }
  return { ok: true, value: reference };
}

export function parseAssignmentConfirmPhrase(raw: unknown): ParseResult<true> {
  if (typeof raw !== "string" || raw.trim() !== ASSIGNMENT_CONFIRM_PHRASE) {
    return {
      ok: false,
      error: `Type ${ASSIGNMENT_CONFIRM_PHRASE} to confirm this assignment.`,
    };
  }
  return { ok: true, value: true };
}

export function parseAssignmentIdempotencyKey(raw: unknown): ParseResult<string> {
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: "This assignment request could not be processed. Please reload and try again.",
    };
  }
  const key = raw.trim();
  if (
    !key ||
    key.length < 8 ||
    key.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(key)
  ) {
    return {
      ok: false,
      error: "This assignment request could not be processed. Please reload and try again.",
    };
  }
  return { ok: true, value: key };
}

/** Convert verified USD price to integer cents; null when unreliable. */
export function usdPriceToCents(priceUSD: number): number | null {
  if (!Number.isFinite(priceUSD) || priceUSD < 0) return null;
  const cents = Math.round(priceUSD * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  return cents;
}
