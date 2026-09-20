import {
  getTestDataCleanupPreviewCounts,
  requireActiveAdminForTestDataCleanupPreview,
} from "@/app/lib/admin/testDataCleanupPreview";
import { TEST_DATA_CLEANUP_PREVIEW_WARNING } from "@/app/lib/admin/testDataCleanupPreviewShared";
import {
  AdminButton,
  AdminKpiCard,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Test data cleanup preview is temporarily unavailable. Please refresh shortly.";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5";

export default async function AdminTestDataCleanupPreviewPage() {
  await requireActiveAdminForTestDataCleanupPreview();

  let data: Awaited<ReturnType<typeof getTestDataCleanupPreviewCounts>>;
  try {
    data = await getTestDataCleanupPreviewCounts();
  } catch {
    return (
      <div className="min-w-0 space-y-6">
        <header className="min-w-0 space-y-2">
          <AdminButton href="/admin" variant="ghost" size="sm">
            ← Overview
          </AdminButton>
          <h1 className="text-2xl font-bold tracking-tight">
            Test Data Cleanup Preview
          </h1>
        </header>
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

  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0 space-y-3">
        <AdminButton href="/admin" variant="ghost" size="sm">
          ← Overview
        </AdminButton>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Test Data Cleanup Preview
          </h1>
          <p
            className="mt-2 max-w-3xl rounded-xl border border-amber-600/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
            role="status"
            data-test-data-cleanup-preview-warning="true"
          >
            {TEST_DATA_CLEANUP_PREVIEW_WARNING}
          </p>
          <p className="mt-2 text-xs text-[var(--text-soft)]">
            Counts checked {data.generatedAtLabel} · read-only · no delete
            actions on this page
          </p>
        </div>
      </header>

      <section aria-labelledby="cleanup-payment-heading" className={CARD_CLASS}>
        <h2
          id="cleanup-payment-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Payment Data
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminKpiCard
            label="Payment attempts (total)"
            value={data.paymentAttemptsTotal}
          />
          <AdminKpiCard
            label="Payment attempts (pending)"
            value={data.paymentAttemptsPending}
          />
          <AdminKpiCard
            label="Payment attempts (failed)"
            value={data.paymentAttemptsFailed}
          />
          <AdminKpiCard
            label="Webhook receipts"
            value={data.paymentWebhookReceipts}
          />
        </div>
      </section>

      <section
        aria-labelledby="cleanup-notifications-heading"
        className={CARD_CLASS}
      >
        <h2
          id="cleanup-notifications-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Notifications
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <AdminKpiCard
            label="Alert states"
            value={data.alertNotificationStates}
          />
          <AdminKpiCard
            label="Alert deliveries"
            value={data.alertNotificationDeliveries}
          />
        </div>
      </section>

      <section aria-labelledby="cleanup-refunds-heading" className={CARD_CLASS}>
        <h2
          id="cleanup-refunds-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Refunds
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <AdminKpiCard
            label="Customer refund requests"
            value={data.refundRequests}
          />
          <AdminKpiCard
            label="Partner refund requests"
            value={data.partnerRefundRequests}
          />
        </div>
      </section>

      <section aria-labelledby="cleanup-wallet-heading" className={CARD_CLASS}>
        <h2
          id="cleanup-wallet-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Wallet
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminKpiCard
            label="Eligible customer topups"
            value={data.walletTopupsNonCredited}
          />
          <AdminKpiCard
            label="Protected credited customer topups"
            value={data.walletTopupsCreditedProtected}
          />
          <AdminKpiCard
            label="Eligible partner topups"
            value={data.partnerWalletTopupsNonCredited}
          />
          <AdminKpiCard
            label="Protected credited partner topups"
            value={data.partnerWalletTopupsCreditedProtected}
          />
        </div>
      </section>

      <section
        aria-labelledby="cleanup-protected-heading"
        className={CARD_CLASS}
        data-test-data-cleanup-protected="true"
      >
        <h2
          id="cleanup-protected-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Protected
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          These records will remain. Phase 1 never deletes customers, partners,
          or orders.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <AdminKpiCard
            label="Customers (will remain)"
            value={data.customersProtected}
          />
          <AdminKpiCard
            label="Partners (will remain)"
            value={data.partnersProtected}
          />
          <AdminKpiCard
            label="Orders (will remain)"
            value={data.ordersProtected}
          />
        </div>
      </section>
    </div>
  );
}
