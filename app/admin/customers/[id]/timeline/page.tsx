import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { getAdminCustomerSupportTimeline } from "@/app/lib/admin/customerSupportTimeline";
import { ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT } from "@/app/lib/admin/customerSupportTimelineShared";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Support timeline data is temporarily unavailable. Please refresh shortly.";

export default async function AdminCustomerSupportTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;

  let result: Awaited<ReturnType<typeof getAdminCustomerSupportTimeline>>;
  try {
    result = await getAdminCustomerSupportTimeline(id);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href={`/admin/customers/${encodeURIComponent(id)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customer
        </Link>
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

  if (!result) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/admin/customers/${encodeURIComponent(result.customerId)}`}
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customer
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Support timeline
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Read-only history for {result.customerName}. Newest{" "}
          {ADMIN_CUSTOMER_SUPPORT_TIMELINE_LIMIT} events from existing
          purchases, payments, webhook receipts, orders, wallet ledger,
          refunds, email timestamps, and relevant audits. This timeline is
          read-only. It does not replay webhooks, fund a purchase, or show
          install identifiers, QR codes, or payment secrets.
        </p>
      </header>

      {result.events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No support timeline events for this customer yet.
        </div>
      ) : (
        <ol className="space-y-3">
          {result.events.map((event) => (
            <li
              key={event.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    {event.sourceLabel} · {event.occurredAtLabel}
                  </p>
                  <p className="font-semibold text-[var(--heading)]">
                    {event.title}
                  </p>
                  <p className="break-words text-[var(--text-muted)]">
                    {event.detail}
                  </p>
                </div>
                {event.href && event.hrefLabel ? (
                  <Link
                    href={event.href}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)]"
                  >
                    {event.hrefLabel}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
