import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import CaseManagementPanel from "@/app/components/admin/CaseManagementPanel";
import ProviderRefreshForm from "@/app/components/admin/ProviderRefreshForm";
import {
  getReconciliationDetail,
  requireActiveAdminForReconciliation,
} from "@/app/lib/admin/reconciliation";
import { isValidReconciliationSourceType } from "@/app/lib/admin/reconciliationClassify";
import { ORDER_EMAIL_NOT_CONFIGURED_LABEL } from "@/app/lib/admin/reconciliationCaseShared";
import { getCaseManagementEligibility } from "@/app/lib/admin/reconciliationCaseManagement";
import { getProviderRefreshUiState } from "@/app/lib/admin/providerRefresh";
import {
  AdminButton,
  AdminStatusPill,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Reconciliation data is temporarily unavailable. Please refresh shortly.";

const CASE_UNAVAILABLE_TITLE = "Reconciliation case unavailable";
const CASE_UNAVAILABLE_MESSAGE =
  "This reconciliation case could not be opened. It may already be resolved, may no longer require reconciliation, or the reference may be incorrect.";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5";

const SECTION_CARD_CLASS =
  "min-w-0 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5";

const UNAVAILABLE_CLASS =
  "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8";

/** Structurally valid attempt ids (cuid / assignment:cuid). Not a DB existence check. */
function isStructurallyValidAttemptId(raw: string): boolean {
  const id = (raw ?? "").trim();
  if (!id || id.length > 96) return false;
  if (id.startsWith("assignment:")) {
    const rest = id.slice("assignment:".length);
    return Boolean(rest) && /^[A-Za-z0-9_-]+$/.test(rest) && rest.length <= 64;
  }
  return /^[A-Za-z0-9_-]+$/.test(id);
}

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

function timelineStateLabel(state: string): string {
  if (state === "done") return "Done";
  if (state === "failed") return "Failed";
  if (state === "pending") return "Pending";
  return "Unknown";
}

function eligibilityDisabledReason(code: string): string {
  switch (code) {
    case "missing_provider_ref":
      return "Provider reference is missing. Status refresh is unavailable.";
    case "resolved":
      return "This case is resolved. Provider status refresh is closed.";
    case "locked":
      return "This case is locked against provider checks.";
    case "conflict":
      return "Provider reference conflicts with another attempt.";
    case "in_progress":
      return "A provider status refresh is already in progress.";
    case "environment_blocked":
      return "Provider environment is not available for status checks.";
    case "unsupported_source":
      return "This case type does not support provider status refresh.";
    default:
      return "Provider status refresh is unavailable for this case.";
  }
}

export default async function AdminReconciliationDetailPage({
  params,
}: {
  params: Promise<{ sourceType: string; attemptId: string }>;
}) {
  const { admin } = await requireActiveAdminForReconciliation();
  const { sourceType, attemptId } = await params;

  let detail: Awaited<ReturnType<typeof getReconciliationDetail>>;
  try {
    detail = await getReconciliationDetail(sourceType, attemptId);
  } catch {
    return (
      <div className="min-w-0 space-y-6">
        <AdminButton href="/admin/reconciliation" variant="ghost" size="sm">
          ← Back to reconciliation
        </AdminButton>
        <div className={UNAVAILABLE_CLASS} role="status">
          <p className="text-sm font-medium text-[var(--heading)]">
            {UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!detail) {
    // Supported source + structurally valid id, but case not loadable/eligible:
    // show a read-only unavailable panel instead of a raw Next.js 404.
    if (
      isValidReconciliationSourceType(sourceType) &&
      isStructurallyValidAttemptId(attemptId)
    ) {
      return (
        <div className="min-w-0 space-y-6">
          <header className="min-w-0 space-y-3">
            <AdminButton href="/admin/reconciliation" variant="ghost" size="sm">
              ← Back to reconciliation
            </AdminButton>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {CASE_UNAVAILABLE_TITLE}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
                {CASE_UNAVAILABLE_MESSAGE}
              </p>
            </div>
          </header>
          <div className={UNAVAILABLE_CLASS} role="status">
            <p className="text-sm font-medium text-[var(--heading)]">
              No recovery actions were started. Opening this page never moves
              funds, contacts the provider, or changes purchase status.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <AdminButton href="/admin/reconciliation" variant="primary">
              Back to Reconciliation
            </AdminButton>
            <AdminButton href="/admin" variant="secondary">
              Back to Admin
            </AdminButton>
          </div>
        </div>
      );
    }
    notFound();
  }

  const [refreshUi, caseUi] = await Promise.all([
    getProviderRefreshUiState({
      sourceType: detail.sourceType,
      attemptId: detail.attemptId,
    }),
    getCaseManagementEligibility({
      sourceType: detail.sourceType,
      attemptId: detail.attemptId,
      adminUserId: admin.id,
    }),
  ]);
  const showRefreshSection =
    detail.sourceType === "wallet_purchase" ||
    detail.sourceType === "partner_purchase" ||
    detail.sourceType === "assignment";
  const refreshDisabled = !refreshUi.eligibility.eligible;
  const refreshReasonCode = refreshUi.eligibility.reasonCode;

  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0 space-y-3">
        <AdminButton href="/admin/reconciliation" variant="ghost" size="sm">
          ← Back to reconciliation
        </AdminButton>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Reconciliation case
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Sanitized timeline and controlled case management. Recovery actions
            require a locked case, confirmation phrases where applicable, and
            conclusive provider or local evidence. They never auto-unlock or
            auto-resolve.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusPill value={detail.categoryLabel}>
            {detail.categoryLabel}
          </AdminStatusPill>
          <AdminStatusPill value={detail.providerResultKindLabel}>
            {detail.providerResultKindLabel}
          </AdminStatusPill>
          <AdminStatusPill value={detail.resolutionLabel}>
            {detail.resolutionLabel}
          </AdminStatusPill>
        </div>
      </header>

      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
        role="status"
      >
        Provider status observations do not automatically authorize a refund or
        local finalization. Unsupported source and action combinations remain
        blocked. Successful recoveries keep the case locked and open for manual
        review.
      </div>

      <dl className={CARD_CLASS}>
        <DetailRow label="Attempt ID" value={detail.attemptId} />
        <DetailRow label="Source" value={detail.sourceType} />
        <DetailRow label="Purchase type" value={detail.purchaseType} />
        <DetailRow
          label="Category"
          value={
            <AdminStatusPill value={detail.categoryLabel}>
              {detail.categoryLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow label="Customer" value={detail.customerLabel} />
        <DetailRow label="Package" value={detail.destinationPackage} />
        <DetailRow label="Amount" value={detail.amountLabel} />
        <DetailRow
          label="Wallet debit / refund"
          value={detail.walletDebitRefundLabel}
        />
        <DetailRow
          label="Provider result"
          value={
            <AdminStatusPill value={detail.providerResultKindLabel}>
              {detail.providerResultKindLabel}
            </AdminStatusPill>
          }
        />
        <DetailRow
          label="Provider reference"
          value={detail.providerRefMasked}
        />
        <DetailRow label="Local order" value={detail.localOrderLabel} />
        <DetailRow label="Failure" value={detail.failureLabel} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow label="Updated" value={detail.updatedAtLabel} />
        <DetailRow
          label="Resolution / lock"
          value={
            <AdminStatusPill value={detail.resolutionLabel}>
              {detail.resolutionLabel}
            </AdminStatusPill>
          }
        />
      </dl>

      {detail.sourceType === "order_email" &&
      detail.failureLabel === ORDER_EMAIL_NOT_CONFIGURED_LABEL ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="status"
        >
          Installation email service is not configured. Delivery was not sent.
          Configure the Orders email channel before resending.
        </div>
      ) : null}

      {caseUi ? (
        <CaseManagementPanel
          sourceType={detail.sourceType}
          attemptId={detail.attemptId}
          stateLabel={caseUi.stateLabel}
          locked={caseUi.locked}
          escalated={caseUi.escalated}
          resolved={caseUi.resolved}
          lockedAtLabel={caseUi.lockedAtLabel}
          lockedByLabel={caseUi.lockedByLabel}
          lockReason={caseUi.lockReason}
          escalatedAtLabel={caseUi.escalatedAtLabel}
          escalatedByLabel={caseUi.escalatedByLabel}
          escalationPriority={caseUi.escalationPriority}
          escalationReason={caseUi.escalationReason}
          resolvedAtLabel={caseUi.resolvedAtLabel}
          resolvedByLabel={caseUi.resolvedByLabel}
          resolutionReason={caseUi.resolutionReason}
          resolutionCode={caseUi.resolutionCode}
          resolutionEligibilityMessage={caseUi.resolutionEligibilityMessage}
          canLock={caseUi.canLock}
          canUnlock={caseUi.canUnlock}
          canEscalate={caseUi.canEscalate}
          canDeescalate={caseUi.canDeescalate}
          deescalatePriorityOptions={caseUi.deescalatePriorityOptions}
          canResolve={caseUi.canResolve}
          emailResendSupported={caseUi.emailResendSupported}
          emailResendAllowed={caseUi.emailResendAllowed}
          emailResendMessage={caseUi.emailResendMessage}
          clearStuckSendSupported={caseUi.clearStuckSendSupported}
          clearStuckSendAllowed={caseUi.clearStuckSendAllowed}
          clearStuckSendMessage={caseUi.clearStuckSendMessage}
          iccidBackfillSupported={caseUi.iccidBackfillSupported}
          iccidBackfillAllowed={caseUi.iccidBackfillAllowed}
          iccidBackfillMessage={caseUi.iccidBackfillMessage}
          localFinalizationSupported={caseUi.localFinalizationSupported}
          localFinalizationAllowed={caseUi.localFinalizationAllowed}
          localFinalizationMessage={caseUi.localFinalizationMessage}
          walletRefundSupported={caseUi.walletRefundSupported}
          walletRefundAllowed={caseUi.walletRefundAllowed}
          walletRefundMessage={caseUi.walletRefundMessage}
          partnerRefundSupported={caseUi.partnerRefundSupported}
          partnerRefundAllowed={caseUi.partnerRefundAllowed}
          partnerRefundMessage={caseUi.partnerRefundMessage}
        />
      ) : null}

      <section className="min-w-0 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
        <ol className="space-y-2">
          {detail.timeline.map((event) => (
            <li
              key={event.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--heading)]">
                  {event.label}
                </p>
                <AdminStatusPill value={timelineStateLabel(event.state)}>
                  {timelineStateLabel(event.state)}
                </AdminStatusPill>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)] break-words">
                {event.detail}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {showRefreshSection ? (
        <>
          <ProviderRefreshForm
            sourceType={detail.sourceType}
            attemptId={detail.attemptId}
            expectedProviderOrderId={
              refreshUi.eligibility.expectedProviderOrderId || ""
            }
            providerRefMasked={refreshUi.eligibility.providerRefMasked}
            disabled={refreshDisabled}
            disabledReason={
              refreshDisabled
                ? eligibilityDisabledReason(refreshReasonCode)
                : undefined
            }
          />

          {refreshUi.panel ? (
            <section className={SECTION_CARD_CLASS}>
              <h2 className="text-lg font-semibold tracking-tight">
                Last provider observation
              </h2>
              <dl>
                <DetailRow
                  label="Last checked"
                  value={refreshUi.panel.lastCheckedLabel}
                />
                <DetailRow
                  label="Checked by"
                  value={refreshUi.panel.checkedByLabel}
                />
                <DetailRow
                  label="Result"
                  value={
                    <AdminStatusPill value={refreshUi.panel.resultLabel}>
                      {refreshUi.panel.resultLabel}
                    </AdminStatusPill>
                  }
                />
                <DetailRow
                  label="Provider state"
                  value={refreshUi.panel.safeProviderStateLabel}
                />
                <DetailRow
                  label="Order exists"
                  value={refreshUi.panel.orderExistsLabel}
                />
                <DetailRow
                  label="Offer match"
                  value={refreshUi.panel.offerMatchLabel}
                />
                <DetailRow
                  label="Install data"
                  value={refreshUi.panel.installDataLabel}
                />
                <DetailRow
                  label="Safe code"
                  value={refreshUi.panel.safeCodeLabel}
                />
              </dl>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="min-w-0 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Related</h2>
        <ul className="flex flex-wrap gap-2">
          {detail.relatedLinks.map((link) => (
            <li key={link.href}>
              <AdminButton href={link.href} variant="secondary" size="sm">
                {link.label}
              </AdminButton>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
