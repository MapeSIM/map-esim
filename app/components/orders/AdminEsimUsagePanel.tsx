"use client";

import { useCallback, useId, useState } from "react";
import { RefreshCw, Signal } from "lucide-react";

type UsagePayload = {
  status: string;
  statusLabel: string;
  initialDataGB: number | null;
  remainingDataGB: number | null;
  usedDataGB: number | null;
  usagePercent: number | null;
  isUnlimited: boolean;
  reportsDataAllowance: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
};

type Props = {
  orderId: string;
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

export default function AdminEsimUsagePanel({ orderId }: Props) {
  const headingId = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/orders/${encodeURIComponent(orderId)}/usage`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }
      );
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        checkedAt?: string;
        usage?: UsagePayload;
      } | null;
      if (!res.ok || !json?.success || !json.usage) {
        setUsage(null);
        setCheckedAt(null);
        setError(
          json?.error ||
            "Live usage is temporarily unavailable. Please try again later."
        );
        return;
      }
      setCheckedAt(
        typeof json.checkedAt === "string" ? json.checkedAt : null
      );
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
        isUnlimited: Boolean(json.usage.isUnlimited),
        reportsDataAllowance: json.usage.reportsDataAllowance !== false,
        activatedAt: json.usage.activatedAt || null,
        expiresAt: json.usage.expiresAt || null,
      });
    } catch {
      setUsage(null);
      setCheckedAt(null);
      setError("Live usage is temporarily unavailable. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-sm font-bold tracking-tight text-[var(--heading)]"
          >
            Live eSIM usage
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            On-demand carrier usage check. No automatic refresh. Full ICCID is
            never shown here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsage()}
          disabled={loading}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--page-bg-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60 sm:w-auto"
        >
          {usage ? (
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          ) : (
            <Signal className="h-4 w-4" aria-hidden="true" />
          )}
          {loading
            ? "Checking…"
            : usage
              ? "Refresh live usage"
              : "Check live usage"}
        </button>
      </div>

      <div className="mt-4 space-y-3" aria-live="polite">
        {error ? (
          <p
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text-muted)]"
            role="status"
          >
            {error}
          </p>
        ) : null}

        {usage ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Status
              </dt>
              <dd className="mt-0.5 font-medium text-[var(--heading)]">
                {usage.statusLabel}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Unlimited
              </dt>
              <dd className="mt-0.5 font-medium text-[var(--heading)]">
                {usage.isUnlimited ? "Yes" : "No"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Initial data
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums text-[var(--heading)]">
                {formatGb(usage.initialDataGB)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Remaining
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums text-[var(--heading)]">
                {formatGb(usage.remainingDataGB)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Used (derived)
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums text-[var(--heading)]">
                {formatGb(usage.usedDataGB)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Usage %
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums text-[var(--heading)]">
                {usage.usagePercent !== null
                  ? `${Math.round(usage.usagePercent)}%`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Activated
              </dt>
              <dd className="mt-0.5 font-medium text-[var(--heading)]">
                {formatWhen(usage.activatedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Expires
              </dt>
              <dd className="mt-0.5 font-medium text-[var(--heading)]">
                {formatWhen(usage.expiresAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Reports allowance
              </dt>
              <dd className="mt-0.5 font-medium text-[var(--heading)]">
                {usage.reportsDataAllowance ? "Yes" : "No"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Checked at
              </dt>
              <dd className="mt-0.5 font-medium text-[var(--heading)]">
                {formatWhen(checkedAt)}
              </dd>
            </div>
          </dl>
        ) : null}

        {!usage && !error && loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading live usage…</p>
        ) : null}
      </div>
    </section>
  );
}
