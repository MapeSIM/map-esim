import { getAdminOverview } from "@/app/lib/admin/overview";

export const dynamic = "force-dynamic";

const DASHBOARD_UNAVAILABLE =
  "Dashboard data is temporarily unavailable. Please refresh shortly.";

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
        <p className="mt-2 text-xs leading-snug text-[var(--text-muted)]">{note}</p>
      ) : null}
    </div>
  );
}

function StatusRow({
  label,
  status,
}: {
  label: string;
  status: string;
}) {
  const ok = status === "Configured" || status === "Operational";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-3 last:border-b-0">
      <span className="text-sm text-[var(--text)]">{label}</span>
      <span
        className={
          ok
            ? "rounded-full bg-[var(--accent-strong)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--accent-strong)]"
            : "rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)]"
        }
      >
        {status}
      </span>
    </div>
  );
}

function DashboardUnavailable() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only operations snapshot. No orders, refunds, or emails can be
          changed from this page.
        </p>
      </header>
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          {DASHBOARD_UNAVAILABLE}
        </p>
      </div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  let data: Awaited<ReturnType<typeof getAdminOverview>>;
  try {
    data = await getAdminOverview();
  } catch {
    // Auth failures redirect from the layout — this is DB/query availability only.
    return <DashboardUnavailable />;
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only operations snapshot. No orders, refunds, or emails can be
          changed from this page.
        </p>
      </header>

      <section aria-labelledby="admin-kpi-heading">
        <h2 id="admin-kpi-heading" className="sr-only">
          Key metrics
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Active customers" value={data.activeCustomerCount} />
          <StatCard
            label="Verified customers"
            value={data.verifiedCustomerCount}
          />
          <StatCard label="Google customers" value={data.googleCustomerCount} />
          <StatCard
            label="Credentials customers"
            value={data.credentialsCustomerCount}
          />
          <StatCard label="Local orders" value={data.totalLocalOrders} />
          <StatCard
            label="Completed local orders"
            value={data.completedLocalOrders}
          />
          <StatCard
            label="VeSIM staging checkout total (USD)"
            value={data.stagingProviderTotalUsd}
            note="This is a staging provider-wallet total, not live customer revenue."
          />
        </div>
      </section>

      <section aria-labelledby="admin-recent-orders-heading">
        <h2
          id="admin-recent-orders-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Recent orders
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Latest local snapshots only. Installation credentials are never shown
          here.
        </p>

        {data.recentOrders.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--text-soft)]">
            No local orders yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-[720px] w-full border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
                <tr>
                  <th className="px-3 py-3 font-semibold">Created</th>
                  <th className="px-3 py-3 font-semibold">Destination</th>
                  <th className="px-3 py-3 font-semibold">Plan / data</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Amount</th>
                  <th className="px-3 py-3 font-semibold">Provider ref</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((order, index) => (
                  <tr
                    key={`${order.providerRefMasked}-${index}`}
                    className="border-t border-[var(--border)] text-[var(--text)]"
                  >
                    <td className="whitespace-nowrap px-3 py-3">
                      {order.createdAtLabel}
                    </td>
                    <td className="px-3 py-3">{order.destination}</td>
                    <td className="px-3 py-3">{order.planPackage}</td>
                    <td className="px-3 py-3">{order.localStatus}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {order.amountLabel}
                    </td>
                    <td className="font-mono text-xs px-3 py-3">
                      {order.providerRefMasked}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="admin-system-status-heading">
        <h2
          id="admin-system-status-heading"
          className="text-lg font-semibold tracking-tight"
        >
          System status
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Configuration presence only. Secret values are never displayed.
        </p>
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4">
          <StatusRow
            label="Google OAuth"
            status={data.systemStatus.googleOAuth}
          />
          <StatusRow label="SMTP" status={data.systemStatus.smtp} />
          <StatusRow
            label="VeSIM environment"
            status={data.systemStatus.vesim}
          />
          <StatusRow
            label="Database connection"
            status={data.systemStatus.database}
          />
        </div>
      </section>
    </div>
  );
}
