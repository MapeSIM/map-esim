"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { RefreshCw, Signal } from "lucide-react";

type UsagePayload = {
  status: string;
  statusLabel: string;
  initialDataGB: number | null;
  remainingDataGB: number | null;
  usedDataGB: number | null;
  usagePercent: number | null;
  usagePercentForBar: number | null;
  isUnlimited: boolean;
  planUnlimited: boolean;
  reportsDataAllowance: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  isActivated: boolean | null;
  isExpired: boolean | null;
};

type Props = {
  orderId: string;
  usageEligible: boolean;
  autoOpen?: boolean;
  /** Override usage API path. Defaults to the customer account route. */
  usagePath?: string;
  /** Compact Partner/share result card. Default remains the customer panel. */
  compact?: boolean;
};

function formatGb(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return `${value} GB`;
  return `${value.toFixed(2)} GB`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Not reported";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not reported";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d) + " UTC";
}

function statusBadgeClass(usage: UsagePayload): string {
  if (usage.isExpired || /expir/i.test(usage.statusLabel + usage.status)) {
    return "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]";
  }
  if (usage.isActivated || /active/i.test(usage.statusLabel + usage.status)) {
    return "border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 text-[var(--heading)]";
  }
  return "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--heading)]";
}

export default function CustomerEsimUsagePanel({
  orderId,
  usageEligible,
  autoOpen = false,
  usagePath,
  compact = false,
}: Props) {
  const headingId = useId();
  const [open, setOpen] = useState(Boolean(autoOpen && usageEligible));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsagePayload | null>(null);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        usagePath ||
          `/api/account/orders/${encodeURIComponent(orderId)}/usage`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }
      );
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        usage?: UsagePayload;
      } | null;
      if (!res.ok || !json?.success || !json.usage) {
        setUsage(null);
        setError(
          json?.error ||
            "Usage is temporarily unavailable. Please try again later."
        );
        return;
      }
      setUsage({
        status: String(json.usage.status || "Unknown"),
        statusLabel: String(json.usage.statusLabel || json.usage.status || "Unknown"),
        initialDataGB:
          typeof json.usage.initialDataGB === "number"
            ? json.usage.initialDataGB
            : null,
        remainingDataGB:
          typeof json.usage.remainingDataGB === "number"
            ? json.usage.remainingDataGB
            : null,
        usedDataGB:
          typeof json.usage.usedDataGB === "number"
            ? json.usage.usedDataGB
            : null,
        usagePercent:
          typeof json.usage.usagePercent === "number"
            ? json.usage.usagePercent
            : null,
        usagePercentForBar:
          typeof json.usage.usagePercentForBar === "number"
            ? json.usage.usagePercentForBar
            : null,
        isUnlimited: Boolean(json.usage.isUnlimited || json.usage.planUnlimited),
        planUnlimited: Boolean(json.usage.planUnlimited),
        reportsDataAllowance: json.usage.reportsDataAllowance !== false,
        activatedAt: json.usage.activatedAt || null,
        expiresAt: json.usage.expiresAt || null,
        daysRemaining:
          typeof json.usage.daysRemaining === "number"
            ? json.usage.daysRemaining
            : null,
        isActivated:
          typeof json.usage.isActivated === "boolean"
            ? json.usage.isActivated
            : null,
        isExpired:
          typeof json.usage.isExpired === "boolean"
            ? json.usage.isExpired
            : null,
      });
    } catch {
      setUsage(null);
      setError("Usage is temporarily unavailable. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [orderId, usagePath]);

  const openAndLoad = useCallback(async () => {
    setOpen(true);
    await loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    if (!autoOpen || !usageEligible || usage || loading) return;
    // Deep-link from My eSIMs "View usage" (?usage=1) or Partner "Show eSIM Status".
    // Not background polling — runs once after the user chose to view usage.
    queueMicrotask(() => {
      void loadUsage();
    });
  }, [autoOpen, usageEligible, usage, loading, loadUsage]);

  if (!usageEligible) {
    return null;
  }

  const barPct =
    usage && !usage.isUnlimited && usage.usagePercentForBar !== null
      ? Math.min(100, Math.max(0, usage.usagePercentForBar))
      : usage?.isUnlimited
        ? 0
        : null;

  return (
    <section
      id="usage"
      aria-labelledby={headingId}
      className={
        compact
          ? "min-w-0"
          : "rounded-2xl border border-[var(--border-hover)] bg-[var(--surface-2)] p-4 sm:p-5"
      }
    >
      <div
        className={
          compact
            ? "flex flex-col gap-2"
            : "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        }
      >
        {compact ? (
          <h2 id={headingId} className="sr-only">
            eSIM Status &amp; Usage
          </h2>
        ) : (
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-base font-bold tracking-tight text-[var(--heading)]"
          >
            eSIM Status &amp; Usage
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Check activation and data usage when you need it. No automatic
            refresh.
          </p>
        </div>
        )}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {!open ? (
            <button
              type="button"
              onClick={() => void openAndLoad()}
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60 sm:w-auto"
            >
              <Signal className="h-4 w-4" aria-hidden="true" />
              {loading ? "Loading…" : compact ? "Check Usage" : "View usage"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void loadUsage()}
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--page-bg-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60 sm:w-auto"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {loading ? "Refreshing…" : "Refresh usage"}
            </button>
          )}
        </div>
      </div>

      {open ? (
        <div className="mt-5 space-y-4" aria-live="polite">
          {error ? (
            <p
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)]"
              role="status"
            >
              {error}
            </p>
          ) : null}

          {usage ? (
            compact ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(usage)}`}
                  >
                    {usage.statusLabel}
                  </span>
                </div>
                {usage.isUnlimited ? (
                  <p className="mt-3 text-sm font-semibold text-[var(--heading)]">
                    Unlimited data
                  </p>
                ) : (
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <dt className="text-xs text-[var(--text-soft)]">Used</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-[var(--heading)]">
                        {formatGb(usage.usedDataGB)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-soft)]">
                        Remaining
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-[var(--heading)]">
                        {formatGb(usage.remainingDataGB)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-soft)]">Total</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-[var(--heading)]">
                        {formatGb(usage.initialDataGB)}
                      </dd>
                    </div>
                  </dl>
                )}
                {usage.expiresAt ? (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    Expires {formatWhen(usage.expiresAt)}
                  </p>
                ) : usage.activatedAt ? (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    Activated {formatWhen(usage.activatedAt)}
                  </p>
                ) : null}
              </div>
            ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(usage)}`}
                >
                  {usage.statusLabel}
                </span>
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    Activated
                  </dt>
                  <dd className="mt-1 font-medium text-[var(--heading)]">
                    {formatWhen(usage.activatedAt)}
                  </dd>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    Expires
                  </dt>
                  <dd className="mt-1 font-medium text-[var(--heading)]">
                    {formatWhen(usage.expiresAt)}
                  </dd>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    Days remaining
                  </dt>
                  <dd className="mt-1 font-medium text-[var(--heading)]">
                    {usage.daysRemaining !== null
                      ? `${usage.daysRemaining}`
                      : "—"}
                  </dd>
                </div>
              </dl>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-4 sm:px-4">
                {usage.isUnlimited ? (
                  <p className="text-sm font-semibold text-[var(--heading)]">
                    Data: Unlimited
                  </p>
                ) : (
                  <>
                    <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <dt className="text-xs text-[var(--text-soft)]">Used</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-[var(--heading)]">
                          {formatGb(usage.usedDataGB)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[var(--text-soft)]">
                          Remaining
                        </dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-[var(--heading)]">
                          {formatGb(usage.remainingDataGB)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[var(--text-soft)]">Total</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-[var(--heading)]">
                          {formatGb(usage.initialDataGB)}
                        </dd>
                      </div>
                    </dl>
                    {barPct !== null ? (
                      <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--text-soft)]">
                          <span>Usage</span>
                          <span className="tabular-nums font-semibold text-[var(--heading)]">
                            {usage.usagePercent !== null
                              ? `${Math.round(usage.usagePercent)}%`
                              : `${Math.round(barPct)}%`}
                          </span>
                        </div>
                        <div
                          className="h-2.5 overflow-hidden rounded-full bg-[var(--page-bg-soft)]"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(barPct)}
                          aria-label="Data usage"
                        >
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent)_0%,var(--accent-strong)_100%)] transition-[width] duration-300"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </>
            )
          ) : null}

          {!usage && !error && loading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading usage…</p>
          ) : null}

          {compact ? null : (
          <p className="text-xs leading-relaxed text-[var(--text-soft)]">
            Usage data may be delayed by up to 1 hour.
          </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
