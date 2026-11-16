"use client";

import dynamic from "next/dynamic";

const footerLinkClass =
  "inline bg-transparent p-0 text-left text-sm font-normal text-[var(--text-muted)] rounded-sm transition hover:text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60";

/**
 * Defers footer compatibility trigger JS off the root-layout critical path.
 * Catalog/modal still load only after the user opens the dialog.
 */
const FooterEsimCompatibilityLink = dynamic(
  () => import("@/app/components/esim/FooterEsimCompatibilityLink"),
  {
    ssr: false,
    loading: () => (
      <span className={footerLinkClass} aria-hidden="true">
        Device Compatibility
      </span>
    ),
  }
);

export default function DeferredFooterEsimCompatibilityLink() {
  return <FooterEsimCompatibilityLink />;
}
