import { getAdminAuditLogs } from "@/app/lib/admin/auditLogs";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogsPage() {
  const logs = await getAdminAuditLogs();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Audit logs</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
        Latest 50 recorded events (newest first). Sensitive metadata is
        filtered; this page is read-only.
      </p>

      {logs.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-5 py-8 text-sm text-[var(--text-soft)]">
          No audit events recorded yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--border)]">
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
              {logs.map((row, index) => (
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
    </div>
  );
}
