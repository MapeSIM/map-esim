"use client";

import { useActionState } from "react";
import {
  verifyPendingGatewayPaymentAction,
  type PendingPaymentVerifyFormState,
} from "@/app/lib/admin/pendingPaymentVerifyActions";
import {
  PENDING_PAYMENT_VERIFY_REASON_MAX,
  SUCCESS_WEBHOOK_REQUIRED_MESSAGE,
} from "@/app/lib/admin/pendingPaymentVerifyShared";

const initialState: PendingPaymentVerifyFormState = null;

export default function PendingPaymentVerifyForm(props: {
  paymentAttemptId: string;
  trackerRefMasked: string;
}) {
  const [state, formAction, pending] = useActionState(
    verifyPendingGatewayPaymentAction,
    initialState
  );

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">Verify payment</h2>
      <p className="text-sm text-[var(--text-muted)]">
        Looks up this attempt with an authenticated Safepay reporter check.
        Browser return data is ignored. This never marks a purchase funded and
        never creates an eSIM order.
      </p>
      <p className="text-xs text-[var(--text-soft)]">
        Stored tracker: {props.trackerRefMasked}
      </p>

      <form action={formAction} className="space-y-3">
        <input
          type="hidden"
          name="paymentAttemptId"
          value={props.paymentAttemptId}
        />
        <div>
          <label
            htmlFor="pending-payment-verify-reason"
            className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Reason (required)
          </label>
          <textarea
            id="pending-payment-verify-reason"
            name="reason"
            required
            maxLength={PENDING_PAYMENT_VERIFY_REASON_MAX}
            rows={3}
            disabled={pending}
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
            placeholder="Why are you verifying this pending gateway payment?"
          />
          {state && !state.ok && state.fieldErrors?.reason ? (
            <p className="mt-1 text-sm text-[var(--danger-text)]">
              {state.fieldErrors.reason}
            </p>
          ) : null}
        </div>

        {state && !state.ok && state.error && !state.fieldErrors?.reason ? (
          <p className="text-sm text-[var(--danger-text)]" role="alert">
            {state.error}
          </p>
        ) : null}

        {state && state.ok ? (
          <div
            className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm"
            role="status"
          >
            <p className="font-semibold text-[var(--heading)]">
              Decision: {state.evidence.decision}
            </p>
            <p className="text-[var(--heading)]">{state.evidence.message}</p>
            {state.evidence.decision ===
            "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED" ? (
              <p className="text-[var(--text-muted)]">
                {SUCCESS_WEBHOOK_REQUIRED_MESSAGE}
              </p>
            ) : null}
            <dl className="grid grid-cols-1 gap-1 text-xs text-[var(--text-muted)] sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Local amount</dt>
                <dd>
                  {state.evidence.localExpectedAmountMinor}{" "}
                  {state.evidence.localExpectedCurrency}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Observed amount</dt>
                <dd>
                  {state.evidence.observedAmountMinor ?? "—"}{" "}
                  {state.evidence.observedCurrency ?? ""}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Tracker state</dt>
                <dd>{state.evidence.trackerState}</dd>
              </div>
              <div>
                <dt className="font-semibold">Capture evidence</dt>
                <dd>{state.evidence.hasCaptureEvidence ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt className="font-semibold">Tracker match</dt>
                <dd>{state.evidence.trackerTokenMatch ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt className="font-semibold">Metadata order match</dt>
                <dd>
                  {state.evidence.metadataOrderIdMatch == null
                    ? "n/a"
                    : state.evidence.metadataOrderIdMatch
                      ? "yes"
                      : "no"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Verified at</dt>
                <dd>{state.evidence.verifiedAt}</dd>
              </div>
              <div>
                <dt className="font-semibold">Reservation released</dt>
                <dd>{state.evidence.reservationReleased ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt className="font-semibold">Funding applied</dt>
                <dd>no</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white outline-none ring-[var(--accent-strong)] focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Verifying…" : "Verify payment"}
        </button>
      </form>
    </section>
  );
}
