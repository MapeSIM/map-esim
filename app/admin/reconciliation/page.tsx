import { Suspense } from "react";
import Link from "next/link";
import {
  getReconciliationListPage,
  requireActiveAdminForReconciliation,
  type ReconciliationListRow,
} from "@/app/lib/admin/reconciliation";
import {
  RECONCILIATION_FILTERS,
  filterLabel,
  simpleReconciliationBucket,
  simpleReconciliationIssue,
  simpleReconciliationNextStep,
  type ReconciliationFilter,
  type SimpleReconciliationBucket,
} from "@/app/lib/admin/reconciliationClassify";
import {
  AdminButton,
  AdminKpiCard,
  AdminStatusPill,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Reconciliation data is temporarily unavailable. Please refresh shortly.";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5";

function buildHref(filter: ReconciliationFilter): string {
  if (filter === "needs_review") return "/admin/reconciliation";
  return `/admin/reconciliation?filter=${encodeURIComponent(filter)}`;
}

function bucketStatusLabel(bucket: SimpleReconciliationBucket): string {
  switch (bucket) {
    case "need_action":
      return "Need Action";
    case "waiting":
      return "Waiting";
    case "resolved":
      return "Resolved";
    default:
      return "Need Action";
  }
}

function CaseStatusBadges({ row }: { row: ReconciliationListRow }) {
  const bucket = simpleReconciliationBucket({
    category: row.category,
    locked: row.locked,
    escalated: row.escalated,
  });
  return (
    <span className="flex flex-wrap gap-1.5">
      <AdminStatusPill value={bucketStatusLabel(bucket)}>
        {bucketStatusLabel(bucket)}
      </AdminStatusPill>
      {row.locked ? (
        <AdminStatusPill value="Locked">Locked</AdminStatusPill>
      ) : null}
      {row.escalated ? (
        <AdminStatusPill value="Escalated">Escalated</AdminStatusPill>
      ) : null}
    </span>
  );
}

function SimpleCaseCard({ row }: { row: ReconciliationListRow }) {
  const issue = simpleReconciliationIssue(row.category);
  const nextStep = simpleReconciliationNextStep(row.category, {
    locked: row.locked,
    escalated: row.escalated,
  });

  return (
    <li className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Customer
            </p>
            {row.customerHref ? (
              <Link
                href={row.customerHref}
                className="mt-0.5 block break-words font-medium text-[var(--accent-strong)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                {row.customerLabel}
              </Link>
            ) : (
              <p className="mt-0.5 break-words font-medium text-[var(--heading)]">
                {row.customerLabel}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Package
            </p>
            <p className="mt-0.5 break-words text-sm text-[var(--heading)]">
              {row.destinationPackage}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Issue
            </p>
            <p className="mt-0.5 break-words text-sm text-[var(--heading)]">
              {issue}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Amount
              </dt>
              <dd className="mt-0.5 font-medium text-[var(--heading)]">
                {row.amountLabel}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Status
              </dt>
              <dd className="mt-1">
                <CaseStatusBadges row={row} />
              </dd>
            </div>
          </dl>

          <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Recommended next step
            </p>
            <p className="mt-1 text-sm text-[var(--heading)]">{nextStep}</p>
          </div>
        </div>

        <div className="shrink-0 sm:pt-1">
          <AdminButton href={row.href} variant="primary" size="sm">
            Open Case
          </AdminButton>
        </div>
      </div>
    </li>
  );
}

function TechnicalTable({ rows }: { rows: ReconciliationListRow[] }) {
  return (
    <div className="-mx-1 overflow-x-auto rounded-2xl border border-[var(--border)] px-1">
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
        <thead className="bg-[var(--surface-2)]">
          <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
            <th className="px-3 py-3 font-semibold whitespace-nowrap">
              Reference
            </th>
            <th className="px-3 py-3 font-semibold">Customer</th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">Type</th>
            <th className="px-3 py-3 font-semibold">Package</th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">
              Amount
            </th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">
              Wallet
            </th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">
              Provider
            </th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">
              Category
            </th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.sourceType}:${row.attemptId}`}
              className="border-b border-[var(--border)] align-top text-[var(--text)]"
            >
              <td className="px-3 py-3 whitespace-nowrap">
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
              <td className="px-3 py-3">
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
              <td className="px-3 py-3 whitespace-nowrap">{row.purchaseType}</td>
              <td className="px-3 py-3">
                <div className="max-w-[220px] whitespace-normal break-words [overflow-wrap:break-word] [word-break:normal]">
                  {row.destinationPackage}
                </div>
              </td>
              <td className="px-3 py-3 whitespace-nowrap">{row.amountLabel}</td>
              <td className="px-3 py-3 whitespace-nowrap text-xs">
                {row.walletDebitRefundLabel}
              </td>
              <td className="px-3 py-3 whitespace-nowrap">
                <span className="block whitespace-nowrap">
                  {row.providerResultKindLabel}
                </span>
                <span className="mt-1 block text-xs text-[var(--text-soft)] whitespace-nowrap">
                  {row.hasProviderRef ? "Ref stored" : "Ref missing"}
                </span>
              </td>
              <td className="px-3 py-3 whitespace-nowrap">
                <span className="block font-medium whitespace-nowrap">
                  {row.categoryLabel}
                </span>
                <span className="mt-1 block text-xs text-[var(--text-soft)] whitespace-nowrap">
                  {row.failureLabel}
                </span>
                <span className="mt-1 block text-xs text-[var(--text-soft)] whitespace-nowrap">
                  {row.resolutionLabel}
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {row.locked ? (
                    <AdminStatusPill value="Locked">Locked</AdminStatusPill>
                  ) : null}
                  {row.escalated ? (
                    <AdminStatusPill value="Escalated">
                      Escalated
                    </AdminStatusPill>
                  ) : null}
                  {row.category === "RESOLVED" ? (
                    <AdminStatusPill value="Resolved">
                      Resolved
                    </AdminStatusPill>
                  ) : null}
                </span>
              </td>
              <td className="px-3 py-3 whitespace-nowrap text-xs">
                <div className="whitespace-nowrap">{row.updatedAtLabel}</div>
                <div className="mt-1 text-[var(--text-soft)] whitespace-nowrap">
                  {row.createdAtLabel}
                </div>
                {row.localOrderHref ? (
                  <AdminButton
                    href={row.localOrderHref}
                    variant="ghost"
                    size="sm"
                    className="mt-1 !h-auto !px-0"
                  >
                    Order
                  </AdminButton>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireActiveAdminForReconciliation();
  const params = await searchParams;

  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">
          Problems & Recovery
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Review stuck purchases, uncertain provider results, and failed
          notifications. Open a case for controlled, evidence-gated recovery.
        </p>
      </header>

      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
        role="status"
      >
        Controlled recovery requires lock ownership, a confirmed reason, and
        conclusive evidence. Provider observations never auto-authorize refund,
        finalization, or resolution. Unsupported source and action combinations
        remain blocked.
      </div>

      <Suspense fallback={<ReconciliationBodyFallback />}>
        <ReconciliationBody filter={params.filter} />
      </Suspense>
    </div>
  );
}

function ReconciliationBodyFallback() {
  return (
    <div className={`${CARD_CLASS} px-5 py-8`} role="status" aria-busy="true">
      <p className="text-sm font-medium text-[var(--heading)]">
        Loading reconciliation KPIs and cases…
      </p>
    </div>
  );
}

async function ReconciliationBody({
  filter,
}: {
  filter?: string;
}) {
  const data = await getReconciliationListPage({ filter });
  const advancedOpen = data.filter !== "needs_review";

  if (data.unavailable) {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          {UNAVAILABLE}
        </p>
      </div>
    );
  }

  return (
    <>
      <section
        aria-label="Reconciliation summary"
        className="grid gap-3 sm:grid-cols-3"
      >
        <AdminKpiCard label="Need Action" value={data.summary.needAction} />
        <AdminKpiCard label="Waiting" value={data.summary.waiting} />
        <AdminKpiCard label="Resolved" value={data.summary.resolved} />
      </section>

      {data.filter !== "needs_review" ? (
        <p className="text-sm text-[var(--text-muted)]">
          Showing filter:{" "}
          <span className="font-medium text-[var(--heading)]">
            {data.filterLabel}
          </span>
          {" · "}
          <Link
            href="/admin/reconciliation"
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
          >
            Clear filter
          </Link>
        </p>
      ) : null}

      {data.rows.length === 0 ? (
        <div className={EMPTY_CLASS} role="status">
          No reconciliation cases match “{data.filterLabel}”.
        </div>
      ) : (
        <ul
          className="space-y-3"
          aria-label="Reconciliation cases"
          data-reconciliation-simple-cases="true"
        >
          {data.rows.map((row) => (
            <SimpleCaseCard
              key={`${row.sourceType}:${row.attemptId}`}
              row={row}
            />
          ))}
        </ul>
      )}

      <details
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4"
        {...(advancedOpen ? { open: true } : {})}
      >
        <summary className="cursor-pointer text-sm font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]">
          Advanced Filters
        </summary>
        <div className="mt-4 space-y-4">
          <nav
            className="flex min-w-0 flex-wrap gap-2"
            aria-label="Reconciliation filters"
          >
            {RECONCILIATION_FILTERS.map((f) => {
              const active = data.filter === f;
              return (
                <AdminButton
                  key={f}
                  href={buildHref(f)}
                  variant={active ? "primary" : "secondary"}
                  size="sm"
                  className="!h-10 !px-4 !text-sm"
                >
                  {filterLabel(f)}
                </AdminButton>
              );
            })}
          </nav>

          {data.rows.length === 0 ? (
            <div className={EMPTY_CLASS} role="status">
              No technical rows for “{data.filterLabel}”.
            </div>
          ) : (
            <TechnicalTable rows={data.rows} />
          )}
        </div>
      </details>
    </>
  );
}
