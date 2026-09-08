"use client";

import { useActionState } from "react";
import {
  checkSimpaisaPendingPaymentStatusAction,
  releaseSimpaisaPendingReservationAction,
  type SimpaisaPendingInvestigateFormState,
  type SimpaisaPendingReleaseFormState,
} from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateActions";
import {
  PENDING_PAYMENT_VERIFY_REASON_MAX,
  SIMPAISA_SUCCESS_WEBHOOK_REQUIRED_MESSAGE,
} from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";

const initialCheckState: SimpaisaPendingInvestigateFormState = null;
const initialReleaseState: SimpaisaPendingReleaseFormState = null;

function EvidencePanel(props: {
  evidence: NonNullable<
    Extract<SimpaisaPendingInvestigateFormState, { ok: true }>
  >["evidence"];
}) {
  const { evidence } = props;
  return (
    <div
      className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm"
      role="status"
    >
      <p className="font-semibold text-[var(--heading)]">
        Decision: {evidence.decision}
      </p>
      <p className="text-[var(--heading)]">{evidence.message}</p>
      {evidence.decision === "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED" ? (
        <p className="text-[var(--text-muted)]">
          {SIMPAISA_SUCCESS_WEBHOOK_REQUIRED_MESSAGE}
        </p>
      ) : null}
      <dl className="grid grid-cols-1 gap-1 text-xs text-[var(--text-muted)] sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Local amount</dt>
          <dd>
            {evidence.localExpectedAmountMinor} {evidence.localExpectedCurrency}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Observed amount</dt>
          <dd>
            {evidence.observedAmountMinor ?? "—"}{" "}
            {evidence.observedCurrency ?? ""}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Inquire status</dt>
          <dd>{evidence.inquiryStatus ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Transaction</dt>
          <dd>{evidence.transactionRefMasked}</dd>
        </div>
        <div>
          <dt className="font-semibold">User key match</dt>
          <dd>
            {evidence.userKeyMatch == null
              ? "n/a"
              : evidence.userKeyMatch
                ? "yes"
                : "no"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Transaction match</dt>
          <dd>
            {evidence.transactionMatch == null
              ? "n/a"
              : evidence.transactionMatch
                ? "yes"
                : "no"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Checked at</dt>
          <dd>{evidence.verifiedAt}</dd>
        </div>
        <div>
          <dt className="font-semibold">Release eligible</dt>
          <dd>{evidence.releaseEligible ? "yes" : "no"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Reservation released</dt>
          <dd>{evidence.reservationReleased ? "yes" : "no"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Funding applied</dt>
          <dd>no</dd>
        </div>
      </dl>
    </div>
  );
}

export default function PendingSimpaisaInvestigateForm(props: {
  paymentAttemptId: string;
  transactionRefMasked: string;
  walletAppliedCents: number;
}) {
  const [checkState, checkAction, checkPending] = useActionState(
    checkSimpaisaPendingPaymentStatusAction,
    initialCheckState
  );
  const [releaseState, releaseAction, releasePending] = useActionState(
    releaseSimpaisaPendingReservationAction,
    initialReleaseState
  );

  const checkOk = checkState && checkState.ok ? checkState.evidence : null;
  const releaseOk =
    releaseState && releaseState.ok ? releaseState.evidence : null;
  const showRelease =
    Boolean(checkOk?.releaseEligible) &&
    props.walletAppliedCents > 0 &&
    !releaseOk?.reservationReleased;

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          Check Simpaisa status
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Calls authenticated Simpaisa Inquire for this attempt. Browser return
          data is ignored. This never marks a purchase funded, never creates an
          eSIM order, and never releases a wallet reservation by itself.
        </p>
        <p className="text-xs text-[var(--text-soft)]">
          Stored transaction: {props.transactionRefMasked}
        </p>
      </div>

      <form action={checkAction} className="space-y-3">
        <input
          type="hidden"
          name="paymentAttemptId"
          value={props.paymentAttemptId}
        />
        <div>
          <label
            htmlFor="pending-simpaisa-check-reason"
            className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Reason (required)
          </label>
          <textarea
            id="pending-simpaisa-check-reason"
            name="reason"
            required
            maxLength={PENDING_PAYMENT_VERIFY_REASON_MAX}
            rows={3}
            disabled={checkPending}
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
            placeholder="Why are you checking this Simpaisa pending payment?"
          />
          {checkState &&
          !checkState.ok &&
          checkState.fieldErrors?.reason ? (
            <p className="mt-1 text-sm text-[var(--danger-text)]">
              {checkState.fieldErrors.reason}
            </p>
          ) : null}
        </div>

        {checkState &&
        !checkState.ok &&
        checkState.error &&
        !checkState.fieldErrors?.reason ? (
          <p className="text-sm text-[var(--danger-text)]" role="alert">
            {checkState.error}
          </p>
        ) : null}

        {checkOk ? <EvidencePanel evidence={checkOk} /> : null}

        <button
          type="submit"
          disabled={checkPending}
          className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white outline-none ring-[var(--accent-strong)] focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checkPending ? "Checking…" : "Check Simpaisa Status"}
        </button>
      </form>

      {showRelease ? (
        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <h3 className="text-base font-semibold tracking-tight">
            Release reservation
          </h3>
          <p className="text-sm text-[var(--text-muted)]">
            Inquire confirmed failed/terminal unpaid and this purchase still
            shows reserved wallet funds. Release re-runs Inquire and only then
            calls the existing reservation release helper. It never funds or
            marks paid.
          </p>
          <form action={releaseAction} className="space-y-3">
            <input
              type="hidden"
              name="paymentAttemptId"
              value={props.paymentAttemptId}
            />
            <div>
              <label
                htmlFor="pending-simpaisa-release-reason"
                className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                Release reason (required)
              </label>
              <textarea
                id="pending-simpaisa-release-reason"
                name="reason"
                required
                maxLength={PENDING_PAYMENT_VERIFY_REASON_MAX}
                rows={2}
                disabled={releasePending}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                placeholder="Confirm why reservation should be released."
              />
              {releaseState &&
              !releaseState.ok &&
              releaseState.fieldErrors?.reason ? (
                <p className="mt-1 text-sm text-[var(--danger-text)]">
                  {releaseState.fieldErrors.reason}
                </p>
              ) : null}
            </div>
            {releaseState &&
            !releaseState.ok &&
            releaseState.error &&
            !releaseState.fieldErrors?.reason ? (
              <p className="text-sm text-[var(--danger-text)]" role="alert">
                {releaseState.error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={releasePending}
              className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--heading)] outline-none ring-[var(--accent-strong)] focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {releasePending ? "Releasing…" : "Release Reservation"}
            </button>
          </form>
        </div>
      ) : null}

      {releaseOk ? <EvidencePanel evidence={releaseOk} /> : null}
    </section>
  );
}
