"use client";

import { useMemo, useState } from "react";
import { Copy, Check, X } from "lucide-react";
import PartnerEsimOrderCard from "@/app/components/partner/PartnerEsimOrderCard";
import type { PartnerRefundRequestCardState } from "@/app/components/partner/PartnerRefundRequestControls";
import type { PartnerOrderListRow } from "@/app/lib/partner/partnerOrders";
import type { OrderSupportTicketSummary } from "@/app/lib/support/orderSupportTicket";
import {
  partnerCardClass,
  partnerFieldClass,
  partnerStatusBadgeClass,
} from "@/app/components/partner/partnerPortalUi";

function CopyIccid({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-slate-300 hover:bg-white/[0.04]"
      title="Copy ICCID"
    >
      <span className="max-w-[9rem] truncate">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3 opacity-60" />
      )}
    </button>
  );
}

export default function PartnerOrdersTableClient({
  orders,
  refundByPurchase,
  supportByOrder = {},
}: {
  orders: PartnerOrderListRow[];
  refundByPurchase: Record<string, PartnerRefundRequestCardState>;
  supportByOrder?: Record<string, OrderSupportTicketSummary>;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const now = Date.now();
    return orders.filter((row) => {
      if (status !== "ALL" && !row.statusBadge.toUpperCase().includes(status)) {
        return false;
      }
      if (typeFilter === "ESIM" && row.isAddDataPurchase) return false;
      if (typeFilter === "TOPUP" && !row.isAddDataPurchase) return false;
      if (dateFilter !== "ALL") {
        const ts = Date.parse(row.purchasedAtLabel || "");
        if (Number.isFinite(ts)) {
          const days = (now - ts) / 86_400_000;
          if (dateFilter === "7" && days > 7) return false;
          if (dateFilter === "30" && days > 30) return false;
          if (dateFilter === "90" && days > 90) return false;
        }
      }
      if (!needle) return true;
      const hay =
        `${row.orderId} ${row.iccid ?? ""} ${row.destination} ${row.planName}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [orders, q, status, typeFilter, dateFilter]);

  const selected = selectedId
    ? orders.find((o) => o.orderId === selectedId) ?? null
    : null;

  return (
    <>
      <div className={partnerCardClass + " space-y-3 !p-4"}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Order ID, ICCID, country, plan…"
            className={`${partnerFieldClass} !mt-0 sm:col-span-2 lg:col-span-1`}
            aria-label="Search orders"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`${partnerFieldClass} !mt-0`}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="ACTIVE">Active</option>
            <option value="REFUNDED">Refunded</option>
            <option value="EXPIRED">Expired</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={`${partnerFieldClass} !mt-0`}
            aria-label="Filter by type"
          >
            <option value="ALL">All types</option>
            <option value="ESIM">eSIM</option>
            <option value="TOPUP">Top-up</option>
          </select>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className={`${partnerFieldClass} !mt-0`}
            aria-label="Filter by date"
          >
            <option value="ALL">All dates</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
        <p className="text-xs text-slate-500">
          {filtered.length} order{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/[0.1] px-4 py-8 text-sm text-slate-400">
          No orders match.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D1526]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">ICCID</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Debit</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.orderId}
                    className="border-t border-white/[0.05] hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-100">
                        {row.destination}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.purchasedAtLabel}
                      </p>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-slate-300">
                      {row.planName}
                    </td>
                    <td className="px-4 py-3">
                      {row.iccid ? (
                        <CopyIccid value={row.iccid} />
                      ) : (
                        <span className="text-xs text-slate-500">
                          {row.iccidMasked}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${partnerStatusBadgeClass(row.statusBadge)}`}
                      >
                        {row.statusBadge}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-200">
                      {row.partnerDebitLabel}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.orderId)}
                        className="inline-flex h-8 items-center rounded-lg bg-emerald-500 px-3 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close drawer"
            onClick={() => setSelectedId(null)}
          />
          <aside
            className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-white/[0.1] bg-[#070D19] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Order details"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-50">
                  {selected.destination}
                </p>
                <p className="text-xs text-slate-500">{selected.planName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] text-slate-300 hover:bg-white/[0.04]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <PartnerEsimOrderCard
                row={selected}
                refundRequest={refundByPurchase[selected.purchaseId] ?? null}
                supportTicket={supportByOrder[selected.orderId] ?? null}
                variant="detail"
              />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
