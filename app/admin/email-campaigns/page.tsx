import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listAdminEmailCampaigns } from "@/app/lib/admin/emailCampaigns";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Email campaign data is temporarily unavailable. Please refresh shortly.";

export default async function AdminEmailCampaignsPage() {
  await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listAdminEmailCampaigns>>;
  try {
    rows = await listAdminEmailCampaigns();
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Email Campaigns</h1>
        <p className="text-sm text-[var(--heading)]" role="status">
          {UNAVAILABLE}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Campaigns</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Admin-only customer broadcasts using the existing MAP eSIM email
            branding. This does not change order, wallet, or payment emails.
          </p>
        </div>
        <Link
          href="/admin/email-campaigns/new"
          className="inline-flex h-10 items-center rounded-[12px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]"
        >
          Create campaign
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No campaigns yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
                <th className="py-2 pr-3 font-semibold">Subject</th>
                <th className="py-2 pr-3 font-semibold">Audience</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Recipients</th>
                <th className="py-2 pr-3 font-semibold">Sent</th>
                <th className="py-2 pr-3 font-semibold">Failed</th>
                <th className="py-2 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)]">
                  <td className="py-3 pr-3 font-semibold text-[var(--heading)]">
                    <Link
                      href={`/admin/email-campaigns/${encodeURIComponent(row.id)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.subject}
                    </Link>
                  </td>
                  <td className="py-3 pr-3">{row.audienceLabel}</td>
                  <td className="py-3 pr-3">{row.statusLabel}</td>
                  <td className="py-3 pr-3">{row.recipientCount}</td>
                  <td className="py-3 pr-3">{row.sentCount}</td>
                  <td className="py-3 pr-3">{row.failedCount}</td>
                  <td className="py-3 whitespace-nowrap">{row.createdAtLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
