"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Props = {
  label: string;
  value: string;
  fieldKey: string;
  mono?: boolean;
};

export function ManualPaymentCopyField({
  label,
  value,
  fieldKey,
  mono = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const display = value.trim() || "Not configured";
  const canCopy = Boolean(value.trim());

  async function copyValue() {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex w-full min-w-0 max-w-full items-center justify-between gap-2 overflow-x-hidden rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          {label}
        </p>
        <p
          className={`mt-0.5 truncate text-sm font-semibold text-[var(--heading)] ${
            mono ? "font-mono tracking-tight" : ""
          }`}
          title={display}
        >
          {display}
        </p>
      </div>
      <button
        type="button"
        data-copy-key={fieldKey}
        onClick={copyValue}
        disabled={!canCopy}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className="relative inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-[11px] font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40 sm:px-2.5"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
        <span>{copied ? "Copied!" : "Copy"}</span>
      </button>
    </div>
  );
}
