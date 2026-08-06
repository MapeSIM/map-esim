import Link from "next/link";
import {
  getReconciliationListPage,
  requireActiveAdminForReconciliation,
} from "@/app/lib/admin/reconciliation";
import {
  RECONCILIATION_FILTERS,
  filterLabel,
  type ReconciliationFilter,
} from "@/app/lib/admin/reconciliationClassify";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Reconciliation data is temporarily unavailable. Please refresh shortly.";

function buildHref(filter: ReconciliationFilter): string {
  if (filter === "needs_review") return "/admin/reconciliation";
  return `/admin/reconciliation?filter=${encodeURIComponent(filter)}`;
}

export default async function AdminReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireActiveAdminForReconciliation();
  const params = await searchParams;

  const data = await getReconciliationListPage({ filter: params.filter });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Reconciliation</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only review of stuck purchases, uncertain provider results, and
          failed notifications. Recovery actions are not available in this
          phase.
        </p>
      </header>

      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
        role="status"
      >
        Recovery actions will be available only after provider evidence and
        financial safety checks are confirmed.
      </div>

      <nav
        className="flex flex-wrap gap-2"
        aria-label="Reconciliation filters"
      >
        {RECONCILIATION_FILTERS.map((f) => {
          const active = data.filter === f;
          return (
            <Link
              key={f}
              href={buildHref(f)}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-lg bg-[var(--accent-strong)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--accent-strong)]"
                  : "rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
              }
            >
              {filterLabel(f)}
            </Link>
          );
        })}
      </nav>

      {data.unavailable ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {UNAVAILABLE}
          </p>
        </div>
      ) : data.rows.length === 0 ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            No reconciliation cases match “{data.filterLabel}”.
          </p>
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[140px]" />
              <col className="w-[200px]" />
              <col className="w-[150px]" />
              <col className="w-[220px]" />
              <col className="w-[110px]" />
              <col className="w-[160px]" />
              <col className="w-[110px]" />
              <col className="w-[170px]" />
              <col className="w-[160px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">
                  Reference
                </th>
                <th className="py-2 pr-3 font-semibold">Customer</th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">
                  Type
                </th>
                <th className="py-2 pr-3 font-semibold">Package</th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">
                  Amount
                </th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">
                  Wallet
                </th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">
                  Provider
                </th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">
                  Category
                </th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={`${row.sourceType}:${row.attemptId}`}
                  className="border-b border-[var(--border)] align-top"
                >
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <Link
                      href={row.href}
                      className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                    >
                      {row.attemptId.slice(0, 12)}…
                    </Link>
                    <p className="mt-1 text-xs text-[var(--text-soft)] whitespace-nowrap">
                      {row.providerRefMasked}
                    </p>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="max-w-[200px] whitespace-normal break-words [overflow-wrap:break-word] [word-break:normal]">
                      {row.customerHref ? (
                        <Link
                          href={row.customerHref}
                          className="text-[var(--heading)] underline-offset-2 hover:underline"
                        >
                          {row.customerLabel}
                        </Link>
                      ) : (
                        row.customerLabel
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    {row.purchaseType}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="max-w-[220px] whitespace-normal break-words [overflow-wrap:break-word] [word-break:normal]">
                      {row.destinationPackage}
                    </div>
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    {row.amountLabel}
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap text-xs">
                    {row.walletDebitRefundLabel}
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <span className="block whitespace-nowrap">
                      {row.providerResultKindLabel}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--text-soft)] whitespace-nowrap">
                      {row.hasProviderRef ? "Ref stored" : "Ref missing"}
                    </span>
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <span className="block font-medium whitespace-nowrap">
                      {row.categoryLabel}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--text-soft)] whitespace-nowrap">
                      {row.failureLabel}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--text-soft)] whitespace-nowrap">
                      {row.resolutionLabel}
                    </span>
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap text-xs">
                    <div className="whitespace-nowrap">{row.updatedAtLabel}</div>
                    <div className="mt-1 text-[var(--text-soft)] whitespace-nowrap">
                      {row.createdAtLabel}
                    </div>
                    {row.localOrderHref ? (
                      <Link
                        href={row.localOrderHref}
                        className="mt-1 inline-block whitespace-nowrap text-[var(--accent-strong)] underline-offset-2 hover:underline"
                      >
                        Order
                      </Link>
                    ) : null}
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
