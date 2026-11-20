import Link from "next/link";
import PartnerEsimOrderCard from "@/app/components/partner/PartnerEsimOrderCard";
import {
  type PartnerRefundRequestCardState,
} from "@/app/components/partner/PartnerRefundRequestControls";
import { requireRole } from "@/app/lib/auth/session";
import { listPartnerOrdersPage } from "@/app/lib/partner/partnerOrders";
import {
  latestPartnerRefundSummary,
  listPartnerRefundRequestSummaries,
  toPartnerRefundCardState,
} from "@/app/lib/partner/partnerRefundRequest";
import { getPartnerGrowthSummary } from "@/app/lib/partner/partnerGrowth";
import { prisma } from "@/app/lib/db";
import { PartnerEsimPurchaseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const PORTAL_UNAVAILABLE =
  "Orders are temporarily unavailable. Please refresh shortly.";

function buildHref(options: {
  tab?: string;
  page?: number;
  q?: string;
  status?: string;
}): string {
  const params = new URLSearchParams();
  if (options.tab && options.tab !== "orders") params.set("tab", options.tab);
  if (options.q) params.set("q", options.q);
  if (options.status && options.status !== "ALL") {
    params.set("status", options.status);
  }
  if (options.page && options.page > 1) {
    params.set("page", String(options.page));
  }
  const qs = params.toString();
  return qs ? `/partner/orders?${qs}` : "/partner/orders";
}

export default async function PartnerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    tab?: string;
    q?: string;
    status?: string;
  }>;
}) {
  const user = await requireRole("PARTNER");
  const params = await searchParams;
  const tab = (params.tab ?? "orders").trim().toLowerCase() === "performance"
    ? "performance"
    : "orders";
  const q = (params.q ?? "").trim().toLowerCase();
  const statusFilter = (params.status ?? "ALL").trim().toUpperCase();

  let data: Awaited<ReturnType<typeof listPartnerOrdersPage>>;
  try {
    data = await listPartnerOrdersPage(user.id, { page: params.page });
  } catch {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-8" role="status">
        <p className="text-sm font-medium text-slate-100">{PORTAL_UNAVAILABLE}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-8">
        <p className="text-sm text-slate-100">Partner access is unavailable.</p>
      </div>
    );
  }

  let refundByPurchase = new Map<
    string,
    NonNullable<PartnerRefundRequestCardState>
  >();
  const purchaseIds = data.orders.map((row) => row.purchaseId);
  try {
    const summaries = await listPartnerRefundRequestSummaries({
      partnerUserId: user.id,
      purchaseIds,
    });
    for (const purchaseId of purchaseIds) {
      const latest = latestPartnerRefundSummary(
        summaries.filter((row) => row.purchaseId === purchaseId)
      );
      if (latest) {
        refundByPurchase.set(purchaseId, toPartnerRefundCardState(latest));
      }
    }
  } catch {
    refundByPurchase = new Map();
  }

  let orders = data.orders;
  if (q) {
    orders = orders.filter((row) => {
      const hay = `${row.orderId} ${row.iccid ?? ""} ${row.destination} ${row.planName}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (statusFilter !== "ALL") {
    orders = orders.filter((row) =>
      row.statusBadge.toUpperCase().includes(statusFilter)
    );
  }

  let performance: Awaited<ReturnType<typeof getPartnerGrowthSummary>> | null =
    null;
  let refundRateLabel = "—";
  if (tab === "performance") {
    try {
      performance = await getPartnerGrowthSummary({
        userId: user.id,
        period: "last30Days",
      });
      const actor = await prisma.user.findUnique({
        where: { id: user.id },
        select: { partnerProfile: { select: { id: true } } },
      });
      const partnerId = actor?.partnerProfile?.id;
      if (partnerId) {
        const [completed, refunded] = await Promise.all([
          prisma.partnerEsimPurchase.count({
            where: {
              partnerId,
              status: PartnerEsimPurchaseStatus.COMPLETED,
            },
          }),
          prisma.partnerEsimPurchase.count({
            where: {
              partnerId,
              status: PartnerEsimPurchaseStatus.FAILED_REFUNDED,
            },
          }),
        ]);
        const denom = completed + refunded;
        refundRateLabel =
          denom > 0
            ? `${((refunded / denom) * 100).toFixed(1)}%`
            : "0%";
      }
    } catch {
      performance = null;
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">Orders</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Search by Order ID, ICCID, country, or plan. Open an eSIM for QR, LPA,
          usage, and cancel/refund.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link
          href={buildHref({ tab: "orders", q: params.q, status: params.status })}
          className={`inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold ${
            tab === "orders"
              ? "bg-emerald-400 text-slate-950"
              : "border border-slate-700 text-slate-200"
          }`}
        >
          Orders
        </Link>
        <Link
          href={buildHref({ tab: "performance" })}
          className={`inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold ${
            tab === "performance"
              ? "bg-emerald-400 text-slate-950"
              : "border border-slate-700 text-slate-200"
          }`}
        >
          Performance
        </Link>
      </div>

      {tab === "performance" ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Total orders (30d)
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-50">
                {performance?.selected.completedOrders ?? "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Total spend USD
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-50">
                {performance?.selected.partnerSpendLabel ?? "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Refund rate
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-50">
                {refundRateLabel}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Savings
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-50">
                {performance?.selected.discountSavingsLabel ?? "—"}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="text-sm font-semibold text-slate-100">
              Top destinations
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {(performance?.topDestinations ?? []).slice(0, 5).map((row) => (
                <li key={row.key} className="flex justify-between gap-3">
                  <span>{row.label}</span>
                  <span className="tabular-nums text-emerald-300">
                    {row.purchaseCount} · {row.partnerSpendLabel}
                  </span>
                </li>
              ))}
              {(performance?.topDestinations?.length ?? 0) === 0 ? (
                <li className="text-slate-500">No completed purchases yet.</li>
              ) : null}
            </ul>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto]" method="get">
            <input type="hidden" name="tab" value="orders" />
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search Order ID, ICCID, country, plan"
              className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            />
            <select
              name="status"
              defaultValue={statusFilter}
              className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
            >
              <option value="ALL">All statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="ACTIVE">Active</option>
              <option value="REFUNDED">Refunded</option>
              <option value="EXPIRED">Expired</option>
            </select>
            <button
              type="submit"
              className="h-11 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-100"
            >
              Filter
            </button>
          </form>

          {orders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-400">
              No orders match.{" "}
              <Link href="/partner/catalog" className="font-semibold text-emerald-300">
                Browse the catalog
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-3">
              {orders.map((row) => (
                <li key={row.orderId} className="min-w-0">
                  <PartnerEsimOrderCard
                    row={row}
                    refundRequest={refundByPurchase.get(row.purchaseId) ?? null}
                    variant="list"
                  />
                </li>
              ))}
            </ul>
          )}

          {data.totalPages > 1 ? (
            <nav className="flex flex-wrap gap-3 text-sm" aria-label="Orders pages">
              {data.page > 1 ? (
                <Link
                  href={buildHref({
                    tab: "orders",
                    page: data.page - 1,
                    q: params.q,
                    status: params.status,
                  })}
                  className="font-semibold text-emerald-300"
                >
                  Previous
                </Link>
              ) : null}
              <span className="text-slate-400">
                Page {data.page} of {data.totalPages}
              </span>
              {data.page < data.totalPages ? (
                <Link
                  href={buildHref({
                    tab: "orders",
                    page: data.page + 1,
                    q: params.q,
                    status: params.status,
                  })}
                  className="font-semibold text-emerald-300"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      )}
    </div>
  );
}
