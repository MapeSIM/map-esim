"use client";

import { useActionState } from "react";
import {
  adminPartnerRefundRequestDecisionAction,
  type AdminPartnerRefundRequestFormState,
} from "@/app/lib/partner/partnerRefundRequestAdminActions";
import { REFUND_ADMIN_DECISION_NOTE_MAX } from "@/app/lib/refunds/refundRequestConstants";

const initialState: AdminPartnerRefundRequestFormState = null;

type Props = {
  requestId: string;
  canMarkUnderReview: boolean;
  canApprove: boolean;
  canReject: boolean;
};

export default function AdminPartnerRefundRequestActions({
  requestId,
  canMarkUnderReview,
  canApprove,
  canReject,
}: Props) {
  const [state, formAction, pending] = useActionState(
    adminPartnerRefundRequestDecisionAction,
    initialState
  );

  if (!canMarkUnderReview && !canApprove && !canReject) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No further review actions are available for this Partner request in this
        phase. Approval never issues a refund.
      </p>
    );
  }

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">Review actions</h2>
      <p className="text-sm text-[var(--text-muted)]">
        Approval does not issue the refund. Provider/order evidence must be
        verified before execution. These actions never credit a Partner wallet,
        create a refund transaction, or call the provider.
      </p>

      <form action={formAction} className="min-w-0 space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <div className="min-w-0">
          <label
            htmlFor="partner-refund-decision-note"
            className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Decision note {canReject ? "(required to reject)" : "(optional)"}
          </label>
          <textarea
            id="partner-refund-decision-note"
            name="decisionNote"
            maxLength={REFUND_ADMIN_DECISION_NOTE_MAX}
            rows={3}
            disabled={pending}
            className="mt-1 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
            placeholder={
              canReject
                ? "Required when rejecting. Optional short note when approving."
                : "Optional short note"
            }
          />
          {state && !state.ok && state.fieldErrors?.decisionNote ? (
            <p className="mt-1 text-sm text-[var(--danger-text)]">
              {state.fieldErrors.decisionNote}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap gap-2">
          {canMarkUnderReview ? (
            <button
              type="submit"
              name="action"
              value="mark_under_review"
              disabled={pending}
              className="inline-flex h-10 min-w-0 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] disabled:opacity-60"
            >
              Start review
            </button>
          ) : null}
          {canApprove ? (
            <button
              type="submit"
              name="action"
              value="approve"
              disabled={pending}
              className="inline-flex h-10 min-w-0 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Approve for execution
            </button>
          ) : null}
          {canReject ? (
            <button
              type="submit"
              name="action"
              value="reject"
              disabled={pending}
              className="inline-flex h-10 min-w-0 items-center justify-center rounded-xl border border-[var(--danger-border)] px-4 text-sm font-semibold text-[var(--danger-text)] disabled:opacity-60"
            >
              Reject request
            </button>
          ) : null}
        </div>

        {state && !state.ok && state.error && !state.fieldErrors ? (
          <p className="text-sm text-[var(--danger-text)]" role="alert">
            {state.error}
          </p>
        ) : null}
        {state && state.ok ? (
          <p className="text-sm font-medium text-[var(--heading)]" role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
