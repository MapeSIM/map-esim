import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listAdminPayments } from "@/app/lib/admin/paymentDashboard";
import { buildAdminPaymentsHref } from "@/app/lib/admin/paymentDashboardShared";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Payment dashboard data is temporarily unavailable. Please refresh shortly.";

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--heading)]">
        {value}
      </p>
    </div>
  );
}

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
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
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
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only eSIM gateway payment inbox. Funding remains
          webhook-authoritative. Admin never marks a payment paid from this
          page.
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/admin/payments/pending"
            className="font-semibold text-[var(--accent-strong)]"
          >
            Pending tools
          </Link>
          <span className="text-[var(--text-soft)]"> · </span>
          <Link
            href="/admin/payments/recovery"
            className="font-semibold text-[var(--accent-strong)]"
          >
            Payment recovery
          </Link>
          <span className="text-[var(--text-soft)]"> · </span>
          <Link
            href="/admin/payments/failed"
            className="font-semibold text-[var(--accent-strong)]"
          >
            Failed payments
          </Link>
          <span className="text-[var(--text-soft)]"> · </span>
          <Link
            href="/admin/payments/webhooks"
            className="font-semibold text-[var(--accent-strong)]"
          >
            Webhook receipts
          </Link>
        </p>
      </header>

      <section
        aria-label="Payment KPIs"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard label="Pending" value={data.kpis.pendingCount} />
        <KpiCard
          label="Failed / cancelled (24h)"
          value={data.kpis.failedLast24hCount}
        />
        <KpiCard
          label="Webhook missing (pending)"
          value={data.kpis.webhookMissingAmongPendingCount}
        />
        <KpiCard
          label="Recovery candidates"
          value={data.kpis.recoveryCandidateCount}
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
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="OTHER">Other</option>
            <option value="ALL">All</option>
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
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white"
          >
            Apply filters
          </button>
          <Link
            href="/admin/payments"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)]"
          >
            Reset
          </Link>
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
                    <p className="text-[var(--heading)]">{row.attemptStatus}</p>
                    <p className="text-xs text-[var(--text-soft)]">
                      purchase {row.purchaseStatus}
                    </p>
                    <p className="text-xs text-[var(--text-soft)]">
                      inquiry {row.inquiryLabel}
                    </p>
                  </td>
                  <td className="px-3 py-3 align-top text-[var(--heading)]">
                    {row.webhookLabel}
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-[var(--text-soft)]">
                    <p>{row.updatedAtLabel}</p>
                    <p>created {row.createdAtLabel}</p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Link
                      href={row.href}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-3 text-xs font-semibold text-white"
                    >
                      Open
                    </Link>
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
            <Link
              href={buildAdminPaymentsHref({
                ...filterBase,
                page: data.page - 1,
              })}
              className="rounded-xl border border-[var(--border-strong)] px-3 py-2 text-sm font-semibold text-[var(--heading)]"
            >
              Previous
            </Link>
          ) : null}
          {data.page < data.totalPages ? (
            <Link
              href={buildAdminPaymentsHref({
                ...filterBase,
                page: data.page + 1,
              })}
              className="rounded-xl border border-[var(--border-strong)] px-3 py-2 text-sm font-semibold text-[var(--heading)]"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
