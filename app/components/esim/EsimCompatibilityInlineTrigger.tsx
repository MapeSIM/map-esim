"use client";

import { ArrowRight } from "lucide-react";
import {
  EsimCompatibilityTrigger,
  type EsimCompatibilityFooterAction,
} from "@/app/components/esim/EsimCompatibilityModal";

type Props = {
  label?: string;
  className?: string;
  footerAction?: EsimCompatibilityFooterAction;
  showArrow?: boolean;
};

/** Inline text/button trigger for home, plan, and info pages. */
export default function EsimCompatibilityInlineTrigger({
  label = "Check eSIM compatibility (?)",
  className,
  footerAction = "explore",
  showArrow = false,
}: Props) {
  return (
    <EsimCompatibilityTrigger
      footerAction={footerAction}
      className={
        className ??
        "inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
      }
      data-checkout-compatibility-trigger="inline"
    >
      {label}
      {showArrow ? (
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
      ) : null}
    </EsimCompatibilityTrigger>
  );
}
