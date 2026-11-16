"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Smartphone, X } from "lucide-react";
import {
  CHECKOUT_COMPATIBILITY_TITLE,
  DEVICE_COMPATIBILITY_PAGE_HREF,
} from "@/app/lib/checkout/checkoutCompatibilityGuide";
import { EsimCompatibilityChecker } from "@/app/components/esim/EsimCompatibilityChecker";

export type EsimCompatibilityFooterAction = "continue" | "explore";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Checkout: Got it, Continue. Info pages: Explore Plans. */
  footerAction?: EsimCompatibilityFooterAction;
};

function EsimCompatibilityDialog({
  open,
  onClose,
  footerAction = "continue",
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
      data-esim-compatibility-modal="true"
      data-checkout-compatibility-modal="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-t-3xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.5)] sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/12">
              <Smartphone
                className="h-5 w-5 text-[var(--accent-strong)]"
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-base font-bold tracking-tight text-[var(--heading)] sm:text-lg"
              >
                {CHECKOUT_COMPATIBILITY_TITLE}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                Search your phone model or verify with *#06# in under 10 seconds.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-2 text-[var(--text-muted)] outline-none transition hover:text-[var(--heading)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            aria-label="Close compatibility check"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
          <EsimCompatibilityChecker />
        </div>

        <div className="shrink-0 space-y-2 border-t border-[var(--border)] px-4 py-3 sm:px-5">
          {footerAction === "explore" ? (
            <Link
              href="/countries"
              onClick={onClose}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95"
            >
              Explore Plans
            </Link>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95"
            >
              Got it, Continue
            </button>
          )}
          <Link
            href={DEVICE_COMPATIBILITY_PAGE_HREF}
            onClick={onClose}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-xl text-xs font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
          >
            Full compatibility guide
          </Link>
        </div>
      </div>
    </div>
  );
}

type TriggerProps = {
  className?: string;
  children?: ReactNode;
  footerAction?: EsimCompatibilityFooterAction;
  /** Optional data attribute for QA / analytics. */
  "data-checkout-compatibility-trigger"?: string;
};

/**
 * Opens the interactive eSIM compatibility modal without navigating away
 * (preserves checkout state).
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
      <EsimCompatibilityDialog
        open={open}
        onClose={() => setOpen(false)}
        footerAction={footerAction}
      />
    </>
  );
}

export { EsimCompatibilityDialog };
