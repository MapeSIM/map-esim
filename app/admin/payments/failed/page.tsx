import { requireRole } from "@/app/lib/auth/session";
import { listFailedGatewayPaymentAttempts } from "@/app/lib/admin/failedPaymentAttempts";
import { AdminButton, AdminStatusPill } from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Failed payment data is temporarily unavailable. Please refresh shortly.";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

const CARD_CLASS =
  "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm";

export default async function AdminFailedPaymentsPage() {
  await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listFailedGatewayPaymentAttempts>>;
  try {
    rows = await listFailedGatewayPaymentAttempts(40);
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Failed payments</h1>
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
        <h1 className="text-2xl font-bold tracking-tight">Failed payments</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Failed and cancelled gateway payment attempts. This list is
          read-only and does not cancel, refund, or mark a purchase funded.
        </p>
        <p className="mt-2 flex flex-wrap gap-2 text-sm">
          <AdminButton href="/admin/payments" variant="ghost" size="sm">
            Payments hub
          </AdminButton>
          <AdminButton href="/admin/payments/pending" variant="ghost" size="sm">
            Pending payments
          </AdminButton>
          <AdminButton
            href="/admin/payments/webhooks"
            variant="ghost"
            size="sm"
          >
            Webhook receipts
          </AdminButton>
        </p>
      </header>

      {rows.length === 0 ? (
        <div className={EMPTY_CLASS}>
          No failed or cancelled gateway payment attempts right now.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.attemptId} className={CARD_CLASS}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusPill value={row.statusLabel}>
                      {row.statusLabel}
                    </AdminStatusPill>
                    <span className="font-semibold text-[var(--heading)]">
                      {row.amountLabel}
                    </span>
                  </div>
                  <p className="break-words text-[var(--text-muted)]">
                    {row.customerLabel}
                  </p>
                  <p className="break-words text-[var(--text-muted)]">
                    {row.planLabel}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    Reason {row.failureReason}
                  </p>
                  <p className="text-xs text-[var(--text-soft)]">
                    {row.occurredAtLabel} · attempt {row.attemptId} · purchase{" "}
                    {row.purchaseId}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <AdminButton
                    href={`/admin/payments/${encodeURIComponent(row.attemptId)}`}
                    variant="primary"
                  >
                    Open payment
                  </AdminButton>
                  {row.customerHref ? (
                    <AdminButton href={row.customerHref} variant="secondary">
                      View customer
                    </AdminButton>
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
