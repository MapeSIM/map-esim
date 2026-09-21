"use client";

import { useCurrency } from "@/app/components/currency/CurrencyProvider";

/** Tiny client island so RSC plan cards can show preference-aware prices. */
export default function CurrencyPrice({
  amountUsd,
}: {
  amountUsd: number | null | undefined;
}) {
  const { formatPrice } = useCurrency();
  return <>{formatPrice(amountUsd)}</>;
}
