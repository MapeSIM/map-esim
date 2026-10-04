"use client";

import { useState } from "react";

type Props = {
  orderId: string;
  /** Full plaintext ICCID when available (always shown — no reveal gate). */
  iccid: string | null;
  /** Shown when no ICCID is stored yet. */
  unavailableLabel?: string;
  /** Single-row ICCID + Copy for compact Partner install cards. */
  compact?: boolean;
};

/**
 * Always-visible ICCID display with copy. No mask / reveal / auto-hide.
 * Kept filename for existing imports; behaviour is plain display.
 */
export default function IccidRevealPanel({
  orderId,
  iccid,
  unavailableLabel = "Pending from provider",
  compact = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = (iccid ?? "").trim();
  const hasIccid = value.length > 0;
  const display = hasIccid ? value : unavailableLabel;

  async function copy() {
    if (!hasIccid) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Unable to copy ICCID.");
    }
  }

  const copyButton = hasIccid ? (
    <button
      type="button"
      onClick={() => void copy()}
      className={
        compact
          ? "inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--heading)] transition hover:bg-[var(--page-bg-soft)]"
          : "inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border-strong)] px-3 text-xs font-semibold text-[var(--heading)] transition hover:bg-[var(--surface)]"
      }
    >
      {copied ? "Copied" : compact ? "Copy" : "Copy ICCID"}
    </button>
  ) : null;

  if (compact) {
    return (
      <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
          ICCID
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Full ICCID for this eSIM. Copy when you need it.
        </p>
        <div className="mt-4 min-w-0 space-y-3 text-sm font-medium text-[var(--heading)]">
          <p
            className="break-all rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 font-mono tracking-wide"
            aria-label={`ICCID for order ${orderId}`}
          >
            {display}
          </p>
          <div className="flex flex-wrap gap-2">{copyButton}</div>
          {error ? (
            <p
              className="text-xs font-normal text-amber-700 dark:text-amber-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-2 border-b border-[var(--border)] py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        ICCID
      </dt>
      <dd className="min-w-0 space-y-2 text-sm font-medium text-[var(--heading)]">
        <p
          className="break-all font-mono"
          aria-label={`ICCID for order ${orderId}`}
        >
          {display}
        </p>
        <div className="flex flex-wrap gap-2">{copyButton}</div>
        {!hasIccid ? (
          <p className="text-xs font-normal text-[var(--text-muted)]">
            Full ICCID is unavailable until it is stored for this order.
          </p>
        ) : null}
        {error ? (
          <p
            className="text-xs font-normal text-amber-700 dark:text-amber-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </dd>
    </div>
  );
}
