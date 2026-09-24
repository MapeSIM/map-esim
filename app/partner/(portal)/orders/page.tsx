import Link from "next/link";
import PartnerEsimOrderCard from "@/app/components/partner/PartnerEsimOrderCard";
import {
  type PartnerRefundRequestCardState,
} from "@/app/components/partner/PartnerRefundRequestControls";
import {
  partnerCardClass,
  partnerSectionLabelClass,
} from "@/app/components/partner/partnerPortalUi";
import { requireRole } from "@/app/lib/auth/session";
import { listPartnerOrdersPage } from "@/app/lib/partner/partnerOrders";
import {
  latestPartnerRefundSummary,
  listPartnerRefundRequestSummaries,
  toPartnerRefundCardState,
} from "@/app/lib/partner/partnerRefundRequest";

export const dynamic = "force-dynamic";

const PORTAL_UNAVAILABLE =
  "Orders are temporarily unavailable. Please refresh shortly.";

function buildPartnerOrdersHref(page: number): string {
  if (page <= 1) return "/partner/orders";
  return `/partner/orders?page=${page}`;
}

export default async function PartnerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireRole("PARTNER");
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof listPartnerOrdersPage>>;
  try {
    data = await listPartnerOrdersPage(user.id, { page: params.page });
  } catch {
    return (
      <div className={`${partnerCardClass} px-5 py-8`} role="status">
        <p className="text-sm font-medium text-[var(--heading)]">
          {PORTAL_UNAVAILABLE}
        </p>
      </div>
    );
  }

  let refundByPurchase = new Map<
    string,
    NonNullable<PartnerRefundRequestCardState>
  >();
  if (data) {
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
  }

  if (!data) {
    return (
      <div className={`${partnerCardClass} px-5 py-8`} role="status">
        <p className="text-sm font-medium text-[var(--heading)]">
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">My eSIMs</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Your purchased Partner eSIMs. Open an eSIM to install or check usage.
        </p>
      </header>

      <section className="min-w-0 space-y-3" aria-labelledby="orders-heading">
        <h2 id="orders-heading" className={partnerSectionLabelClass}>
          Completed orders
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
                    refundRequest={refundByPurchase.get(row.purchaseId) ?? null}
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
