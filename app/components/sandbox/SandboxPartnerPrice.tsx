"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SANDBOX_DEFAULT_DISCOUNT_PERCENT,
  sandboxDiscountLabel,
  sandboxPartnerPriceUsd,
} from "@/app/lib/sandbox/sandboxPricing";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";

type Props = {
  retailUsd: number | null | undefined;
  /** When known from RSC (session partner); otherwise fetched from /api/sandbox/session. */
  discountPercent?: number;
  /** Show "3% off" under/beside the price. */
  showDiscountLabel?: boolean;
  className?: string;
};

/**
 * Catalog / hero price island for sandbox: partnerPrice from retail × discount.
 */
export default function SandboxPartnerPrice({
  retailUsd,
  discountPercent: discountProp,
  showDiscountLabel = true,
  className,
}: Props) {
  const { formatPrice } = useCurrency();
  const [discountPercent, setDiscountPercent] = useState(
    typeof discountProp === "number"
      ? discountProp
      : SANDBOX_DEFAULT_DISCOUNT_PERCENT
  );

  useEffect(() => {
    if (typeof discountProp === "number") {
      setDiscountPercent(discountProp);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/sandbox/session", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          discountPercent?: number;
          partner?: { discountPercent?: number };
        };
        if (!cancelled && data.ok) {
          setDiscountPercent(
            data.discountPercent ??
              data.partner?.discountPercent ??
              SANDBOX_DEFAULT_DISCOUNT_PERCENT
          );
        }
      } catch {
        /* keep default */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [discountProp]);

  const partnerUsd = useMemo(() => {
    if (typeof retailUsd !== "number" || !Number.isFinite(retailUsd)) {
      return null;
    }
    return sandboxPartnerPriceUsd(retailUsd, discountPercent);
  }, [retailUsd, discountPercent]);

  if (partnerUsd == null) {
    return <span className={className}>{formatPrice(retailUsd)}</span>;
  }

  return (
    <span className={className}>
      {formatPrice(partnerUsd)}
      {showDiscountLabel ? (
        <span className="ml-1.5 text-xs font-semibold text-emerald-400/90 sm:text-sm">
          {sandboxDiscountLabel(discountPercent)}
        </span>
      ) : null}
    </span>
  );
}
