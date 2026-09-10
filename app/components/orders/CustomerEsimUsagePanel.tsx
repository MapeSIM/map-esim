"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
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
  /** Show Add More Data near remaining usage when eligible (customer UI only). */
  addDataEligible?: boolean;
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
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(d) + " UTC"
  );
}

function statusBadgeClass(usage: UsagePayload): string {
  if (usage.isExpired || /expir/i.test(usage.statusLabel + usage.status)) {
    return "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]";
  }
  if (usage.isActivated || /active/i.test(usage.statusLabel + usage.status)) {
    return "border-[var(--accent-strong)]/45 bg-[var(--accent-strong)]/14 text-[var(--heading)]";
  }
  return "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--heading)]";
}

/** Display-only low/empty data cues from existing usage fields. */
function dataLevelHint(usage: UsagePayload): {
  level: "ok" | "low" | "empty" | "unknown";
  message: string | null;
} {
  if (usage.isUnlimited) {
    return { level: "ok", message: null };
  }
  if (!usage.reportsDataAllowance) {
    return {
      level: "unknown",
      message: "Detailed data totals were not reported for this plan.",
    };
  }
  const remaining = usage.remainingDataGB;
  const pct = usage.usagePercent;
  if (remaining !== null && Number.isFinite(remaining) && remaining <= 0) {
    return {
      level: "empty",
      message: "No data remaining on this eSIM.",
    };
  }
  if (
    (remaining !== null && Number.isFinite(remaining) && remaining <= 0.25) ||
    (pct !== null && Number.isFinite(pct) && pct >= 90)
  ) {
    return {
      level: "low",
      message: "Data is running low on this eSIM.",
    };
  }
  return { level: "ok", message: null };
}

function remainingToneClass(level: "ok" | "low" | "empty" | "unknown"): string {
  switch (level) {
    case "empty":
      return "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]";
    case "low":
      return "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]";
    default:
      return "border-[var(--accent-strong)]/30 bg-[var(--accent-strong)]/10 text-[var(--heading)]";
  }
}

export default function CustomerEsimUsagePanel({
  orderId,
  usageEligible,
  autoOpen = false,
  usagePath,
  compact = false,
  addDataEligible = false,
}: Props) {
  const headingId = useId();
  const [open, setOpen] = useState(Boolean(autoOpen && usageEligible));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  /** Route uses MAP local order id; VeSIM provider bind id is checkout-only. */
  const addDataHref = addDataEligible
    ? `/account/orders/${encodeURIComponent(orderId)}/add-data`
    : null;

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
        statusLabel: String(
          json.usage.statusLabel || json.usage.status || "Unknown"
        ),
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
  const dataHint = usage ? dataLevelHint(usage) : null;

  return (
    <section
      id="usage"
      aria-labelledby={headingId}
      className={
        compact
          ? "min-w-0"
          : "overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
      }
    >
      <div
        className={
          compact
            ? "flex flex-col gap-2"
            : "border-b border-[var(--border)] bg-[var(--surface-2)]/45 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6"
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
        <div
          className={
            compact
              ? "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
              : "mt-3 flex w-full flex-col gap-2 sm:mt-0 sm:w-auto sm:flex-row sm:items-center"
          }
        >
          {!open ? (
            <button
              type="button"
              onClick={() => void openAndLoad()}
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] shadow-[0_8px_16px_rgba(0,0,0,0.14)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60 sm:w-auto"
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
        <div
          className={compact ? "mt-5 space-y-4" : "space-y-5 px-5 py-5 sm:px-6"}
          aria-live="polite"
        >
          {error ? (
            <p
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]"
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
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide ${statusBadgeClass(usage)}`}
                  >
                    {usage.statusLabel}
                  </span>
                  {dataHint && dataHint.level === "low" ? (
                    <span className="inline-flex rounded-full border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2.5 py-1 text-xs font-bold text-[var(--warning-text)]">
                      Low data
                    </span>
                  ) : null}
                  {dataHint && dataHint.level === "empty" ? (
                    <span className="inline-flex rounded-full border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2.5 py-1 text-xs font-bold text-[var(--danger-text)]">
                      No data left
                    </span>
                  ) : null}
                </div>

                {dataHint?.message ? (
                  <p
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
                      dataHint.level === "empty"
                        ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]"
                        : dataHint.level === "low"
                          ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]"
                    }`}
                    role="status"
                  >
                    {dataHint.message}
                  </p>
                ) : null}

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--page-bg)]/35 p-4 sm:p-5">
                  {usage.isUnlimited ? (
                    <p className="text-base font-bold text-[var(--heading)]">
                      Unlimited data
                    </p>
                  ) : (
                    <>
                      <dl className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3.5">
                          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                            Used
                          </dt>
                          <dd className="mt-1.5 text-lg font-bold tabular-nums text-[var(--heading)]">
                            {formatGb(usage.usedDataGB)}
                          </dd>
                        </div>
                        <div
                          className={`rounded-2xl border px-3.5 py-3.5 ${remainingToneClass(dataHint?.level ?? "ok")}`}
                        >
                          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-80">
                            Remaining
                          </dt>
                          <dd className="mt-1.5 text-lg font-bold tabular-nums">
                            {formatGb(usage.remainingDataGB)}
                          </dd>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3.5">
                          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                            Total
                          </dt>
                          <dd className="mt-1.5 text-lg font-bold tabular-nums text-[var(--heading)]">
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
                              className={`h-full rounded-full transition-[width] duration-300 ${
                                dataHint?.level === "empty"
                                  ? "bg-[var(--danger-text)]"
                                  : dataHint?.level === "low"
                                    ? "bg-[var(--warning-text)]"
                                    : "bg-[linear-gradient(90deg,var(--accent)_0%,var(--accent-strong)_100%)]"
                              }`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <dl className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/50 px-3.5 py-3.5">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                      Activated
                    </dt>
                    <dd className="mt-1.5 text-sm font-semibold text-[var(--heading)]">
                      {formatWhen(usage.activatedAt)}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/50 px-3.5 py-3.5">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                      Expires
                    </dt>
                    <dd className="mt-1.5 text-sm font-semibold text-[var(--heading)]">
                      {formatWhen(usage.expiresAt)}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/50 px-3.5 py-3.5">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                      Days remaining
                    </dt>
                    <dd className="mt-1.5 text-sm font-semibold text-[var(--heading)]">
                      {usage.daysRemaining !== null
                        ? `${usage.daysRemaining}`
                        : "—"}
                    </dd>
                  </div>
                </dl>

                {addDataHref ? (
                  <div className="rounded-2xl border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 px-4 py-4">
                    <p className="text-sm font-semibold text-[var(--heading)]">
                      Need more data on this eSIM?
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Top up the same eSIM — a new eSIM is not created.
                    </p>
                    <Link
                      href={addDataHref}
                      className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] shadow-[0_8px_16px_rgba(0,0,0,0.14)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
                    >
                      Add More Data
                    </Link>
                  </div>
                ) : null}
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
