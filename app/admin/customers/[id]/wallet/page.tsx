import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAdminAccess } from "@/app/lib/admin/adminPermissionAccess";
import { hasAdminPermission } from "@/app/lib/admin/adminPermissions";
import { getAdminWalletLedgerPage } from "@/app/lib/admin/walletLedger";
import { buildAdminWalletLedgerHref } from "@/app/lib/admin/walletLedgerShared";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Wallet ledger data is temporarily unavailable. Please refresh shortly.";

export default async function AdminCustomerWalletLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const admin = await requireRole("ADMIN");
  const access = await loadAdminAccess(admin.id);
  const canAdjustWallet = hasAdminPermission(
    access?.permissions ?? [],
    "WALLET_ADJUST"
  );
  const canViewTransactions = hasAdminPermission(
    access?.permissions ?? [],
    "TRANSACTIONS_VIEW"
  );
  const canViewPayments = hasAdminPermission(access?.permissions ?? [], [
    "TRANSACTIONS_VIEW",
    "PAYMENTS_MANAGE",
  ]);
  const canViewOrders = hasAdminPermission(access?.permissions ?? [], [
    "ORDERS_VIEW",
    "ORDERS_MANAGE",
  ]);
  const { id: rawId } = await params;
  const sp = await searchParams;

  let data: Awaited<ReturnType<typeof getAdminWalletLedgerPage>>;
  try {
    data = await getAdminWalletLedgerPage({
      customerUserId: rawId,
      page: sp.page,
    });
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Wallet ledger</h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">{UNAVAILABLE}</p>
        </div>
      </div>
    );
  }

  if (!data) notFound();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm">
          <Link
            href={`/admin/customers/${encodeURIComponent(data.customerId)}`}
            className="font-semibold text-[var(--accent-strong)]"
          >
            ← Customer
          </Link>
          <span className="text-[var(--text-soft)]"> · </span>
          <Link
            href={`/admin/customers/${encodeURIComponent(data.customerId)}/timeline`}
            className="font-semibold text-[var(--accent-strong)]"
          >
            Timeline
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Wallet ledger</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Read-only investigate view of MAP Wallet history. This page never
          changes balance, never marks paid, and never releases reservations.
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm sm:p-5">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Customer
            </dt>
            <dd className="mt-1 font-medium text-[var(--heading)]">
              {data.customerName} · {data.customerEmailMasked}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Available balance
            </dt>
            <dd className="mt-1 font-medium text-[var(--heading)]">
              {data.balanceLabel} {data.currency}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Wallet status
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {data.hasWallet ? data.walletStatusLabel : "Not created"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Account
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {data.accountActive ? "Active" : "Inactive"}
            </dd>
          </div>
        </dl>

        {data.accountActive ? (
          <p className="mt-4 flex flex-wrap gap-3 text-sm">
            {canAdjustWallet ? (
              <Link
                href={`/admin/customers/${encodeURIComponent(data.customerId)}/wallet/credit`}
                className="font-semibold text-[var(--accent-strong)]"
              >
                Add credit
              </Link>
            ) : null}
            {canAdjustWallet && data.hasWallet && data.balanceCents > 0 ? (
              <Link
                href={`/admin/customers/${encodeURIComponent(data.customerId)}/wallet/debit`}
                className="font-semibold text-[var(--accent-strong)]"
              >
                Deduct funds
              </Link>
            ) : null}
            {canViewTransactions ? (
              <Link
                href="/admin/wallet-topups"
                className="font-semibold text-[var(--accent-strong)]"
              >
                Wallet top-ups
              </Link>
            ) : null}
            {canViewPayments ? (
              <Link
                href="/admin/payments"
                className="font-semibold text-[var(--accent-strong)]"
              >
                Payments hub
              </Link>
            ) : null}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            Transaction history
          </h2>
          <p className="text-xs text-[var(--text-soft)]">
            {data.totalCount} total · page {data.page} / {data.totalPages}
          </p>
        </div>

        {!data.hasWallet ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
            Wallet not created yet. Viewing never creates a wallet.
          </div>
        ) : data.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
            No wallet transactions yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
                <tr>
                  <th className="px-3 py-3 font-semibold">When</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Lifecycle</th>
                  <th className="px-3 py-3 font-semibold">Amount</th>
                  <th className="px-3 py-3 font-semibold">Related</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-3 align-top text-xs text-[var(--text-soft)]">
                      <p>{row.createdAtLabel}</p>
                      <p className="mt-1 break-all">{row.id}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-[var(--heading)]">
                        {row.typeLabel}
                      </p>
                      <p className="text-xs text-[var(--text-soft)]">
                        {row.directionLabel} · {row.statusLabel}
                      </p>
                      {row.balanceAfterLabel ? (
                        <p className="text-xs text-[var(--text-soft)]">
                          bal {row.balanceAfterLabel}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="font-semibold text-[var(--heading)]">
                        {row.lifecycleLabel}
                      </p>
                      {row.referenceLabel ? (
                        <p className="text-xs text-[var(--text-soft)]">
                          Ref {row.referenceLabel}
                        </p>
                      ) : null}
                      {row.notificationLabel ? (
                        <p className="text-xs text-[var(--text-soft)]">
                          {row.notificationLabel}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top font-semibold tabular-nums text-[var(--heading)]">
                      {row.amountLabel}
                    </td>
                    <td className="px-3 py-3 align-top text-xs">
                      {row.purchaseHref && row.purchaseId ? (
                        <p>
                          <Link
                            href={row.purchaseHref}
                            className="font-semibold text-[var(--accent-strong)]"
                          >
                            Purchase {row.purchaseId}
                          </Link>
                          {row.purchaseStatus ? (
                            <span className="text-[var(--text-soft)]">
                              {" "}
                              · {row.purchaseStatus}
                            </span>
                          ) : null}
                        </p>
                      ) : (
                        <p className="text-[var(--text-soft)]">No purchase</p>
                      )}
                      {row.paymentAttemptHref && row.paymentAttemptId ? (
                        canViewPayments ? (
                          <p className="mt-1">
                            <Link
                              href={row.paymentAttemptHref}
                              className="font-semibold text-[var(--accent-strong)]"
                            >
                              Payment {row.paymentAttemptId}
                            </Link>
                          </p>
                        ) : (
                          <p className="mt-1 text-[var(--text-soft)]">
                            Payment recorded
                          </p>
                        )
                      ) : (
                        <p className="mt-1 text-[var(--text-soft)]">
                          No payment attempt
                        </p>
                      )}
                      {canViewOrders && row.orderHref && row.orderId ? (
                        <p className="mt-1">
                          <Link
                            href={row.orderHref}
                            className="font-semibold text-[var(--accent-strong)]"
                          >
                            Order {row.orderId}
                          </Link>
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.totalPages > 1 ? (
          <div className="flex flex-wrap gap-2">
            {data.page > 1 ? (
              <Link
                href={buildAdminWalletLedgerHref({
                  customerId: data.customerId,
                  page: data.page - 1,
                })}
                className="rounded-xl border border-[var(--border-strong)] px-3 py-2 text-sm font-semibold text-[var(--heading)]"
              >
                Previous
              </Link>
            ) : null}
            {data.page < data.totalPages ? (
              <Link
                href={buildAdminWalletLedgerHref({
                  customerId: data.customerId,
                  page: data.page + 1,
                })}
                className="rounded-xl border border-[var(--border-strong)] px-3 py-2 text-sm font-semibold text-[var(--heading)]"
              >
                Next
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
