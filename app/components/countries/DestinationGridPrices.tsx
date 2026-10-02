"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";

/**
 * One client island for an entire destination grid.
 * Cards store USD in data-usd; this fills preference-aware labels after mount.
 */
export default function DestinationGridPrices({
  children,
}: {
  children: ReactNode;
}) {
  const { formatPrice } = useCurrency();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-usd]");
    for (const el of nodes) {
      const raw = el.getAttribute("data-usd");
      if (raw == null || raw === "") {
        el.textContent = "—";
        continue;
      }
      const amount = Number(raw);
      el.textContent = Number.isFinite(amount) ? formatPrice(amount) : "—";
    }
  }, [formatPrice]);

  return <div ref={rootRef}>{children}</div>;
}
