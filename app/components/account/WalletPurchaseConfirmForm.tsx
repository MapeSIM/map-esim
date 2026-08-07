"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { confirmWalletEsimPurchaseAction } from "@/app/lib/esim/walletPurchaseActions";
import { calculatePurchaseFunding } from "@/app/lib/esim/purchaseFunding";
import {
  CARD_PAYMENT_UNAVAILABLE_MESSAGE,
  initialWalletPurchaseState,
  type WalletPurchaseActionState,
} from "@/app/lib/esim/walletPurchaseFormState";
import type { WalletPurchaseReview } from "@/app/lib/esim/walletPurchaseRead";
import { formatUsdCents } from "@/app/lib/wallet/display";

type Props = {
  review: WalletPurchaseReview;
};

export default function WalletPurchaseConfirmForm({ review }: Props) {
  const [state, formAction, pending] = useActionState(
    confirmWalletEsimPurchaseAction,
    initialWalletPurchaseState
  );
  const [confirmed, setConfirmed] = useState(false);
  const [useWallet, setUseWallet] = useState(review.useWallet);
  const confirmId = useId();
  const useWalletId = useId();
  const planHeadingId = useId();
  const customerHeadingId = useId();
  const walletHeadingId = useId();
  const orderHeadingId = useId();
  const paymentHeadingId = useId();
  const errorState = state as WalletPurchaseActionState;

  const preview = useMemo(() => {
    try {
      return calculatePurchaseFunding({
        priceCents: review.priceCents,
        walletBalanceCents: review.balanceCents,
        useWallet,
      });
    } catch {
      return {
        useWallet,
        walletAppliedCents: 0,
        gatewayAmountCents: review.priceCents,
      };
    }
  }, [review.priceCents, review.balanceCents, useWallet]);

  const gatewayRequired = preview.gatewayAmountCents > 0;
  const fullWallet = !gatewayRequired && preview.useWallet;
  const walletDisabled = review.balanceCents <= 0;
  const balanceAfterPreview = Math.max(
    0,
    review.balanceCents - preview.walletAppliedCents
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="purchaseId" value={review.purchaseId} />
      <input type="hidden" name="idempotencyKey" value={review.idempotencyKey} />

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5"
        aria-labelledby={planHeadingId}
      >
        <h2
          id={planHeadingId}
          className="border-b border-[var(--border)] py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Plan summary
        </h2>
        <dl className="text-sm">
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
          <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Delivery
            </dt>
            <dd className="font-semibold text-[var(--heading)]">
              {review.deliveryLabel}
            </dd>
          </div>
        </dl>
      </section>

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
        aria-labelledby={customerHeadingId}
      >
        <h2
          id={customerHeadingId}
          className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Customer
        </h2>
        <p className="mt-2 text-sm font-semibold text-[var(--heading)]">
          {review.customerEmail}
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Signed-in account email
        </p>
      </section>

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
        aria-labelledby={walletHeadingId}
      >
        <h2
          id={walletHeadingId}
          className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Wallet
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Current balance: {review.balanceLabel} USD
          {walletDisabled ? " (no funds available)" : null}
        </p>
        <label
          htmlFor={useWalletId}
          className="mt-4 flex items-start gap-3 text-sm text-[var(--heading)]"
        >
          <input
            id={useWalletId}
            name="useWallet"
            type="checkbox"
            value="on"
            checked={useWallet && !walletDisabled}
            onChange={(event) => setUseWallet(event.target.checked)}
            disabled={pending || walletDisabled}
            className="mt-1"
          />
          <span>Use wallet balance</span>
        </label>
      </section>

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5"
        aria-labelledby={orderHeadingId}
      >
        <h2
          id={orderHeadingId}
          className="border-b border-[var(--border)] py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Order summary
        </h2>
        <dl className="text-sm">
          <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Package total
            </dt>
            <dd className="font-semibold text-[var(--heading)]">
              {formatUsdCents(review.priceCents)}
            </dd>
          </div>
          <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Wallet applied
            </dt>
            <dd className="font-semibold text-[var(--heading)]">
              {preview.walletAppliedCents > 0
                ? `−${formatUsdCents(preview.walletAppliedCents)}`
                : formatUsdCents(0)}
            </dd>
          </div>
          <div
            className={`grid gap-1 py-3 sm:grid-cols-[180px_1fr]${
              fullWallet ? " border-b border-[var(--border)]" : ""
            }`}
          >
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Pay now
            </dt>
            <dd className="font-semibold text-[var(--heading)]">
              {formatUsdCents(preview.gatewayAmountCents)}
            </dd>
          </div>
          {fullWallet ? (
            <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Balance after purchase
              </dt>
              <dd className="font-semibold text-[var(--heading)]">
                {formatUsdCents(balanceAfterPreview)} USD
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {gatewayRequired ? (
        <section
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
          aria-labelledby={paymentHeadingId}
        >
          <h2
            id={paymentHeadingId}
            className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Payment method
          </h2>
          <p className="mt-2 text-sm font-semibold text-[var(--heading)]">
            Online payment
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]" role="status">
            {CARD_PAYMENT_UNAVAILABLE_MESSAGE}
          </p>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Remaining due: {formatUsdCents(preview.gatewayAmountCents)}. Wallet
            funds are not reserved until online payment is available.
          </p>
        </section>
      ) : null}

      {fullWallet ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]"
          role="note"
        >
          Confirm below to complete this purchase with your wallet. If the
          provider confirms failure, the amount will be restored automatically.
          An uncertain provider result may require support review.
        </div>
      ) : null}

      {errorState.ok === false && errorState.error ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="alert"
        >
          {errorState.error}
        </div>
      ) : null}

      {fullWallet ? (
        <>
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
            {pending ? "Buying with wallet…" : "Buy eSIM with Wallet"}
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled
          className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] opacity-60"
        >
          Continue to Payment
        </button>
      )}
    </form>
  );
}
