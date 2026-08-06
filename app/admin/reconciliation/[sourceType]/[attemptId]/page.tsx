import Link from "next/link";
import { notFound } from "next/navigation";
import CaseManagementPanel from "@/app/components/admin/CaseManagementPanel";
import ProviderRefreshForm from "@/app/components/admin/ProviderRefreshForm";
import {
  getReconciliationDetail,
  requireActiveAdminForReconciliation,
} from "@/app/lib/admin/reconciliation";
import { getCaseManagementEligibility } from "@/app/lib/admin/reconciliationCaseManagement";
import { getProviderRefreshUiState } from "@/app/lib/admin/providerRefresh";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Reconciliation data is temporarily unavailable. Please refresh shortly.";

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
      <div className="space-y-6">
        <Link
          href="/admin/reconciliation"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to reconciliation
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!detail) notFound();

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
    detail.sourceType === "assignment";
  const refreshDisabled = !refreshUi.eligibility.eligible;
  const refreshReasonCode = refreshUi.eligibility.reasonCode;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/reconciliation"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to reconciliation
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Reconciliation case
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Sanitized timeline and controlled case management. Wallet refunds are
          not available here. Local finalization recovery requires a locked case
          and confirmed provider evidence.
        </p>
      </div>

      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
        role="status"
      >
        Recovery actions will be available only after provider evidence and
        financial safety checks are confirmed. Provider status observations do
        not automatically authorize a refund or local finalization.
      </div>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5">
        <DetailRow label="Attempt ID" value={detail.attemptId} />
        <DetailRow label="Source" value={detail.sourceType} />
        <DetailRow label="Purchase type" value={detail.purchaseType} />
        <DetailRow label="Category" value={detail.categoryLabel} />
        <DetailRow label="Customer" value={detail.customerLabel} />
        <DetailRow label="Package" value={detail.destinationPackage} />
        <DetailRow label="Amount" value={detail.amountLabel} />
        <DetailRow
          label="Wallet debit / refund"
          value={detail.walletDebitRefundLabel}
        />
        <DetailRow
          label="Provider result"
          value={detail.providerResultKindLabel}
        />
        <DetailRow
          label="Provider reference"
          value={detail.providerRefMasked}
        />
        <DetailRow label="Local order" value={detail.localOrderLabel} />
        <DetailRow label="Failure" value={detail.failureLabel} />
        <DetailRow label="Created" value={detail.createdAtLabel} />
        <DetailRow label="Updated" value={detail.updatedAtLabel} />
        <DetailRow label="Resolution / lock" value={detail.resolutionLabel} />
      </dl>

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
          iccidBackfillSupported={caseUi.iccidBackfillSupported}
          iccidBackfillAllowed={caseUi.iccidBackfillAllowed}
          iccidBackfillMessage={caseUi.iccidBackfillMessage}
          localFinalizationSupported={caseUi.localFinalizationSupported}
          localFinalizationAllowed={caseUi.localFinalizationAllowed}
          localFinalizationMessage={caseUi.localFinalizationMessage}
          walletRefundSupported={caseUi.walletRefundSupported}
          walletRefundAllowed={caseUi.walletRefundAllowed}
          walletRefundMessage={caseUi.walletRefundMessage}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
        <ol className="space-y-2">
          {detail.timeline.map((event) => (
            <li
              key={event.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--heading)]">
                  {event.label}
                </p>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  {timelineStateLabel(event.state)}
                </p>
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
            <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
              <h2 className="text-lg font-semibold tracking-tight">
                Last provider observation
              </h2>
              <dl className="space-y-0">
                <DetailRow
                  label="Last checked"
                  value={refreshUi.panel.lastCheckedLabel}
                />
                <DetailRow
                  label="Checked by"
                  value={refreshUi.panel.checkedByLabel}
                />
                <DetailRow label="Result" value={refreshUi.panel.resultLabel} />
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Related</h2>
        <ul className="space-y-2">
          {detail.relatedLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
