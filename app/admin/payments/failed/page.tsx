import { requireRole } from "@/app/lib/auth/session";
import { ADMIN_UX_NAV, ADMIN_UX_PAGE } from "@/app/lib/admin/adminUxCopy";
import { listFailedGatewayPaymentAttempts } from "@/app/lib/admin/failedPaymentAttempts";
import {
  AdminButton,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatusPill,
  ADMIN_LIST_CARD_CLASS,
  ADMIN_PAGE_STACK_CLASS,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Failed payment data is temporarily unavailable. Please refresh shortly.";

export default async function AdminFailedPaymentsPage() {
  await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listFailedGatewayPaymentAttempts>>;
  try {
    rows = await listFailedGatewayPaymentAttempts(40);
  } catch {
    return (
      <div className={ADMIN_PAGE_STACK_CLASS}>
        <AdminPageHeader title={ADMIN_UX_PAGE.failedPayments.title} />
        <AdminEmptyState title="Temporarily unavailable">
          {UNAVAILABLE}
        </AdminEmptyState>
      </div>
    );
  }

  return (
    <div className={ADMIN_PAGE_STACK_CLASS}>
      <AdminPageHeader
        title={ADMIN_UX_PAGE.failedPayments.title}
        description={ADMIN_UX_PAGE.failedPayments.description}
        actions={
          <>
            <AdminButton href="/admin/payments" variant="ghost" size="sm">
              {ADMIN_UX_NAV.payments}
            </AdminButton>
            <AdminButton
              href="/admin/payments/pending"
              variant="ghost"
              size="sm"
            >
              {ADMIN_UX_NAV.verifyPending}
            </AdminButton>
            <AdminButton
              href="/admin/payments/webhooks"
              variant="ghost"
              size="sm"
            >
              {ADMIN_UX_NAV.webhookReceipts}
            </AdminButton>
          </>
        }
      />

      {rows.length === 0 ? (
        <AdminEmptyState
          title="No failed or cancelled payments"
          actionHref="/admin/payments"
          actionLabel="Open Payments inbox"
        >
          There are no recent failed or cancelled gateway attempts to review.
        </AdminEmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.attemptId} className={ADMIN_LIST_CARD_CLASS}>
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
                  <p className="break-all text-xs text-[var(--text-soft)]">
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
