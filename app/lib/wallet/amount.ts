/**
 * Pure USD amount parsing for admin wallet credit (no DB I/O).
 * Converts decimal USD strings to integer cents — never floating-point storage math.
 */

export const ADMIN_CREDIT_MIN_CENTS = 10; // $0.10
export const ADMIN_CREDIT_MAX_CENTS = 50_000; // $500.00
export const ADMIN_CREDIT_REASON_MIN = 5;
export const ADMIN_CREDIT_REASON_MAX = 200;
export const ADMIN_CREDIT_REFERENCE_MAX = 100;

export type ParseUsdCentsResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

/**
 * Parse a USD decimal amount into positive integer cents.
 * Accepts: "0.10", "0.11", "1", "1.00", "10.50", "500.00"
 * Rejects: empty, negative, below $0.10, NaN, exponents, >2 decimals, non-numeric.
 */
export function parseUsdAmountToCents(raw: unknown): ParseUsdCentsResult {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { ok: false, error: "Enter a valid USD amount." };
  }

  const s = String(raw).trim();
  if (!s) {
    return { ok: false, error: "Enter a valid USD amount." };
  }

  // Reject scientific notation, signs, commas, spaces mid-string, etc.
  if (/[eE+]/.test(s) || s.includes("-") || s.includes(",")) {
    return { ok: false, error: "Enter a valid USD amount." };
  }

  // Digits with optional 1–2 decimal places only.
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(s)) {
    return { ok: false, error: "Use up to two decimal places (for example 10.00)." };
  }

  const [dollarsPart, fractionPart = ""] = s.split(".");
  const dollars = Number.parseInt(dollarsPart, 10);
  if (!Number.isSafeInteger(dollars) || dollars < 0) {
    return { ok: false, error: "Enter a valid USD amount." };
  }

  const frac = fractionPart.padEnd(2, "0");
  const fracCents = Number.parseInt(frac, 10);
  if (!Number.isInteger(fracCents) || fracCents < 0 || fracCents > 99) {
    return { ok: false, error: "Enter a valid USD amount." };
  }

  const cents = dollars * 100 + fracCents;
  if (!Number.isSafeInteger(cents) || cents < 0) {
    return { ok: false, error: "Enter a valid USD amount." };
  }

  if (cents < ADMIN_CREDIT_MIN_CENTS) {
    return { ok: false, error: "Minimum manual credit is $0.10." };
  }
  if (cents > ADMIN_CREDIT_MAX_CENTS) {
    return { ok: false, error: "Maximum manual credit is $500.00." };
  }

  return { ok: true, cents };
}

export function parseAdminCreditReason(
  raw: unknown
): { ok: true; reason: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "Enter a reason for this credit." };
  }
  const reason = raw.trim();
  if (reason.length < ADMIN_CREDIT_REASON_MIN) {
    return {
      ok: false,
      error: `Reason must be at least ${ADMIN_CREDIT_REASON_MIN} characters.`,
    };
  }
  if (reason.length > ADMIN_CREDIT_REASON_MAX) {
    return {
      ok: false,
      error: `Reason must be at most ${ADMIN_CREDIT_REASON_MAX} characters.`,
    };
  }
  return { ok: true, reason };
}

export function parseAdminCreditInternalReference(
  raw: unknown
): { ok: true; reference: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, reference: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Internal reference is invalid." };
  }
  const reference = raw.trim();
  if (!reference) {
    return { ok: true, reference: null };
  }
  if (reference.length > ADMIN_CREDIT_REFERENCE_MAX) {
    return {
      ok: false,
      error: `Internal reference must be at most ${ADMIN_CREDIT_REFERENCE_MAX} characters.`,
    };
  }
  return { ok: true, reference };
}
