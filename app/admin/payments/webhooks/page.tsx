import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listPaymentWebhookReceipts } from "@/app/lib/admin/paymentWebhookReceipts";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Webhook receipt data is temporarily unavailable. Please refresh shortly.";

export default async function AdminPaymentWebhooksPage() {
  await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listPaymentWebhookReceipts>>;
  try {
    rows = await listPaymentWebhookReceipts(40);
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Webhook receipts</h1>
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
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Webhook receipts</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Delivery observability for signed Safepay webhooks and rejected
          posts. This list is read-only. It does not replay events, fund a
          purchase, or enable the payment gateway.
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/admin/payments/pending"
            className="font-semibold text-[var(--accent-strong)]"
          >
            Pending payments
          </Link>
          <span className="text-[var(--text-soft)]"> · </span>
          <Link
            href="/admin/payments/failed"
            className="font-semibold text-[var(--accent-strong)]"
          >
            Failed payments
          </Link>
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No webhook receipts recorded yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-[var(--heading)]">
                    {row.logCode} · HTTP {row.httpStatusLabel}
                  </p>
                  <p className="break-words text-[var(--text-muted)]">
                    {row.signatureLabel} · {row.parseLabel} · {row.outcomeLabel}
                  </p>
                  <p className="break-words text-[var(--text-muted)]">
                    Event {row.eventIdLabel} · {row.eventTypeLabel}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    Tracker {row.trackerMasked} · {row.providerLabel}
                  </p>
                  <p className="text-xs text-[var(--text-soft)]">
                    {row.receivedAtLabel}
                    {row.paymentAttemptId
                      ? ` · attempt ${row.paymentAttemptId}`
                      : ""}
                    {row.topupId ? ` · top-up ${row.topupId}` : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  {row.attemptHref ? (
                    <Link
                      href={row.attemptHref}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)]"
                    >
                      View attempt
                    </Link>
                  ) : null}
                  {row.topupHref ? (
                    <Link
                      href={row.topupHref}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)]"
                    >
                      View top-up
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
