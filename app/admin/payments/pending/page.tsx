import { requireRole } from "@/app/lib/auth/session";
import { listPendingGatewayPaymentAttempts } from "@/app/lib/admin/pendingPaymentVerify";
import { AdminButton, AdminStatusPill } from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Pending payment data is temporarily unavailable. Please refresh shortly.";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

const CARD_CLASS =
  "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm";

export default async function AdminPendingPaymentsPage() {
  await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listPendingGatewayPaymentAttempts>>;
  try {
    rows = await listPendingGatewayPaymentAttempts(40);
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Pending payments</h1>
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
        <h1 className="text-2xl font-bold tracking-tight">Pending payments</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Inspect gateway payment attempts with authenticated Safepay reporter
          or Simpaisa Inquire checks. Successful evidence still requires an
          authoritative webhook before funding. Admin never funds or marks paid.
        </p>
        <p className="mt-2 flex flex-wrap gap-2 text-sm">
          <AdminButton href="/admin/payments" variant="ghost" size="sm">
            Payments hub
          </AdminButton>
          <AdminButton href="/admin/payments/failed" variant="ghost" size="sm">
            Failed payments
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
          No awaiting gateway payment attempts right now.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.attemptId} className={CARD_CLASS}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <p className="font-semibold text-[var(--heading)]">
                    Attempt {row.attemptId}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    Purchase {row.purchaseId}
                    {row.gatewayProvider
                      ? ` · ${row.gatewayProvider}`
                      : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusPill value={row.attemptStatus}>
                      {row.attemptStatus}
                    </AdminStatusPill>
                    <AdminStatusPill value={row.purchaseStatus}>
                      {row.purchaseStatus}
                    </AdminStatusPill>
                    <span className="text-xs text-[var(--text-soft)]">
                      {row.gatewayAmountCents} {row.currency}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-soft)]">
                    Tracker {row.trackerRefMasked}
                    {row.walletAppliedCents > 0
                      ? ` · wallet reserved ${row.walletAppliedCents}`
                      : " · gateway-only"}
                  </p>
                </div>
                <AdminButton
                  href={`/admin/payments/${encodeURIComponent(row.attemptId)}`}
                  variant="primary"
                >
                  Open
                </AdminButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
