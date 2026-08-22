import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminCustomerDetail } from "@/app/lib/admin/customers";
import { getAdminCustomerRecentOrders } from "@/app/lib/admin/orders";
import { getAdminCustomerRecentTopups } from "@/app/lib/admin/topups";
import { getAdminCustomerWalletSummary } from "@/app/lib/admin/wallet";
import { ADMIN_DEBIT_MIN_CENTS } from "@/app/lib/wallet/amount";
import { CustomerBlockPanel } from "@/app/components/admin/CustomerBlockPanel";

export const dynamic = "force-dynamic";

const CUSTOMERS_UNAVAILABLE =
  "Customer data is temporarily unavailable. Please refresh shortly.";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
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
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getAdminCustomerDetail>>;
  try {
    detail = await getAdminCustomerDetail(id);
  } catch {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/customers"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to customers
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
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
      <div>
        <Link
          href="/admin/customers"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to customers
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Customer detail
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only CUSTOMER profile. Password hashes, OAuth tokens, and
          installation secrets are never shown.
        </p>
        <p className="mt-4 text-sm">
          <Link
            href={`/admin/customers/${encodeURIComponent(detail.id)}/timeline`}
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Support timeline
          </Link>
          <span className="text-[var(--text-muted)]">
            {" "}
            — read-only purchases, payments, orders, wallet, refunds, emails, and
            audits.
          </span>
        </p>
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Local customer ID" value={detail.id} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow label="Updated" value={detail.updatedAtLabel} />
        <DetailRow label="Name" value={detail.name} />
        <DetailRow label="Email" value={detail.email} />
        <DetailRow label="Role" value={detail.roleLabel} />
        <DetailRow
          label="Email verification"
          value={detail.emailVerifiedLabel}
        />
        <DetailRow
          label="Verified at"
          value={detail.emailVerifiedAtLabel}
        />
        <DetailRow label="Account status" value={detail.accountStatusLabel} />
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
          value={detail.googleLinkedLabel}
        />
        <DetailRow
          label="Credentials available"
          value={detail.credentialsAvailableLabel}
        />
        <DetailRow
          label="Legal consent"
          value={detail.legalConsentStatusLabel}
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

      {detail.localOrderCount > 0 ? (
        <p>
          <Link
            href={`/admin/orders?userId=${encodeURIComponent(detail.id)}`}
            className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            View linked local orders
          </Link>
        </p>
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
          {detail.accountStatusLabel === "Active" ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/customers/${encodeURIComponent(detail.id)}/esim/assign`}
                className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
              >
                Assign eSIM package
              </Link>
              <Link
                href={`/admin/customers/${encodeURIComponent(detail.id)}/esim/wallet-buy`}
                className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
              >
                Buy eSIM with wallet
              </Link>
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
          {detail.localOrderCount > 0 ? (
            <Link
              href={`/admin/orders?userId=${encodeURIComponent(detail.id)}`}
              className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              View all linked orders
            </Link>
          ) : null}
        </div>

        {ordersUnavailable ? (
          <div
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-6"
            role="status"
          >
            <p className="text-sm font-medium text-[var(--heading)]">
              Order data is temporarily unavailable. Please refresh shortly.
            </p>
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-5 text-sm text-[var(--text-muted)]">
            No eSIM orders found for this customer.
          </div>
        ) : (
          <ul className="space-y-3">
            {recentOrders.map((order) => (
              <li
                key={order.id}
                className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--heading)] break-words">
                      {order.destination}
                    </p>
                    <p className="mt-1 text-[var(--text-muted)] break-words">
                      {order.planName}
                      {order.dataAllowance !== "Not available"
                        ? ` · ${order.dataAllowance}`
                        : ""}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-[var(--heading)]">
                    {order.amountLabel}
                  </p>
                </div>
                <dl className="mt-3 grid gap-1 text-xs text-[var(--text-soft)] sm:grid-cols-2">
                  <div>
                    <dt className="inline font-semibold">Validity: </dt>
                    <dd className="inline">{order.validity}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Status: </dt>
                    <dd className="inline">{order.localStatus}</dd>
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
                <p className="mt-3">
                  <Link
                    href={`/admin/orders/${encodeURIComponent(order.id)}`}
                    className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                  >
                    View Order
                  </Link>
                </p>
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
          {wallet?.accountActive ? (
            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/customers/${encodeURIComponent(detail.id)}/wallet/credit`}
                  className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                >
                  Add wallet credit
                </Link>
                {wallet.hasWallet &&
                wallet.balanceCents >= ADMIN_DEBIT_MIN_CENTS ? (
                  <Link
                    href={`/admin/customers/${encodeURIComponent(detail.id)}/wallet/debit`}
                    className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                  >
                    Deduct wallet funds
                  </Link>
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
          <div
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-6"
            role="status"
          >
            <p className="text-sm font-medium text-[var(--heading)]">
              Wallet data is temporarily unavailable. Please refresh shortly.
            </p>
          </div>
        ) : wallet ? (
          <>
            <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
              <DetailRow
                label="Available balance"
                value={`${wallet.balanceLabel} USD`}
              />
              <DetailRow label="Currency" value="USD" />
              <DetailRow
                label="Wallet status"
                value={
                  wallet.hasWallet
                    ? wallet.walletStatusLabel
                    : "Not created"
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
                <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-5 text-sm text-[var(--text-muted)]">
                  No wallet transactions yet.
                </div>
              ) : (
                <ul className="space-y-3">
                  {wallet.recentTransactions.map((row) => (
                    <li
                      key={row.id}
                      className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
                    >
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--heading)] break-words">
                            {row.typeLabel}
                          </p>
                          <p className="mt-1 text-[var(--text-muted)] break-words">
                            {row.directionLabel} · {row.statusLabel}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold tabular-nums text-[var(--heading)]">
                          {row.amountLabel}
                        </p>
                      </div>
                      <p className="mt-2 text-xs text-[var(--text-soft)] break-words">
                        {row.createdAtLabel}
                      </p>
                      {row.referenceLabel ? (
                        <p className="mt-1 text-xs text-[var(--text-soft)] break-words">
                          Ref {row.referenceLabel}
                        </p>
                      ) : null}
                      {row.notificationLabel ? (
                        <p className="mt-1 text-xs text-[var(--text-soft)] break-words">
                          {row.notificationLabel}
                        </p>
                      ) : null}
                      {row.relatedOrderId ? (
                        <p className="mt-2">
                          <Link
                            href={`/admin/orders/${encodeURIComponent(row.relatedOrderId)}`}
                            className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                          >
                            View related order
                          </Link>
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-sm text-[var(--text-soft)]">
                Full admin wallet history coming soon
              </p>
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
          <Link
            href="/admin/wallet-topups"
            className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
          >
            View all top-ups
          </Link>
        </div>

        {topupsUnavailable ? (
          <div
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-6"
            role="status"
          >
            <p className="text-sm font-medium text-[var(--heading)]">
              Wallet top-up data is temporarily unavailable.
            </p>
          </div>
        ) : recentTopups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-5 text-sm text-[var(--text-muted)]">
            No wallet top-ups for this customer.
          </div>
        ) : (
          <ul className="space-y-3">
            {recentTopups.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--heading)]">
                      {row.statusLabel}
                    </p>
                    <p className="mt-1 text-[var(--text-muted)]">
                      {row.gatewayLabel} · {row.createdAtLabel}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-[var(--heading)]">
                    {row.creditAmountLabel} USD
                  </p>
                </div>
                <p className="mt-3">
                  <Link
                    href={`/admin/wallet-topups/${encodeURIComponent(row.id)}`}
                    className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                  >
                    View top-up
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
