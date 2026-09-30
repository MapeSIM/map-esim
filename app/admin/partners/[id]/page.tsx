import { notFound } from "next/navigation";
import { PartnerDiscountPanel } from "@/app/components/admin/PartnerDiscountPanel";
import { PartnerInviteResendPanel } from "@/app/components/admin/PartnerInviteResendPanel";
import { PartnerNameEditPanel } from "@/app/components/admin/PartnerNameEditPanel";
import { PartnerStatusPanel } from "@/app/components/admin/PartnerStatusPanel";
import { PartnerWalletPanel } from "@/app/components/admin/PartnerWalletPanel";
import {
  AdminButton,
  AdminEmptyState,
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
import { getPartnerDetail } from "@/app/lib/partner/partners";

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
}): string {
  const params = new URLSearchParams();
  if (options.ordersPage > 1) params.set("ordersPage", String(options.ordersPage));
  if (options.paymentsPage > 1) {
    params.set("paymentsPage", String(options.paymentsPage));
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
  searchParams: Promise<{ ordersPage?: string; paymentsPage?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  let detail: Awaited<ReturnType<typeof getPartnerDetail>>;
  try {
    detail = await getPartnerDetail(id, {
      ordersPage: query.ordersPage,
      paymentsPage: query.paymentsPage,
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

      <section aria-labelledby="partner-orders-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="partner-orders-heading"
              className={ADMIN_SECTION_TITLE_CLASS}
            >
              Orders history
            </h2>
            <p className={ADMIN_SOFT_COPY_CLASS}>
              Completed partner purchases only · {detail.purchasesTotalCount}{" "}
              total · page {detail.purchasesPage} / {detail.purchasesTotalPages}
            </p>
          </div>
        </div>
        {detail.purchases.length === 0 ? (
          <AdminEmptyState title="No completed orders">
            This partner has no completed eSIM purchases yet.
          </AdminEmptyState>
        ) : (
          <AdminTableShell
            caption="Partner completed orders"
            minWidthClassName="min-w-[800px]"
          >
            <AdminTableHead>
              <tr>
                <th className="px-3 py-3 font-semibold">Purchase ID</th>
                <th className="px-3 py-3 font-semibold">eSIM / Plan</th>
                <th className="px-3 py-3 font-semibold">Amount</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Date</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {detail.purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td className="break-all px-3 py-3 font-mono text-xs text-[var(--heading)]">
                    {purchase.id}
                  </td>
                  <td className="px-3 py-3 text-[var(--heading)]">
                    {purchase.planLabel}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-[var(--heading)]">
                    {purchase.amountLabel}
                  </td>
                  <td className="px-3 py-3">
                    <AdminStatusPill value={purchase.status}>
                      {adminHumanStatusLabel(purchase.status)}
                    </AdminStatusPill>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[var(--text-muted)]">
                    {purchase.createdAtLabel}
                  </td>
                </tr>
              ))}
            </AdminTableBody>
          </AdminTableShell>
        )}
        {detail.purchasesTotalPages > 1 ? (
          <nav
            className="mt-3 flex flex-wrap gap-2"
            aria-label="Orders pagination"
          >
            {detail.purchasesPage > 1 ? (
              <AdminButton
                href={buildPartnerDetailHref({
                  partnerId: detail.id,
                  ordersPage: detail.purchasesPage - 1,
                  paymentsPage: detail.paymentsPage,
                })}
                variant="secondary"
                size="sm"
              >
                Previous orders
              </AdminButton>
            ) : (
              <AdminButton variant="secondary" size="sm" disabled>
                Previous orders
              </AdminButton>
            )}
            {detail.purchasesPage < detail.purchasesTotalPages ? (
              <AdminButton
                href={buildPartnerDetailHref({
                  partnerId: detail.id,
                  ordersPage: detail.purchasesPage + 1,
                  paymentsPage: detail.paymentsPage,
                })}
                variant="secondary"
                size="sm"
              >
                Next orders
              </AdminButton>
            ) : (
              <AdminButton variant="secondary" size="sm" disabled>
                Next orders
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
