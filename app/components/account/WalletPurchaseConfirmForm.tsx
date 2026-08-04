"use client";

import { useActionState, useId, useState } from "react";
import { confirmWalletEsimPurchaseAction } from "@/app/lib/esim/walletPurchaseActions";
import {
  initialWalletPurchaseState,
  type WalletPurchaseActionState,
} from "@/app/lib/esim/walletPurchaseFormState";
import type { WalletPurchaseReview } from "@/app/lib/esim/walletPurchaseRead";

type Props = {
  review: WalletPurchaseReview;
};

export default function WalletPurchaseConfirmForm({ review }: Props) {
  const [state, formAction, pending] = useActionState(
    confirmWalletEsimPurchaseAction,
    initialWalletPurchaseState
  );
  const [confirmed, setConfirmed] = useState(false);
  const confirmId = useId();
  const errorState = state as WalletPurchaseActionState;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="purchaseId" value={review.purchaseId} />
      <input type="hidden" name="idempotencyKey" value={review.idempotencyKey} />

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5 text-sm">
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
            Wallet price
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.priceLabel}
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Current wallet balance
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.balanceLabel} USD
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Balance after purchase
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.balanceAfterLabel} USD
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Funding
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {review.fundingLabel}
          </dd>
        </div>
      </dl>

      <div
        className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]"
        role="note"
      >
        This purchase will deduct funds from your MAP eSIM wallet. If the
        provider confirms failure, the amount will be restored automatically. An
        uncertain provider result may require support review.
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
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={pending}
            className="mt-1"
          />
          <span>
            I confirm this wallet purchase and understand funds are reserved
            before provider checkout.
          </span>
        </label>
        {errorState.ok === false && errorState.fieldErrors?.confirm ? (
          <p className="text-sm text-[var(--heading)]" role="alert">
            {errorState.fieldErrors.confirm}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending || !confirmed}
        className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Buying with wallet…" : "Buy eSIM with wallet"}
      </button>
    </form>
  );
}
