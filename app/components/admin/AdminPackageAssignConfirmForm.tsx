"use client";

import { useActionState, useId } from "react";
import { confirmAdminPackageAssignmentAction } from "@/app/lib/esim/adminPackageAssignmentActions";
import {
  initialAdminPackageAssignmentState,
  type AdminPackageAssignmentActionState,
} from "@/app/lib/esim/adminPackageAssignmentFormState";
import { ASSIGNMENT_CONFIRM_PHRASE } from "@/app/lib/esim/assignmentValidation";
import type { AdminAssignmentReview } from "@/app/lib/esim/adminPackageAssignmentRead";

type Props = {
  review: AdminAssignmentReview;
};

export default function AdminPackageAssignConfirmForm({ review }: Props) {
  const [state, formAction, pending] = useActionState(
    confirmAdminPackageAssignmentAction,
    initialAdminPackageAssignmentState
  );
  const confirmId = useId();
  const phraseId = useId();
  const errorState = state as AdminPackageAssignmentActionState;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="customerUserId" value={review.customerId} />
      <input type="hidden" name="assignmentId" value={review.assignmentId} />
      <input type="hidden" name="idempotencyKey" value={review.idempotencyKey} />

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5 text-sm">
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Customer
          </dt>
          <dd className="font-semibold text-[var(--heading)] break-words">
            {review.customerName} · {review.customerEmailMasked}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Destination
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.destination}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Package / data
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.planName} · {review.dataAllowance}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Validity
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.validity}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Provider / company cost
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.providerCostLabel}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Funding mode
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.fundingLabel}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Customer wallet before
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.walletBeforeLabel} USD
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Customer wallet after
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.walletAfterLabel} USD
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Offer ID
          </dt>
          <dd className="font-medium text-[var(--heading)] break-all">
            {review.offerId}
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Internal reason
          </dt>
          <dd className="font-medium text-[var(--heading)] break-words">
            {review.reason}
          </dd>
        </div>
      </dl>

      <div
        className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]"
        role="note"
      >
        This action creates a real provider eSIM order and may charge the MAP
        eSIM provider balance. The customer wallet will not be charged.
      </div>

      {errorState.ok === false && errorState.error ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="alert"
        >
          {errorState.error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label
          htmlFor={confirmId}
          className="flex items-start gap-3 text-sm text-[var(--heading)]"
        >
          <input
            id={confirmId}
            name="confirm"
            type="checkbox"
            disabled={pending}
            className="mt-1"
          />
          <span>
            I confirm this company-funded assignment and understand the provider
            balance may be charged.
          </span>
        </label>
        {errorState.ok === false && errorState.fieldErrors?.confirm ? (
          <p className="text-xs text-[var(--text-muted)]">
            {errorState.fieldErrors.confirm}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor={phraseId}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Type {ASSIGNMENT_CONFIRM_PHRASE} to confirm
        </label>
        <input
          id={phraseId}
          name="confirmPhrase"
          type="text"
          autoComplete="off"
          disabled={pending}
          placeholder={ASSIGNMENT_CONFIRM_PHRASE}
          className="w-full rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--heading)]"
        />
        {errorState.ok === false && errorState.fieldErrors?.confirmPhrase ? (
          <p className="text-xs text-[var(--text-muted)]">
            {errorState.fieldErrors.confirmPhrase}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Assigning package…" : "Assign eSIM package"}
      </button>
    </form>
  );
}
