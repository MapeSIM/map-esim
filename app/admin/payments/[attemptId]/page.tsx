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
import { getAdminPaymentDetail } from "@/app/lib/admin/paymentDashboard";
import { getAdminPaymentRecoveryDetailExtras } from "@/app/lib/admin/paymentRecovery";
import {
  PAYMENT_RECOVERY_BANNER_TITLE,
  PAYMENT_RECOVERY_POLICY_BLURB,
} from "@/app/lib/admin/paymentRecoveryShared";
import { requireRole } from "@/app/lib/auth/session";
import {
  AdminButton,
  AdminKpiCard,
  AdminStatusPill,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm sm:p-5";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

export default async function AdminPaymentDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  await requireRole("ADMIN");
  const { attemptId: raw } = await params;
  const detail = await getAdminPaymentDetail(raw);
  if (!detail) notFound();

  const recovery = await getAdminPaymentRecoveryDetailExtras(detail.attemptId);
  const showRecon = isAdminWalletReconciliationLinkApplicable({
    purchaseStatus: detail.purchaseStatus,
    attemptStatus: detail.attemptStatus,
  });

  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton href="/admin/payments" variant="ghost" size="sm">
            ← Payments
          </AdminButton>
          <AdminButton
            href="/admin/payments/pending"
            variant="ghost"
            size="sm"
          >
            Pending payment tools
          </AdminButton>
          {recovery?.isRecoveryCandidate ? (
            <AdminButton
              href="/admin/payments/recovery"
              variant="ghost"
              size="sm"
            >
              Payment recovery
            </AdminButton>
          ) : null}
          {showRecon ? (
            <AdminButton
              href={buildAdminWalletPurchaseReconciliationHref(
                detail.purchaseId
              )}
              variant="ghost"
              size="sm"
            >
              Reconciliation
            </AdminButton>
          ) : null}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment detail</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Canonical payment attempt view. Investigation tools never fund or mark
            paid. Funding remains webhook-authoritative.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusPill value={detail.attemptStatus}>
            {adminWalletReservationStatusLabel(detail.attemptStatus)}
          </AdminStatusPill>
          <AdminStatusPill value={detail.purchaseStatus}>
            {adminWalletReservationStatusLabel(detail.purchaseStatus)}
          </AdminStatusPill>
          <AdminStatusPill value={detail.webhookLabel}>
            {detail.webhookLabel}
          </AdminStatusPill>
        </div>
      </header>

      <section
        aria-label="Payment summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <AdminKpiCard label="Amount" value={detail.amountLabel} />
        <AdminKpiCard label="Provider" value={detail.providerLabel} />
        <AdminKpiCard label="Method" value={detail.methodLabel} />
      </section>

      {recovery?.isRecoveryCandidate ? (
        <section
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm sm:p-5"
          aria-label={PAYMENT_RECOVERY_BANNER_TITLE}
        >
          <h2 className="text-base font-semibold text-[var(--heading)]">
            {PAYMENT_RECOVERY_BANNER_TITLE}
          </h2>
          <p className="mt-2 text-[var(--text-muted)]">
            {PAYMENT_RECOVERY_POLICY_BLURB}
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Last investigation decision
              </dt>
              <dd className="mt-1 text-[var(--heading)]">
                {recovery.lastDecisionLabel}
                {recovery.lastDecisionAtLabel ? (
                  <span className="text-[var(--text-soft)]">
                    {" "}
                    · {recovery.lastDecisionAtLabel}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Suggested safe action
              </dt>
              <dd className="mt-1 text-[var(--heading)]">
                {recovery.suggestedSafeAction}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <h2 className="text-base font-semibold tracking-tight text-[var(--heading)]">
          Payment details
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Payment id
            </dt>
            <dd className="mt-1 font-medium text-[var(--heading)]">
              {detail.attemptId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Customer
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.customerHref ? (
                <Link
                  href={detail.customerHref}
                  className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                >
                  {detail.customerLabel}
                </Link>
              ) : (
                detail.customerLabel
              )}
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
              Order id
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.orderId ? (
                <Link
                  href={`/admin/orders/${encodeURIComponent(detail.orderId)}`}
                  className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                >
                  {detail.orderId}
                </Link>
              ) : (
                "none"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Amount
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.amountLabel}
              {detail.chargeLabel ? ` · charge ${detail.chargeLabel}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Provider / method
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.providerLabel} · method {detail.methodLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Status
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
              Provider reference
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.providerRefMasked}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Webhook
            </dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <AdminStatusPill value={detail.webhookLabel}>
                {detail.webhookLabel}
              </AdminStatusPill>
              <AdminButton
                href="/admin/payments/webhooks"
                variant="ghost"
                size="sm"
              >
                Receipts
              </AdminButton>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Inquiry
            </dt>
            <dd className="mt-1 text-[var(--heading)]">{detail.inquiryLabel}</dd>
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
              Created / updated
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.createdAtLabel} · {detail.updatedAtLabel}
            </dd>
          </div>
          {detail.failureCategory || detail.failureCode ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Failure
              </dt>
              <dd className="mt-1 text-[var(--heading)]">
                {[detail.failureCategory, detail.failureCode]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {detail.customerHref ? (
            <AdminButton
              href={`${detail.customerHref}/timeline`}
              variant="secondary"
              size="sm"
            >
              Customer timeline
            </AdminButton>
          ) : null}
          {showRecon ? (
            <AdminButton
              href={buildAdminWalletPurchaseReconciliationHref(
                detail.purchaseId
              )}
              variant="secondary"
              size="sm"
            >
              Open reconciliation
            </AdminButton>
          ) : null}
          <AdminButton
            href={`/admin/payments/pending/${encodeURIComponent(detail.attemptId)}`}
            variant="secondary"
            size="sm"
          >
            Pending payment tools
          </AdminButton>
        </div>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="text-base font-semibold tracking-tight text-[var(--heading)]">
          Webhook receipts for this attempt
        </h2>
        <p className="mt-1 text-xs text-[var(--text-soft)]">
          Read-only observability. Receipts do not authorize admin funding or
          webhook replay.
        </p>
        {!recovery || recovery.receipts.length === 0 ? (
          <div className={`${EMPTY_CLASS} mt-3`}>
            No webhook receipts claimed for this attempt id.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {recovery.receipts.map((receipt) => (
              <li
                key={receipt.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
              >
                <p className="font-medium text-[var(--heading)]">
                  {receipt.receivedAtLabel} · {receipt.providerLabel}
                </p>
                <p className="mt-1 text-xs text-[var(--text-soft)]">
                  signature {receipt.signatureLabel} · parse {receipt.parseLabel}{" "}
                  · HTTP {receipt.httpStatusLabel} · {receipt.outcomeLabel}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <AdminButton
            href="/admin/payments/webhooks"
            variant="ghost"
            size="sm"
          >
            All webhook receipts
          </AdminButton>
        </div>
      </section>

      {detail.investigationAvailable ? (
        detail.isSimpaisa ? (
          <PendingSimpaisaInvestigateForm
            paymentAttemptId={detail.attemptId}
            transactionRefMasked={detail.providerRefMasked}
            walletAppliedCents={detail.walletAppliedCents}
          />
        ) : (
          <PendingPaymentVerifyForm
            paymentAttemptId={detail.attemptId}
            trackerRefMasked={detail.providerRefMasked}
          />
        )
      ) : (
        <section className={EMPTY_CLASS}>
          Investigation tools are available when the attempt is awaiting
          gateway payment, payment pending, or reconciliation required. This
          page never funds or marks paid.
        </section>
      )}
    </div>
  );
}
