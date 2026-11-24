"use client";

import { useEffect, useState } from "react";
import { SANDBOX_DEFAULT_BALANCE_CENTS } from "@/app/lib/sandbox/sandboxShared";
import {
  SANDBOX_TX_KEY,
  SANDBOX_WALLET_KEY,
  type SandboxWalletTx,
} from "@/app/lib/sandbox/sandboxClientStorage";
import {
  readSandboxApiKey,
  refreshSandboxWalletCache,
} from "@/app/lib/sandbox/sandboxPurchaseClient";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";

const PRESETS = [100, 250, 500, 750, 1000] as const;

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function SandboxWalletClient() {
  const [balanceCents, setBalanceCents] = useState(SANDBOX_DEFAULT_BALANCE_CENTS);
  const [txs, setTxs] = useState<SandboxWalletTx[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedUsd, setSelectedUsd] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  async function reloadWallet() {
    const key = readSandboxApiKey();
    setHasApiKey(Boolean(key));
    if (key) {
      const cents = await refreshSandboxWalletCache();
      if (typeof cents === "number") {
        setBalanceCents(cents);
      }
      try {
        const rawTx = localStorage.getItem(SANDBOX_TX_KEY);
        const parsed = rawTx ? (JSON.parse(rawTx) as SandboxWalletTx[]) : [];
        setTxs(Array.isArray(parsed) ? parsed : []);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const bal = localStorage.getItem(SANDBOX_WALLET_KEY);
      setBalanceCents(
        bal != null && Number.isFinite(Number(bal))
          ? Number(bal)
          : SANDBOX_DEFAULT_BALANCE_CENTS
      );
      const rawTx = localStorage.getItem(SANDBOX_TX_KEY);
      const parsed = rawTx ? (JSON.parse(rawTx) as SandboxWalletTx[]) : [];
      setTxs(Array.isArray(parsed) ? parsed : []);
    } catch {
      setBalanceCents(SANDBOX_DEFAULT_BALANCE_CENTS);
      setTxs([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await reloadWallet();
      if (!cancelled) setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only hydrate
  }, []);

  async function confirmTopUp() {
    if (selectedUsd == null || busy) return;
    const usd = selectedUsd;
    const key = readSandboxApiKey();
    if (!key) {
      setError(
        "Sandbox API key required. Use a provisioned sandbox session — local preview top-ups are disabled to avoid unexpected balance changes."
      );
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/sandbox/v1/wallet", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amountUsd: usd }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as {
        wallet?: { balanceCents?: number };
        transactions?: SandboxWalletTx[];
        message?: string;
      } | null;
      if (!res.ok) {
        setError(data?.message || "Top-up could not be completed.");
        return;
      }
      const cents = data?.wallet?.balanceCents;
      if (typeof cents === "number") {
        setBalanceCents(cents);
        try {
          localStorage.setItem(SANDBOX_WALLET_KEY, String(cents));
        } catch {
          /* ignore */
        }
      } else {
        await reloadWallet();
      }
      if (Array.isArray(data?.transactions)) {
        setTxs(data.transactions);
        try {
          localStorage.setItem(SANDBOX_TX_KEY, JSON.stringify(data.transactions));
        } catch {
          /* ignore */
        }
      }
      setMessage(`Added $${usd} to your sandbox wallet.`);
      setSelectedUsd(null);
    } catch {
      setError("Top-up is temporarily unavailable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-50">Wallet</h1>
        <p className="mt-1 text-sm text-slate-400">
          Prepaid USD balance for wholesale eSIM purchases.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 via-[#0D1526] to-[#0D1526] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300/80">
          Available balance
        </p>
        <p className="mt-2 text-4xl font-bold tracking-tight text-slate-50 tabular-nums">
          {ready ? formatUsd(balanceCents) : "—"}
        </p>
        <p className="mt-1 text-sm text-slate-400">USD</p>
      </div>

      <section className={partnerCardClass + " space-y-4"}>
        <div>
          <h2 className="text-lg font-semibold text-slate-50">+ Add Funds</h2>
          <p className="mt-1 text-sm text-slate-400">
            Select an amount, then confirm. Balance only changes after a
            confirmed top-up
            {hasApiKey ? " to your Neon sandbox wallet." : "."}
          </p>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Top-up amounts"
        >
          {PRESETS.map((usd) => {
            const active = selectedUsd === usd;
            return (
              <button
                key={usd}
                type="button"
                aria-pressed={active}
                disabled={busy}
                onClick={() => {
                  setSelectedUsd(usd);
                  setError(null);
                  setMessage(null);
                }}
                className={
                  active
                    ? "inline-flex h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-60"
                    : "inline-flex h-10 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100 hover:border-emerald-500/40 hover:bg-emerald-500/10 disabled:opacity-60"
                }
              >
                ${usd}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            disabled={busy || selectedUsd == null}
            onClick={() => void confirmTopUp()}
            className="inline-flex h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? "Adding…"
              : selectedUsd != null
                ? `Confirm · Add $${selectedUsd}`
                : "Select an amount"}
          </button>
          {selectedUsd != null && !busy ? (
            <button
              type="button"
              onClick={() => setSelectedUsd(null)}
              className="text-sm font-semibold text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          ) : null}
        </div>
        {message ? (
          <p className="text-sm text-emerald-300" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-50">
          Transaction history
        </h2>
        {txs.length === 0 ? (
          <div className={partnerCardClass}>
            <p className="text-sm text-slate-400">No transactions yet.</p>
          </div>
        ) : (
          <ul className={`${partnerCardClass} divide-y divide-white/[0.06] !p-0`}>
            {txs.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-100">{tx.label}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(tx.createdAt).toLocaleString()}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    tx.kind === "credit" ? "text-emerald-300" : "text-slate-200"
                  }`}
                >
                  {tx.kind === "credit" ? "+" : ""}
                  {formatUsd(Math.abs(tx.amountCents))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
