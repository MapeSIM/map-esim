"use client";

import { useActionState, useId, useState } from "react";
import {
  verifyPendingGatewayPaymentAction,
  type PendingPaymentVerifyFormState,
} from "@/app/lib/admin/pendingPaymentVerifyActions";
import {
  applyCustomerVerifiedPendingPaymentAction,
  type CustomerPendingApplyFormState,
} from "@/app/lib/admin/pendingCustomerPaymentApplyActions";
import {
  CUSTOMER_APPLY_CONFIRM_LABEL,
  CUSTOMER_APPLY_SUCCESS_MESSAGE,
  isSafepayCustomerApplyEligibleDecision,
} from "@/app/lib/admin/pendingCustomerPaymentApplyShared";
import {
  PENDING_PAYMENT_VERIFY_REASON_MAX,
  SUCCESS_WEBHOOK_REQUIRED_MESSAGE,
} from "@/app/lib/admin/pendingPaymentVerifyShared";

const initialState: PendingPaymentVerifyFormState = null;
const initialApplyState: CustomerPendingApplyFormState = null;

export default function PendingPaymentVerifyForm(props: {
  paymentAttemptId: string;
  trackerRefMasked: string;
}) {
  const formId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [state, formAction, pending] = useActionState(
    verifyPendingGatewayPaymentAction,
    initialState
  );
  const [applyState, applyAction, applyPending] = useActionState(
    applyCustomerVerifiedPendingPaymentAction,
    initialApplyState
  );

  const verifyOk = state && state.ok ? state.evidence : null;
  const showApply =
    Boolean(verifyOk) &&
    isSafepayCustomerApplyEligibleDecision(verifyOk?.decision) &&
    !(applyState && applyState.ok);

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">Verify payment</h2>
      <p className="text-sm text-[var(--text-muted)]">
        Looks up this attempt with an authenticated Safepay reporter check.
        Browser return data is ignored. Verify alone never marks a purchase funded
        and never creates an eSIM order. After confirmed success, use Apply below
        (re-checks gateway, then canonical funding).
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
            disabled={pending || applyPending}
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

        {verifyOk ? (
          <div
            className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm"
            role="status"
          >
            <p className="font-semibold text-[var(--heading)]">
              Decision: {verifyOk.decision}
            </p>
            <p className="text-[var(--heading)]">{verifyOk.message}</p>
            {verifyOk.decision ===
            "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED" ? (
              <p className="text-[var(--text-muted)]">
                {SUCCESS_WEBHOOK_REQUIRED_MESSAGE}
              </p>
            ) : null}
            <dl className="grid grid-cols-1 gap-1 text-xs text-[var(--text-muted)] sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Local amount</dt>
                <dd>
                  {verifyOk.localExpectedAmountMinor}{" "}
                  {verifyOk.localExpectedCurrency}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Observed amount</dt>
                <dd>
                  {verifyOk.observedAmountMinor ?? "—"}{" "}
                  {verifyOk.observedCurrency ?? ""}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Tracker state</dt>
                <dd>{verifyOk.trackerState}</dd>
              </div>
              <div>
                <dt className="font-semibold">Capture evidence</dt>
                <dd>{verifyOk.hasCaptureEvidence ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt className="font-semibold">Tracker match</dt>
                <dd>{verifyOk.trackerTokenMatch ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt className="font-semibold">Metadata order match</dt>
                <dd>
                  {verifyOk.metadataOrderIdMatch == null
                    ? "n/a"
                    : verifyOk.metadataOrderIdMatch
                      ? "yes"
                      : "no"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Verified at</dt>
                <dd>{verifyOk.verifiedAt}</dd>
              </div>
              <div>
                <dt className="font-semibold">Reservation released</dt>
                <dd>{verifyOk.reservationReleased ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt className="font-semibold">Funding applied</dt>
                <dd>no (verify step)</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending || applyPending}
          className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white outline-none ring-[var(--accent-strong)] focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Verifying…" : "Verify payment"}
        </button>
      </form>

      {showApply ? (
        <form
          action={applyAction}
          className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
          aria-busy={applyPending}
        >
          <h3 className="text-sm font-semibold text-[var(--heading)]">
            Apply verified payment / fulfill
          </h3>
          <p className="text-sm text-[var(--text-muted)]">
            Re-checks Safepay reporter, then runs the same funding path as the
            missing webhook (idempotent). Never trusts browser payment fields.
          </p>
          <input
            type="hidden"
            name="paymentAttemptId"
            value={props.paymentAttemptId}
          />
          <div>
            <label
              htmlFor={`${formId}-apply-reason`}
              className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
            >
              Apply reason (required)
            </label>
            <textarea
              id={`${formId}-apply-reason`}
              name="reason"
              required
              maxLength={PENDING_PAYMENT_VERIFY_REASON_MAX}
              rows={2}
              disabled={applyPending}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
              placeholder="Why are you applying this verified payment now?"
            />
            {applyState &&
            !applyState.ok &&
            applyState.fieldErrors?.reason ? (
              <p className="mt-1 text-sm text-[var(--danger-text)]">
                {applyState.fieldErrors.reason}
              </p>
            ) : null}
          </div>
          {confirmed ? <input type="hidden" name="confirm" value="on" /> : null}
          <label
            htmlFor={`${formId}-apply-confirm`}
            className="flex items-start gap-2 text-xs text-[var(--text-muted)]"
          >
            <input
              id={`${formId}-apply-confirm`}
              type="checkbox"
              className="mt-0.5"
              checked={confirmed}
              disabled={applyPending}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{CUSTOMER_APPLY_CONFIRM_LABEL}</span>
          </label>
          {applyState && !applyState.ok && applyState.fieldErrors?.confirm ? (
            <p className="text-sm text-[var(--danger-text)]" role="alert">
              {applyState.fieldErrors.confirm}
            </p>
          ) : null}
          {applyState &&
          !applyState.ok &&
          applyState.error &&
          !applyState.fieldErrors?.reason &&
          !applyState.fieldErrors?.confirm ? (
            <p className="text-sm text-[var(--danger-text)]" role="alert">
              {applyState.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={applyPending || !confirmed}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {applyPending
              ? "Applying…"
              : "Apply verified payment / fulfill"}
          </button>
        </form>
      ) : null}

      {applyState && applyState.ok ? (
        <p
          className="text-sm font-medium text-[var(--accent-strong)]"
          role="status"
        >
          {applyState.message || CUSTOMER_APPLY_SUCCESS_MESSAGE}
          {applyState.duplicate ? " (already applied)" : ""}
        </p>
      ) : null}
    </section>
  );
}
