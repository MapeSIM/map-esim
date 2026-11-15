"use client";

import { EsimCompatibilityTrigger } from "@/app/components/esim/EsimCompatibilityModal";

const footerLinkClass =
  "inline bg-transparent p-0 text-left text-sm font-normal text-[var(--text-muted)] rounded-sm transition hover:text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60";

/** Footer Support link — opens interactive modal (Explore Plans CTA). */
export default function FooterEsimCompatibilityLink() {
  return (
    <EsimCompatibilityTrigger
      footerAction="explore"
      className={footerLinkClass}
      data-checkout-compatibility-trigger="footer"
    >
      Device Compatibility
    </EsimCompatibilityTrigger>
  );
}
