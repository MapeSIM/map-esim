import {
  DEFAULT_CURRENCY,
  FALLBACK_USD_RATES,
  type CurrencyCode,
} from "@/app/lib/currency/currencies";

export type CurrencyRates = Record<CurrencyCode, number>;

export function convertFromUsd(
  amountUsd: number,
  currency: CurrencyCode,
  rates: CurrencyRates = FALLBACK_USD_RATES
): number {
  const rate = rates[currency] ?? FALLBACK_USD_RATES[currency] ?? 1;
  return amountUsd * rate;
}

export function formatMoney(
  amountUsd: number | null | undefined,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  rates: CurrencyRates = FALLBACK_USD_RATES
): string {
  if (amountUsd === null || amountUsd === undefined || !Number.isFinite(amountUsd)) {
    return "—";
  }

  const converted = convertFromUsd(amountUsd, currency, rates);

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: currency === "PKR" ? 0 : 2,
    maximumFractionDigits: currency === "PKR" ? 0 : 2,
  }).format(converted);
}
