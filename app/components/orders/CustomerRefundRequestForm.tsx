"use client";

import { useActionState } from "react";
import {
  createCustomerRefundRequestAction,
  type CustomerRefundRequestFormState,
} from "@/app/lib/refunds/refundRequestActions";
import {
  REFUND_REQUEST_NOTE_MAX,
  REFUND_REQUEST_REASONS,
  refundReasonLabel,
} from "@/app/lib/refunds/refundRequestConstants";

const initialState: CustomerRefundRequestFormState = null;

type Props = {
  orderId: string;
  canRequest: boolean;
  openStatusLabel: string | null;
};

export default function CustomerRefundRequestForm({
  orderId,
  canRequest,
  openStatusLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(
    createCustomerRefundRequestAction,
    initialState
  );

  if (!canRequest) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
        <h2 className="text-base font-bold text-[var(--heading)]">
          Refund request
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {openStatusLabel
            ? `Current request status: ${openStatusLabel}. You cannot submit another open request for this order.`
            : "A refund request cannot be submitted for this order right now."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
      <h2 className="text-base font-bold text-[var(--heading)]">
        Request a refund
      </h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Submit a request for admin review. The refund amount is taken from your
        order record — you cannot choose or change it. No funds are moved until
        a later approved execution step.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="orderId" value={orderId} />
        <div>
          <label
            htmlFor="refund-reason"
            className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Reason
          </label>
          <select
            id="refund-reason"
            name="reason"
            required
            disabled={pending}
            defaultValue=""
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
          >
            <option value="" disabled>
              Select a reason
            </option>
            {REFUND_REQUEST_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {refundReasonLabel(reason)}
              </option>
            ))}
          </select>
          {state && !state.ok && state.fieldErrors?.reason ? (
            <p className="mt-1 text-sm text-[var(--danger-text)]">
              {state.fieldErrors.reason}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="refund-note"
            className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Short explanation (optional)
          </label>
          <textarea
            id="refund-note"
            name="customerNote"
            maxLength={REFUND_REQUEST_NOTE_MAX}
            rows={3}
            disabled={pending}
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
            placeholder="Optional details for the review team"
          />
          {state && !state.ok && state.fieldErrors?.customerNote ? (
            <p className="mt-1 text-sm text-[var(--danger-text)]">
              {state.fieldErrors.customerNote}
            </p>
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

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit refund request"}
        </button>
      </form>
    </section>
  );
}
