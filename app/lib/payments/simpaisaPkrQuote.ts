/**
 * Simpaisa PKR charge quote from authoritative USD cents.
 * Uses the existing MAP PKR conversion (convertFromUsd + FALLBACK_USD_RATES.PKR).
 * Whole-rupee rounding matches PKR display (0 fraction digits).
 * Never invents a second FX rate. Safe for client + server.
 */

import { FALLBACK_USD_RATES } from "@/app/lib/currency/currencies";
import { convertFromUsd } from "@/app/lib/currency/format";
import {
  isSimpaisaWalletOperatorId,
  normalizeSimpaisaMsisdn,
  SIMPAISA_CHARGE_CURRENCY,
  SIMPAISA_WALLET_OPERATORS,
} from "@/app/lib/payments/simpaisaPolicy";

export const SIMPAISA_PKR_USD_RATE = FALLBACK_USD_RATES.PKR;

export type SimpaisaPkrChargeQuote = {
  chargeCurrency: typeof SIMPAISA_CHARGE_CURRENCY;
  chargeAmountMinor: number;
  pkrRupees: number;
  usdCents: number;
  fxRateSnapshot: string;
};

export function quoteSimpaisaPkrChargeFromUsdCents(
  usdCents: number
): SimpaisaPkrChargeQuote | null {
  if (!Number.isInteger(usdCents) || usdCents <= 0) return null;
  const usdMajor = usdCents / 100;
  const pkrMajor = convertFromUsd(usdMajor, "PKR");
  if (!Number.isFinite(pkrMajor) || pkrMajor <= 0) return null;
  const pkrRupees = Math.round(pkrMajor);
  if (!Number.isInteger(pkrRupees) || pkrRupees <= 0) return null;
  return {
    chargeCurrency: SIMPAISA_CHARGE_CURRENCY,
    chargeAmountMinor: pkrRupees * 100,
    pkrRupees,
    usdCents,
    fxRateSnapshot: `USD:PKR:${SIMPAISA_PKR_USD_RATE}`,
  };
}

export function simpaisaChargeMatchesQuote(input: {
  usdCents: number;
  chargeCurrency: string;
  chargeAmountMinor: number;
}): boolean {
  const quote = quoteSimpaisaPkrChargeFromUsdCents(input.usdCents);
  if (!quote) return false;
  return (
    input.chargeCurrency.trim().toUpperCase() === quote.chargeCurrency &&
    input.chargeAmountMinor === quote.chargeAmountMinor
  );
}

export function formatSimpaisaPkrChargeLabel(pkrRupees: number): string {
  if (!Number.isInteger(pkrRupees) || pkrRupees <= 0) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: SIMPAISA_CHARGE_CURRENCY,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pkrRupees);
}

export const SIMPAISA_WALLET_OPERATOR_OPTIONS = [
  { id: SIMPAISA_WALLET_OPERATORS.EASYPAISA, label: "Easypaisa" },
  { id: SIMPAISA_WALLET_OPERATORS.JAZZCASH, label: "JazzCash" },
] as const;

export function parseSimpaisaWalletCheckoutFields(input: {
  walletOperatorId: unknown;
  customerMsisdn: unknown;
}):
  | {
      ok: true;
      walletOperatorId: string;
      customerMsisdn: string;
    }
  | {
      ok: false;
      fieldErrors: {
        walletOperatorId?: string;
        customerMsisdn?: string;
      };
      error: string;
    } {
  const operator = String(input.walletOperatorId ?? "").trim();
  const msisdn = normalizeSimpaisaMsisdn(String(input.customerMsisdn ?? ""));
  const fieldErrors: {
    walletOperatorId?: string;
    customerMsisdn?: string;
  } = {};
  if (!isSimpaisaWalletOperatorId(operator)) {
    fieldErrors.walletOperatorId = "Select Easypaisa or JazzCash.";
  }
  if (!msisdn) {
    fieldErrors.customerMsisdn = "Enter a valid Pakistani mobile number.";
  }
  if (fieldErrors.walletOperatorId || fieldErrors.customerMsisdn) {
    return {
      ok: false,
      fieldErrors,
      error: fieldErrors.walletOperatorId || fieldErrors.customerMsisdn || "Invalid wallet details.",
    };
  }
  return {
    ok: true,
    walletOperatorId: operator,
    customerMsisdn: msisdn!,
  };
}
