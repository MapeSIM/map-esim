"use client";

import { useEffect, useRef, useState } from "react";

const AUTO_HIDE_MS = 60_000;

type Props = {
  orderId: string;
  /** Masked last-4 or pending/not-provided label from the server. */
  maskedLabel: string;
  /** True only when encrypted ICCID is stored and reveal may succeed. */
  revealable: boolean;
  /** Absolute path to POST reveal endpoint. */
  revealPath: string;
};

export default function IccidRevealPanel({
  orderId,
  maskedLabel,
  revealable,
  revealPath,
}: Props) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHideTimer() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function hide() {
    clearHideTimer();
    setRevealed(null);
    setCopied(false);
    setError(null);
  }

  function scheduleAutoHide() {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      setRevealed(null);
      setCopied(false);
    }, AUTO_HIDE_MS);
  }

  useEffect(() => {
    return () => clearHideTimer();
  }, []);

  async function reveal() {
    if (!revealable || pending) return;
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch(revealPath, {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        iccid?: string;
        error?: string;
      } | null;

      if (!response.ok || !data?.success || typeof data.iccid !== "string") {
        setRevealed(null);
        setError(
          typeof data?.error === "string" && data.error.trim()
            ? data.error
            : "Unable to reveal ICCID."
        );
        return;
      }

      // Keep only in component state — never written into the DOM as initial HTML.
      setRevealed(data.iccid);
      scheduleAutoHide();
    } catch {
      setRevealed(null);
      setError("Unable to reveal ICCID.");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      scheduleAutoHide();
    } catch {
      setError("Unable to copy ICCID.");
    }
  }

  return (
    <div className="grid gap-2 border-b border-[var(--border)] py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        ICCID
      </dt>
      <dd className="space-y-2 text-sm font-medium text-[var(--heading)]">
        <p className="break-all font-mono" aria-label={`ICCID for order ${orderId}`}>
          {revealed ?? maskedLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          {!revealed ? (
            <button
              type="button"
              onClick={() => void reveal()}
              disabled={!revealable || pending}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border-strong)] px-3 text-xs font-semibold text-[var(--heading)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Revealing…" : "Show full ICCID"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void copy()}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border-strong)] px-3 text-xs font-semibold text-[var(--heading)] transition hover:bg-[var(--surface)]"
              >
                {copied ? "Copied" : "Copy ICCID"}
              </button>
              <button
                type="button"
                onClick={hide}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border-strong)] px-3 text-xs font-semibold text-[var(--heading)] transition hover:bg-[var(--surface)]"
              >
                Hide ICCID
              </button>
            </>
          )}
        </div>
        {!revealable ? (
          <p className="text-xs font-normal text-[var(--text-muted)]">
            Full ICCID reveal is unavailable until the value is stored securely.
          </p>
        ) : null}
        {error ? (
          <p className="text-xs font-normal text-amber-700 dark:text-amber-200" role="alert">
            {error}
          </p>
        ) : null}
        {revealed ? (
          <p className="text-xs font-normal text-[var(--text-muted)]">
            Visible for a short time, then hidden automatically.
          </p>
        ) : null}
      </dd>
    </div>
  );
}
