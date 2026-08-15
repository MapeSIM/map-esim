import Image from "next/image";
import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import {
  listPartnerOrdersPage,
  type PartnerAttentionRow,
  type PartnerOrderListRow,
} from "@/app/lib/partner/partnerOrders";
import type { PartnerOrderStatusBadge } from "@/app/lib/partner/partnerOrdersDisplay";

export const dynamic = "force-dynamic";

const PORTAL_UNAVAILABLE =
  "Orders are temporarily unavailable. Please refresh shortly.";

function statusBadgeClass(status: PartnerOrderStatusBadge): string {
  switch (status) {
    case "Completed":
      return "bg-[var(--accent)]/15 text-[var(--heading)] border-[var(--accent-strong)]/40";
    case "Processing":
      return "bg-[var(--surface)] text-[var(--text)] border-[var(--border-hover)]";
    case "Under review":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Failed — balance returned":
      return "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]";
    default:
      return "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]";
  }
}

function OrderCard({ row }: { row: PartnerOrderListRow }) {
  return (
    <li className="min-w-0">
      <Link
        href={`/partner/orders/${encodeURIComponent(row.orderId)}`}
        className="block min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        <div className="flex min-w-0 items-start gap-3">
          {row.flagUrl ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              <Image
                src={row.flagUrl}
                alt=""
                width={40}
                height={30}
                className="h-6 w-auto object-cover"
                unoptimized
              />
            </div>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-[var(--heading)]">
                {row.destination}
              </p>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.statusBadge)}`}
              >
                {row.statusBadge}
              </span>
            </div>
            <p className="truncate text-sm text-[var(--text-muted)]">
              {row.planName}
            </p>
            <dl className="grid gap-1 text-xs text-[var(--text-muted)] sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="inline text-[var(--text-soft)]">Ref </dt>
                <dd className="inline font-mono text-[var(--heading)]">
                  {row.shortReference}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="inline text-[var(--text-soft)]">Retail </dt>
                <dd className="inline tabular-nums text-[var(--heading)]">
                  {row.retailPriceLabel}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="inline text-[var(--text-soft)]">Debit </dt>
                <dd className="inline tabular-nums text-[var(--heading)]">
                  {row.partnerDebitLabel}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="inline text-[var(--text-soft)]">Purchased </dt>
                <dd className="inline text-[var(--heading)]">
                  {row.purchasedAtLabel}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Link>
    </li>
  );
}

function AttentionCard({ row }: { row: PartnerAttentionRow }) {
  return (
    <li className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[var(--heading)]">{row.title}</p>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.statusBadge)}`}
        >
          {row.statusBadge}
        </span>
      </div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{row.message}</p>
      <dl className="mt-3 grid gap-1 text-xs text-[var(--text-muted)] sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="inline text-[var(--text-soft)]">Destination </dt>
          <dd className="inline text-[var(--heading)]">{row.destination}</dd>
        </div>
        <div className="min-w-0">
          <dt className="inline text-[var(--text-soft)]">Plan </dt>
          <dd className="inline text-[var(--heading)]">{row.planName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="inline text-[var(--text-soft)]">Ref </dt>
          <dd className="inline font-mono text-[var(--heading)]">
            {row.shortReference}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="inline text-[var(--text-soft)]">Retail </dt>
          <dd className="inline tabular-nums text-[var(--heading)]">
            {row.retailPriceLabel}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="inline text-[var(--text-soft)]">Debit </dt>
          <dd className="inline tabular-nums text-[var(--heading)]">
            {row.partnerDebitLabel}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="inline text-[var(--text-soft)]">Started </dt>
          <dd className="inline text-[var(--heading)]">{row.purchasedAtLabel}</dd>
        </div>
      </dl>
    </li>
  );
}

export default async function PartnerOrdersPage() {
  const user = await requireRole("PARTNER");

  let data: Awaited<ReturnType<typeof listPartnerOrdersPage>>;
  try {
    data = await listPartnerOrdersPage(user.id);
  } catch {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          {PORTAL_UNAVAILABLE}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Your Partner eSIM purchases. Open a completed order for install
          details and secure ICCID reveal.
        </p>
      </header>

      {data.attention.length > 0 ? (
        <section className="min-w-0 space-y-3" aria-labelledby="attention-heading">
          <h2
            id="attention-heading"
            className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Purchases requiring attention
          </h2>
          <ul className="space-y-3">
            {data.attention.map((row) => (
              <AttentionCard key={row.purchaseId} row={row} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="min-w-0 space-y-3" aria-labelledby="orders-heading">
        <h2
          id="orders-heading"
          className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Completed orders
        </h2>
        {data.orders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--text-muted)]">
            No completed Partner orders yet. Buy a plan from Catalog to get
            started.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.orders.map((row) => (
              <OrderCard key={row.orderId} row={row} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
