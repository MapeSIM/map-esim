import {
  getAdminAuditLogsPage,
  requireActiveAdminForAuditLogs,
} from "@/app/lib/admin/auditLogs";
import {
  ADMIN_AUDIT_ACTOR_FILTERS,
  adminAuditActorFilterLabel,
  buildAdminAuditLogsHref,
} from "@/app/lib/admin/auditLogsShared";
import { AdminButton } from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Audit log data is temporarily unavailable. Please refresh shortly.";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; actor?: string; page?: string }>;
}) {
  await requireActiveAdminForAuditLogs();
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof getAdminAuditLogsPage>>;
  try {
    data = await getAdminAuditLogsPage({
      q: params.q,
      actor: params.actor,
      page: params.page,
    });
  } catch {
    return (
      <div className="min-w-0 space-y-6">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Permanent security record. This page is strictly read-only.
          </p>
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

  const filterBase = { q: data.search, actor: data.actor };

  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Permanent security record of admin and system events. Viewing,
          search, and filtering only — audit events cannot be edited, deleted,
          or cleared from this page.
        </p>
      </header>

      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
        role="status"
        data-audit-logs-readonly="true"
      >
        Strictly read-only. No edit, delete, or clear-log actions are available.
        Historical audit events remain intact as a security record.
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-2 lg:grid-cols-4"
        data-audit-logs-filters="true"
      >
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={data.search}
            maxLength={100}
            placeholder="Action, target, or audit id"
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Actor
          </span>
          <select
            name="actor"
            defaultValue={data.actor}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            {ADMIN_AUDIT_ACTOR_FILTERS.map((f) => (
              <option key={f} value={f}>
                {adminAuditActorFilterLabel(f)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          <AdminButton type="submit" variant="primary" size="sm" className="!h-11">
            Apply filters
          </AdminButton>
          {data.search || data.actor !== "all" ? (
            <AdminButton
              href="/admin/audit-logs"
              variant="ghost"
              size="sm"
              className="!h-11"
            >
              Clear filters
            </AdminButton>
          ) : null}
        </div>
      </form>

      <p className="text-sm text-[var(--text-muted)]">
        Showing page {data.page} of {data.totalPages} · {data.totalCount} event
        {data.totalCount === 1 ? "" : "s"}
        {data.actor !== "all" ? ` · ${data.actorLabel}` : ""}
        {data.search ? ` · search “${data.search}”` : ""}
      </p>

      {data.rows.length === 0 ? (
        <div className={EMPTY_CLASS} role="status">
          No audit events match the current view.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="min-w-[760px] w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
              <tr>
                <th className="px-3 py-3 font-semibold">Timestamp</th>
                <th className="px-3 py-3 font-semibold">Event</th>
                <th className="px-3 py-3 font-semibold">Target</th>
                <th className="px-3 py-3 font-semibold">Actor</th>
                <th className="px-3 py-3 font-semibold">Result</th>
                <th className="px-3 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr
                  key={`${row.createdAtLabel}-${row.action}-${index}`}
                  className="border-t border-[var(--border)] text-[var(--text)]"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    {row.createdAtLabel}
                  </td>
                  <td className="px-3 py-3 font-medium">{row.action}</td>
                  <td className="px-3 py-3">{row.targetType}</td>
                  <td className="px-3 py-3">{row.actorCategory}</td>
                  <td className="px-3 py-3">{row.resultLabel}</td>
                  <td className="px-3 py-3 text-xs text-[var(--text-muted)]">
                    {row.safeDetails}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.totalPages > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Audit log pagination">
          {data.page > 1 ? (
            <AdminButton
              href={buildAdminAuditLogsHref({
                ...filterBase,
                page: data.page - 1,
              })}
              variant="secondary"
              size="sm"
            >
              Previous
            </AdminButton>
          ) : null}
          {data.page < data.totalPages ? (
            <AdminButton
              href={buildAdminAuditLogsHref({
                ...filterBase,
                page: data.page + 1,
              })}
              variant="secondary"
              size="sm"
            >
              Next
            </AdminButton>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
