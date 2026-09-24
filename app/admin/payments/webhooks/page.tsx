import { requireRole } from "@/app/lib/auth/session";
import { ADMIN_UX_NAV, ADMIN_UX_PAGE } from "@/app/lib/admin/adminUxCopy";
import { listPaymentWebhookReceipts } from "@/app/lib/admin/paymentWebhookReceipts";
import {
  AdminButton,
  AdminEmptyState,
  AdminPageHeader,
  ADMIN_LIST_CARD_CLASS,
  ADMIN_PAGE_STACK_CLASS,
} from "@/app/components/admin/ui";

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
      <div className={ADMIN_PAGE_STACK_CLASS}>
        <AdminPageHeader title={ADMIN_UX_PAGE.webhookReceipts.title} />
        <AdminEmptyState title="Temporarily unavailable">
          {UNAVAILABLE}
        </AdminEmptyState>
      </div>
    );
  }

  return (
    <div className={ADMIN_PAGE_STACK_CLASS}>
      <AdminPageHeader
        title={ADMIN_UX_PAGE.webhookReceipts.title}
        description={ADMIN_UX_PAGE.webhookReceipts.description}
        meta={
          <>
            Delivery observability for payment gateway webhooks and rejected
            posts. This list is read-only. It does not replay events, fund a
            purchase, or enable the payment gateway.
          </>
        }
        actions={
          <>
            <AdminButton href="/admin/payments" variant="ghost" size="sm">
              ← {ADMIN_UX_NAV.payments}
            </AdminButton>
            <AdminButton
              href="/admin/payments/pending"
              variant="ghost"
              size="sm"
            >
              {ADMIN_UX_NAV.verifyPending}
            </AdminButton>
            <AdminButton
              href="/admin/payments/failed"
              variant="ghost"
              size="sm"
            >
              {ADMIN_UX_NAV.failedPayments}
            </AdminButton>
          </>
        }
      />

      {rows.length === 0 ? (
        <AdminEmptyState
          title="No webhook receipts yet"
          actionHref="/admin/payments"
          actionLabel="Open Payments inbox"
        >
          No gateway webhook receipts have been recorded yet. Receipts appear
          here after the gateway posts to the webhook endpoint.
        </AdminEmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className={ADMIN_LIST_CARD_CLASS}>
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
                    <AdminButton href={row.attemptHref} variant="secondary">
                      View attempt
                    </AdminButton>
                  ) : null}
                  {row.topupHref ? (
                    <AdminButton href={row.topupHref} variant="secondary">
                      View top-up
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
