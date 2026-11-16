"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

export type EsimCompatibilityFooterAction = "continue" | "explore";

const EsimCompatibilityDialog = dynamic(
  () => import("@/app/components/esim/EsimCompatibilityDialog"),
  { ssr: false }
);

type TriggerProps = {
  className?: string;
  children?: ReactNode;
  footerAction?: EsimCompatibilityFooterAction;
  /** Optional data attribute for QA / analytics. */
  "data-checkout-compatibility-trigger"?: string;
};

/**
 * Lightweight trigger — dialog/checker/catalog load only after open.
 * Preserves checkout state (no navigation).
 */
export function EsimCompatibilityTrigger({
  className,
  children,
  footerAction = "continue",
  "data-checkout-compatibility-trigger": dataTrigger,
}: TriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 transition hover:border-[var(--border-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        }
        data-checkout-compatibility-trigger={dataTrigger ?? "true"}
        data-esim-compatibility-trigger="true"
      >
        {children ?? "Check eSIM compatibility (?)"}
      </button>
      {open ? (
        <EsimCompatibilityDialog
          open={open}
          onClose={() => setOpen(false)}
          footerAction={footerAction}
        />
      ) : null}
    </>
  );
}

export { EsimCompatibilityDialog };
