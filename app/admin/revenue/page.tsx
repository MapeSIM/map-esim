import { getAdminBusinessInsights } from "@/app/lib/admin/businessInsights";
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

function RankTable({
  title,
  caption,
  rows,
  emptyLabel,
}: {
  title: string;
  caption: string;
  rows: Array<{
    key: string;
    label: string;
    purchaseCount: number;
    revenueLabel: string;
  }>;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
      <h3 className="text-sm font-semibold text-[var(--heading)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{caption}</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">{emptyLabel}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Purchases</th>
                <th className="py-2 font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${title}-${row.key}`}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <td className="py-2.5 pr-3 text-[var(--text-muted)]">
                    {index + 1}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-[var(--heading)]">
                    {row.label}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--heading)]">
                    {row.purchaseCount}
                  </td>
                  <td className="py-2.5 font-semibold text-[var(--heading)]">
                    {row.revenueLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  let revenue: Awaited<ReturnType<typeof getAdminRevenueOverview>>;
  let insights: Awaited<ReturnType<typeof getAdminBusinessInsights>> | null =
    null;
  try {
    revenue = await getAdminRevenueOverview();
  } catch {
    return <RevenueUnavailable />;
  }
  try {
    insights = await getAdminBusinessInsights();
  } catch {
    insights = null;
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only customer and partner revenue from completed purchases.
          Provider cost is excluded. Generated {revenue.generatedAtLabel}.
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
          {revenue.periods.map((period) => (
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
          {revenue.periods.map((period) => (
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
          {revenue.periods.map((period) => (
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

      {insights ? (
        <section
          aria-labelledby="admin-business-insights-heading"
          className="space-y-8 border-t border-[var(--border)] pt-10"
        >
          <header>
            <h2
              id="admin-business-insights-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Business insights
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
              Read-only rankings and trends from completed customer purchases
              (company-funded excluded). Partner Add More Data is shown
              separately. Generated {insights.generatedAtLabel}.
            </p>
          </header>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankTable
              title="Top countries · last 30 days"
              caption="Customer completed purchases by destination code."
              rows={insights.topCountriesLast30Days}
              emptyLabel="No completed customer purchases in the last 30 days."
            />
            <RankTable
              title="Top countries · all time"
              caption="Customer completed purchases by destination code."
              rows={insights.topCountriesAllTime}
              emptyLabel="No completed customer purchases yet."
            />
            <RankTable
              title="Top packages · last 30 days"
              caption="Customer completed purchases by offer."
              rows={insights.topPackagesLast30Days}
              emptyLabel="No completed customer purchases in the last 30 days."
            />
            <RankTable
              title="Top packages · all time"
              caption="Customer completed purchases by offer."
              rows={insights.topPackagesAllTime}
              emptyLabel="No completed customer purchases yet."
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--heading)]">
              Customer growth
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              New CUSTOMER accounts created (not deleted), by signup time.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {insights.periods.map((period) => (
                <StatCard
                  key={`growth-${period.key}`}
                  label={period.label}
                  value={period.newCustomers}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--heading)]">
              Repeat customers
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Distinct customers with 2+ completed purchases in the period
              (company-funded excluded).
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {insights.periods.map((period) => (
                <StatCard
                  key={`repeat-${period.key}`}
                  label={period.label}
                  value={period.repeatCustomers}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--heading)]">
              Add More Data · customer revenue
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Completed customer purchases with adddata_ idempotency keys
              (catalog sell price).
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {insights.periods.map((period) => (
                <StatCard
                  key={`adddata-customer-${period.key}`}
                  label={period.label}
                  value={period.customerAddMoreDataRevenueLabel}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--heading)]">
              Add More Data · partner revenue
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Completed Partner purchases with adddata_ keys — partner wallet
              charge (separate from customer).
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {insights.periods.map((period) => (
                <StatCard
                  key={`adddata-partner-${period.key}`}
                  label={period.label}
                  value={period.partnerAddMoreDataRevenueLabel}
                />
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section
          aria-labelledby="admin-business-insights-unavailable-heading"
          className="border-t border-[var(--border)] pt-10"
        >
          <h2
            id="admin-business-insights-unavailable-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Business insights
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]" role="status">
            Business insights are temporarily unavailable. Revenue figures above
            are still shown.
          </p>
        </section>
      )}
    </div>
  );
}
