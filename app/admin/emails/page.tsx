import { requireRole } from "@/app/lib/auth/session";
import { getAdminEmailCenterPage } from "@/app/lib/admin/emailCenter";
import {
  EMAIL_CENTER_CATEGORIES,
  EMAIL_CENTER_RESEND_SAFE_HINT,
  EMAIL_CENTER_TABS,
  buildAdminEmailCenterHref,
  emailCenterCategoryLabel,
  type EmailCenterTab,
} from "@/app/lib/admin/emailCenterShared";
import EmailCenterRetryButton from "@/app/components/admin/EmailCenterRetryButton";
import { AdminButton, AdminKpiCard } from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Email log data is temporarily unavailable. Please refresh shortly.";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

function shortTarget(id: string): string {
  const t = id.trim();
  if (!t) return "—";
  if (t.length <= 12) return t;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

const TAB_LABELS: Record<EmailCenterTab, string> = {
  all: "Email Logs",
  failed: "Failed Emails",
};

export default async function AdminEmailCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string; q?: string }>;
}) {
  await requireRole("ADMIN");
  const query = await searchParams;

  let data: Awaited<ReturnType<typeof getAdminEmailCenterPage>>;
  try {
    data = await getAdminEmailCenterPage({
      tab: query.tab,
      category: query.category,
      q: query.q,
      limit: 80,
    });
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

  const filterBase = {
    tab: data.tab,
    category: data.category,
    q: data.search,
  };

  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">Email Center</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Review outgoing notification emails by status and type. Retrying a
          send only reuses existing email helpers — it never moves money or
          changes payment, refund, or wallet outcomes.
        </p>
      </header>

      <section
        aria-label="Email summary"
        className="grid gap-3 sm:grid-cols-3"
        data-email-center-summary="true"
      >
        <AdminKpiCard label="Sent" value={data.summary.sent} />
        <AdminKpiCard label="Failed" value={data.summary.failed} />
        <AdminKpiCard label="Pending" value={data.summary.pending} />
      </section>

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-2 lg:grid-cols-4"
        data-email-center-filters="true"
      >
        {data.tab === "failed" ? (
          <input type="hidden" name="tab" value="failed" />
        ) : null}
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={data.search}
            maxLength={100}
            placeholder="Recipient reference, order/id, or email type"
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Category
          </span>
          <select
            name="category"
            defaultValue={data.category}
            className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            {EMAIL_CENTER_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {emailCenterCategoryLabel(category)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <AdminButton type="submit" variant="primary" size="sm" className="!h-11">
            Apply filters
          </AdminButton>
          {data.search || data.category !== "all" ? (
            <AdminButton
              href={buildAdminEmailCenterHref({ tab: data.tab })}
              variant="ghost"
              size="sm"
              className="!h-11"
            >
              Clear
            </AdminButton>
          ) : null}
        </div>
      </form>

      <nav className="flex min-w-0 flex-wrap gap-2" aria-label="Email Center tabs">
        {EMAIL_CENTER_TABS.map((tab) => {
          const active = tab === data.tab;
          return (
            <AdminButton
              key={tab}
              href={buildAdminEmailCenterHref({
                ...filterBase,
                tab,
              })}
              variant={active ? "primary" : "secondary"}
              size="sm"
              className="!h-10 !px-4 !text-sm"
            >
              {TAB_LABELS[tab]}
            </AdminButton>
          );
        })}
      </nav>

      <p className="text-sm text-[var(--text-muted)]">
        Showing {data.rows.length} of {data.totalBeforeFilter} recent email
        attempt{data.totalBeforeFilter === 1 ? "" : "s"}
        {data.category !== "all"
          ? ` · ${emailCenterCategoryLabel(data.category)}`
          : ""}
        {data.search ? ` · search “${data.search}”` : ""}
      </p>

      {data.rows.length === 0 ? (
        <div className={EMPTY_CLASS} role="status">
          {data.tab === "failed"
            ? "No failed or not-configured outgoing emails match the current filters."
            : "No outgoing email attempts match the current filters."}
        </div>
      ) : (
        <ul className="space-y-3" data-email-center-list="true">
          {data.rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
              data-email-center-detail="true"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                      Email type
                    </p>
                    <p className="mt-0.5 font-semibold text-[var(--heading)]">
                      {row.actionLabel}
                    </p>
                  </div>

                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                        Status
                      </dt>
                      <dd className="mt-0.5 font-medium text-[var(--heading)]">
                        {row.deliveryStatusLabel}
                        <span className="ml-1 text-xs font-normal text-[var(--text-soft)]">
                          ({row.deliveryStatus})
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                        When
                      </dt>
                      <dd className="mt-0.5 text-[var(--text-muted)]">
                        {row.createdAtLabel}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                        Order / reference
                      </dt>
                      <dd className="mt-0.5 text-[var(--heading)]">
                        {row.orderId ? shortTarget(row.orderId) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                        Target
                      </dt>
                      <dd className="mt-0.5 text-[var(--text-muted)]">
                        {row.targetType} {shortTarget(row.targetId)}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                        Recipient search hint
                      </dt>
                      <dd className="mt-0.5 text-xs text-[var(--text-soft)]">
                        Search uses email type and order/reference ids. Full
                        mailbox addresses are not stored in this log view.
                      </dd>
                    </div>
                  </dl>

                  {row.failureReason ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                        Failure reason
                      </p>
                      <p className="mt-0.5 font-medium text-[var(--heading)]">
                        {row.failureReason}
                      </p>
                    </div>
                  ) : null}

                  {row.canRetry ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      {EMAIL_CENTER_RESEND_SAFE_HINT}
                    </p>
                  ) : null}
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
