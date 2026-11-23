"use client";

import { useCallback, useEffect, useState } from "react";
import {
  generateSandboxTestKey,
  SANDBOX_CATALOG,
  SANDBOX_DEFAULT_BALANCE_CENTS,
  type SandboxCatalogItem,
} from "@/app/lib/sandbox/sandboxShared";
import {
  SANDBOX_API_KEY_KEY,
  SANDBOX_ORDERS_KEY,
  SANDBOX_TX_KEY,
  SANDBOX_WALLET_KEY,
  type SandboxStoredOrder,
  type SandboxWalletTx,
} from "@/app/lib/sandbox/sandboxClientStorage";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function SandboxCatalogClient() {
  const [balanceCents, setBalanceCents] = useState(SANDBOX_DEFAULT_BALANCE_CENTS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<SandboxStoredOrder | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const bal = localStorage.getItem(SANDBOX_WALLET_KEY);
      setBalanceCents(
        bal != null && Number.isFinite(Number(bal))
          ? Number(bal)
          : SANDBOX_DEFAULT_BALANCE_CENTS
      );
      let key = localStorage.getItem(SANDBOX_API_KEY_KEY);
      if (!key || !key.startsWith("sb_test_")) {
        key = generateSandboxTestKey();
        localStorage.setItem(SANDBOX_API_KEY_KEY, key);
      }
      setApiKey(key);
    } catch {
      setApiKey(generateSandboxTestKey());
    }
    setReady(true);
  }, []);

  const persistBuy = useCallback(
    (nextBal: number, order: SandboxStoredOrder) => {
      setBalanceCents(nextBal);
      setLastOrder(order);
      try {
        localStorage.setItem(SANDBOX_WALLET_KEY, String(nextBal));
        const prev = JSON.parse(
          localStorage.getItem(SANDBOX_ORDERS_KEY) || "[]"
        ) as SandboxStoredOrder[];
        const nextOrders = [order, ...(Array.isArray(prev) ? prev : [])].slice(
          0,
          40
        );
        localStorage.setItem(SANDBOX_ORDERS_KEY, JSON.stringify(nextOrders));
        const txs = JSON.parse(
          localStorage.getItem(SANDBOX_TX_KEY) || "[]"
        ) as SandboxWalletTx[];
        const tx: SandboxWalletTx = {
          id: `tx_${order.orderId}`,
          label: `Purchase · ${order.planName}`,
          amountCents: -order.totalCents,
          createdAt: order.createdAt,
          kind: "debit",
        };
        localStorage.setItem(
          SANDBOX_TX_KEY,
          JSON.stringify([tx, ...(Array.isArray(txs) ? txs : [])].slice(0, 50))
        );
      } catch {
        /* ignore */
      }
    },
    []
  );

  async function buy(item: SandboxCatalogItem) {
    setError(null);
    if (balanceCents < item.priceCents) {
      setError("Insufficient mock balance. Top up on Wallet (sandbox).");
      return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch("/api/sandbox/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ offerId: item.id, quantity: 1 }),
      });
      const data = (await res.json()) as {
        message?: string;
        order?: {
          orderId: string;
          planName: string;
          region: string;
          totalCents: number;
          iccid: string;
          activationCode: string;
          createdAt: string;
        };
      };
      if (!res.ok || !data.order) {
        setError(data.message || "Mock purchase failed.");
        return;
      }
      const order: SandboxStoredOrder = {
        orderId: data.order.orderId,
        planName: data.order.planName,
        region: data.order.region,
        totalCents: data.order.totalCents,
        iccid: data.order.iccid,
        activationCode: data.order.activationCode,
        createdAt: data.order.createdAt,
        status: "COMPLETED",
      };
      persistBuy(balanceCents - data.order.totalCents, order);
    } catch {
      setError("Network error calling sandbox API.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Catalog</h1>
          <p className="mt-1 text-sm text-slate-400">
            Mock destinations — buy debits localStorage only via{" "}
            <code className="text-emerald-300">POST /api/sandbox/v1/orders</code>
            .
          </p>
        </div>
        <p className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-semibold tabular-nums text-emerald-300">
          {ready ? formatUsd(balanceCents) : "—"}
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SANDBOX_CATALOG.map((plan) => (
          <article key={plan.id} className={partnerCardClass + " flex flex-col"}>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              {plan.region}
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-50">
              {plan.name}
            </h2>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-300">
              {formatUsd(plan.priceCents)}
            </p>
            <button
              type="button"
              disabled={!ready || busyId === plan.id}
              onClick={() => void buy(plan)}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {busyId === plan.id ? "Issuing…" : "Buy (sandbox)"}
            </button>
          </article>
        ))}
      </div>

      {lastOrder ? (
        <section className={partnerCardClass + " space-y-2"}>
          <h2 className="text-lg font-semibold text-slate-50">
            Latest mock eSIM
          </h2>
          <p className="text-sm text-slate-300">
            {lastOrder.region} · {lastOrder.planName}
          </p>
          <p className="font-mono text-xs text-emerald-300">
            ICCID {lastOrder.iccid}
          </p>
          <p className="break-all font-mono text-[11px] text-slate-400">
            {lastOrder.activationCode}
          </p>
        </section>
      ) : null}
    </div>
  );
}
