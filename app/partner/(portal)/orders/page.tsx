import Link from "next/link";
import PartnerEsimOrderCard from "@/app/components/partner/PartnerEsimOrderCard";
import PartnerOrdersTableClient from "@/app/components/partner/PartnerOrdersTableClient";
import {
  type PartnerRefundRequestCardState,
} from "@/app/components/partner/PartnerRefundRequestControls";
import { requireRole } from "@/app/lib/auth/session";
import { listPartnerOrdersPage } from "@/app/lib/partner/partnerOrders";
import { recoverPartnerOwnedStaleWalletHolds } from "@/app/lib/partner/partnerOwnedStaleHoldRecovery";
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
import { readAppDomain } from "@/app/lib/domain/readAppDomain";

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

function buildPartnerOrdersHref(page: number): string {
  if (page <= 1) return "/partner/orders";
  return `/partner/orders?page=${page}`;
}

export default async function PartnerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const user = await requireRole("PARTNER");
  const domain = await readAppDomain();
  const isRetail = domain === "retail";
  const params = await searchParams;

  // partneresim.com + sandbox only — never touch mapesim.com retail behavior.
  if (domain === "partner" || domain === "sandbox") {
    await recoverPartnerOwnedStaleWalletHolds(user.id).catch(() => undefined);
  }

  let data: Awaited<ReturnType<typeof listPartnerOrdersPage>>;
  try {
    data = await listPartnerOrdersPage(user.id, { page: params.page });
  } catch {
    return (
      <div
        className={
          isRetail
            ? "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
            : partnerCardClass
        }
        role="status"
      >
        <p
          className={
            isRetail
              ? "text-sm font-medium text-[var(--heading)]"
              : "text-sm font-medium text-slate-100"
          }
        >
          {PORTAL_UNAVAILABLE}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className={
          isRetail
            ? "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
            : partnerCardClass
        }
      >
        <p
          className={
            isRetail
              ? "text-sm font-medium text-[var(--heading)]"
              : "text-sm text-slate-100"
          }
        >
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  const refundMap: Record<string, PartnerRefundRequestCardState> = {};
  let refundByPurchase = new Map<
    string,
    NonNullable<PartnerRefundRequestCardState>
  >();
  try {
    const summaries = await listPartnerRefundRequestSummaries({
      partnerUserId: user.id,
      purchaseIds: data.orders.map((row) => row.purchaseId),
    });
    for (const row of data.orders) {
      const latest = latestPartnerRefundSummary(
        summaries.filter((s) => s.purchaseId === row.purchaseId)
      );
      if (latest) {
        const state = toPartnerRefundCardState(latest);
        refundMap[row.purchaseId] = state;
        refundByPurchase.set(row.purchaseId, state);
      }
    }
  } catch {
    /* ignore */
  }

  // mapesim.com — 6a9cf44 customer-style card list.
  if (isRetail) {
    return (
      <div className="min-w-0 space-y-8">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">My eSIMs</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Tap an eSIM to manage usage, QR install, and top-ups.
          </p>
        </header>

        <section className="min-w-0 space-y-3" aria-labelledby="orders-heading">
          <h2
            id="orders-heading"
            className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]"
          >
            Your eSIMs
          </h2>
          {data.orders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--text-muted)]">
              You have not purchased an eSIM yet.{" "}
              <Link
                href="/countries"
                className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
              >
                Browse destinations
              </Link>{" "}
              to find a plan.
            </p>
          ) : (
            <>
              <ul className="space-y-3">
                {data.orders.map((row) => (
                  <li key={row.orderId} className="min-w-0">
                    <PartnerEsimOrderCard
                      row={row}
                      refundRequest={
                        refundByPurchase.get(row.purchaseId) ?? null
                      }
                      variant="list"
                    />
                  </li>
                ))}
              </ul>
              {data.totalPages > 1 ? (
                <nav
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 pt-2 text-sm"
                  aria-label="Partner eSIM pages"
                >
                  <p className="text-[var(--text-muted)]">
                    Page {data.page} of {data.totalPages}
                    <span className="text-[var(--text-soft)]">
                      {" "}
                      · {data.totalMatched} total
                    </span>
                  </p>
                  <div className="flex gap-3">
                    {data.page > 1 ? (
                      <Link
                        href={buildPartnerOrdersHref(data.page - 1)}
                        className="font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
                      >
                        Previous
                      </Link>
                    ) : (
                      <span className="text-[var(--text-soft)]">Previous</span>
                    )}
                    {data.page < data.totalPages ? (
                      <Link
                        href={buildPartnerOrdersHref(data.page + 1)}
                        className="font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
                      >
                        Next
                      </Link>
                    ) : (
                      <span className="text-[var(--text-soft)]">Next</span>
                    )}
                  </div>
                </nav>
              ) : null}
            </>
          )}
        </section>
      </div>
    );
  }

  // partneresim.com — B2B table + performance tabs.
  const tab =
    (params.tab ?? "orders").trim().toLowerCase() === "performance"
      ? "performance"
      : "orders";

  let supportByOrder: Awaited<
    ReturnType<typeof mapLatestOrderSupportTicketsByOrderIds>
  > = {};
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            My eSIMs
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Search, filter, and manage Partner orders — QR, LPA, usage, and
            refunds.
          </p>
        </div>
        <Link
          href={buildHref({ tab, page: 1 })}
          className="inline-flex h-10 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.05]"
        >
          Refresh
        </Link>
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
