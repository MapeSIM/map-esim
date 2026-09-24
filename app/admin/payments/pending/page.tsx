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
        <h1 className="text-2xl font-bold tracking-tight">
          {ADMIN_UX_PAGE.verifyPending.title}
        </h1>
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
        <h1 className="text-2xl font-bold tracking-tight">
          {ADMIN_UX_PAGE.verifyPending.title}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {ADMIN_UX_PAGE.verifyPending.description}
        </p>
        <p className="mt-2 flex flex-wrap gap-2 text-sm">
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
          <AdminButton href="/admin/payments/failed" variant="ghost" size="sm">
            {ADMIN_UX_NAV.failedPayments}
          </AdminButton>
          <AdminButton
            href="/admin/payments/webhooks"
            variant="ghost"
            size="sm"
          >
            {ADMIN_UX_NAV.webhookReceipts}
          </AdminButton>
        </p>
      </header>

      {rows.length === 0 ? (
        <div className={EMPTY_CLASS}>
          No awaiting gateway payment attempts right now.
        </div>
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
