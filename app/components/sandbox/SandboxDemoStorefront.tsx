"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  generateSandboxTestKey,
  SANDBOX_CATALOG,
  SANDBOX_DEFAULT_BALANCE_CENTS,
  type SandboxCatalogItem,
} from "@/app/lib/sandbox/sandboxShared";
import {
  readSandboxShareBranding,
  type SandboxShareBranding,
  SANDBOX_DEFAULT_BRANDING,
} from "@/app/lib/sandbox/sandboxClientStorage";

const WALLET_KEY = "mapesim_sandbox_wallet_cents";
const ORDERS_KEY = "mapesim_sandbox_demo_orders";

type DemoOrder = {
  orderId: string;
  planName: string;
  region: string;
  totalCents: number;
  iccid: string;
  activationCode: string;
  createdAt: string;
};

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function MockQrMark({ label, code }: { label: string; code: string }) {
  return (
    <div
      className="flex aspect-square w-full max-w-[11rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-500/40 bg-slate-950 p-4"
      role="img"
      aria-label={`Mock QR for ${label}`}
      title={code}
    >
      <svg
        viewBox="0 0 48 48"
        className="h-20 w-20 text-emerald-400"
        aria-hidden
      >
        <rect x="4" y="4" width="14" height="14" fill="currentColor" opacity="0.9" />
        <rect x="30" y="4" width="14" height="14" fill="currentColor" opacity="0.9" />
        <rect x="4" y="30" width="14" height="14" fill="currentColor" opacity="0.9" />
        <rect x="22" y="22" width="6" height="6" fill="currentColor" />
        <rect x="30" y="30" width="4" height="4" fill="currentColor" opacity="0.7" />
        <rect x="36" y="36" width="8" height="8" fill="currentColor" opacity="0.85" />
      </svg>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Mock QR
      </span>
    </div>
  );
}

export default function SandboxDemoStorefront() {
  const [balanceCents, setBalanceCents] = useState(SANDBOX_DEFAULT_BALANCE_CENTS);
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKey] = useState(() => generateSandboxTestKey());
  const [hydrated, setHydrated] = useState(false);
  const [branding, setBranding] = useState<SandboxShareBranding>(
    SANDBOX_DEFAULT_BRANDING
  );

  useEffect(() => {
    try {
      const rawBal = localStorage.getItem(WALLET_KEY);
      if (rawBal != null && Number.isFinite(Number(rawBal))) {
        setBalanceCents(Number(rawBal));
      } else {
        localStorage.setItem(WALLET_KEY, String(SANDBOX_DEFAULT_BALANCE_CENTS));
      }
      const rawOrders = localStorage.getItem(ORDERS_KEY);
      if (rawOrders) {
        const parsed = JSON.parse(rawOrders) as DemoOrder[];
        if (Array.isArray(parsed)) setOrders(parsed);
      }
      setBranding(readSandboxShareBranding());
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((nextBal: number, nextOrders: DemoOrder[]) => {
    setBalanceCents(nextBal);
    setOrders(nextOrders);
    try {
      localStorage.setItem(WALLET_KEY, String(nextBal));
      localStorage.setItem(ORDERS_KEY, JSON.stringify(nextOrders));
    } catch {
      /* ignore */
    }
  }, []);

  async function buy(item: SandboxCatalogItem) {
    setError(null);
    if (balanceCents < item.priceCents) {
      setError("Insufficient mock wallet balance. Reset the wallet to try again.");
      return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch("/api/sandbox/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ offerId: item.id, quantity: 1 }),
      });
      const data = (await res.json()) as {
        success?: boolean;
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
      const nextBal = balanceCents - data.order.totalCents;
      const nextOrders: DemoOrder[] = [
        {
          orderId: data.order.orderId,
          planName: data.order.planName,
          region: data.order.region,
          totalCents: data.order.totalCents,
          iccid: data.order.iccid,
          activationCode: data.order.activationCode,
          createdAt: data.order.createdAt,
        },
        ...orders,
      ].slice(0, 12);
      persist(nextBal, nextOrders);
    } catch {
      setError("Network error calling sandbox API.");
    } finally {
      setBusyId(null);
    }
  }

  function resetWallet() {
    persist(SANDBOX_DEFAULT_BALANCE_CENTS, []);
    setError(null);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">
          White-label preview
        </p>
        <h1 className="text-2xl font-bold text-slate-50 sm:text-3xl">
          Demo Partner Store
        </h1>
        <p className="max-w-xl text-sm text-slate-400">
          Simulate a customer purchase against{" "}
          <code className="text-emerald-300">POST /api/sandbox/v1/orders</code>.
          Balance lives in localStorage — never Neon.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-emerald-500/15 to-transparent px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            Mock partner balance
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-300">
            {hydrated ? formatUsd(balanceCents) : "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            Sandbox · not live
          </span>
          <button
            type="button"
            onClick={resetWallet}
            className="rounded-full border border-white/[0.12] px-3 py-1 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05]"
          >
            Reset wallet
          </button>
        </div>
      </div>

      {error ? (
        <p
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SANDBOX_CATALOG.map((plan) => (
          <article
            key={plan.id}
            className="flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"
          >
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
              disabled={busyId === plan.id || !hydrated}
              onClick={() => void buy(plan)}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
            >
              {busyId === plan.id ? "Provisioning…" : "Buy with mock wallet"}
            </button>
          </article>
        ))}
      </div>

      {orders.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-50">
            Issued mock eSIMs
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {orders.map((ord) => (
              <li
                key={ord.orderId}
                className="flex gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"
              >
                <MockQrMark label={ord.planName} code={ord.activationCode} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-slate-50">
                    {ord.region} · {ord.planName}
                  </p>
                  <p className="text-xs text-slate-500">{ord.orderId}</p>
                  <p className="truncate font-mono text-[11px] text-emerald-300/90">
                    ICCID {ord.iccid}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatUsd(ord.totalCents)} · {branding.companyName}
                  </p>
                  <Link
                    href="/sandbox/share/preview"
                    className="mt-2 inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-bold"
                    style={{
                      backgroundColor: branding.buttonBackground,
                      color: branding.buttonTextColor,
                    }}
                  >
                    Install eSIM
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-sm text-slate-500">
        <Link
          href="/sandbox"
          className="font-semibold text-emerald-400 hover:text-emerald-300"
        >
          ← Back to sandbox overview
        </Link>
      </p>
    </div>
  );
}
