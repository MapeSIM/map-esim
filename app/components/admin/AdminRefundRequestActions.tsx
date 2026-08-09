"use client";

import { useActionState } from "react";
import {
  adminRefundRequestDecisionAction,
  type AdminRefundRequestFormState,
} from "@/app/lib/refunds/refundRequestAdminActions";
import { REFUND_ADMIN_DECISION_NOTE_MAX } from "@/app/lib/refunds/refundRequestConstants";

const initialState: AdminRefundRequestFormState = null;

type Props = {
  requestId: string;
  canMarkUnderReview: boolean;
  canApprove: boolean;
  canReject: boolean;
};

export default function AdminRefundRequestActions({
  requestId,
  canMarkUnderReview,
  canApprove,
  canReject,
}: Props) {
  const [state, formAction, pending] = useActionState(
    adminRefundRequestDecisionAction,
    initialState
  );

  if (!canMarkUnderReview && !canApprove && !canReject) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No further review actions are available for this request in this phase.
      </p>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">Review actions</h2>
      <p className="text-sm text-[var(--text-muted)]">
        Approve means approved pending later execution only. These actions never
        credit a wallet, call a payment gateway, or reverse a provider order.
      </p>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <div>
          <label
            htmlFor="refund-decision-note"
            className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Decision note {canReject ? "(required to reject)" : "(optional)"}
          </label>
          <textarea
            id="refund-decision-note"
            name="decisionNote"
            maxLength={REFUND_ADMIN_DECISION_NOTE_MAX}
            rows={3}
            disabled={pending}
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
            placeholder="Internal decision note"
          />
          {state && !state.ok && state.fieldErrors?.decisionNote ? (
            <p className="mt-1 text-sm text-[var(--danger-text)]">
              {state.fieldErrors.decisionNote}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {canMarkUnderReview ? (
            <button
              type="submit"
              name="action"
              value="mark_under_review"
              disabled={pending}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] disabled:opacity-60"
            >
              Mark under review
            </button>
          ) : null}
          {canApprove ? (
            <button
              type="submit"
              name="action"
              value="approve"
              disabled={pending}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Approve (pending execution)
            </button>
          ) : null}
          {canReject ? (
            <button
              type="submit"
              name="action"
              value="reject"
              disabled={pending}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--danger-border)] px-4 text-sm font-semibold text-[var(--danger-text)] disabled:opacity-60"
            >
              Reject
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
