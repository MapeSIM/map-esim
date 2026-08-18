import { DEFAULT_CURRENCY, type CurrencyCode } from "@/app/lib/currency/currencies";
import { formatUsdCents } from "@/app/lib/wallet/display";

export const CHECKOUT_NON_USD_DISPLAY_NOTE =
  "Non-USD amounts are estimated using the current display rate. Order and wallet values remain recorded in USD. Final payment currency will be shown before payment.";

export type CheckoutMoneyVariant =
  | "base"
  | "wallet-balance"
  | "wallet-deduction";

export function isCheckoutDisplayUsd(currency: CurrencyCode): boolean {
  return currency === DEFAULT_CURRENCY;
}

/**
 * Catalog `formatPrice` / `formatMoney` take a USD dollar amount.
 * Integer cents are passed through unchanged; this only scales for display.
 */
export function usdCentsToCatalogAmount(cents: number): number {
  return cents / 100;
}

/** Presentation-only minus. Never negate stored cents. */
export const CHECKOUT_DISPLAY_MINUS = "−";

export function applyCheckoutDisplaySign(
  formattedAmount: string,
  signed = false
): string {
  return signed ? `${CHECKOUT_DISPLAY_MINUS}${formattedAmount}` : formattedAmount;
}

export function formatCheckoutEstimatedPrimary(
  formattedMoney: string,
  signed = false
): string {
  return `Estimated ${applyCheckoutDisplaySign(formattedMoney, signed)}`;
}

export function formatCheckoutUsdSecondaryLabel(
  cents: number,
  variant: CheckoutMoneyVariant = "base",
  signed = false
): string {
  const usd = applyCheckoutDisplaySign(formatUsdCents(cents), signed);
  if (variant === "wallet-balance") {
    return `USD wallet balance: ${usd}`;
  }
  if (variant === "wallet-deduction") {
    return `USD wallet deduction: ${usd}`;
  }
  return `USD base amount: ${usd}`;
}
