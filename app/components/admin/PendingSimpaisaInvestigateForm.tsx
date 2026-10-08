"use client";

import { useActionState, useId, useState } from "react";
import {
  applyCustomerVerifiedPendingPaymentAction,
  type CustomerPendingApplyFormState,
} from "@/app/lib/admin/pendingCustomerPaymentApplyActions";
import {
  CUSTOMER_APPLY_CONFIRM_LABEL,
  CUSTOMER_APPLY_SUCCESS_MESSAGE,
  isSimpaisaCustomerApplyEligibleDecision,
} from "@/app/lib/admin/pendingCustomerPaymentApplyShared";
import {
  checkSimpaisaPendingPaymentStatusAction,
  releaseSimpaisaPendingReservationAction,
  type SimpaisaPendingInvestigateFormState,
  type SimpaisaPendingReleaseFormState,
} from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateActions";
import {
  PENDING_PAYMENT_VERIFY_REASON_MAX,
  SIMPAISA_PARTNER_SUCCESS_APPLIED_MESSAGE,
  SIMPAISA_SUCCESS_WEBHOOK_REQUIRED_MESSAGE,
} from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";
import { ADMIN_RELEASE_RESERVATION_BLURB } from "@/app/lib/admin/adminWalletReservationDisplay";

const initialCheckState: SimpaisaPendingInvestigateFormState = null;
const initialReleaseState: SimpaisaPendingReleaseFormState = null;
const initialApplyState: CustomerPendingApplyFormState = null;

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
        Gateway Decision: {evidence.decision}
      </p>
      <p className="text-[var(--heading)]">{evidence.message}</p>
      {evidence.decision === "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED" ? (
        <p className="text-[var(--text-muted)]">
          {SIMPAISA_SUCCESS_WEBHOOK_REQUIRED_MESSAGE}
        </p>
      ) : null}
      {evidence.decision === "CONFIRMED_SUCCESS_APPLIED" ? (
        <p className="text-[var(--text-muted)]">
          {SIMPAISA_PARTNER_SUCCESS_APPLIED_MESSAGE}
        </p>
      ) : null}
      <dl className="grid grid-cols-1 gap-1 text-xs text-[var(--text-muted)] sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Owner</dt>
          <dd>{evidence.ownerKind === "partner" ? "Partner" : "Customer"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Amount</dt>
          <dd>
            {evidence.localExpectedAmountMinor} {evidence.localExpectedCurrency}
            {evidence.observedAmountMinor != null
              ? ` · gateway ${evidence.observedAmountMinor} ${evidence.observedCurrency ?? ""}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Payment Status</dt>
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
          <dt className="font-semibold">Can release hold</dt>
          <dd>{evidence.releaseEligible ? "yes" : "no"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Hold released</dt>
          <dd>{evidence.reservationReleased ? "yes" : "no"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Funding applied</dt>
          <dd>{evidence.fundingApplied ? "yes" : "no"}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function PendingSimpaisaInvestigateForm(props: {
  paymentAttemptId: string;
  transactionRefMasked: string;
  walletAppliedCents: number;
  ownerKind?: "customer" | "partner";
}) {
  const ownerKind = props.ownerKind === "partner" ? "partner" : "customer";
  const formId = useId();
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const [checkState, checkAction, checkPending] = useActionState(
    checkSimpaisaPendingPaymentStatusAction,
    initialCheckState
  );
  const [releaseState, releaseAction, releasePending] = useActionState(
    releaseSimpaisaPendingReservationAction,
    initialReleaseState
  );
  const [applyState, applyAction, applyPending] = useActionState(
    applyCustomerVerifiedPendingPaymentAction,
    initialApplyState
  );

  const checkOk = checkState && checkState.ok ? checkState.evidence : null;
  const releaseOk =
    releaseState && releaseState.ok ? releaseState.evidence : null;
  const showRelease =
    Boolean(checkOk?.releaseEligible) &&
    props.walletAppliedCents > 0 &&
    !releaseOk?.reservationReleased &&
    !checkOk?.fundingApplied;
  const showCustomerApply =
    ownerKind === "customer" &&
    Boolean(checkOk) &&
    isSimpaisaCustomerApplyEligibleDecision(
      checkOk?.decision,
      Boolean(checkOk?.validatedConfirmed)
    ) &&
    !checkOk?.fundingApplied &&
    !(applyState && applyState.ok);

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <div className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight">
          Check gateway status
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Live gateway lookup for this attempt. Never invents a mark-paid
          action
          {ownerKind === "partner"
            ? "; partner confirmed success uses the existing apply path only"
            : "; Check alone never marks a purchase funded — after confirmed success, use Apply below (re-inquires then applies)"}
          .
        </p>
        <p className="text-xs text-[var(--text-soft)]">
          Ref: {props.transactionRefMasked}
        </p>
      </div>

      <form action={checkAction} className="space-y-3">
        <input
          type="hidden"
          name="paymentAttemptId"
          value={props.paymentAttemptId}
        />
        <input type="hidden" name="ownerKind" value={ownerKind} />
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
          {checkPending ? "Checking…" : "Check gateway status"}
        </button>
      </form>

      {showCustomerApply ? (
        <form
          action={applyAction}
          className="space-y-3 border-t border-[var(--border)] pt-4"
          aria-busy={applyPending}
        >
          <h3 className="text-base font-semibold tracking-tight">
            Apply verified payment / fulfill
          </h3>
          <p className="text-sm text-[var(--text-muted)]">
            Re-runs Simpaisa Inquire, then applies through the same customer
            payment path as the missing webhook (idempotent).
          </p>
          <input
            type="hidden"
            name="paymentAttemptId"
            value={props.paymentAttemptId}
          />
          <div>
            <label
              htmlFor={`${formId}-simpaisa-apply-reason`}
              className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
            >
              Apply reason (required)
            </label>
            <textarea
              id={`${formId}-simpaisa-apply-reason`}
              name="reason"
              required
              maxLength={PENDING_PAYMENT_VERIFY_REASON_MAX}
              rows={2}
              disabled={applyPending}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
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
          {applyConfirmed ? (
            <input type="hidden" name="confirm" value="on" />
          ) : null}
          <label
            htmlFor={`${formId}-simpaisa-apply-confirm`}
            className="flex items-start gap-2 text-xs text-[var(--text-muted)]"
          >
            <input
              id={`${formId}-simpaisa-apply-confirm`}
              type="checkbox"
              className="mt-0.5"
              checked={applyConfirmed}
              disabled={applyPending}
              onChange={(event) => setApplyConfirmed(event.target.checked)}
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
            disabled={applyPending || !applyConfirmed}
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

      {showRelease ? (
        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <h3 className="text-base font-semibold tracking-tight">
            Release wallet hold
          </h3>
          <p className="text-sm text-[var(--text-muted)]">
            {ADMIN_RELEASE_RESERVATION_BLURB} Gateway must confirm
            failed/unpaid and this purchase must still show reserved wallet
            funds. Release re-checks the gateway, then uses the existing hold
            release helper.
          </p>
          <form action={releaseAction} className="space-y-3">
            <input
              type="hidden"
              name="paymentAttemptId"
              value={props.paymentAttemptId}
            />
            <input type="hidden" name="ownerKind" value={ownerKind} />
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
              {releasePending ? "Releasing…" : "Release wallet hold"}
            </button>
          </form>
        </div>
      ) : null}

      {releaseOk ? <EvidencePanel evidence={releaseOk} /> : null}
    </section>
  );
}
