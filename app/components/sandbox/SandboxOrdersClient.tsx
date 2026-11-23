"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  SANDBOX_ORDERS_KEY,
  type SandboxStoredOrder,
} from "@/app/lib/sandbox/sandboxClientStorage";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function SandboxOrdersClient({
  tab,
}: {
  tab: "orders" | "performance";
}) {
  const [orders, setOrders] = useState<SandboxStoredOrder[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const key = localStorage.getItem("mapesim_sandbox_api_key");
        if (key) {
          const res = await fetch("/api/sandbox/v1/orders", {
            headers: { Authorization: `Bearer ${key}` },
            cache: "no-store",
          });
          if (res.ok) {
            const data = (await res.json()) as {
              orders?: Array<{
                orderId: string;
                planName: string;
                region: string;
                totalCents: number;
                iccid?: string;
                activationCode?: string;
                createdAt: string;
                status?: string;
              }>;
            };
            const mapped: SandboxStoredOrder[] = (data.orders ?? []).map(
              (o) => ({
                orderId: o.orderId,
                planName: o.planName,
                region: o.region,
                totalCents: o.totalCents,
                iccid: o.iccid ?? "",
                activationCode: o.activationCode ?? "",
                createdAt: o.createdAt,
                status: "COMPLETED",
              })
            );
            if (!cancelled) {
              setOrders(mapped);
              try {
                localStorage.setItem(SANDBOX_ORDERS_KEY, JSON.stringify(mapped));
              } catch {
                /* ignore */
              }
            }
            return;
          }
        }
      } catch {
        /* fall back to local cache */
      }
      try {
        const raw = localStorage.getItem(SANDBOX_ORDERS_KEY);
        const parsed = raw ? (JSON.parse(raw) as SandboxStoredOrder[]) : [];
        if (!cancelled) setOrders(Array.isArray(parsed) ? parsed : []);
      } catch {
        if (!cancelled) setOrders([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const spend = orders.reduce((s, o) => s + o.totalCents, 0);
    return {
      count: orders.length,
      spendLabel: formatUsd(spend),
      avgLabel: orders.length
        ? formatUsd(Math.round(spend / orders.length))
        : "$0.00",
    };
  }, [orders]);

  function refresh() {
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">My eSIMs</h1>
          <p className="mt-1 text-sm text-slate-400">
            Search, filter, and manage Partner orders — QR, LPA, usage, and
            refunds.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex h-10 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.05]"
        >
          Refresh
        </button>
      </header>

      <div className="flex gap-1 border-b border-white/[0.08]">
        <Link
          href="/sandbox/orders"
          className={`relative inline-flex h-10 items-center px-3 text-sm font-medium ${
            tab === "orders" ? "text-emerald-300" : "text-slate-400"
          }`}
        >
          Orders
          {tab === "orders" ? (
            <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-emerald-400" />
          ) : null}
        </Link>
        <Link
          href="/sandbox/orders?tab=performance"
          className={`relative inline-flex h-10 items-center px-3 text-sm font-medium ${
            tab === "performance" ? "text-emerald-300" : "text-slate-400"
          }`}
        >
          Performance
          {tab === "performance" ? (
            <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-emerald-400" />
          ) : null}
        </Link>
      </div>

      {tab === "performance" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Total orders", value: String(stats.count) },
            { label: "Total spend USD", value: stats.spendLabel },
            { label: "Avg ticket", value: stats.avgLabel },
          ].map((kpi) => (
            <div key={kpi.label} className={partnerCardClass}>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                {kpi.label}
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-50">
                {kpi.value}
              </p>
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className={partnerCardClass}>
          <p className="text-sm text-slate-400">
            No orders yet.{" "}
            <Link
              href="/sandbox/catalog"
              className="font-semibold text-emerald-300"
            >
              Browse the catalog
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className={`${partnerCardClass} divide-y divide-white/[0.06] !p-0`}>
          {orders.map((row) => (
            <li
              key={row.orderId}
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100">
                  {row.region} · {row.planName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {new Date(row.createdAt).toLocaleString()} ·{" "}
                  {formatUsd(row.totalCents)}
                </p>
                <p className="mt-1 font-mono text-[11px] text-emerald-300/90">
                  {row.iccid}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/sandbox/share/preview"
                  className="rounded-full border border-white/[0.12] px-2.5 py-0.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.05]"
                >
                  Share QR
                </Link>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                  {row.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
