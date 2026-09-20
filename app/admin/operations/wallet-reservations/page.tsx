import Link from "next/link";
import { requireActiveAdminForOperations } from "@/app/lib/admin/operationsHealth";
import { getWalletReservationMonitorDashboard } from "@/app/lib/admin/walletReservationMonitor";
import {
  AdminButton,
  AdminKpiCard,
  AdminStatusPill,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Wallet reservation monitor data is temporarily unavailable. Please refresh shortly.";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

export default async function AdminWalletReservationsMonitorPage() {
  await requireActiveAdminForOperations();

  let data: Awaited<ReturnType<typeof getWalletReservationMonitorDashboard>>;
  try {
    data = await getWalletReservationMonitorDashboard();
  } catch {
    return (
      <div className="min-w-0 space-y-6">
        <header className="min-w-0 space-y-2">
          <p className="text-sm">
            <AdminButton href="/admin/operations" variant="ghost" size="sm">
              ← Operations
            </AdminButton>
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            Wallet reservations
          </h1>
        </header>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton href="/admin/operations" variant="ghost" size="sm">
            ← Operations
          </AdminButton>
          <AdminButton href="/admin/alerts" variant="ghost" size="sm">
            Alerts
          </AdminButton>
          <AdminButton
            href="/admin/reconciliation?filter=funds_reserved"
            variant="ghost"
            size="sm"
          >
            Reconciliation (funds reserved)
          </AdminButton>
          <AdminButton
            href="/admin/payments/pending"
            variant="ghost"
            size="sm"
          >
            Pending payment tools
          </AdminButton>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Wallet reservations
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
            {data.policyBlurb}
          </p>
          <p className="mt-2 text-xs text-[var(--text-soft)]">
            Stale threshold · {data.staleMinutes} minutes (same as monitoring
            alerts) · checked {data.checkedAtLabel}
            {data.truncated ? " · list truncated at query limit" : ""}
          </p>
        </div>
      </header>

      <section
        aria-label="Wallet reservation KPIs"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <AdminKpiCard
          label="Open wallet reservations"
          value={data.openCount}
        />
        <AdminKpiCard
          label="Total reserved USD"
          value={data.totalReservedUsdLabel}
        />
        <AdminKpiCard
          label="Stale reservations"
          value={data.staleCount}
        />
        <AdminKpiCard
          label="Split payment reservations"
          value={data.splitCount}
        />
      </section>

      {data.rows.length === 0 ? (
        <div className={EMPTY_CLASS}>
          No open wallet reservations match the monitor criteria right now.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
              <tr>
                <th className="px-3 py-3 font-semibold">Customer</th>
                <th className="px-3 py-3 font-semibold">Package</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Reserved</th>
                <th className="px-3 py-3 font-semibold">Age</th>
                <th className="px-3 py-3 font-semibold">Created / updated</th>
                <th className="px-3 py-3 font-semibold">Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
              {data.rows.map((row) => (
                <tr key={row.purchaseId}>
                  <td className="px-3 py-3 align-top text-[var(--text-muted)]">
                    {row.customerHref ? (
                      <Link
                        href={row.customerHref}
                        className="font-medium text-[var(--accent-strong)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                      >
                        {row.customerLabel}
                      </Link>
                    ) : (
                      row.customerLabel
                    )}
                    <p className="mt-1 text-xs text-[var(--text-soft)]">
                      {row.purchaseId}
                    </p>
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--heading)]">
                    {row.packageLabel}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      <AdminStatusPill value={row.status}>
                        {row.statusLabel}
                      </AdminStatusPill>
                      {row.stale ? (
                        <AdminStatusPill value="WARNING">Stale</AdminStatusPill>
                      ) : null}
                      {row.split ? (
                        <AdminStatusPill value="INFO">Split</AdminStatusPill>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top font-medium text-[var(--heading)]">
                    {row.reservedAmountLabel}
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--heading)]">
                    {row.ageLabel}
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--text-muted)]">
                    <p>{row.createdAtLabel}</p>
                    <p className="mt-1 text-xs text-[var(--text-soft)]">
                      upd {row.updatedAtLabel}
                    </p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-col gap-2">
                      {row.paymentDetailHref ? (
                        <AdminButton
                          href={row.paymentDetailHref}
                          variant="secondary"
                          size="sm"
                        >
                          Payment detail
                        </AdminButton>
                      ) : null}
                      {row.reconciliationHref ? (
                        <AdminButton
                          href={row.reconciliationHref}
                          variant="secondary"
                          size="sm"
                        >
                          Reconciliation
                        </AdminButton>
                      ) : null}
                      {!row.paymentDetailHref && !row.reconciliationHref ? (
                        <span className="text-xs text-[var(--text-soft)]">
                          —
                        </span>
                      ) : null}
                    </div>
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
