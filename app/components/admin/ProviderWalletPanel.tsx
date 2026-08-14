"use client";

import { useCallback, useId, useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";

type TxRow = {
  type: string;
  amount: number | null;
  currency: string | null;
  description: string;
  createdAt: string | null;
  orderRefMasked: string | null;
};

type WalletState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "verified";
      balance: number | null;
      currency: string | null;
      discountPercent: number | null;
      checkedAt: string;
      transactions: TxRow[];
    }
  | { kind: "unavailable"; message: string };

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
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

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null || !Number.isFinite(amount)) return "—";
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${cur}`;
  }
}

function statusLabel(state: WalletState): string {
  if (state.kind === "verified") return "VERIFIED";
  if (state.kind === "unavailable") return "TEMPORARILY UNAVAILABLE";
  return "NOT CHECKED / ON-DEMAND";
}

export function ProviderWalletPanel() {
  const headingId = useId();
  const [state, setState] = useState<WalletState>({ kind: "idle" });

  const refresh = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/provider-wallet", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        checkedAt?: string;
        balance?: number | null;
        currency?: string | null;
        discountPercent?: number | null;
        transactions?: TxRow[];
      } | null;

      if (!res.ok || !json?.success) {
        setState({
          kind: "unavailable",
          message:
            json?.error ||
            "Provider wallet is temporarily unavailable. Please try again later.",
        });
        return;
      }

      setState({
        kind: "verified",
        balance: typeof json.balance === "number" ? json.balance : null,
        currency: json.currency ?? null,
        discountPercent:
          typeof json.discountPercent === "number"
            ? json.discountPercent
            : null,
        checkedAt:
          typeof json.checkedAt === "string"
            ? json.checkedAt
            : new Date().toISOString(),
        transactions: Array.isArray(json.transactions)
          ? json.transactions
          : [],
      });
    } catch {
      setState({
        kind: "unavailable",
        message:
          "Provider wallet is temporarily unavailable. Please try again later.",
      });
    }
  }, []);

  const loading = state.kind === "loading";

  return (
    <section
      className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5"
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-base font-semibold tracking-tight text-[var(--heading)]"
          >
            Provider wallet (VeSIM)
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
            Read-only balance and recent ledger from documented VeSIM wallet
            endpoints. Not loaded automatically — refresh only when needed.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {statusLabel(state)}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--page-bg-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wallet className="h-4 w-4" aria-hidden="true" />
            )}
            {loading ? "Refreshing…" : "Refresh provider wallet"}
          </button>
        </div>
      </div>

      <div aria-live="polite" className="space-y-3">
        {state.kind === "unavailable" ? (
          <p
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-muted)]"
            role="status"
          >
            {state.message}
          </p>
        ) : null}

        {state.kind === "verified" ? (
          <>
            <dl className="grid gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Balance
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--heading)]">
                  {formatAmount(state.balance, state.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Currency
                </dt>
                <dd className="mt-1 text-sm font-semibold text-[var(--heading)]">
                  {state.currency || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Discount %
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--heading)]">
                  {state.discountPercent !== null
                    ? `${state.discountPercent}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Checked at
                </dt>
                <dd className="mt-1 text-sm font-semibold text-[var(--heading)]">
                  {formatWhen(state.checkedAt)}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                Recent transactions
              </h3>
              {state.transactions.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  No recent transactions returned.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  {state.transactions.map((tx, idx) => (
                    <li
                      key={`${tx.createdAt ?? "t"}-${idx}`}
                      className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[100px_1fr_auto]"
                    >
                      <span className="font-semibold uppercase tracking-[0.04em] text-[var(--text-soft)]">
                        {tx.type}
                      </span>
                      <span className="min-w-0 text-[var(--heading)]">
                        <span className="block truncate">{tx.description}</span>
                        <span className="block text-xs text-[var(--text-soft)]">
                          {formatWhen(tx.createdAt)}
                          {tx.orderRefMasked
                            ? ` · ${tx.orderRefMasked}`
                            : ""}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums text-[var(--heading)] sm:text-right">
                        {formatAmount(tx.amount, tx.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}

        {state.kind === "idle" ? (
          <p className="text-sm text-[var(--text-muted)]">
            Status: NOT CHECKED / ON-DEMAND. Click refresh to load the current
            provider wallet.
          </p>
        ) : null}
      </div>
    </section>
  );
}
