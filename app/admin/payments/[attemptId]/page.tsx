import Link from "next/link";
import { notFound } from "next/navigation";
import PendingPaymentVerifyForm from "@/app/components/admin/PendingPaymentVerifyForm";
import PendingSimpaisaInvestigateForm from "@/app/components/admin/PendingSimpaisaInvestigateForm";
import StaleGatewayReservationReleaseForm from "@/app/components/admin/StaleGatewayReservationReleaseForm";
import {
  buildAdminWalletPurchaseReconciliationHref,
  formatAdminReservedWalletAmount,
  isAdminWalletReconciliationLinkApplicable,
} from "@/app/lib/admin/adminWalletReservationDisplay";
import { adminHumanStatusLabel } from "@/app/lib/admin/adminUxCopy";
import { getAdminPaymentDetail } from "@/app/lib/admin/paymentDashboard";
import {
  buildPaymentDetailTimeline,
  PAYMENT_DETAIL_WORKBENCH_DESCRIPTION,
  PAYMENT_DETAIL_WORKBENCH_TITLE,
  paymentDetailStatusSummary,
  suggestPaymentDetailNextSafeAction,
} from "@/app/lib/admin/paymentDetailWorkbenchShared";
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
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  await requireRole("ADMIN");
  const { attemptId: raw } = await params;
  const query = await searchParams;
  const kindHint =
    query.kind === "partner"
      ? ("partner" as const)
      : query.kind === "customer"
        ? ("customer" as const)
        : null;
  const detail = await getAdminPaymentDetail(raw, kindHint);
  if (!detail) notFound();

  const recovery = await getAdminPaymentRecoveryDetailExtras(
    detail.attemptId,
    detail.ownerKind
  );
  const showRecon =
    detail.ownerKind === "customer" &&
    isAdminWalletReconciliationLinkApplicable({
      purchaseStatus: detail.purchaseStatus,
      attemptStatus: detail.attemptStatus,
    });

  const nextSafeAction = suggestPaymentDetailNextSafeAction({
    ownerKind: detail.ownerKind,
    attemptStatus: detail.attemptStatus,
    purchaseStatus: detail.purchaseStatus,
    webhookPresent: detail.webhookEventIdPresent,
    investigationAvailable: detail.investigationAvailable,
    isRecoveryCandidate: Boolean(recovery?.isRecoveryCandidate),
    staleReleaseEligible: Boolean(recovery?.staleReleaseEligible),
    showStuckCaseLink: showRecon,
    recoverySuggestedSafeAction: recovery?.suggestedSafeAction ?? null,
  });

  const timeline = buildPaymentDetailTimeline([
    {
      id: "created",
      at: detail.createdAt,
      atLabel: detail.createdAtLabel,
      title: "Attempt created",
      detail: `${detail.providerLabel} · ${detail.amountLabel}`,
    },
    {
      id: "updated",
      at: detail.updatedAt,
      atLabel: detail.updatedAtLabel,
      title: "Last updated",
      detail: paymentDetailStatusSummary({
        attemptStatus: detail.attemptStatus,
        purchaseStatus: detail.purchaseStatus,
        webhookLabel: detail.webhookLabel,
      }),
    },
    {
      id: "failed",
      at: detail.failedAt,
      atLabel: detail.failedAtLabel,
      title: "Marked failed",
      detail: [detail.failureCategory, detail.failureCode]
        .filter(Boolean)
        .join(" · "),
    },
    {
      id: "cancelled",
      at: detail.cancelledAt,
      atLabel: detail.cancelledAtLabel,
      title: "Marked cancelled",
    },
    ...(recovery?.lastDecisionAt && recovery.lastDecisionAtLabel
      ? [
          {
            id: "investigate",
            at: recovery.lastDecisionAt,
            atLabel: recovery.lastDecisionAtLabel,
            title: "Last investigation decision",
            detail: recovery.lastDecisionLabel,
          },
        ]
      : []),
    ...(recovery?.receipts ?? []).map((receipt) => ({
      id: `receipt-${receipt.id}`,
      at: receipt.receivedAt,
      atLabel: receipt.receivedAtLabel,
      title: `Webhook receipt · ${receipt.providerLabel}`,
      detail: `${receipt.outcomeLabel} · signature ${receipt.signatureLabel} · HTTP ${receipt.httpStatusLabel}`,
    })),
  ]);

  const walletHref =
    detail.ownerKind === "customer" && detail.customerHref
      ? `${detail.customerHref}/wallet`
      : null;
  const timelineHref =
    detail.ownerKind === "customer" && detail.customerHref
      ? `${detail.customerHref}/timeline`
      : null;

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
            Verify Pending
          </AdminButton>
          {recovery?.isRecoveryCandidate ? (
            <AdminButton
              href="/admin/payments/recovery"
              variant="ghost"
              size="sm"
            >
              Stale unpaid holds
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
              Stuck cases
            </AdminButton>
          ) : null}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {PAYMENT_DETAIL_WORKBENCH_TITLE}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {PAYMENT_DETAIL_WORKBENCH_DESCRIPTION}
          </p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">
            {detail.ownerKind === "partner" ? "Partner" : "Customer"} ·{" "}
            {paymentDetailStatusSummary({
              attemptStatus: detail.attemptStatus,
              purchaseStatus: detail.purchaseStatus,
              webhookLabel: detail.webhookLabel,
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusPill value={detail.ownerKind}>
            {detail.ownerKind === "partner" ? "Partner" : "Customer"}
          </AdminStatusPill>
          <AdminStatusPill value={detail.attemptStatus}>
            {adminHumanStatusLabel(detail.attemptStatus)}
          </AdminStatusPill>
          <AdminStatusPill value={detail.purchaseStatus}>
            {adminHumanStatusLabel(detail.purchaseStatus)}
          </AdminStatusPill>
          <AdminStatusPill value={detail.webhookLabel}>
            Webhook {adminHumanStatusLabel(detail.webhookLabel)}
          </AdminStatusPill>
        </div>
      </header>

      <section
        className="rounded-2xl border border-[var(--accent-strong)]/30 bg-[var(--accent-strong)]/8 p-4 text-sm sm:p-5"
        aria-label="Next safe action"
      >
        <h2 className="text-base font-semibold text-[var(--heading)]">
          Next safe action
        </h2>
        <p className="mt-2 text-[var(--heading)]">{nextSafeAction}</p>
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Guidance only — existing tools and permissions below are unchanged.
          This page never funds or marks paid.
        </p>
      </section>

      <section
        aria-label="Payment summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <AdminKpiCard label="Amount" value={detail.amountLabel} />
        <AdminKpiCard label="Provider" value={detail.providerLabel} />
        <AdminKpiCard
          label="Wallet reserved"
          value={formatAdminReservedWalletAmount(detail.walletAppliedCents, {
            showCentsSecondary: false,
          })}
        />
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

      <section className={CARD_CLASS} aria-labelledby="related-records-heading">
        <h2
          id="related-records-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Related records
        </h2>
        <p className="mt-1 text-xs text-[var(--text-soft)]">
          Jump to customer, partner, order, or wallet context without changing
          payment state.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {detail.customerHref ? (
            <AdminButton href={detail.customerHref} variant="secondary" size="sm">
              {detail.ownerKind === "partner" ? "Partner profile" : "Customer"}
            </AdminButton>
          ) : null}
          {timelineHref ? (
            <AdminButton href={timelineHref} variant="secondary" size="sm">
              Customer timeline
            </AdminButton>
          ) : null}
          {walletHref ? (
            <AdminButton href={walletHref} variant="secondary" size="sm">
              Customer wallet
            </AdminButton>
          ) : null}
          {detail.orderId ? (
            <AdminButton
              href={`/admin/orders/${encodeURIComponent(detail.orderId)}`}
              variant="secondary"
              size="sm"
            >
              Order
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
              Open stuck case
            </AdminButton>
          ) : null}
          {detail.ownerKind === "customer" ? (
            <AdminButton
              href={`/admin/payments/pending/${encodeURIComponent(detail.attemptId)}`}
              variant="secondary"
              size="sm"
            >
              Verify Pending
            </AdminButton>
          ) : null}
          <AdminButton
            href="/admin/payments/webhooks"
            variant="ghost"
            size="sm"
          >
            Webhook receipts
          </AdminButton>
        </div>
      </section>

      <section className={CARD_CLASS} aria-labelledby="payment-timeline-heading">
        <h2
          id="payment-timeline-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Payment timeline
        </h2>
        <p className="mt-1 text-xs text-[var(--text-soft)]">
          Read-only history from attempt timestamps and webhook receipts.
        </p>
        {timeline.length === 0 ? (
          <div className={`${EMPTY_CLASS} mt-3`}>
            No timeline events available for this attempt.
          </div>
        ) : (
          <ol className="mt-4 space-y-3">
            {timeline.map((event) => (
              <li
                key={event.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
              >
                <p className="text-xs text-[var(--text-soft)]">{event.atLabel}</p>
                <p className="mt-1 font-medium text-[var(--heading)]">
                  {event.title}
                </p>
                {event.detail ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {event.detail}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
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

      <details className={CARD_CLASS}>
        <summary className="cursor-pointer text-base font-semibold tracking-tight text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]">
          Advanced technical details
        </summary>
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Raw identifiers and diagnostic fields for engineering cross-checks.
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Payment id
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-[var(--heading)]">
              {detail.attemptId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Purchase id
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-[var(--heading)]">
              {detail.purchaseId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Order id
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-[var(--heading)]">
              {detail.orderId ?? "none"}
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
              Attempt status (enum)
            </dt>
            <dd className="mt-1 font-mono text-xs text-[var(--heading)]">
              {detail.attemptStatus}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Purchase status (enum)
            </dt>
            <dd className="mt-1 font-mono text-xs text-[var(--heading)]">
              {detail.purchaseStatus}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Charge
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.chargeLabel ?? "Not available"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Method / inquiry
            </dt>
            <dd className="mt-1 text-[var(--heading)]">
              {detail.methodLabel} · {detail.inquiryLabel}
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
              {detail.ownerKind === "partner" ? "Partner" : "Customer"}
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
      </details>

      {recovery?.staleReleaseEligible ? (
        <StaleGatewayReservationReleaseForm
          paymentAttemptId={detail.attemptId}
          ownerKind={detail.ownerKind}
          walletAppliedCents={
            recovery.walletAppliedCents ?? detail.walletAppliedCents
          }
        />
      ) : null}

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
      ) : detail.ownerKind === "customer" ? (
        <section className={EMPTY_CLASS}>
          Investigation tools are available when the attempt is awaiting
          gateway payment, payment pending, or reconciliation required. This
          page never funds or marks paid.
        </section>
      ) : null}

      <p className="text-xs text-[var(--text-soft)]">
        Reserved wallet display:{" "}
        {formatAdminReservedWalletAmount(detail.walletAppliedCents)}. This
        page never funds or marks paid.
      </p>
    </div>
  );
}
