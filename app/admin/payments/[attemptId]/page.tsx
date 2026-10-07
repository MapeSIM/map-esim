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
  humanGatewayDecisionLabel,
  humanPaymentStatusBadge,
  humanWalletFundsLabel,
  PAYMENT_DETAIL_WORKBENCH_DESCRIPTION,
  PAYMENT_DETAIL_WORKBENCH_TITLE,
  PAYMENT_WORKBENCH_LABEL,
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
  AdminEmptyState,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatusPill,
  ADMIN_CARD_CLASS,
  ADMIN_PAGE_STACK_CLASS,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

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

  let detail: Awaited<ReturnType<typeof getAdminPaymentDetail>> = null;
  try {
    detail = await getAdminPaymentDetail(raw, kindHint);
  } catch (error) {
    console.error("[admin.payments.detail] load failed", {
      attemptId: (raw ?? "").trim().slice(0, 64),
      kindHint,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    detail = null;
  }
  if (!detail) notFound();

  let recovery: Awaited<
    ReturnType<typeof getAdminPaymentRecoveryDetailExtras>
  > = null;
  try {
    recovery = await getAdminPaymentRecoveryDetailExtras(
      detail.attemptId,
      detail.ownerKind
    );
  } catch (error) {
    console.error("[admin.payments.detail] recovery extras load failed", {
      attemptId: detail.attemptId,
      ownerKind: detail.ownerKind,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    recovery = null;
  }
  const showRecon =
    detail.ownerKind === "customer" &&
    isAdminWalletReconciliationLinkApplicable({
      purchaseStatus: detail.purchaseStatus,
      attemptStatus: detail.attemptStatus,
    });

  const walletCents =
    typeof recovery?.walletAppliedCents === "number"
      ? recovery.walletAppliedCents
      : typeof detail.walletAppliedCents === "number"
        ? detail.walletAppliedCents
        : 0;

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
    walletAppliedCents: walletCents,
  });

  const paymentBadge = humanPaymentStatusBadge({
    attemptStatus: detail.attemptStatus,
    purchaseStatus: detail.purchaseStatus,
    webhookPresent: detail.webhookEventIdPresent,
  });
  const gatewayBadge = humanGatewayDecisionLabel(detail.webhookEventIdPresent);
  const walletFunds = humanWalletFundsLabel(walletCents);

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
    <div className={ADMIN_PAGE_STACK_CLASS}>
      <AdminPageHeader
        title={PAYMENT_DETAIL_WORKBENCH_TITLE}
        description={PAYMENT_DETAIL_WORKBENCH_DESCRIPTION}
        meta={
          <>
            {detail.ownerKind === "partner" ? "Partner" : "Customer"} ·{" "}
            {paymentDetailStatusSummary({
              attemptStatus: detail.attemptStatus,
              purchaseStatus: detail.purchaseStatus,
              webhookLabel: detail.webhookLabel,
            })}
          </>
        }
        actions={
          <>
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
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <AdminStatusPill value={detail.ownerKind}>
          {detail.ownerKind === "partner" ? "Partner" : "Customer"}
        </AdminStatusPill>
        <AdminStatusPill value={paymentBadge.toneValue}>
          {paymentBadge.label}
        </AdminStatusPill>
        <AdminStatusPill value={gatewayBadge.toneValue}>
          {gatewayBadge.label}
        </AdminStatusPill>
      </div>

      <section
        aria-label="Payment summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <AdminKpiCard
          label={PAYMENT_WORKBENCH_LABEL.paymentStatus}
          value={paymentBadge.label}
        />
        <AdminKpiCard
          label={PAYMENT_WORKBENCH_LABEL.gatewayDecision}
          value={gatewayBadge.label}
        />
        <AdminKpiCard
          label={PAYMENT_WORKBENCH_LABEL.amount}
          value={detail.amountLabel}
        />
      </section>

      <section
        className="rounded-2xl border border-[var(--accent-strong)]/30 bg-[var(--accent-strong)]/8 p-4 text-sm sm:p-5"
        aria-label="Next safe action"
      >
        <h2 className="text-base font-semibold text-[var(--heading)]">
          {PAYMENT_WORKBENCH_LABEL.nextSafeAction}
        </h2>
        <p className="mt-2 text-[var(--heading)]">{nextSafeAction}</p>
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Guidance only — existing tools and permissions below are unchanged.
          This page never funds or marks paid.
        </p>
      </section>

      {recovery?.staleReleaseEligible ? (
        <StaleGatewayReservationReleaseForm
          paymentAttemptId={detail.attemptId}
          ownerKind={detail.ownerKind === "partner" ? "partner" : "customer"}
          walletAppliedCents={walletCents}
        />
      ) : (
        <section className={ADMIN_CARD_CLASS} aria-label="Wallet funds">
          <h2 className="text-base font-semibold tracking-tight text-[var(--heading)]">
            {PAYMENT_WORKBENCH_LABEL.walletFunds}
          </h2>
          <p className="mt-2 text-sm font-medium text-[var(--heading)]">
            Status: {walletFunds.label}
          </p>
          {walletFunds.hasHold ? (
            <p className="mt-1 text-xs text-[var(--text-soft)]">
              {formatAdminReservedWalletAmount(walletCents, {
                showCentsSecondary: false,
              })}
            </p>
          ) : null}
        </section>
      )}

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
                Last check
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
                Suggested action
              </dt>
              <dd className="mt-1 text-[var(--heading)]">
                {recovery.suggestedSafeAction}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className={ADMIN_CARD_CLASS} aria-labelledby="related-records-heading">
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

      {detail.investigationAvailable ? (
        detail.isSimpaisa ? (
          <PendingSimpaisaInvestigateForm
            paymentAttemptId={detail.attemptId}
            transactionRefMasked={detail.providerRefMasked}
            walletAppliedCents={detail.walletAppliedCents}
            ownerKind={detail.ownerKind === "partner" ? "partner" : "customer"}
          />
        ) : detail.ownerKind === "customer" ? (
          <PendingPaymentVerifyForm
            paymentAttemptId={detail.attemptId}
            trackerRefMasked={detail.providerRefMasked}
          />
        ) : (
          <AdminEmptyState title="Check status not available">
            Partner pending checks currently support Simpaisa attempts only.
            Use Stuck Cases when applicable.
          </AdminEmptyState>
        )
      ) : (
        <AdminEmptyState title="Check status not available">
          Gateway check tools appear when the attempt is still awaiting payment
          {detail.ownerKind === "customer"
            ? ", payment pending, or needs reconciliation"
            : ""}
          . This page never marks paid without the webhook path.
        </AdminEmptyState>
      )}

      <details className={ADMIN_CARD_CLASS}>
        <summary className="cursor-pointer text-base font-semibold tracking-tight text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]">
          {PAYMENT_WORKBENCH_LABEL.technicalLogs}
        </summary>
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Payment timeline and engineering fields for cross-checks.
        </p>

        <h3 className="mt-4 text-sm font-semibold text-[var(--heading)]">
          Payment timeline
        </h3>
        {timeline.length === 0 ? (
          <div className="mt-2">
            <AdminEmptyState title="No timeline events">
              No timeline events available for this attempt.
            </AdminEmptyState>
          </div>
        ) : (
          <ol className="mt-3 space-y-3">
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

        <h3 className="mt-5 text-sm font-semibold text-[var(--heading)]">
          Webhook receipts for this attempt
        </h3>
        {!recovery || recovery.receipts.length === 0 ? (
          <div className="mt-2">
            <AdminEmptyState title="No receipts for this attempt">
              No webhook receipts claimed for this attempt id.
            </AdminEmptyState>
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
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

        <details className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]">
            Advanced technical details
          </summary>
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
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Human enums
              </dt>
              <dd className="mt-1 text-xs text-[var(--text-muted)]">
                Attempt {adminHumanStatusLabel(detail.attemptStatus)} · Purchase{" "}
                {adminHumanStatusLabel(detail.purchaseStatus)} · Webhook{" "}
                {adminHumanStatusLabel(detail.webhookLabel)} · Provider{" "}
                {detail.providerLabel}
              </dd>
            </div>
          </dl>
        </details>
      </details>

      <p className="text-xs text-[var(--text-soft)]">
        Wallet funds: {walletFunds.label}. This page does not invent generic
        mark-paid shortcuts.
      </p>
    </div>
  );
}
