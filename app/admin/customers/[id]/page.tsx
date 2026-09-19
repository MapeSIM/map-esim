import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getAdminCustomerDetail } from "@/app/lib/admin/customers";
import { getAdminCustomerRecentOrders } from "@/app/lib/admin/orders";
import { getAdminCustomerRecentTopups } from "@/app/lib/admin/topups";
import { getAdminCustomerWalletSummary } from "@/app/lib/admin/wallet";
import { loadAdminAccess } from "@/app/lib/admin/adminPermissionAccess";
import { hasAdminPermission } from "@/app/lib/admin/adminPermissions";
import { ADMIN_DEBIT_MIN_CENTS } from "@/app/lib/wallet/amount";
import { CustomerBlockPanel } from "@/app/components/admin/CustomerBlockPanel";
import { requireRole } from "@/app/lib/auth/session";
import {
  AdminButton,
  AdminKpiCard,
  AdminStatusPill,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const CUSTOMERS_UNAVAILABLE =
  "Customer data is temporarily unavailable. Please refresh shortly.";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5";

const LIST_CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm";

const UNAVAILABLE_CLASS =
  "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8";

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-[var(--border)] py-3 last:border-b-0 sm:grid-cols-[220px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[var(--heading)] break-words">
        {value}
      </dd>
    </div>
  );
}

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireRole("ADMIN");
  const access = await loadAdminAccess(admin.id);
  const canFulfill = hasAdminPermission(
    access?.permissions ?? [],
    "ESIM_FULFILLMENT"
  );
  const canAdjustWallet = hasAdminPermission(
    access?.permissions ?? [],
    "WALLET_ADJUST"
  );
  const canViewOrders = hasAdminPermission(
    access?.permissions ?? [],
    ["ORDERS_VIEW", "ORDERS_MANAGE"]
  );
  const canViewTransactions = hasAdminPermission(
    access?.permissions ?? [],
    "TRANSACTIONS_VIEW"
  );
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getAdminCustomerDetail>>;
  try {
    detail = await getAdminCustomerDetail(id);
  } catch {
    return (
      <div className="min-w-0 space-y-6">
        <AdminButton href="/admin/customers" variant="ghost" size="sm">
          ← Back to customers
        </AdminButton>
        <div className={UNAVAILABLE_CLASS} role="status">
          <p className="text-sm font-medium text-[var(--heading)]">
            {CUSTOMERS_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  let wallet: Awaited<ReturnType<typeof getAdminCustomerWalletSummary>> = null;
  let walletUnavailable = false;
  try {
    wallet = await getAdminCustomerWalletSummary(detail.id);
  } catch {
    walletUnavailable = true;
  }

  let recentTopups: Awaited<ReturnType<typeof getAdminCustomerRecentTopups>> =
    [];
  let topupsUnavailable = false;
  try {
    recentTopups = await getAdminCustomerRecentTopups(detail.id, 5);
  } catch {
    topupsUnavailable = true;
  }

  let recentOrders: Awaited<ReturnType<typeof getAdminCustomerRecentOrders>> =
    [];
  let ordersUnavailable = false;
  try {
    recentOrders = await getAdminCustomerRecentOrders(detail.id);
  } catch {
    ordersUnavailable = true;
  }

  return (
    <div className="min-w-0 w-full max-w-full space-y-8">
      <header className="min-w-0 space-y-3">
        <AdminButton href="/admin/customers" variant="ghost" size="sm">
          ← Back to customers
        </AdminButton>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Customer detail
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Read-only CUSTOMER profile. Password hashes, OAuth tokens, and
            installation secrets are never shown.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusPill value={detail.accountStatusLabel}>
            {detail.accountStatusLabel}
          </AdminStatusPill>
          <AdminStatusPill value={detail.emailVerifiedLabel}>
            {detail.emailVerifiedLabel}
          </AdminStatusPill>
          <AdminButton
            href={`/admin/customers/${encodeURIComponent(detail.id)}/timeline`}
            variant="secondary"
            size="sm"
          >
            Support timeline
          </AdminButton>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Support timeline is read-only: purchases, payments, orders, wallet,
          refunds, emails, and audits.
        </p>
      </header>

      <section
        aria-label="Customer summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <AdminKpiCard
          label="Local orders"
          value={detail.localOrderCount}
        />
        <AdminKpiCard
          label="Completed orders"
          value={detail.completedOrderCount}
        />
        <AdminKpiCard
          label="Claimed orders"
          value={detail.claimedOrderCount}
        />
      </section>

      <dl className={CARD_CLASS}>
        <DetailRow label="Local customer ID" value={detail.id} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow label="Updated" value={detail.updatedAtLabel} />
        <DetailRow label="Name" value={detail.name} />
        <DetailRow label="Email" value={detail.email} />
        <DetailRow
          label="Role"
          value={
            <AdminStatusPill value={detail.roleLabel}>
              {detail.roleLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow
          label="Email verification"
          value={
            <AdminStatusPill value={detail.emailVerifiedLabel}>
              {detail.emailVerifiedLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow
          label="Verified at"
          value={detail.emailVerifiedAtLabel}
        />
        <DetailRow
          label="Account status"
          value={
            <AdminStatusPill value={detail.accountStatusLabel}>
              {detail.accountStatusLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow label="Deleted at" value={detail.deletedAtLabel} />
        <DetailRow label="Blocked at" value={detail.blockedAtLabel} />
        {detail.accountStatusLabel === "Blocked" ? (
          <DetailRow
            label="Block reason (admin only)"
            value={detail.blockedReasonLabel}
          />
        ) : null}
        <DetailRow
          label="Authentication method"
          value={detail.authMethodLabel}
        />
        <DetailRow
          label="Google account linked"
          value={
            <AdminStatusPill value={detail.googleLinkedLabel}>
              {detail.googleLinkedLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow
          label="Credentials available"
          value={
            <AdminStatusPill value={detail.credentialsAvailableLabel}>
              {detail.credentialsAvailableLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow
          label="Legal consent"
          value={
            <AdminStatusPill value={detail.legalConsentStatusLabel}>
              {detail.legalConsentStatusLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow
          label="Terms accepted at"
          value={detail.termsAcceptedAtLabel}
        />
        <DetailRow label="Terms version" value={detail.termsVersionLabel} />
        <DetailRow
          label="Privacy acknowledged at"
          value={detail.privacyAcknowledgedAtLabel}
        />
        <DetailRow
          label="Privacy version"
          value={detail.privacyVersionLabel}
        />
        <DetailRow
          label="Consent source"
          value={detail.legalConsentSourceLabel}
        />
        <DetailRow
          label="Local order count"
          value={String(detail.localOrderCount)}
        />
        <DetailRow
          label="Completed local orders"
          value={String(detail.completedOrderCount)}
        />
        <DetailRow
          label="Claimed orders"
          value={String(detail.claimedOrderCount)}
        />
      </dl>

      {detail.accountStatusLabel === "Active" ? (
        <CustomerBlockPanel
          customerUserId={detail.id}
          accountStatusVersion={detail.accountStatusVersion}
          mode="block"
        />
      ) : null}
      {detail.accountStatusLabel === "Blocked" ? (
        <CustomerBlockPanel
          customerUserId={detail.id}
          accountStatusVersion={detail.accountStatusVersion}
          mode="reactivate"
        />
      ) : null}

      {canViewOrders && detail.localOrderCount > 0 ? (
        <div>
          <AdminButton
            href={`/admin/orders?userId=${encodeURIComponent(detail.id)}`}
            variant="secondary"
            size="sm"
          >
            View linked local orders
          </AdminButton>
        </div>
      ) : null}

      <section className="min-w-0 w-full max-w-full space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">eSIM packages</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Company-funded assignment never charges the customer wallet.
              Assisted wallet purchase uses the customer&apos;s available balance.
            </p>
          </div>
          {canFulfill && detail.accountStatusLabel === "Active" ? (
            <div className="flex flex-wrap gap-2">
              <AdminButton
                href={`/admin/customers/${encodeURIComponent(detail.id)}/esim/assign`}
                variant="primary"
              >
                Assign eSIM package
              </AdminButton>
              <AdminButton
                href={`/admin/customers/${encodeURIComponent(detail.id)}/esim/wallet-buy`}
                variant="secondary"
              >
                Buy eSIM with wallet
              </AdminButton>
            </div>
          ) : null}
        </div>
      </section>

      <section className="min-w-0 w-full max-w-full space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Recent eSIM Orders
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Local orders linked to this customer. ICCID values stay masked;
              open an order to use secure reveal when authorized.
            </p>
          </div>
          {canViewOrders && detail.localOrderCount > 0 ? (
            <AdminButton
              href={`/admin/orders?userId=${encodeURIComponent(detail.id)}`}
              variant="ghost"
              size="sm"
            >
              View all linked orders
            </AdminButton>
          ) : null}
        </div>

        {ordersUnavailable ? (
          <div className={UNAVAILABLE_CLASS} role="status">
            <p className="text-sm font-medium text-[var(--heading)]">
              Order data is temporarily unavailable. Please refresh shortly.
            </p>
          </div>
        ) : recentOrders.length === 0 ? (
          <div className={EMPTY_CLASS}>
            No eSIM orders found for this customer.
          </div>
        ) : (
          <ul className="space-y-3">
            {recentOrders.map((order) => (
              <li key={order.id} className={LIST_CARD_CLASS}>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--heading)] break-words">
                        {order.destination}
                      </p>
                      <AdminStatusPill value={order.localStatus}>
                        {order.localStatus}
                      </AdminStatusPill>
                    </div>
                    <p className="text-[var(--text-muted)] break-words">
                      {order.planName}
                      {order.dataAllowance !== "Not available"
                        ? ` · ${order.dataAllowance}`
                        : ""}
                    </p>
                    <p className="font-semibold tabular-nums text-[var(--heading)]">
                      {order.amountLabel}
                    </p>
                    <dl className="grid gap-1 text-xs text-[var(--text-soft)] sm:grid-cols-2">
                      <div>
                        <dt className="inline font-semibold">Validity: </dt>
                        <dd className="inline">{order.validity}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">Currency: </dt>
                        <dd className="inline">{order.currencyLabel}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">Funding: </dt>
                        <dd className="inline">{order.fundingLabel}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">Purchased: </dt>
                        <dd className="inline">{order.purchasedAtLabel}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">ICCID: </dt>
                        <dd className="inline">{order.iccidMasked}</dd>
                      </div>
                    </dl>
                  </div>
                  {canViewOrders ? (
                    <AdminButton
                      href={`/admin/orders/${encodeURIComponent(order.id)}`}
                      variant="primary"
                      className="shrink-0"
                    >
                      View Order
                    </AdminButton>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0 w-full max-w-full space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Wallet</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Read-only balance and recent ledger activity. Viewing never creates
              a wallet.
            </p>
          </div>
          {canAdjustWallet && wallet?.accountActive ? (
            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap gap-2">
                <AdminButton
                  href={`/admin/customers/${encodeURIComponent(detail.id)}/wallet/credit`}
                  variant="primary"
                >
                  Add wallet credit
                </AdminButton>
                {wallet.hasWallet &&
                wallet.balanceCents >= ADMIN_DEBIT_MIN_CENTS ? (
                  <AdminButton
                    href={`/admin/customers/${encodeURIComponent(detail.id)}/wallet/debit`}
                    variant="secondary"
                  >
                    Deduct wallet funds
                  </AdminButton>
                ) : null}
              </div>
              {!(
                wallet.hasWallet && wallet.balanceCents >= ADMIN_DEBIT_MIN_CENTS
              ) ? (
                <p className="text-xs text-[var(--text-soft)] sm:text-right">
                  No wallet funds are available to deduct.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {walletUnavailable ? (
          <div className={UNAVAILABLE_CLASS} role="status">
            <p className="text-sm font-medium text-[var(--heading)]">
              Wallet data is temporarily unavailable. Please refresh shortly.
            </p>
          </div>
        ) : wallet ? (
          <>
            <dl className={CARD_CLASS}>
              <DetailRow
                label="Available balance"
                value={`${wallet.balanceLabel} USD`}
              />
              <DetailRow label="Currency" value="USD" />
              <DetailRow
                label="Wallet status"
                value={
                  <AdminStatusPill
                    value={
                      wallet.hasWallet
                        ? wallet.walletStatusLabel
                        : "Not created"
                    }
                  >
                    {wallet.hasWallet
                      ? wallet.walletStatusLabel
                      : "Not created"}
                  </AdminStatusPill>
                }
              />
              {!wallet.hasWallet ? (
                <DetailRow
                  label="Note"
                  value="Wallet not created yet"
                />
              ) : null}
              <DetailRow
                label="Total completed credits"
                value={wallet.totalCompletedCreditsLabel}
              />
            </dl>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                Recent wallet transactions
              </h3>
              {wallet.recentTransactions.length === 0 ? (
                <div className={EMPTY_CLASS}>
                  No wallet transactions yet.
                </div>
              ) : (
                <ul className="space-y-3">
                  {wallet.recentTransactions.map((row) => (
                    <li key={row.id} className={LIST_CARD_CLASS}>
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="font-semibold text-[var(--heading)] break-words">
                              {row.typeLabel}
                            </p>
                            <AdminStatusPill value={row.statusLabel}>
                              {row.statusLabel}
                            </AdminStatusPill>
                          </div>
                          <p className="text-[var(--text-muted)] break-words">
                            {row.directionLabel}
                          </p>
                          <p className="font-semibold tabular-nums text-[var(--heading)]">
                            {row.amountLabel}
                          </p>
                          <p className="text-xs text-[var(--text-soft)] break-words">
                            {row.createdAtLabel}
                          </p>
                          {row.referenceLabel ? (
                            <p className="text-xs text-[var(--text-soft)] break-words">
                              Ref {row.referenceLabel}
                            </p>
                          ) : null}
                          {row.notificationLabel ? (
                            <p className="text-xs text-[var(--text-soft)] break-words">
                              {row.notificationLabel}
                            </p>
                          ) : null}
                        </div>
                        {canViewOrders && row.relatedOrderId ? (
                          <AdminButton
                            href={`/admin/orders/${encodeURIComponent(row.relatedOrderId)}`}
                            variant="secondary"
                            size="sm"
                            className="shrink-0"
                          >
                            View related order
                          </AdminButton>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <AdminButton
                  href={`/admin/customers/${encodeURIComponent(detail.id)}/wallet`}
                  variant="ghost"
                  size="sm"
                >
                  View full wallet ledger
                </AdminButton>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section className="min-w-0 w-full max-w-full space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Wallet top-ups
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Read-only top-up attempts. No mark-paid or raw payload controls.
            </p>
          </div>
          {canViewTransactions ? (
            <AdminButton
              href="/admin/wallet-topups"
              variant="ghost"
              size="sm"
            >
              View all top-ups
            </AdminButton>
          ) : null}
        </div>

        {topupsUnavailable ? (
          <div className={UNAVAILABLE_CLASS} role="status">
            <p className="text-sm font-medium text-[var(--heading)]">
              Wallet top-up data is temporarily unavailable.
            </p>
          </div>
        ) : recentTopups.length === 0 ? (
          <div className={EMPTY_CLASS}>
            No wallet top-ups for this customer.
          </div>
        ) : (
          <ul className="space-y-3">
            {recentTopups.map((row) => (
              <li key={row.id} className={LIST_CARD_CLASS}>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <AdminStatusPill value={row.statusLabel}>
                        {row.statusLabel}
                      </AdminStatusPill>
                      <p className="font-semibold tabular-nums text-[var(--heading)]">
                        {row.creditAmountLabel} USD
                      </p>
                    </div>
                    <p className="text-[var(--text-muted)]">
                      {row.gatewayLabel} · {row.createdAtLabel}
                    </p>
                  </div>
                  {canViewTransactions ? (
                    <AdminButton
                      href={`/admin/wallet-topups/${encodeURIComponent(row.id)}`}
                      variant="primary"
                      className="shrink-0"
                    >
                      View top-up
                    </AdminButton>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
