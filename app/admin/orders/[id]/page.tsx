import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminAddDataForm from "@/app/components/admin/AdminAddDataForm";
import AdminOrderInstallEmailResendButton from "@/app/components/admin/AdminOrderInstallEmailResendButton";
import { AddDataPurchaseBadge } from "@/app/components/orders/AddDataPurchaseBadge";
import { EsimLifecycleBadges } from "@/app/components/orders/EsimLifecycleBadges";
import IccidRevealPanel from "@/app/components/orders/IccidRevealPanel";
import AdminEsimUsagePanel from "@/app/components/orders/AdminEsimUsagePanel";
import { loadAdminAccess } from "@/app/lib/admin/adminPermissionAccess";
import { hasAdminPermission } from "@/app/lib/admin/adminPermissions";
import { getAdminOrderDetail } from "@/app/lib/admin/orders";
import { requireRole } from "@/app/lib/auth/session";
import {
  AdminButton,
  AdminStatusPill,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const ORDERS_UNAVAILABLE =
  "Order data is temporarily unavailable. Please refresh shortly.";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5";

const UNAVAILABLE_CLASS =
  "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8";

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-[var(--border)] py-3 last:border-b-0 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[var(--heading)] break-words">
        {value}
      </dd>
    </div>
  );
}

export default async function AdminOrderDetailPage({
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
  const canResendInstallEmail = hasAdminPermission(
    access?.permissions ?? [],
    ["SUPPORT_EMAILS", "ORDERS_MANAGE", "ESIM_FULFILLMENT", "INSTALL_ISSUES"]
  );
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getAdminOrderDetail>>;
  try {
    detail = await getAdminOrderDetail(id);
  } catch {
    return (
      <div className="min-w-0 space-y-6">
        <AdminButton href="/admin/orders" variant="ghost" size="sm">
          ← Back to orders
        </AdminButton>
        <div className={UNAVAILABLE_CLASS} role="status">
          <p className="text-sm font-medium text-[var(--heading)]">
            {ORDERS_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0 space-y-3">
        <AdminButton href="/admin/orders" variant="ghost" size="sm">
          ← Back to orders
        </AdminButton>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order detail</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Local order snapshots only. Provider fulfilment status is not
            refreshed from this page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusPill value={detail.displayStatusLabel}>
            {detail.displayStatusLabel}
          </AdminStatusPill>
          <AdminStatusPill value={detail.localStatus}>
            Local: {detail.localStatus}
          </AdminStatusPill>
          <AdminStatusPill value={detail.fundingLabel}>
            {detail.fundingLabel}
          </AdminStatusPill>
          <AdminStatusPill value={detail.associationLabel}>
            {detail.associationLabel}
          </AdminStatusPill>
          {detail.isAddDataPurchase ? (
            <AddDataPurchaseBadge
              isAddDataPurchase
              sourceOrderHref={
                detail.addDataSourceOrderId
                  ? `/admin/orders/${encodeURIComponent(detail.addDataSourceOrderId)}`
                  : null
              }
            />
          ) : null}
        </div>
        {!detail.isRefunded ? (
          <EsimLifecycleBadges
            lifecycle={detail.lifecycle}
            remainingDataLabel={detail.remainingDataLabel}
          />
        ) : (
          <p className="text-sm font-medium text-[var(--danger-text)]">
            This order is refunded. Installation QR and live usage are blocked.
          </p>
        )}
        {canResendInstallEmail && detail.installEmailResendEligible ? (
          <div className="rounded-2xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 px-4 py-4 sm:px-5">
            <p className="text-sm font-semibold text-[var(--heading)]">
              Customer installation email
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Resend the QR code and install instructions if the customer did
              not receive them or needs another copy.
            </p>
            <div className="mt-3">
              <AdminOrderInstallEmailResendButton
                orderId={detail.id}
                customerEmailLabel={detail.customerEmail}
              />
            </div>
          </div>
        ) : null}
      </header>

      <dl className={CARD_CLASS}>
        <DetailRow label="Local order ID" value={detail.id} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow label="Updated" value={detail.updatedAtLabel} />
        <DetailRow label="Destination" value={detail.destination} />
        <DetailRow label="Plan / data" value={detail.planPackage} />
        <DetailRow label="Validity" value={detail.validity} />
        <DetailRow
          label="Local status"
          value={
            <AdminStatusPill value={detail.localStatus}>
              {detail.localStatus}
            </AdminStatusPill>
          }
        />
        {detail.isAddDataPurchase && detail.addDataSourceOrderId ? (
          <DetailRow
            label="Add More Data source"
            value={
              <Link
                href={`/admin/orders/${encodeURIComponent(detail.addDataSourceOrderId)}`}
                className="font-mono text-sm font-semibold text-[var(--heading)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
              >
                {detail.addDataSourceOrderId}
              </Link>
            }
          />
        ) : null}
        {detail.isAddDataPurchase ? (
          <DetailRow
            label="ICCID note"
            value="Shared with source eSIM (Add More Data top-up)."
          />
        ) : null}
        <DetailRow
          label="Funding"
          value={
            <AdminStatusPill value={detail.fundingLabel}>
              {detail.fundingLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow label="Provider amount" value={detail.amountLabel} />
        <DetailRow
          label="Provider reference"
          value={detail.providerRefMasked}
        />
        <DetailRow label="Offer ID" value={detail.offerId} />
        <DetailRow
          label="Association"
          value={
            <AdminStatusPill value={detail.associationLabel}>
              {detail.associationLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow label="Customer email" value={detail.customerEmail} />
        <DetailRow
          label="Account status"
          value={
            <AdminStatusPill value={detail.accountStatusLabel}>
              {detail.accountStatusLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow
          label="Claim status"
          value={
            <AdminStatusPill value={detail.claimStatusLabel}>
              {detail.claimStatusLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow label="Claimed at" value={detail.claimedAtLabel} />
        <IccidRevealPanel
          orderId={detail.id}
          iccid={detail.iccid}
          unavailableLabel={detail.iccidHint}
        />
      </dl>

      <section className="min-w-0 space-y-3" aria-labelledby="admin-usage-heading">
        <div className="sr-only">
          <h2 id="admin-usage-heading">Usage</h2>
        </div>
        {!detail.isRefunded ? (
          <AdminEsimUsagePanel orderId={detail.id} />
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-sm text-[var(--text-muted)]">
            Live VeSIM usage is hidden for refunded orders.
          </div>
        )}
        {canFulfill && detail.addDataEligible ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5">
            <p className="text-sm font-semibold text-[var(--heading)]">
              Add More Data
            </p>
            <div className="mt-3">
              <AdminAddDataForm orderId={detail.id} />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
