import { getAdminRevenueOverview } from "@/app/lib/admin/revenueOverview";

export const dynamic = "force-dynamic";

const REVENUE_UNAVAILABLE =
  "Revenue data is temporarily unavailable. Please refresh shortly.";

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--heading)]">
        {value}
      </p>
      {note ? (
        <p className="mt-2 text-xs leading-snug text-[var(--text-muted)]">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function RevenueUnavailable() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only revenue snapshot. Provider cost is never shown as revenue.
        </p>
      </header>
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          {REVENUE_UNAVAILABLE}
        </p>
      </div>
    </div>
  );
}

export default async function AdminRevenuePage() {
  let data: Awaited<ReturnType<typeof getAdminRevenueOverview>>;
  try {
    data = await getAdminRevenueOverview();
  } catch {
    return <RevenueUnavailable />;
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only customer and partner revenue from completed purchases.
          Provider cost is excluded. Generated {data.generatedAtLabel}.
        </p>
      </header>

      <section aria-labelledby="admin-customer-revenue-heading">
        <h2
          id="admin-customer-revenue-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Customer revenue
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Completed wallet / checkout purchases at catalog sell price. Company-
          funded assignments are excluded.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.periods.map((period) => (
            <StatCard
              key={`customer-${period.key}`}
              label={period.label}
              value={period.customerRevenueLabel}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="admin-partner-revenue-heading">
        <h2
          id="admin-partner-revenue-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Partner revenue
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Completed Partner purchases — partner wallet charge (separate from
          customer revenue).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.periods.map((period) => (
            <StatCard
              key={`partner-${period.key}`}
              label={period.label}
              value={period.partnerRevenueLabel}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="admin-orders-revenue-heading">
        <h2
          id="admin-orders-revenue-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Orders by period
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Local Order rows by created time. Pending / failed use Order.status.
        </p>
        <div className="mt-4 space-y-4">
          {data.periods.map((period) => (
            <div
              key={`orders-${period.key}`}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4"
            >
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                {period.label}
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total orders" value={period.ordersTotal} />
                <StatCard
                  label="Completed orders"
                  value={period.ordersCompleted}
                />
                <StatCard
                  label="Pending orders"
                  value={period.ordersPending}
                />
                <StatCard label="Failed orders" value={period.ordersFailed} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
