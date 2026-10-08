import { notFound } from "next/navigation";
import { AdminVoidPendingPartnerPurchaseForm } from "@/app/components/admin/AdminVoidPendingPartnerPurchaseForm";
import { PartnerDiscountPanel } from "@/app/components/admin/PartnerDiscountPanel";
import { PartnerInviteResendPanel } from "@/app/components/admin/PartnerInviteResendPanel";
import { PartnerNameEditPanel } from "@/app/components/admin/PartnerNameEditPanel";
import { PartnerStatusPanel } from "@/app/components/admin/PartnerStatusPanel";
import { PartnerWalletPanel } from "@/app/components/admin/PartnerWalletPanel";
import { loadAdminAccess } from "@/app/lib/admin/adminPermissionAccess";
import { hasAdminPermission } from "@/app/lib/admin/adminPermissions";
import { requireRole } from "@/app/lib/auth/session";
import {
  AdminButton,
  AdminEmptyState,
  AdminFilterField,
  AdminFilterPanel,
  adminFilterControlClassName,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableBody,
  AdminTableHead,
  AdminTableShell,
  ADMIN_CARD_CLASS,
  ADMIN_KPI_GRID_CLASS,
  ADMIN_PAGE_STACK_CLASS,
  ADMIN_SECTION_TITLE_CLASS,
  ADMIN_SOFT_COPY_CLASS,
} from "@/app/components/admin/ui";
import { adminHumanStatusLabel } from "@/app/lib/admin/adminUxCopy";
import {
  PARTNER_DETAIL_PURCHASE_STATUSES,
  getPartnerDetail,
} from "@/app/lib/partner/partners";

export const dynamic = "force-dynamic";

const PARTNERS_UNAVAILABLE =
  "Partner data is temporarily unavailable. Please refresh shortly.";

function partnerStatusPillValue(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "DISABLED") return "DISABLED";
  if (normalized === "DELETED") return "DELETED";
  if (normalized === "INVITED") return "PENDING";
  return status;
}

function buildPartnerDetailHref(options: {
  partnerId: string;
  ordersPage: number;
  paymentsPage: number;
  purchaseStatus?: string;
}): string {
  const params = new URLSearchParams();
  if (options.ordersPage > 1) params.set("ordersPage", String(options.ordersPage));
  if (options.paymentsPage > 1) {
    params.set("paymentsPage", String(options.paymentsPage));
  }
  const status = (options.purchaseStatus ?? "ALL").trim().toUpperCase();
  if (status && status !== "ALL") {
    params.set("purchaseStatus", status);
  }
  const qs = params.toString();
  const base = `/admin/partners/${encodeURIComponent(options.partnerId)}`;
  return qs ? `${base}?${qs}` : base;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--border)] py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium text-[var(--heading)]">
        {value}
      </dd>
    </div>
  );
}

export default async function AdminPartnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    ordersPage?: string;
    paymentsPage?: string;
    purchaseStatus?: string;
  }>;
}) {
  const admin = await requireRole("ADMIN");
  const access = await loadAdminAccess(admin.id);
  const canVoidPartnerHolds =
    hasAdminPermission(access?.permissions ?? [], "WALLET_ADJUST") ||
    hasAdminPermission(access?.permissions ?? [], "PARTNERS_MANAGE");
  const canOpenReconciliation = hasAdminPermission(
    access?.permissions ?? [],
    "RECONCILIATION"
  );

  const { id } = await params;
  const query = await searchParams;

  let detail: Awaited<ReturnType<typeof getPartnerDetail>>;
  try {
    detail = await getPartnerDetail(id, {
      ordersPage: query.ordersPage,
      paymentsPage: query.paymentsPage,
      purchaseStatus: query.purchaseStatus,
    });
  } catch {
    return (
      <div className={ADMIN_PAGE_STACK_CLASS}>
        <AdminPageHeader
          title="Partner detail"
          actions={
            <AdminButton href="/admin/partners" variant="ghost" size="sm">
              ← Partners
            </AdminButton>
          }
        />
        <AdminEmptyState title="Temporarily unavailable">
          {PARTNERS_UNAVAILABLE}
        </AdminEmptyState>
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  const walletActive =
    detail.statusLabel !== "Disabled" && detail.statusLabel !== "Deleted";
  const discountDisabled =
    detail.statusLabel === "Disabled" || detail.statusLabel === "Deleted";
  const purchaseStatusFilter = detail.purchasesStatusFilter;

  return (
    <div className={`${ADMIN_PAGE_STACK_CLASS} min-w-0 w-full max-w-full`}>
      <AdminPageHeader
        title={detail.name}
        description="Partner operations overview. Orders, payments, and savings metrics are read-only aggregates."
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <AdminStatusPill value={partnerStatusPillValue(detail.statusLabel)}>
              {detail.statusLabel}
            </AdminStatusPill>
            <span className="text-[var(--text-soft)]">{detail.email}</span>
            <span className="text-[var(--text-soft)]">·</span>
            <span className="text-[var(--text-soft)]">
              Created {detail.createdAtLabel}
            </span>
          </span>
        }
        actions={
          <AdminButton href="/admin/partners" variant="ghost" size="sm">
            ← Partners
          </AdminButton>
        }
      />

      <section className={ADMIN_CARD_CLASS} aria-label="Partner overview">
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>Partner overview</h2>
        <dl className="mt-3">
          <DetailRow label="Partner name" value={detail.name} />
          <DetailRow label="Email" value={detail.email} />
          <DetailRow label="Status" value={detail.statusLabel} />
          <DetailRow label="Created" value={detail.createdAtLabel} />
          <DetailRow label="Partner ID" value={detail.id} />
          <DetailRow label="User ID" value={detail.userId} />
          <DetailRow
            label="Credentials set"
            value={detail.credentialsAvailableLabel}
          />
          <DetailRow label="Disabled at" value={detail.disabledAtLabel} />
          <DetailRow label="Deleted at" value={detail.deletedAtLabel} />
        </dl>
      </section>

      <section className={ADMIN_KPI_GRID_CLASS} aria-label="Partner KPIs">
        <AdminKpiCard label="Wallet balance" value={detail.balanceLabel} />
        <AdminKpiCard
          label="Completed orders"
          value={detail.totalOrdersLabel}
        />
        <AdminKpiCard label="Total revenue" value={detail.revenueLabel} />
        <AdminKpiCard
          label="Discount / savings"
          value={detail.discountSavingsLabel}
        />
      </section>

      <section className={ADMIN_CARD_CLASS} aria-label="Discount overview">
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>Discount overview</h2>
        <p className={`mt-1 ${ADMIN_SOFT_COPY_CLASS}`}>
          Display only — discount rate and lifetime savings from completed
          purchase snapshots. Editing uses the existing discount panel below.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Current discount
            </dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--heading)]">
              {detail.discountPercentLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Discount (bps)
            </dt>
            <dd className="mt-1 font-mono text-sm text-[var(--heading)]">
              {detail.discountBps}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Lifetime savings
            </dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--heading)]">
              {detail.discountSavingsLabel}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="partner-active-holds-heading">
        <div className="mb-3">
          <h2
            id="partner-active-holds-heading"
            className={ADMIN_SECTION_TITLE_CLASS}
          >
            Active Wallet Holds
          </h2>
          <p className={ADMIN_SOFT_COPY_CLASS}>
            Open Partner wallet reservations for this partner ·{" "}
            {detail.activeHolds.length} shown
            {detail.activeHoldsTruncated ? " (list truncated)" : ""}
            {canVoidPartnerHolds
              ? " · WALLET_ADJUST / PARTNERS_MANAGE can void unprovisioned holds"
              : ""}
          </p>
        </div>
        {detail.activeHolds.length === 0 ? (
          <AdminEmptyState title="No active wallet holds">
            This partner has no open wallet holds right now.
          </AdminEmptyState>
        ) : (
          <AdminTableShell
            caption="Partner active wallet holds"
            minWidthClassName="min-w-[1000px]"
          >
            <AdminTableHead>
              <tr>
                <th className="px-3 py-3 font-semibold">Purchase ID</th>
                <th className="px-3 py-3 font-semibold">Reserved</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Funding</th>
                <th className="px-3 py-3 font-semibold">Payment</th>
                <th className="px-3 py-3 font-semibold">Reserved at</th>
                <th className="px-3 py-3 font-semibold">Age</th>
                <th className="px-3 py-3 font-semibold">Actions</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {detail.activeHolds.map((hold) => (
                <tr key={hold.purchaseId}>
                  <td className="break-all px-3 py-3 font-mono text-xs text-[var(--heading)]">
                    {hold.purchaseId}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-[var(--heading)]">
                    {hold.reservedAmountLabel} {hold.currencyLabel}
                  </td>
                  <td className="px-3 py-3">
                    <AdminStatusPill value={hold.status}>
                      {adminHumanStatusLabel(hold.status)}
                    </AdminStatusPill>
                  </td>
                  <td className="px-3 py-3 text-[var(--heading)]">
                    {hold.fundingLabel}
                  </td>
                  <td className="px-3 py-3">
                    {hold.paymentHref && hold.paymentAttemptStatus ? (
                      <div className="flex flex-col gap-1">
                        <AdminStatusPill value={hold.paymentAttemptStatus}>
                          {adminHumanStatusLabel(hold.paymentAttemptStatus)}
                        </AdminStatusPill>
                        <AdminButton
                          href={hold.paymentHref}
                          variant="secondary"
                          size="sm"
                        >
                          Open payment
                        </AdminButton>
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[var(--text-muted)]">
                    {hold.reservedAtLabel}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[var(--text-muted)]">
                    {hold.ageLabel}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-2">
                      {canVoidPartnerHolds && hold.canVoidPending ? (
                        <AdminVoidPendingPartnerPurchaseForm
                          partnerId={detail.id}
                          partnerEsimPurchaseId={hold.purchaseId}
                          compact
                        />
                      ) : null}
                      {canOpenReconciliation && hold.reconciliationHref ? (
                        <AdminButton
                          href={hold.reconciliationHref}
                          variant="secondary"
                          size="sm"
                        >
                          Open reconciliation
                        </AdminButton>
                      ) : null}
                      {!(canVoidPartnerHolds && hold.canVoidPending) &&
                      !(canOpenReconciliation && hold.reconciliationHref) ? (
                        <span className="text-[var(--text-muted)]">—</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </AdminTableBody>
          </AdminTableShell>
        )}
      </section>

      <section aria-labelledby="partner-orders-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="partner-orders-heading"
              className={ADMIN_SECTION_TITLE_CLASS}
            >
              Purchases
            </h2>
            <p className={ADMIN_SOFT_COPY_CLASS}>
              All partner eSIM purchases ·{" "}
              {detail.purchasesTotalCount} matching · page {detail.purchasesPage}{" "}
              / {detail.purchasesTotalPages}
              . Stuck unprovisioned rows can be voided; provider-evidence cases
              open reconciliation for refund / finalize.
            </p>
          </div>
        </div>

        <AdminFilterPanel aria-label="Purchase status filter" className="mb-3">
          {detail.paymentsPage > 1 ? (
            <input
              type="hidden"
              name="paymentsPage"
              value={String(detail.paymentsPage)}
            />
          ) : null}
          <AdminFilterField label="Purchase status">
            <select
              name="purchaseStatus"
              defaultValue={purchaseStatusFilter}
              className={adminFilterControlClassName}
            >
              <option value="ALL">All statuses</option>
              {PARTNER_DETAIL_PURCHASE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {adminHumanStatusLabel(status)}
                </option>
              ))}
            </select>
          </AdminFilterField>
          <div className="flex items-end">
            <AdminButton type="submit" variant="secondary" size="sm">
              Apply filter
            </AdminButton>
          </div>
        </AdminFilterPanel>

        {detail.purchases.length === 0 ? (
          <AdminEmptyState title="No purchases">
            {purchaseStatusFilter === "ALL"
              ? "This partner has no eSIM purchases yet."
              : "No purchases match this status filter."}
          </AdminEmptyState>
        ) : (
          <AdminTableShell
            caption="Partner purchases"
            minWidthClassName="min-w-[1100px]"
          >
            <AdminTableHead>
              <tr>
                <th className="px-3 py-3 font-semibold">Purchase ID</th>
                <th className="px-3 py-3 font-semibold">Created</th>
                <th className="px-3 py-3 font-semibold">Plan</th>
                <th className="px-3 py-3 font-semibold">Destination</th>
                <th className="px-3 py-3 font-semibold">Data</th>
                <th className="px-3 py-3 font-semibold">Validity</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Charge</th>
                <th className="px-3 py-3 font-semibold">Funding</th>
                <th className="px-3 py-3 font-semibold">Payment</th>
                <th className="px-3 py-3 font-semibold">Actions</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {detail.purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td className="break-all px-3 py-3 font-mono text-xs text-[var(--heading)]">
                    {purchase.id}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[var(--text-muted)]">
                    {purchase.createdAtLabel}
                  </td>
                  <td className="px-3 py-3 text-[var(--heading)]">
                    {purchase.planLabel}
                  </td>
                  <td className="px-3 py-3 text-[var(--heading)]">
                    {purchase.destinationLabel}
                  </td>
                  <td className="px-3 py-3 text-[var(--heading)]">
                    {purchase.dataAllowanceLabel}
                  </td>
                  <td className="px-3 py-3 text-[var(--heading)]">
                    {purchase.validityLabel}
                  </td>
                  <td className="px-3 py-3">
                    <AdminStatusPill value={purchase.status}>
                      {adminHumanStatusLabel(purchase.status)}
                    </AdminStatusPill>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-[var(--heading)]">
                    {purchase.amountLabel} {purchase.currencyLabel}
                  </td>
                  <td className="px-3 py-3 text-[var(--heading)]">
                    {purchase.fundingLabel}
                  </td>
                  <td className="px-3 py-3">
                    {purchase.paymentHref && purchase.paymentAttemptStatus ? (
                      <div className="flex flex-col gap-1">
                        <AdminStatusPill value={purchase.paymentAttemptStatus}>
                          {adminHumanStatusLabel(purchase.paymentAttemptStatus)}
                        </AdminStatusPill>
                        <AdminButton
                          href={purchase.paymentHref}
                          variant="secondary"
                          size="sm"
                        >
                          Open payment
                        </AdminButton>
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-2">
                      {canVoidPartnerHolds && purchase.canVoidPending ? (
                        <AdminVoidPendingPartnerPurchaseForm
                          partnerId={detail.id}
                          partnerEsimPurchaseId={purchase.id}
                          compact
                        />
                      ) : null}
                      {canOpenReconciliation && purchase.reconciliationHref ? (
                        <AdminButton
                          href={purchase.reconciliationHref}
                          variant="secondary"
                          size="sm"
                        >
                          Open reconciliation
                        </AdminButton>
                      ) : null}
                      {!(canVoidPartnerHolds && purchase.canVoidPending) &&
                      !(
                        canOpenReconciliation && purchase.reconciliationHref
                      ) ? (
                        <span className="text-[var(--text-muted)]">—</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </AdminTableBody>
          </AdminTableShell>
        )}
        {detail.purchasesTotalPages > 1 ? (
          <nav
            className="mt-3 flex flex-wrap gap-2"
            aria-label="Purchases pagination"
          >
            {detail.purchasesPage > 1 ? (
              <AdminButton
                href={buildPartnerDetailHref({
                  partnerId: detail.id,
                  ordersPage: detail.purchasesPage - 1,
                  paymentsPage: detail.paymentsPage,
                  purchaseStatus: purchaseStatusFilter,
                })}
                variant="secondary"
                size="sm"
              >
                Previous purchases
              </AdminButton>
            ) : (
              <AdminButton variant="secondary" size="sm" disabled>
                Previous purchases
              </AdminButton>
            )}
            {detail.purchasesPage < detail.purchasesTotalPages ? (
              <AdminButton
                href={buildPartnerDetailHref({
                  partnerId: detail.id,
                  ordersPage: detail.purchasesPage + 1,
                  paymentsPage: detail.paymentsPage,
                  purchaseStatus: purchaseStatusFilter,
                })}
                variant="secondary"
                size="sm"
              >
                Next purchases
              </AdminButton>
            ) : (
              <AdminButton variant="secondary" size="sm" disabled>
                Next purchases
              </AdminButton>
            )}
          </nav>
        ) : null}
      </section>

      <section aria-labelledby="partner-payments-heading">
        <div className="mb-3">
          <h2
            id="partner-payments-heading"
            className={ADMIN_SECTION_TITLE_CLASS}
          >
            Payment history
          </h2>
          <p className={ADMIN_SOFT_COPY_CLASS}>
            Gateway payment attempts for this partner ·{" "}
            {detail.paymentsTotalCount} total · page {detail.paymentsPage} /{" "}
            {detail.paymentsTotalPages}
          </p>
        </div>
        {detail.payments.length === 0 ? (
          <AdminEmptyState title="No payment attempts">
            No partner gateway payment attempts recorded for this partner.
          </AdminEmptyState>
        ) : (
          <AdminTableShell
            caption="Partner payment attempts"
            minWidthClassName="min-w-[900px]"
          >
            <AdminTableHead>
              <tr>
                <th className="px-3 py-3 font-semibold">Payment ID</th>
                <th className="px-3 py-3 font-semibold">Amount</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Payment method</th>
                <th className="px-3 py-3 font-semibold">Created</th>
                <th className="px-3 py-3 font-semibold"> </th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {detail.payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="break-all px-3 py-3 font-mono text-xs text-[var(--heading)]">
                    {payment.id}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-[var(--heading)]">
                    {payment.amountLabel}
                  </td>
                  <td className="px-3 py-3">
                    <AdminStatusPill value={payment.status}>
                      {adminHumanStatusLabel(payment.status)}
                    </AdminStatusPill>
                  </td>
                  <td className="px-3 py-3 text-[var(--heading)]">
                    {payment.methodLabel}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[var(--text-muted)]">
                    {payment.createdAtLabel}
                  </td>
                  <td className="px-3 py-3">
                    <AdminButton href={payment.href} variant="secondary" size="sm">
                      Open
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </AdminTableBody>
          </AdminTableShell>
        )}
        {detail.paymentsTotalPages > 1 ? (
          <nav
            className="mt-3 flex flex-wrap gap-2"
            aria-label="Payments pagination"
          >
            {detail.paymentsPage > 1 ? (
              <AdminButton
                href={buildPartnerDetailHref({
                  partnerId: detail.id,
                  ordersPage: detail.purchasesPage,
                  paymentsPage: detail.paymentsPage - 1,
                  purchaseStatus: purchaseStatusFilter,
                })}
                variant="secondary"
                size="sm"
              >
                Previous payments
              </AdminButton>
            ) : (
              <AdminButton variant="secondary" size="sm" disabled>
                Previous payments
              </AdminButton>
            )}
            {detail.paymentsPage < detail.paymentsTotalPages ? (
              <AdminButton
                href={buildPartnerDetailHref({
                  partnerId: detail.id,
                  ordersPage: detail.purchasesPage,
                  paymentsPage: detail.paymentsPage + 1,
                  purchaseStatus: purchaseStatusFilter,
                })}
                variant="secondary"
                size="sm"
              >
                Next payments
              </AdminButton>
            ) : (
              <AdminButton variant="secondary" size="sm" disabled>
                Next payments
              </AdminButton>
            )}
          </nav>
        ) : null}
      </section>

      <PartnerNameEditPanel
        partnerId={detail.id}
        currentName={detail.name}
        disabled={detail.statusLabel === "Deleted"}
      />

      <PartnerDiscountPanel
        partnerId={detail.id}
        discountBps={detail.discountBps}
        discountVersion={detail.discountVersion}
        disabled={discountDisabled}
      />

      {detail.statusLabel === "Invited" ? (
        <PartnerInviteResendPanel partnerId={detail.id} />
      ) : null}

      {detail.statusLabel === "Active" || detail.statusLabel === "Invited" ? (
        <PartnerStatusPanel
          partnerId={detail.id}
          statusVersion={detail.statusVersion}
          mode="disable"
        />
      ) : null}
      {detail.statusLabel === "Disabled" ? (
        <PartnerStatusPanel
          partnerId={detail.id}
          statusVersion={detail.statusVersion}
          mode="reactivate"
        />
      ) : null}

      <PartnerWalletPanel
        partnerId={detail.id}
        partnerName={detail.name}
        balanceCents={detail.balanceCents}
        balanceLabel={detail.balanceLabel}
        totalAddedLabel={detail.totalAddedLabel}
        totalDeductedLabel={detail.totalDeductedLabel}
        walletActive={walletActive}
        transactions={detail.transactions}
      />
    </div>
  );
}
