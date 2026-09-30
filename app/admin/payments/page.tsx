import Link from "next/link";
import { PaymentListRowActions } from "@/app/components/admin/PaymentListRowActions";
import { requireRole } from "@/app/lib/auth/session";
import {
  ADMIN_UX_NAV,
  ADMIN_UX_PAGE,
  adminFilterStatusLabel,
  adminHumanStatusLabel,
} from "@/app/lib/admin/adminUxCopy";
import { listAdminPayments } from "@/app/lib/admin/paymentDashboard";
import { buildAdminPaymentsHref } from "@/app/lib/admin/paymentDashboardShared";
import {
  AdminButton,
  AdminEmptyState,
  AdminFilterField,
  AdminFilterPanel,
  adminFilterControlClassName,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableBody,
  AdminTableHead,
  AdminTableShell,
  ADMIN_KPI_GRID_CLASS,
  ADMIN_PAGE_STACK_CLASS,
  ADMIN_SOFT_COPY_CLASS,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Payment dashboard data is temporarily unavailable. Please refresh shortly.";

export default async function AdminPaymentsHubPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    provider?: string;
    webhook?: string;
    owner?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof listAdminPayments>>;
  try {
    data = await listAdminPayments({
      q: params.q,
      status: params.status,
      provider: params.provider,
      webhook: params.webhook,
      owner: params.owner,
      from: params.from,
      to: params.to,
      page: params.page,
    });
  } catch {
    return (
      <div className={ADMIN_PAGE_STACK_CLASS}>
        <AdminPageHeader title={ADMIN_UX_PAGE.payments.title} />
        <AdminEmptyState title="Temporarily unavailable">
          {UNAVAILABLE}
        </AdminEmptyState>
      </div>
    );
  }

  const filterBase = {
    q: data.search,
    status: data.status,
    provider: data.provider,
    webhook: data.webhook,
    owner: data.owner,
    from: data.from,
    to: data.to,
  };

  return (
    <div className={ADMIN_PAGE_STACK_CLASS}>
      <AdminPageHeader
        title={ADMIN_UX_PAGE.payments.title}
        description={ADMIN_UX_PAGE.payments.description}
        meta={
          <span className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
            <Link
              href="/admin/payments/pending"
              className="font-semibold text-[var(--accent-strong)]"
            >
              {ADMIN_UX_NAV.verifyPending}
            </Link>
            <span className="text-[var(--text-soft)]">·</span>
            <Link
              href="/admin/payments/recovery"
              className="font-semibold text-[var(--accent-strong)]"
            >
              {ADMIN_UX_NAV.staleUnpaidHolds}
            </Link>
            <span className="text-[var(--text-soft)]">·</span>
            <Link
              href="/admin/payments/failed"
              className="font-semibold text-[var(--accent-strong)]"
            >
              {ADMIN_UX_NAV.failedPayments}
            </Link>
            <span className="text-[var(--text-soft)]">·</span>
            <Link
              href="/admin/payments/webhooks"
              className="font-semibold text-[var(--accent-strong)]"
            >
              {ADMIN_UX_NAV.webhookReceipts}
            </Link>
          </span>
        }
      />

      <section aria-label="Payment KPIs" className={ADMIN_KPI_GRID_CLASS}>
        <AdminKpiCard
          label="Total payments"
          value={data.kpis.totalCount}
          href={buildAdminPaymentsHref({ status: "ALL" })}
        />
        <AdminKpiCard
          label="Pending"
          value={data.kpis.pendingCount}
          href={buildAdminPaymentsHref({ status: "PENDING" })}
        />
        <AdminKpiCard
          label="Failed"
          value={data.kpis.failedCount}
          href={buildAdminPaymentsHref({ status: "FAILED" })}
        />
        <AdminKpiCard
          label="Completed"
          value={data.kpis.completedCount}
          href={buildAdminPaymentsHref({ status: "CONFIRMED" })}
        />
        <AdminKpiCard
          label="Webhook missing (pending)"
          value={data.kpis.webhookMissingAmongPendingCount}
          href={buildAdminPaymentsHref({
            status: "PENDING",
            webhook: "MISSING",
          })}
        />
        <AdminKpiCard
          label="Stale unpaid holds"
          value={data.kpis.recoveryCandidateCount}
          href="/admin/payments/recovery"
        />
      </section>

      <AdminFilterPanel aria-label="Payment filters">
        <AdminFilterField label="Search" className="sm:col-span-2 lg:col-span-2">
          <input
            type="search"
            name="q"
            defaultValue={data.search}
            maxLength={100}
            placeholder="Attempt, purchase, order id, or email"
            className={adminFilterControlClassName}
          />
        </AdminFilterField>

        <AdminFilterField label="Status">
          <select
            name="status"
            defaultValue={data.status}
            className={adminFilterControlClassName}
          >
            <option value="PENDING">{adminFilterStatusLabel("PENDING")}</option>
            <option value="FAILED">{adminFilterStatusLabel("FAILED")}</option>
            <option value="CANCELLED">
              {adminFilterStatusLabel("CANCELLED")}
            </option>
            <option value="CONFIRMED">
              {adminFilterStatusLabel("CONFIRMED")}
            </option>
            <option value="OTHER">{adminFilterStatusLabel("OTHER")}</option>
            <option value="ALL">{adminFilterStatusLabel("ALL")}</option>
          </select>
        </AdminFilterField>

        <AdminFilterField label="Owner">
          <select
            name="owner"
            defaultValue={data.owner}
            className={adminFilterControlClassName}
          >
            <option value="ALL">All owners</option>
            <option value="CUSTOMER">Customer</option>
            <option value="PARTNER">Partner</option>
          </select>
        </AdminFilterField>

        <AdminFilterField label="Provider">
          <select
            name="provider"
            defaultValue={data.provider}
            className={adminFilterControlClassName}
          >
            <option value="ALL">All providers</option>
            <option value="SIMPAISA">SIMPAISA</option>
            <option value="SAFEPAY">SAFEPAY</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </AdminFilterField>

        <AdminFilterField label="Webhook">
          <select
            name="webhook"
            defaultValue={data.webhook}
            className={adminFilterControlClassName}
          >
            <option value="ALL">All</option>
            <option value="MISSING">Missing</option>
            <option value="PRESENT">Present</option>
          </select>
        </AdminFilterField>

        <AdminFilterField label="From date">
          <input
            type="date"
            name="from"
            defaultValue={data.from}
            className={adminFilterControlClassName}
          />
        </AdminFilterField>

        <AdminFilterField label="To date">
          <input
            type="date"
            name="to"
            defaultValue={data.to}
            className={adminFilterControlClassName}
          />
        </AdminFilterField>

        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <AdminButton type="submit" variant="primary">
            Apply filters
          </AdminButton>
          <AdminButton href="/admin/payments" variant="secondary">
            Reset
          </AdminButton>
        </div>
      </AdminFilterPanel>

      <p className={ADMIN_SOFT_COPY_CLASS}>
        Showing {data.rows.length} of {data.totalCount} · page {data.page} /{" "}
        {data.totalPages} · customer + partner gateway attempts
      </p>

      {data.rows.length === 0 ? (
        <AdminEmptyState
          title="No matching payments"
          actionHref="/admin/payments"
          actionLabel="Reset filters"
        >
          No payment attempts match these filters. Try clearing search or
          opening Verify Pending / Stale Unpaid Holds.
        </AdminEmptyState>
      ) : (
        <AdminTableShell
          caption="Payment attempts"
          minWidthClassName="min-w-[1040px]"
        >
          <AdminTableHead>
            <tr>
              <th className="px-3 py-3 font-semibold">Payment ID</th>
              <th className="px-3 py-3 font-semibold">Owner</th>
              <th className="px-3 py-3 font-semibold">Customer / Partner</th>
              <th className="px-3 py-3 font-semibold">Amount</th>
              <th className="px-3 py-3 font-semibold">Provider</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Created</th>
              <th className="px-3 py-3 font-semibold">Updated</th>
              <th className="px-3 py-3 font-semibold">Action</th>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {data.rows.map((row) => (
              <tr key={`${row.ownerKind}-${row.attemptId}`}>
                <td className="px-3 py-3 align-top">
                  <p className="break-all font-medium text-[var(--heading)]">
                    {row.attemptId}
                  </p>
                  <p className="text-xs text-[var(--text-soft)]">
                    purchase {row.purchaseId}
                    {row.orderId ? ` · order ${row.orderId}` : ""}
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  <AdminStatusPill value={row.ownerKind}>
                    {row.ownerLabel}
                  </AdminStatusPill>
                </td>
                <td className="px-3 py-3 align-top text-[var(--text-muted)]">
                  {row.customerHref ? (
                    <Link
                      href={row.customerHref}
                      className="font-medium text-[var(--accent-strong)]"
                    >
                      {row.customerLabel}
                    </Link>
                  ) : (
                    row.customerLabel
                  )}
                </td>
                <td className="px-3 py-3 align-top text-[var(--heading)]">
                  <p>{row.amountLabel}</p>
                  {row.chargeLabel ? (
                    <p className="text-xs text-[var(--text-soft)]">
                      charge {row.chargeLabel}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-top text-[var(--heading)]">
                  {row.providerLabel}
                </td>
                <td className="px-3 py-3 align-top">
                  <AdminStatusPill value={row.attemptStatus}>
                    {adminHumanStatusLabel(row.attemptStatus)}
                  </AdminStatusPill>
                  <p className="mt-1 text-xs text-[var(--text-soft)]">
                    purchase {adminHumanStatusLabel(row.purchaseStatus)}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top text-xs text-[var(--text-soft)]">
                  {row.createdAtLabel}
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top text-xs text-[var(--text-soft)]">
                  {row.updatedAtLabel}
                </td>
                <td className="px-3 py-3 align-top">
                  <PaymentListRowActions
                    detailHref={row.href}
                    staleReleaseHref={row.staleReleaseHref}
                    reconciliationHref={row.reconciliationHref}
                  />
                </td>              </tr>
            ))}
          </AdminTableBody>
        </AdminTableShell>
      )}

      {data.totalPages > 1 ? (
        <div className="flex flex-wrap gap-2">
          {data.page > 1 ? (
            <AdminButton
              href={buildAdminPaymentsHref({
                ...filterBase,
                page: data.page - 1,
              })}
              variant="secondary"
            >
              Previous
            </AdminButton>
          ) : null}
          {data.page < data.totalPages ? (
            <AdminButton
              href={buildAdminPaymentsHref({
                ...filterBase,
                page: data.page + 1,
              })}
              variant="secondary"
            >
              Next
            </AdminButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
