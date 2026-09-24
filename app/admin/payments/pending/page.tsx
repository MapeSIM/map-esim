import { requireRole } from "@/app/lib/auth/session";
import {
  adminWalletReservationStatusLabel,
  buildAdminWalletPurchaseReconciliationHref,
  formatAdminReservedWalletListFragment,
  isAdminWalletReconciliationLinkApplicable,
} from "@/app/lib/admin/adminWalletReservationDisplay";
import { ADMIN_UX_NAV, ADMIN_UX_PAGE } from "@/app/lib/admin/adminUxCopy";
import { listPendingGatewayPaymentAttempts } from "@/app/lib/admin/pendingPaymentVerify";
import { formatUsdCents } from "@/app/lib/wallet/display";
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
  "Pending payment data is temporarily unavailable. Please refresh shortly.";

export default async function AdminPendingPaymentsPage() {
  await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listPendingGatewayPaymentAttempts>>;
  try {
    rows = await listPendingGatewayPaymentAttempts(40);
  } catch {
    return (
      <div className={ADMIN_PAGE_STACK_CLASS}>
        <AdminPageHeader title={ADMIN_UX_PAGE.verifyPending.title} />
        <AdminEmptyState title="Temporarily unavailable">
          {UNAVAILABLE}
        </AdminEmptyState>
      </div>
    );
  }

  return (
    <div className={ADMIN_PAGE_STACK_CLASS}>
      <AdminPageHeader
        title={ADMIN_UX_PAGE.verifyPending.title}
        description={ADMIN_UX_PAGE.verifyPending.description}
        actions={
          <>
            <AdminButton href="/admin/payments" variant="ghost" size="sm">
              {ADMIN_UX_NAV.payments}
            </AdminButton>
            <AdminButton
              href="/admin/payments/recovery"
              variant="ghost"
              size="sm"
            >
              {ADMIN_UX_NAV.staleUnpaidHolds}
            </AdminButton>
            <AdminButton
              href="/admin/payments/failed"
              variant="ghost"
              size="sm"
            >
              {ADMIN_UX_NAV.failedPayments}
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
          title="No awaiting gateway payments"
          actionHref="/admin/payments"
          actionLabel="Open Payments inbox"
        >
          Nothing is waiting on gateway payment right now. Check Stale Unpaid
          Holds if a customer reports a stuck checkout.
        </AdminEmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const reservedFragment = formatAdminReservedWalletListFragment(
              row.walletAppliedCents
            );
            const showRecon = isAdminWalletReconciliationLinkApplicable({
              purchaseStatus: row.purchaseStatus,
              attemptStatus: row.attemptStatus,
            });
            return (
              <li key={row.attemptId} className={ADMIN_LIST_CARD_CLASS}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <p className="break-all font-semibold text-[var(--heading)]">
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
                        {adminWalletReservationStatusLabel(row.attemptStatus)}
                      </AdminStatusPill>
                      <AdminStatusPill value={row.purchaseStatus}>
                        {adminWalletReservationStatusLabel(row.purchaseStatus)}
                      </AdminStatusPill>
                      <span className="text-xs text-[var(--text-soft)]">
                        {formatUsdCents(row.gatewayAmountCents)} {row.currency}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-soft)]">
                      Tracker {row.trackerRefMasked}
                      {reservedFragment
                        ? ` · ${reservedFragment}`
                        : " · gateway-only"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {showRecon ? (
                      <AdminButton
                        href={buildAdminWalletPurchaseReconciliationHref(
                          row.purchaseId
                        )}
                        variant="secondary"
                        size="sm"
                      >
                        {ADMIN_UX_NAV.stuckCases}
                      </AdminButton>
                    ) : null}
                    <AdminButton
                      href={`/admin/payments/${encodeURIComponent(row.attemptId)}`}
                      variant="primary"
                    >
                      Open
                    </AdminButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
