"use client";

import { useEffect, useState } from "react";
import { SANDBOX_DEFAULT_BALANCE_CENTS } from "@/app/lib/sandbox/sandboxShared";
import {
  SANDBOX_TX_KEY,
  SANDBOX_WALLET_KEY,
  type SandboxWalletTx,
} from "@/app/lib/sandbox/sandboxClientStorage";
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

  useEffect(() => {
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
      /* ignore */
    }
    setReady(true);
  }, []);

  function credit(usd: number) {
    const cents = usd * 100;
    const next = balanceCents + cents;
    const tx: SandboxWalletTx = {
      id: `tx_credit_${Date.now()}`,
      label: `Add Funds · $${usd}`,
      amountCents: cents,
      createdAt: new Date().toISOString(),
      kind: "credit",
    };
    const nextTxs = [tx, ...txs].slice(0, 50);
    setBalanceCents(next);
    setTxs(nextTxs);
    try {
      localStorage.setItem(SANDBOX_WALLET_KEY, String(next));
      localStorage.setItem(SANDBOX_TX_KEY, JSON.stringify(nextTxs));
    } catch {
      /* ignore */
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
        <h2 className="text-lg font-semibold text-slate-50">+ Add Funds</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((usd) => (
            <button
              key={usd}
              type="button"
              onClick={() => credit(usd)}
              className="inline-flex h-10 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100 hover:border-emerald-500/40 hover:bg-emerald-500/10"
            >
              ${usd}
            </button>
          ))}
        </div>
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
                <div>
                  <p className="text-sm text-slate-100">{tx.label}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(tx.createdAt).toLocaleString()}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold tabular-nums ${
                    tx.kind === "credit" ? "text-emerald-300" : "text-slate-200"
                  }`}
                >
                  {tx.kind === "credit" ? "+" : ""}
                  {formatUsd(tx.amountCents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
