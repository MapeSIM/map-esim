"use client";

import {
  EsimCompatibilityTrigger,
  EsimCompatibilityDialog,
} from "@/app/components/esim/EsimCompatibilityModal";

/**
 * Checkout entry: opens interactive EsimCompatibilityModal without leaving
 * checkout (preserves cart / payment state).
 */
export function CheckoutCompatibilityCheck() {
  return (
    <EsimCompatibilityTrigger
      footerAction="continue"
      data-checkout-compatibility-trigger="true"
    >
      Check eSIM compatibility (?)
    </EsimCompatibilityTrigger>
  );
}

export { EsimCompatibilityDialog as CheckoutCompatibilityDialog };
