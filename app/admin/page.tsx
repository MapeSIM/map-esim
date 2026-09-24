import { getAdminOverview } from "@/app/lib/admin/overview";
import { getAdminOverviewAttention } from "@/app/lib/admin/overviewAttention";
import {
  ADMIN_UX_PAGE,
  adminHumanStatusLabel,
} from "@/app/lib/admin/adminUxCopy";
import { loadAdminAccess } from "@/app/lib/admin/adminPermissionAccess";
import { requireRole } from "@/app/lib/auth/session";
import {
  AdminEmptyState,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableBody,
  AdminTableHead,
  AdminTableShell,
  ADMIN_CARD_CLASS,
  ADMIN_PAGE_STACK_CLASS,
  ADMIN_SECTION_TITLE_CLASS,
  ADMIN_MUTED_COPY_CLASS,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const DASHBOARD_UNAVAILABLE =
  "Dashboard data is temporarily unavailable. Please refresh shortly.";

function StatusRow({
  label,
  status,
}: {
  label: string;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-3 last:border-b-0">
      <span className="min-w-0 break-words text-sm text-[var(--text)]">
        {label}
      </span>
      <AdminStatusPill value={status}>{status}</AdminStatusPill>
    </div>
  );
}

function DashboardUnavailable() {
  return (
    <div className={ADMIN_PAGE_STACK_CLASS}>
      <AdminPageHeader
        title={ADMIN_UX_PAGE.overview.title}
        description={ADMIN_UX_PAGE.overview.description}
      />
      <AdminEmptyState title="Temporarily unavailable">
        {DASHBOARD_UNAVAILABLE}
      </AdminEmptyState>
    </div>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ forbidden?: string }>;
}) {
  const user = await requireRole("ADMIN");
  const params = await searchParams;
  const forbidden = params.forbidden === "1";

  let data: Awaited<ReturnType<typeof getAdminOverview>>;
  try {
    data = await getAdminOverview();
  } catch {
    // Auth failures redirect from the layout — this is DB/query availability only.
    return <DashboardUnavailable />;
  }

  const access = await loadAdminAccess(user.id);
  const attention = access
    ? await getAdminOverviewAttention(access.permissions)
    : [];

  return (
    <div className={ADMIN_PAGE_STACK_CLASS}>
      {forbidden ? (
        <p
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          You do not have permission to open that admin page.
        </p>
      ) : null}
      <AdminPageHeader
        title={ADMIN_UX_PAGE.overview.title}
        description={ADMIN_UX_PAGE.overview.description}
      />

      {attention.length > 0 ? (
        <section aria-labelledby="admin-needs-attention-heading">
          <h2
            id="admin-needs-attention-heading"
            className={ADMIN_SECTION_TITLE_CLASS}
          >
            Needs attention
          </h2>
          <p className={`mt-1 ${ADMIN_MUTED_COPY_CLASS}`}>
            Open a queue to investigate. Counts are read-only summaries.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {attention.map((card) => (
              <AdminKpiCard
                key={card.id}
                label={card.label}
                value={card.value}
                note={card.note}
                href={card.href}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="admin-primary-kpi-heading">
        <h2
          id="admin-primary-kpi-heading"
          className={ADMIN_SECTION_TITLE_CLASS}
        >
          Key metrics
        </h2>
        <p className={`mt-1 ${ADMIN_MUTED_COPY_CLASS}`}>
          Orders and active customers at a glance.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AdminKpiCard label="Orders" value={data.totalLocalOrders} />
          <AdminKpiCard
            label="Completed orders"
            value={data.completedLocalOrders}
          />
          <AdminKpiCard
            label="Active customers"
            value={data.activeCustomerCount}
          />
        </div>
      </section>

      <section aria-labelledby="admin-recent-orders-heading">
        <h2
          id="admin-recent-orders-heading"
          className={ADMIN_SECTION_TITLE_CLASS}
        >
          Recent orders
        </h2>
        <p className={`mt-1 ${ADMIN_MUTED_COPY_CLASS}`}>
          Latest local snapshots only. Installation credentials are never shown
          here.
        </p>

        {data.recentOrders.length === 0 ? (
          <div className="mt-4">
            <AdminEmptyState
              title="No local orders yet"
              actionHref="/admin/orders"
              actionLabel="Open Orders"
            >
              Orders will appear here after the first local purchase snapshot is
              recorded.
            </AdminEmptyState>
          </div>
        ) : (
          <div className="mt-4">
            <AdminTableShell caption="Recent orders">
              <AdminTableHead>
                <tr>
                  <th className="px-3 py-3 font-semibold">Created</th>
                  <th className="px-3 py-3 font-semibold">Destination</th>
                  <th className="px-3 py-3 font-semibold">Plan / data</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Amount</th>
                  <th className="px-3 py-3 font-semibold">Provider ref</th>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {data.recentOrders.map((order, index) => (
                  <tr key={`${order.providerRefMasked}-${index}`}>
                    <td className="whitespace-nowrap px-3 py-3 text-[var(--text)]">
                      {order.createdAtLabel}
                    </td>
                    <td className="px-3 py-3 text-[var(--text)]">
                      {order.destination}
                    </td>
                    <td className="px-3 py-3 text-[var(--text)]">
                      {order.planPackage}
                    </td>
                    <td className="px-3 py-3">
                      <AdminStatusPill value={order.localStatus}>
                        {adminHumanStatusLabel(order.localStatus)}
                      </AdminStatusPill>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[var(--text)]">
                      {order.amountLabel}
                    </td>
                    <td className="break-all px-3 py-3 font-mono text-xs text-[var(--text)]">
                      {order.providerRefMasked}
                    </td>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminTableShell>
          </div>
        )}
      </section>

      <section aria-labelledby="admin-customer-mix-heading">
        <h2
          id="admin-customer-mix-heading"
          className={ADMIN_SECTION_TITLE_CLASS}
        >
          Customer breakdown
        </h2>
        <p className={`mt-1 ${ADMIN_MUTED_COPY_CLASS}`}>
          Sign-in mix among active customers. Secondary to order metrics.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AdminKpiCard
            label="Verified customers"
            value={data.verifiedCustomerCount}
          />
          <AdminKpiCard
            label="Google customers"
            value={data.googleCustomerCount}
          />
          <AdminKpiCard
            label="Credentials customers"
            value={data.credentialsCustomerCount}
          />
        </div>
      </section>

      <section aria-labelledby="admin-system-status-heading">
        <h2
          id="admin-system-status-heading"
          className={ADMIN_SECTION_TITLE_CLASS}
        >
          System status
        </h2>
        <p className={`mt-1 ${ADMIN_MUTED_COPY_CLASS}`}>
          Configuration presence only. Secret values are never displayed.
        </p>
        <div className={`mt-4 ${ADMIN_CARD_CLASS} !p-0 px-4`}>
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

      <section aria-labelledby="admin-staging-heading">
        <h2
          id="admin-staging-heading"
          className="text-sm font-semibold tracking-tight text-[var(--text-soft)]"
        >
          Staging (non-revenue)
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Staging provider-wallet total only — not live customer revenue.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AdminKpiCard
            label="VeSIM staging checkout total (USD)"
            value={data.stagingProviderTotalUsd}
            note="This is a staging provider-wallet total, not live customer revenue."
          />
        </div>
      </section>
    </div>
  );
}
