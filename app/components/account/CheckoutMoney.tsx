"use client";

import { useCurrency } from "@/app/components/currency/CurrencyProvider";
import {
  CHECKOUT_NON_USD_DISPLAY_NOTE,
  applyCheckoutDisplaySign,
  formatCheckoutEstimatedPrimary,
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
};

export function CheckoutMoney({
  cents,
  signed = false,
  variant = "base",
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

  return (
    <span className="inline-flex flex-col items-start gap-0.5 align-top">
      <span>
        {formatCheckoutEstimatedPrimary(
          formatPrice(usdCentsToCatalogAmount(cents)),
          signed
        )}
      </span>
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
