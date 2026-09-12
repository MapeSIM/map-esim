import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EmailCampaignBulkSendForm,
  EmailCampaignTestForm,
} from "@/app/components/admin/EmailCampaignSendForms";
import { getAdminEmailCampaignDetail } from "@/app/lib/admin/emailCampaigns";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[var(--heading)] break-words">
        {value}
      </dd>
    </div>
  );
}

export default async function AdminEmailCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireRole("ADMIN");
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getAdminEmailCampaignDetail>>;
  try {
    detail = await getAdminEmailCampaignDetail(id);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/email-campaigns"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Email Campaigns
        </Link>
        <p className="text-sm text-[var(--heading)]" role="status">
          Campaign data is temporarily unavailable. Please refresh shortly.
        </p>
      </div>
    );
  }

  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/email-campaigns"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Email Campaigns
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Campaign detail
        </h1>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Subject" value={detail.subject} />
        <DetailRow label="Audience" value={detail.audienceLabel} />
        <DetailRow label="Status" value={detail.statusLabel} />
        <DetailRow
          label="Eligible now"
          value={String(detail.liveRecipientCount)}
        />
        <DetailRow
          label="Queued recipients"
          value={String(detail.recipientCount)}
        />
        <DetailRow label="Sent" value={String(detail.sentCount)} />
        <DetailRow label="Failed" value={String(detail.failedCount)} />
        <DetailRow label="Skipped" value={String(detail.skippedCount)} />
        <DetailRow label="Pending" value={String(detail.pendingCount)} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow
          label="Test sent"
          value={
            detail.testSentTo
              ? `${detail.testSentTo}${detail.testSentAtLabel ? ` · ${detail.testSentAtLabel}` : ""}`
              : "Not sent"
          }
        />
      </dl>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Preview</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Branded MAP eSIM layout. Content is escaped text only.
        </p>
        <iframe
          title="Campaign email preview"
          sandbox=""
          srcDoc={detail.previewHtml}
          className="h-[520px] w-full rounded-2xl border border-[var(--border)] bg-white"
        />
      </section>

      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold tracking-tight">Send test email</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Sends one copy through the support channel. Does not start the bulk
          send.
        </p>
        <EmailCampaignTestForm
          campaignId={detail.id}
          defaultTestEmail={admin.email}
        />
      </section>

      {detail.canStartBulk ? (
        <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
          <h2 className="text-lg font-semibold tracking-tight">
            Send to customers
          </h2>
          <p className="text-sm text-[var(--heading)]">
            Recipients that will receive this campaign:{" "}
            <strong>{detail.liveRecipientCount}</strong>
          </p>
          <EmailCampaignBulkSendForm
            campaignId={detail.id}
            recipientCount={detail.liveRecipientCount}
            mode="start"
          />
        </section>
      ) : null}

      {detail.canContinueBulk ? (
        <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
          <h2 className="text-lg font-semibold tracking-tight">
            Continue sending
          </h2>
          <p className="text-sm text-[var(--heading)]">
            Pending recipients remaining: <strong>{detail.pendingCount}</strong>
          </p>
          <EmailCampaignBulkSendForm
            campaignId={detail.id}
            recipientCount={detail.liveRecipientCount}
            mode="continue"
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Send log</h2>
        {detail.logs.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No recipient logs yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  <th className="py-2 pr-3 font-semibold">Email</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Error</th>
                  <th className="py-2 font-semibold">Sent</th>
                </tr>
              </thead>
              <tbody>
                {detail.logs.map((log) => (
                  <tr key={log.id} className="border-b border-[var(--border)]">
                    <td className="py-3 pr-3">{log.email}</td>
                    <td className="py-3 pr-3">{log.statusLabel}</td>
                    <td className="py-3 pr-3">{log.errorCode || "—"}</td>
                    <td className="py-3 whitespace-nowrap">
                      {log.sentAtLabel || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
