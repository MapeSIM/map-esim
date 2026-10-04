"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Smartphone, X } from "lucide-react";
import {
  CHECKOUT_COMPATIBILITY_INTRO,
  CHECKOUT_COMPATIBILITY_TITLE,
  COMMON_SUPPORTED_ESIM_MODELS,
  COMPATIBILITY_ANDROID_QUICK_CHECK,
  COMPATIBILITY_IPHONE_QUICK_CHECK,
  COMPATIBILITY_UNLOCKED_NOTE,
  DEVICE_COMPATIBILITY_PAGE_HREF,
} from "@/app/lib/checkout/checkoutCompatibilityGuide";

type ModalProps = {
  open: boolean;
  onClose: () => void;
};

function CheckoutCompatibilityDialog({ open, onClose }: ModalProps) {
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
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
      data-checkout-compatibility-modal="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-lg overflow-hidden rounded-t-3xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10">
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
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
                {CHECKOUT_COMPATIBILITY_INTRO}
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

        <div className="max-h-[calc(92vh-5.5rem)] space-y-4 overflow-y-auto px-5 py-4">
          <section aria-labelledby="checkout-compat-models-heading">
            <h3
              id="checkout-compat-models-heading"
              className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
            >
              Commonly supported models
            </h3>
            <ul className="mt-3 space-y-2.5">
              {COMMON_SUPPORTED_ESIM_MODELS.map((item) => (
                <li
                  key={item.brand}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3"
                >
                  <p className="text-sm font-semibold text-[var(--heading)]">
                    {item.brand}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-[var(--accent-strong)]">
                    {item.summary}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    {item.detail}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                iPhone quick check
              </h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[var(--text)] sm:text-sm">
                {COMPATIBILITY_IPHONE_QUICK_CHECK.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                Android quick check
              </h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[var(--text)] sm:text-sm">
                {COMPATIBILITY_ANDROID_QUICK_CHECK.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </section>

          <p className="rounded-xl border border-[var(--border)] bg-[var(--page-bg-soft)] px-3.5 py-3 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
            {COMPATIBILITY_UNLOCKED_NOTE}
          </p>

          <Link
            href={DEVICE_COMPATIBILITY_PAGE_HREF}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            onClick={onClose}
          >
            Full compatibility guide
          </Link>
        </div>
      </div>
    </div>
  );
}

/** 1-click checkout trigger + lightweight modal (stays on checkout). */
export function CheckoutCompatibilityCheck() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 transition hover:border-[var(--border-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        data-checkout-compatibility-trigger="true"
      >
        Check eSIM compatibility (?)
      </button>
      <CheckoutCompatibilityDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
