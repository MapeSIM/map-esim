"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  orderId: string;
  /** Full plaintext ICCID when available (always shown — no reveal gate). */
  iccid: string | null;
  /** Shown when no ICCID is stored yet. */
  unavailableLabel?: string;
  /** Single-row ICCID + Copy for compact Partner install cards. */
  compact?: boolean;
  /**
   * Optional provider sync when ICCID is still pending.
   * Parent owns the fetch; on success it should pass the new `iccid` prop.
   */
  onRefreshFromProvider?: () => Promise<string | null>;
  /**
   * Serializable sync endpoint for Server Components (POST `{ sync: true }`).
   * Used when `onRefreshFromProvider` cannot be passed across the RSC boundary.
   */
  syncPath?: string | null;
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
  onRefreshFromProvider,
  syncPath = null,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localIccid, setLocalIccid] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoSyncedRef = useRef(false);

  const value = (localIccid ?? iccid ?? "").trim();
  const hasIccid = value.length > 0;
  const display = hasIccid ? value : unavailableLabel;
  const syncHref = (syncPath ?? "").trim();
  const canRefresh =
    !hasIccid &&
    (typeof onRefreshFromProvider === "function" || Boolean(syncHref));

  useEffect(() => {
    if (hasIccid || !canRefresh || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    void refresh();
    // One-shot best-effort provider sync when ICCID is still pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIccid, canRefresh]);

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

  async function refreshFromPath(): Promise<string | null> {
    if (!syncHref) return null;
    const res = await fetch(syncHref, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sync: true }),
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      iccid?: string;
    } | null;
    if (!res.ok || !json?.success || !json.iccid) {
      return null;
    }
    return json.iccid;
  }

  async function refresh() {
    if ((!onRefreshFromProvider && !syncHref) || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const next = onRefreshFromProvider
        ? await onRefreshFromProvider()
        : await refreshFromPath();
      const trimmed = (next ?? "").trim();
      if (!trimmed) {
        setError(
          "ICCID is not available from the provider yet. Try again shortly."
        );
        return;
      }
      setLocalIccid(trimmed);
    } catch {
      setError("Unable to refresh ICCID from the provider.");
    } finally {
      setRefreshing(false);
    }
  }

  const copyButton = hasIccid ? (
    <button
      type="button"
      onClick={() => void copy()}
      className={
        compact
          ? "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--heading)] transition hover:bg-[var(--page-bg-soft)]"
          : "inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border-strong)] px-3 text-xs font-semibold text-[var(--heading)] transition hover:bg-[var(--surface)]"
      }
    >
      {copied ? "Copied" : compact ? "Copy" : "Copy ICCID"}
    </button>
  ) : null;

  const refreshButton = canRefresh ? (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={refreshing}
      className={
        compact
          ? "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--heading)] transition hover:bg-[var(--page-bg-soft)] disabled:opacity-60"
          : "inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border-strong)] px-3 text-xs font-semibold text-[var(--heading)] transition hover:bg-[var(--surface)] disabled:opacity-60"
      }
    >
      {refreshing ? "Refreshing…" : compact ? "Refresh" : "Refresh from provider"}
    </button>
  ) : null;

  if (compact) {
    return (
      <section className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              ICCID
            </p>
            <p
              className="mt-0.5 truncate font-mono text-xs font-medium tracking-wide text-[var(--heading)] sm:text-sm"
              aria-label={`ICCID for order ${orderId}`}
              title={hasIccid ? value : undefined}
            >
              {display}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {copyButton}
            {refreshButton}
          </div>
        </div>
        {error ? (
          <p
            className="mt-1.5 text-xs font-normal text-amber-700 dark:text-amber-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}
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
        <div className="flex flex-wrap gap-2">
          {copyButton}
          {refreshButton}
        </div>
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
