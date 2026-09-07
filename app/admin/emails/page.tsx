import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listAdminEmailCenter } from "@/app/lib/admin/emailCenter";
import {
  emailCenterTabHref,
  parseEmailCenterTab,
  type EmailCenterTab,
} from "@/app/lib/admin/emailCenterShared";
import EmailCenterRetryButton from "@/app/components/admin/EmailCenterRetryButton";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Email log data is temporarily unavailable. Please refresh shortly.";

const TABS: { id: EmailCenterTab; label: string }[] = [
  { id: "all", label: "Email Logs" },
  { id: "failed", label: "Failed Emails" },
];

function shortTarget(id: string): string {
  const t = id.trim();
  if (!t) return "—";
  if (t.length <= 12) return t;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

export default async function AdminEmailCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireRole("ADMIN");
  const query = await searchParams;
  const tab = parseEmailCenterTab(query.tab);

  let rows: Awaited<ReturnType<typeof listAdminEmailCenter>>;
  try {
    rows = await listAdminEmailCenter({ tab, limit: 80 });
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Email Center</h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">{UNAVAILABLE}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">Email Center</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Outgoing notification emails with delivery status. Retry Send reuses
          existing email helpers only — it does not change payment, refund, or
          wallet money movement.
        </p>
      </header>

      <nav className="flex min-w-0 flex-wrap gap-2" aria-label="Email Center tabs">
        {TABS.map((item) => {
          const active = item.id === tab;
          return (
            <Link
              key={item.id}
              href={emailCenterTabHref(item.id)}
              className={
                active
                  ? "inline-flex h-10 items-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white"
                  : "inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)]"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          {tab === "failed"
            ? "No failed or not-configured outgoing emails right now."
            : "No outgoing email attempts recorded yet."}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-[var(--heading)]">
                    {row.actionLabel}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    Status{" "}
                    <span className="font-medium text-[var(--heading)]">
                      {row.deliveryStatusLabel}
                    </span>
                    <span className="text-[var(--text-soft)]">
                      {" "}
                      ({row.deliveryStatus})
                    </span>
                  </p>
                  {row.failureReason ? (
                    <p className="text-[var(--text-muted)]">
                      Failure reason{" "}
                      <span className="font-medium text-[var(--heading)]">
                        {row.failureReason}
                      </span>
                    </p>
                  ) : null}
                  <p className="text-xs text-[var(--text-soft)]">
                    {row.createdAtLabel} · {row.targetType}{" "}
                    {shortTarget(row.targetId)}
                  </p>
                </div>
                {row.canRetry && row.retryKind ? (
                  <EmailCenterRetryButton
                    retryKind={row.retryKind}
                    targetId={row.targetId}
                    emailEvent={row.emailEvent}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
