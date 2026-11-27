"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PartnerEsimOrderCard from "@/app/components/partner/PartnerEsimOrderCard";
import {
  SANDBOX_ORDERS_KEY,
  type SandboxStoredOrder,
} from "@/app/lib/sandbox/sandboxClientStorage";
import { sandboxAuthHeaders } from "@/app/lib/sandbox/sandboxPurchaseClient";
import { sandboxOrderToPartnerRow } from "@/app/lib/sandbox/sandboxOrderPresentation";
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
        const res = await fetch("/api/sandbox/v1/orders", {
          headers: sandboxAuthHeaders(),
          credentials: "same-origin",
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
      } catch {
        /* fall back */
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
    <div className="space-y-6 [--heading:#f8fafc] [--surface:#0D1526] [--surface-2:#111827] [--text:#e2e8f0] [--text-muted:#94a3b8] [--text-soft:#64748b] [--border:rgba(255,255,255,0.08)] [--border-strong:rgba(255,255,255,0.12)] [--border-hover:rgba(255,255,255,0.18)] [--accent-strong:#84cc16]">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-50 sm:text-2xl">
            Orders
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            <span className="sm:hidden">Orders, QR, and share.</span>
            <span className="hidden sm:inline">
              Simulated Partner orders — QR, LPA, install, and share (no live
              provisioning).
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex h-9 w-fit items-center rounded-xl border border-white/[0.12] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.05] sm:h-10 sm:px-4"
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
        <ul className="space-y-3">
          {orders.map((row) => (
            <li key={row.orderId}>
              <PartnerEsimOrderCard
                row={sandboxOrderToPartnerRow(row)}
                refundRequest={null}
                variant="list"
                ordersBasePath="/sandbox/orders"
                enablePartnerSupport={false}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
