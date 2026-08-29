"use client";

import { useActionState } from "react";
import {
  adminSendVesimRefundReviewAction,
  type AdminVesimReviewFormState,
} from "@/app/lib/refunds/refundRequestAdminActions";
import {
  VESIM_REVIEW_ALREADY_SENT_MESSAGE,
  VESIM_REVIEW_CONFIRM_MESSAGE,
} from "@/app/lib/refunds/refundRequestConstants";

const initialState: AdminVesimReviewFormState = null;

type Props = {
  requestId: string;
  alreadySent: boolean;
};

export default function AdminVesimRefundReviewSend({
  requestId,
  alreadySent,
}: Props) {
  const [state, formAction, pending] = useActionState(
    adminSendVesimRefundReviewAction,
    initialState
  );

  const showAlreadySent =
    alreadySent || (state?.ok === true && state.alreadySent === true);

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">
        VeSIM provider review
      </h2>
      <p className="text-sm text-[var(--text-muted)]">
        Sends an informational refund-review email to VeSIM for provider-side
        eligibility. This does not approve, reject, or execute the refund, and
        does not move money.
      </p>

      {showAlreadySent ? (
        <p
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--heading)]"
          role="status"
        >
          {VESIM_REVIEW_ALREADY_SENT_MESSAGE}
        </p>
      ) : (
        <form
          action={formAction}
          className="space-y-3"
          onSubmit={(event) => {
            if (pending) {
              event.preventDefault();
              return;
            }
            if (!window.confirm(VESIM_REVIEW_CONFIRM_MESSAGE)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="requestId" value={requestId} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send to VeSIM for Review"}
          </button>
        </form>
      )}

      {state && !state.ok ? (
        <p className="text-sm text-[var(--danger-text)]" role="alert">
          {state.error}
        </p>
      ) : null}
      {state && state.ok && !state.alreadySent ? (
        <p className="text-sm font-medium text-[var(--heading)]" role="status">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
