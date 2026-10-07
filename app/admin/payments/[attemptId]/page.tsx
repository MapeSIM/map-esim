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
  isPaymentAttemptActionSuppressed,
  PAYMENT_DETAIL_WORKBENCH_DESCRIPTION,
  PAYMENT_DETAIL_WORKBENCH_TITLE,
  PAYMENT_WORKBENCH_LABEL,
  paymentDetailStatusSummary,
  splitPaymentPartyLabel,
  suggestPaymentDetailNextSafeAction,
} from "@/app/lib/admin/paymentDetailWorkbenchShared";
import { getAdminPaymentRecoveryDetailExtras } from "@/app/lib/admin/paymentRecovery";
import { requireRole } from "@/app/lib/auth/session";
import {
  AdminButton,
  AdminEmptyState,
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

  const actionsSuppressed = isPaymentAttemptActionSuppressed({
    attemptStatus: detail.attemptStatus,
    purchaseStatus: detail.purchaseStatus,
  });
  const gatewayOnlyDismissEligible = Boolean(
    recovery?.gatewayOnlyDismissEligible
  );
  const showDismissOrRelease =
    !actionsSuppressed &&
    (Boolean(recovery?.staleReleaseEligible) || gatewayOnlyDismissEligible);
  const showInvestigate =
    !actionsSuppressed && Boolean(detail.investigationAvailable);

  const nextSafeAction = suggestPaymentDetailNextSafeAction({
    ownerKind: detail.ownerKind,
    attemptStatus: detail.attemptStatus,
    purchaseStatus: detail.purchaseStatus,
    webhookPresent: detail.webhookEventIdPresent,
    investigationAvailable: showInvestigate,
    isRecoveryCandidate: Boolean(recovery?.isRecoveryCandidate),
    staleReleaseEligible: showDismissOrRelease,
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
  const party = splitPaymentPartyLabel(detail.customerLabel);
  const closedWithoutFunds =
    actionsSuppressed &&
    walletCents <= 0 &&
    paymentBadge.label !== "Paid";

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

      {/* Single overview card */}
      <section
        className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] shadow-sm"
        aria-label="Payment overview"
      >
        <div className="flex flex-col gap-4 border-b border-[var(--border)] px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <AdminStatusPill value={detail.ownerKind}>
                {detail.ownerKind === "partner" ? "Partner" : "Customer"}
              </AdminStatusPill>
              <AdminStatusPill value={paymentBadge.toneValue}>
                {paymentBadge.label}
              </AdminStatusPill>
            </div>
            <h2 className="truncate text-xl font-semibold tracking-tight text-[var(--heading)]">
              {detail.customerHref ? (
                <Link
                  href={detail.customerHref}
                  className="text-[var(--heading)] underline-offset-2 hover:underline"
                >
                  {party.name}
                </Link>
              ) : (
                party.name
              )}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">{party.email}</p>
            <p className="text-xs text-[var(--text-soft)]">
              Created {detail.createdAtLabel}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              {PAYMENT_WORKBENCH_LABEL.amount}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--heading)]">
              {detail.amountLabel}
            </p>
          </div>
        </div>

        <dl className="grid gap-4 px-4 py-5 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Gateway
            </dt>
            <dd className="mt-1 text-sm font-medium text-[var(--heading)]">
              {detail.providerLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Gateway ref
            </dt>
            <dd className="mt-1 break-all font-mono text-sm text-[var(--heading)]">
              {detail.providerRefMasked}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              {PAYMENT_WORKBENCH_LABEL.gatewayDecision}
            </dt>
            <dd className="mt-1">
              <AdminStatusPill value={gatewayBadge.toneValue}>
                {gatewayBadge.label}
              </AdminStatusPill>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              {PAYMENT_WORKBENCH_LABEL.walletFunds}
            </dt>
            <dd className="mt-1 text-sm font-medium text-[var(--heading)]">
              {walletFunds.label}
            </dd>
          </div>
        </dl>

        {!actionsSuppressed ? (
          <div
            className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6"
            aria-label="Next safe action"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              {PAYMENT_WORKBENCH_LABEL.nextSafeAction}
            </p>
            <p className="mt-1 text-sm text-[var(--heading)]">{nextSafeAction}</p>
          </div>
        ) : null}
      </section>

      {closedWithoutFunds ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--heading)]"
          role="status"
        >
          {PAYMENT_WORKBENCH_LABEL.closedNoFundsBanner}
        </div>
      ) : null}

      {showDismissOrRelease ? (
        <StaleGatewayReservationReleaseForm
          paymentAttemptId={detail.attemptId}
          ownerKind={detail.ownerKind === "partner" ? "partner" : "customer"}
          walletAppliedCents={walletCents}
          gatewayOnlyDismiss={gatewayOnlyDismissEligible || walletCents === 0}
        />
      ) : null}

      {showInvestigate ? (
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
          </AdminEmptyState>
        )
      ) : null}

      <section className={ADMIN_CARD_CLASS} aria-labelledby="related-records-heading">
        <h2
          id="related-records-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Related records
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
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
          <AdminButton
            href="/admin/payments/webhooks"
            variant="ghost"
            size="sm"
          >
            Webhook receipts
          </AdminButton>
        </div>
      </section>

      <details className={ADMIN_CARD_CLASS}>
        <summary className="cursor-pointer text-base font-semibold tracking-tight text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]">
          {PAYMENT_WORKBENCH_LABEL.technicalLogs}
        </summary>
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Payment timeline, webhook receipts, and engineering fields.
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
          <ol className="mt-3 space-y-2">
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
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            No webhook receipts claimed for this attempt id.
          </p>
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
                Attempt / purchase enums
              </dt>
              <dd className="mt-1 font-mono text-xs text-[var(--heading)]">
                {detail.attemptStatus} · {detail.purchaseStatus}
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
                Human labels
              </dt>
              <dd className="mt-1 text-xs text-[var(--text-muted)]">
                Attempt {adminHumanStatusLabel(detail.attemptStatus)} · Purchase{" "}
                {adminHumanStatusLabel(detail.purchaseStatus)} · Webhook{" "}
                {adminHumanStatusLabel(detail.webhookLabel)}
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
            {recovery?.lastDecisionLabel ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Last investigation
                </dt>
                <dd className="mt-1 text-[var(--heading)]">
                  {recovery.lastDecisionLabel}
                  {recovery.lastDecisionAtLabel
                    ? ` · ${recovery.lastDecisionAtLabel}`
                    : ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </details>
      </details>
    </div>
  );
}
