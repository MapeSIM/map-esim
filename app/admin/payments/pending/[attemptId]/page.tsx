import Link from "next/link";
import { notFound } from "next/navigation";
import PendingPaymentVerifyForm from "@/app/components/admin/PendingPaymentVerifyForm";
import PendingSimpaisaInvestigateForm from "@/app/components/admin/PendingSimpaisaInvestigateForm";
import {
  adminWalletReservationStatusLabel,
  buildAdminWalletPurchaseReconciliationHref,
  formatAdminReservedWalletAmount,
  isAdminWalletReconciliationLinkApplicable,
} from "@/app/lib/admin/adminWalletReservationDisplay";
import { formatAdminPaymentChargeLabel } from "@/app/lib/admin/paymentDashboardShared";
import { getPendingGatewayPaymentAttemptDetail } from "@/app/lib/admin/pendingPaymentVerify";
import { requireRole } from "@/app/lib/auth/session";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { AdminButton, AdminStatusPill } from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminPendingPaymentDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  await requireRole("ADMIN");
  const { attemptId: raw } = await params;
  const detail = await getPendingGatewayPaymentAttemptDetail(raw);
  if (!detail) notFound();

  const isSimpaisa = detail.gatewayProvider === "SIMPAISA";
  const showRecon = isAdminWalletReconciliationLinkApplicable({
    purchaseStatus: detail.purchaseStatus,
    attemptStatus: detail.attemptStatus,
  });

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm">
          <Link
            href="/admin/payments"
            className="font-semibold text-[var(--accent-strong)]"
          >
            ← Payments
          </Link>
          <span className="text-[var(--text-soft)]"> · </span>
          <Link
            href="/admin/payments/pending"
            className="font-semibold text-[var(--accent-strong)]"
          >
            Verify Pending
          </Link>
          {showRecon ? (
            <>
              <span className="text-[var(--text-soft)]"> · </span>
              <Link
                href={buildAdminWalletPurchaseReconciliationHref(
                  detail.purchaseId
                )}
                className="font-semibold text-[var(--accent-strong)]"
              >
                Stuck cases
              </Link>
            </>
          ) : null}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          Payment attempt
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {isSimpaisa
            ? "Read-only local state plus authenticated Simpaisa Inquire. Funding remains webhook-authoritative."
            : "Read-only local state plus authenticated Safepay verification. Funding remains webhook-authoritative."}
        </p>
        {showRecon ? (
          <p className="flex flex-wrap gap-2 pt-1">
            <AdminButton
              href={buildAdminWalletPurchaseReconciliationHref(
                detail.purchaseId
              )}
              variant="secondary"
              size="sm"
            >
              Open stuck case
            </AdminButton>
          </p>
        ) : null}
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm sm:p-5">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Attempt id
            </dt>
            <dd className="mt-1 font-medium text-[var(--heading)]">
              {detail.attemptId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Purchase id
            </dt>
            <dd className="mt-1 font-medium text-[var(--heading)]">
              {detail.purchaseId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Gateway
            </dt>
            <dd className="mt-1 font-medium text-[var(--heading)]">
              {detail.gatewayProvider ?? "unknown"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Local statuses
            </dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <AdminStatusPill value={detail.attemptStatus}>
                {adminWalletReservationStatusLabel(detail.attemptStatus)}
              </AdminStatusPill>
              <AdminStatusPill value={detail.purchaseStatus}>
                {adminWalletReservationStatusLabel(detail.purchaseStatus)}
              </AdminStatusPill>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Expected charge
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {formatAdminPaymentChargeLabel(
                detail.chargeAmountMinor,
                detail.chargeCurrency
              ) ??
                `${formatUsdCents(detail.gatewayAmountCents)} ${detail.currency}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Wallet reserved
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {formatAdminReservedWalletAmount(detail.walletAppliedCents)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Webhook / VeSIM
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              webhook {detail.webhookEventIdPresent ? "present" : "missing"} ·
              order {detail.orderId ? detail.orderId : "none"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              {isSimpaisa ? "Transaction" : "Tracker"}
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.trackerRefMasked}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Created
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.createdAt.toISOString()}
            </dd>
          </div>
        </dl>
      </section>

      {isSimpaisa ? (
        <PendingSimpaisaInvestigateForm
          paymentAttemptId={detail.attemptId}
          transactionRefMasked={detail.trackerRefMasked}
          walletAppliedCents={detail.walletAppliedCents}
        />
      ) : (
        <PendingPaymentVerifyForm
          paymentAttemptId={detail.attemptId}
          trackerRefMasked={detail.trackerRefMasked}
        />
      )}
    </div>
  );
}
