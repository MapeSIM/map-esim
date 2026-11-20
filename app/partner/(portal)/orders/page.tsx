import Link from "next/link";
import PartnerOrdersTableClient from "@/app/components/partner/PartnerOrdersTableClient";
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
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";
import { mapLatestOrderSupportTicketsByOrderIds } from "@/app/lib/support/orderSupportTicket";

export const dynamic = "force-dynamic";

const PORTAL_UNAVAILABLE =
  "Orders are temporarily unavailable. Please refresh shortly.";

function buildHref(options: { tab?: string; page?: number }): string {
  const params = new URLSearchParams();
  if (options.tab && options.tab !== "orders") params.set("tab", options.tab);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  const qs = params.toString();
  return qs ? `/partner/orders?${qs}` : "/partner/orders";
}

export default async function PartnerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const user = await requireRole("PARTNER");
  const params = await searchParams;
  const tab =
    (params.tab ?? "orders").trim().toLowerCase() === "performance"
      ? "performance"
      : "orders";

  let data: Awaited<ReturnType<typeof listPartnerOrdersPage>>;
  try {
    data = await listPartnerOrdersPage(user.id, { page: params.page });
  } catch {
    return (
      <div className={partnerCardClass} role="status">
        <p className="text-sm font-medium text-slate-100">{PORTAL_UNAVAILABLE}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={partnerCardClass}>
        <p className="text-sm text-slate-100">Partner access is unavailable.</p>
      </div>
    );
  }

  const refundMap: Record<string, PartnerRefundRequestCardState> = {};
  let supportByOrder: Awaited<
    ReturnType<typeof mapLatestOrderSupportTicketsByOrderIds>
  > = {};
  try {
    const summaries = await listPartnerRefundRequestSummaries({
      partnerUserId: user.id,
      purchaseIds: data.orders.map((row) => row.purchaseId),
    });
    for (const row of data.orders) {
      const latest = latestPartnerRefundSummary(
        summaries.filter((s) => s.purchaseId === row.purchaseId)
      );
      if (latest) refundMap[row.purchaseId] = toPartnerRefundCardState(latest);
    }
  } catch {
    /* ignore */
  }
  try {
    supportByOrder = await mapLatestOrderSupportTicketsByOrderIds(
      data.orders.map((row) => row.orderId)
    );
  } catch {
    supportByOrder = {};
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
          denom > 0 ? `${((refunded / denom) * 100).toFixed(1)}%` : "0%";
      }
    } catch {
      performance = null;
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Orders
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Search, copy ICCIDs, open the drawer for QR / LPA / usage / refund.
        </p>
      </header>

      <div className="flex gap-1 border-b border-white/[0.06]">
        <Link
          href={buildHref({ tab: "orders" })}
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
          href={buildHref({ tab: "performance" })}
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
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Total orders (30d)",
                value: performance?.selected.completedOrders ?? "—",
              },
              {
                label: "Total spend USD",
                value: performance?.selected.partnerSpendLabel ?? "—",
              },
              { label: "Refund rate", value: refundRateLabel },
              {
                label: "Savings",
                value: performance?.selected.discountSavingsLabel ?? "—",
              },
            ].map((kpi) => (
              <div key={kpi.label} className={partnerCardClass + " !p-4"}>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  {kpi.label}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-slate-50">
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
          <div className={partnerCardClass}>
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
          <PartnerOrdersTableClient
            orders={data.orders}
            refundByPurchase={refundMap}
            supportByOrder={supportByOrder}
          />
          {data.totalPages > 1 ? (
            <nav
              className="flex flex-wrap gap-3 text-sm"
              aria-label="Orders pages"
            >
              {data.page > 1 ? (
                <Link
                  href={buildHref({ tab: "orders", page: data.page - 1 })}
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
                  href={buildHref({ tab: "orders", page: data.page + 1 })}
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
