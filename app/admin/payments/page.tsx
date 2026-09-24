import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import {
  ADMIN_UX_NAV,
  ADMIN_UX_PAGE,
  adminFilterStatusLabel,
  adminHumanStatusLabel,
} from "@/app/lib/admin/adminUxCopy";
import { listAdminPayments } from "@/app/lib/admin/paymentDashboard";
import { buildAdminPaymentsHref } from "@/app/lib/admin/paymentDashboardShared";
import { AdminButton, AdminKpiCard, AdminStatusPill } from "@/app/components/admin/ui";

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
      page: params.page,
    });
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {ADMIN_UX_PAGE.payments.title}
        </h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">{UNAVAILABLE}</p>
        </div>
      </div>
    );
  }

  const filterBase = {
    q: data.search,
    status: data.status,
    provider: data.provider,
    webhook: data.webhook,
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {ADMIN_UX_PAGE.payments.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          {ADMIN_UX_PAGE.payments.description}
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/admin/payments/pending"
            className="font-semibold text-[var(--accent-strong)]"
          >
            {ADMIN_UX_NAV.verifyPending}
          </Link>
          <span className="text-[var(--text-soft)]"> · </span>
          <Link
            href="/admin/payments/recovery"
            className="font-semibold text-[var(--accent-strong)]"
          >
            {ADMIN_UX_NAV.staleUnpaidHolds}
          </Link>
          <span className="text-[var(--text-soft)]"> · </span>
          <Link
            href="/admin/payments/failed"
            className="font-semibold text-[var(--accent-strong)]"
          >
            {ADMIN_UX_NAV.failedPayments}
          </Link>
          <span className="text-[var(--text-soft)]"> · </span>
          <Link
            href="/admin/payments/webhooks"
            className="font-semibold text-[var(--accent-strong)]"
          >
            {ADMIN_UX_NAV.webhookReceipts}
          </Link>
        </p>
      </header>

      <section
        aria-label="Payment KPIs"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <AdminKpiCard
          label="Pending"
          value={data.kpis.pendingCount}
          href={buildAdminPaymentsHref({ status: "PENDING" })}
        />
        <AdminKpiCard
          label="Failed / cancelled (24h)"
          value={data.kpis.failedLast24hCount}
          href="/admin/payments/failed"
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

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block text-sm sm:col-span-2 lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={data.search}
            maxLength={100}
            placeholder="Attempt, purchase, order id, or customer email"
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Status
          </span>
          <select
            name="status"
            defaultValue={data.status}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
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
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Provider
          </span>
          <select
            name="provider"
            defaultValue={data.provider}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <option value="ALL">All providers</option>
            <option value="SIMPAISA">SIMPAISA</option>
            <option value="SAFEPAY">SAFEPAY</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Webhook
          </span>
          <select
            name="webhook"
            defaultValue={data.webhook}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <option value="ALL">All</option>
            <option value="MISSING">Missing</option>
            <option value="PRESENT">Present</option>
          </select>
        </label>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <AdminButton type="submit" variant="primary">
            Apply filters
          </AdminButton>
          <AdminButton href="/admin/payments" variant="secondary">
            Reset
          </AdminButton>
        </div>
      </form>

      <p className="text-xs text-[var(--text-soft)]">
        Showing {data.rows.length} of {data.totalCount} · page {data.page} /{" "}
        {data.totalPages}
      </p>

      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No payment attempts match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
              <tr>
                <th className="px-3 py-3 font-semibold">Payment</th>
                <th className="px-3 py-3 font-semibold">Customer</th>
                <th className="px-3 py-3 font-semibold">Amount</th>
                <th className="px-3 py-3 font-semibold">Provider</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Webhook</th>
                <th className="px-3 py-3 font-semibold">Updated</th>
                <th className="px-3 py-3 font-semibold"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
              {data.rows.map((row) => (
                <tr key={row.attemptId}>
                  <td className="px-3 py-3 align-top">
                    <p className="font-medium text-[var(--heading)]">
                      {row.attemptId}
                    </p>
                    <p className="text-xs text-[var(--text-soft)]">
                      purchase {row.purchaseId}
                      {row.orderId ? ` · order ${row.orderId}` : ""}
                    </p>
                    <p className="text-xs text-[var(--text-soft)]">
                      ref {row.providerRefMasked}
                    </p>
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
                    <p className="text-xs text-[var(--text-soft)]">
                      method {row.methodLabel}
                    </p>
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
                    <p className="text-xs text-[var(--text-soft)]">
                      inquiry {row.inquiryLabel}
                    </p>
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--heading)]">
                    {adminHumanStatusLabel(row.webhookLabel)}
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-[var(--text-soft)]">
                    <p>{row.updatedAtLabel}</p>
                    <p>created {row.createdAtLabel}</p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <AdminButton href={row.href} variant="primary" size="sm">
                      Open
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
