/**
 * Partner admin wallet credit/debit amount limits ($50,000 max).
 */

import {
  ADMIN_CREDIT_REASON_MAX,
  ADMIN_CREDIT_REASON_MIN,
  ADMIN_CREDIT_REFERENCE_MAX,
} from "@/app/lib/wallet/amount";

export const PARTNER_ADMIN_CREDIT_MIN_CENTS = 10; // $0.10
export const PARTNER_ADMIN_CREDIT_MAX_CENTS = 5_000_000; // $50,000.00
export const PARTNER_ADMIN_DEBIT_MIN_CENTS = 10; // $0.10
export const PARTNER_ADMIN_DEBIT_MAX_CENTS = 5_000_000; // $50,000.00

export {
  ADMIN_CREDIT_REASON_MIN as PARTNER_ADMIN_REASON_MIN,
  ADMIN_CREDIT_REASON_MAX as PARTNER_ADMIN_REASON_MAX,
  ADMIN_CREDIT_REFERENCE_MAX as PARTNER_ADMIN_REFERENCE_MAX,
};

export type ParseUsdCentsResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

function parsePositiveUsdCentsRaw(raw: unknown): ParseUsdCentsResult {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { ok: false, error: "Enter a valid USD amount." };
  }

  const s = String(raw).trim();
  if (!s) {
    return { ok: false, error: "Enter a valid USD amount." };
  }

  if (/[eE+]/.test(s) || s.includes("-") || s.includes(",")) {
    return { ok: false, error: "Enter a valid USD amount." };
  }

  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(s)) {
    return {
      ok: false,
      error: "Use up to two decimal places (for example 10.00).",
    };
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

  return { ok: true, cents };
}

export function parsePartnerAdminCreditAmountToCents(
  raw: unknown
): ParseUsdCentsResult {
  const parsed = parsePositiveUsdCentsRaw(raw);
  if (!parsed.ok) return parsed;

  if (parsed.cents < PARTNER_ADMIN_CREDIT_MIN_CENTS) {
    return { ok: false, error: "Minimum manual credit is $0.10." };
  }
  if (parsed.cents > PARTNER_ADMIN_CREDIT_MAX_CENTS) {
    return { ok: false, error: "Maximum manual credit is $50,000.00." };
  }

  return parsed;
}

export function parsePartnerAdminDebitAmountToCents(
  raw: unknown,
  availableBalanceCents?: number
): ParseUsdCentsResult {
  const parsed = parsePositiveUsdCentsRaw(raw);
  if (!parsed.ok) return parsed;

  if (parsed.cents < PARTNER_ADMIN_DEBIT_MIN_CENTS) {
    return { ok: false, error: "Minimum manual debit is $0.10." };
  }
  if (parsed.cents > PARTNER_ADMIN_DEBIT_MAX_CENTS) {
    return { ok: false, error: "Maximum manual debit is $50,000.00." };
  }

  if (
    typeof availableBalanceCents === "number" &&
    Number.isInteger(availableBalanceCents) &&
    availableBalanceCents >= 0 &&
    parsed.cents > availableBalanceCents
  ) {
    return {
      ok: false,
      error: "Debit amount cannot exceed the available wallet balance.",
    };
  }

  return parsed;
}
