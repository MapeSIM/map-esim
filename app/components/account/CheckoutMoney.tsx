"use client";

import { useCurrency } from "@/app/components/currency/CurrencyProvider";
import {
  CHECKOUT_NON_USD_DISPLAY_NOTE,
  applyCheckoutDisplaySign,
  formatCheckoutEstimatedPrimary,
  formatCheckoutSimpaisaPkrPrimary,
  formatCheckoutUsdSecondaryLabel,
  isCheckoutDisplayUsd,
  usdCentsToCatalogAmount,
  type CheckoutMoneyVariant,
} from "@/app/lib/currency/checkoutMoney";
import { formatUsdCents } from "@/app/lib/wallet/display";

type CheckoutMoneyProps = {
  cents: number;
  signed?: boolean;
  variant?: CheckoutMoneyVariant;
  /**
   * When true and display currency is PKR, use the Simpaisa charge quote
   * (fixed MAP 293 rate) so sticky/summary amounts match SimpaisaWalletFields.
   */
  exactSimpaisaPkrCharge?: boolean;
};

export function CheckoutMoney({
  cents,
  signed = false,
  variant = "base",
  exactSimpaisaPkrCharge = false,
}: CheckoutMoneyProps) {
  const { currency, formatPrice } = useCurrency();
  const usdLabel = applyCheckoutDisplaySign(formatUsdCents(cents), signed);

  if (isCheckoutDisplayUsd(currency)) {
    const suffix = variant === "wallet-balance" ? " USD" : "";
    return (
      <span>
        {usdLabel}
        {suffix}
      </span>
    );
  }

  const simpaisaPkrPrimary =
    exactSimpaisaPkrCharge && currency === "PKR"
      ? formatCheckoutSimpaisaPkrPrimary(cents, signed)
      : null;
  const primaryLabel =
    simpaisaPkrPrimary ??
    formatCheckoutEstimatedPrimary(
      formatPrice(usdCentsToCatalogAmount(cents)),
      signed
    );

  return (
    <span className="inline-flex flex-col items-start gap-0.5 align-top">
      <span>{primaryLabel}</span>
      <span className="text-xs font-medium text-[var(--text-muted)]">
        {formatCheckoutUsdSecondaryLabel(cents, variant, signed)}
      </span>
    </span>
  );
}

export function CheckoutDisplayCurrencyNote() {
  const { currency } = useCurrency();
  if (isCheckoutDisplayUsd(currency)) return null;
  return (
    <p className="text-sm text-[var(--text-muted)]" role="note">
      {CHECKOUT_NON_USD_DISPLAY_NOTE}
    </p>
  );
}
