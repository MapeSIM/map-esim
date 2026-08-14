export const CURRENCY_CODES = [
  "USD",
  "PKR",
  "EUR",
  "CAD",
  "BRL",
  "MXN",
  "SAR",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const DEFAULT_CURRENCY: CurrencyCode = "USD";
export const CURRENCY_STORAGE_KEY = "map-esim-currency";

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: "US Dollar",
  PKR: "Pakistani Rupee",
  EUR: "Euro",
  CAD: "Canadian Dollar",
  BRL: "Brazilian Real",
  MXN: "Mexican Peso",
  SAR: "Saudi Riyal",
};

/** Region/country short codes for currency selector display only. */
export const CURRENCY_REGION_CODES: Record<CurrencyCode, string> = {
  USD: "US",
  PKR: "PK",
  EUR: "EU",
  CAD: "CA",
  BRL: "BR",
  MXN: "MX",
  SAR: "SA",
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  PKR: "Rs",
  EUR: "€",
  CAD: "C$",
  BRL: "R$",
  MXN: "MX$",
  SAR: "﷼",
};

export type CurrencyOption = {
  code: CurrencyCode;
  region: string;
  symbol: string;
  label: string;
};

export const CURRENCY_OPTIONS: CurrencyOption[] = CURRENCY_CODES.map(
  (code) => ({
    code,
    region: CURRENCY_REGION_CODES[code],
    symbol: CURRENCY_SYMBOLS[code],
    label: CURRENCY_LABELS[code],
  })
);

/**
 * Fallback USD→currency rates used when live FX is unavailable.
 * PKR is also the fixed MAP retail display rate (1 USD = 293 PKR).
 */
export const FALLBACK_USD_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  PKR: 293,
  EUR: 0.92,
  CAD: 1.37,
  BRL: 5.45,
  MXN: 18.7,
  SAR: 3.75,
};

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    typeof value === "string" &&
    (CURRENCY_CODES as readonly string[]).includes(value)
  );
}
