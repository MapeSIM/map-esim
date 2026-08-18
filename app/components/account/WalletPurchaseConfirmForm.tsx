"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  confirmWalletEsimPurchaseAction,
  setWalletPurchaseFundingChoiceAction,
} from "@/app/lib/esim/walletPurchaseActions";
import {
  calculatePurchaseFunding,
  type PurchaseFundingBreakdown,
} from "@/app/lib/esim/purchaseFunding";
import {
  CARD_PAYMENT_UNAVAILABLE_MESSAGE,
  initialWalletPurchaseState,
  type WalletPurchaseActionState,
} from "@/app/lib/esim/walletPurchaseFormState";
import type { WalletPurchaseReview } from "@/app/lib/esim/walletPurchaseRead";
import CheckoutPromoCodeSection from "@/app/components/account/CheckoutPromoCodeSection";
import {
  CheckoutDisplayCurrencyNote,
  CheckoutMoney,
} from "@/app/components/account/CheckoutMoney";

type Props = {
  review: WalletPurchaseReview;
};

/**
 * Live checkout funding preview from the same rules as the server.
 * Never falls back to a fake gateway-only breakdown when the wallet is selected.
 */
function previewPurchaseFunding(
  review: WalletPurchaseReview,
  useWallet: boolean,
  useRewards: boolean
): PurchaseFundingBreakdown & { rewardPointsRedeemed: number } {
  const afterPromoCents = Math.trunc(Number(review.payableCents ?? review.priceCents));
  const pointsBalance = Math.max(0, Math.trunc(Number(review.rewardPointsBalance)));
  const eligible = review.rewardEligible === true;
  const rewardPointsRedeemed =
    useRewards && eligible
      ? Math.min(pointsBalance, Math.max(0, afterPromoCents))
      : 0;
  const payableCents = Math.max(0, afterPromoCents - rewardPointsRedeemed);
  try {
    if (payableCents === 0) {
      return {
        useWallet,
        walletAppliedCents: 0,
        gatewayAmountCents: 0,
        rewardPointsRedeemed,
      };
    }
    return {
      ...calculatePurchaseFunding({
        priceCents: payableCents,
        walletBalanceCents: review.balanceCents,
        useWallet,
      }),
      rewardPointsRedeemed,
    };
  } catch {
    // Same choice as the server review DTO — trust its live breakdown.
    if (useWallet === review.useWallet && useRewards === review.useRewards) {
      return {
        useWallet: review.useWallet,
        walletAppliedCents: review.walletAppliedCents,
        gatewayAmountCents: review.gatewayAmountCents,
        rewardPointsRedeemed: review.rewardPointsRedeemed,
      };
    }
    const priceCents = payableCents;
    const balanceCents = Math.max(0, Math.trunc(Number(review.balanceCents)));
    if (
      !Number.isFinite(priceCents) ||
      priceCents <= 0 ||
      !Number.isFinite(balanceCents)
    ) {
      return {
        useWallet: review.useWallet,
        walletAppliedCents: review.walletAppliedCents,
        gatewayAmountCents: review.gatewayAmountCents,
        rewardPointsRedeemed: review.rewardPointsRedeemed,
      };
    }
    const walletAppliedCents = useWallet
      ? Math.min(balanceCents, priceCents)
      : 0;
    return {
      useWallet,
      walletAppliedCents,
      gatewayAmountCents: priceCents - walletAppliedCents,
      rewardPointsRedeemed,
    };
  }
}

export default function WalletPurchaseConfirmForm({ review }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    confirmWalletEsimPurchaseAction,
    initialWalletPurchaseState
  );
  const [confirmed, setConfirmed] = useState(false);
  const [useWallet, setUseWallet] = useState(review.useWallet);
  const [useRewards, setUseRewards] = useState(review.useRewards);
  const [fundingPending, startFundingTransition] = useTransition();
  const fundingChoiceGen = useRef(0);
  const confirmId = useId();
  const useWalletId = useId();
  const useRewardsId = useId();
  const planHeadingId = useId();
  const customerHeadingId = useId();
  const walletHeadingId = useId();
  const rewardsHeadingId = useId();
  const orderHeadingId = useId();
  const paymentHeadingId = useId();
  const errorState = state as WalletPurchaseActionState;

  // Reset local choice only when navigating to a different purchase.
  useEffect(() => {
    setUseWallet(review.useWallet);
    setUseRewards(review.useRewards);
  }, [review.purchaseId, review.useWallet, review.useRewards]);

  const preview = previewPurchaseFunding(review, useWallet, useRewards);
  const gatewayRequired = preview.gatewayAmountCents > 0;
  const walletFundsApplied = preview.walletAppliedCents > 0;
  const fullWallet = !gatewayRequired && walletFundsApplied;
  const zeroCashConfirm = !gatewayRequired;
  const rewardsDisabled = !review.rewardEligible;
  const walletDisabled = review.balanceCents <= 0;
  const paymentGatewayConfigured = review.paymentGatewayConfigured === true;
  const gatewayReady = gatewayRequired && paymentGatewayConfigured;
  const showGatewayUnavailable = gatewayRequired && !paymentGatewayConfigured;
  const balanceAfterPreview = Math.max(
    0,
    review.balanceCents - preview.walletAppliedCents
  );
  const busy = pending || fundingPending;
  const alertError =
    errorState.ok === false && errorState.error
      ? errorState.error === CARD_PAYMENT_UNAVAILABLE_MESSAGE
        ? null
        : errorState.error
      : null;

  function persistFundingChoice(nextWallet: boolean, nextRewards: boolean) {
    const gen = ++fundingChoiceGen.current;
    startFundingTransition(async () => {
      const fd = new FormData();
      fd.set("purchaseId", review.purchaseId);
      if (nextWallet) fd.set("useWallet", "on");
      if (nextRewards) fd.set("useRewards", "on");
      const result = await setWalletPurchaseFundingChoiceAction(
        initialWalletPurchaseState,
        fd
      );
      if (result.ok === true && gen === fundingChoiceGen.current) {
        router.refresh();
      }
    });
  }

  function onUseWalletChange(checked: boolean) {
    setUseWallet(checked);
    persistFundingChoice(checked, useRewards && !rewardsDisabled);
  }

  function onUseRewardsChange(checked: boolean) {
    setUseRewards(checked);
    persistFundingChoice(useWallet && !walletDisabled, checked);
  }

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

      <CheckoutPromoCodeSection
        purchaseId={review.purchaseId}
        applied={review.promoApplied}
        code={review.promoCode}
        originalCents={review.priceCents}
        discountCents={review.promoDiscountCents}
        totalCents={review.payableCents}
        disabled={busy}
      />

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
        aria-labelledby={rewardsHeadingId}
      >
        <h2
          id={rewardsHeadingId}
          className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Rewards
        </h2>
        {review.rewardEligible ? (
          <>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {review.rewardPointsBalanceLabel} points available (
              <CheckoutMoney cents={review.rewardPointsBalance} />)
            </p>
            <label
              htmlFor={useRewardsId}
              className="mt-4 flex items-start gap-3 text-sm text-[var(--heading)]"
            >
              <input
                id={useRewardsId}
                name="useRewards"
                type="checkbox"
                value="on"
                checked={useRewards}
                onChange={(event) => onUseRewardsChange(event.target.checked)}
                disabled={busy}
                className="mt-1"
              />
              <span>Use rewards</span>
            </label>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-[var(--heading)]">
              {review.rewardPointsBalanceLabel} points available
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Earn {review.rewardPointsToUnlock} more points to unlock rewards.
            </p>
            <label
              htmlFor={useRewardsId}
              className="mt-4 flex items-start gap-3 text-sm text-[var(--text-muted)]"
            >
              <input
                id={useRewardsId}
                name="useRewards"
                type="checkbox"
                value="on"
                checked={false}
                disabled
                className="mt-1"
              />
              <span>Use rewards</span>
            </label>
          </>
        )}
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
          Current balance:{" "}
          <CheckoutMoney
            cents={review.balanceCents}
            variant="wallet-balance"
          />
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
            onChange={(event) => onUseWalletChange(event.target.checked)}
            disabled={busy || walletDisabled}
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
              <CheckoutMoney cents={review.priceCents} />
            </dd>
          </div>
          {review.promoDiscountCents > 0 ? (
            <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Promo discount
              </dt>
              <dd className="font-semibold text-[var(--heading)]">
                <CheckoutMoney cents={review.promoDiscountCents} signed />
              </dd>
            </div>
          ) : null}
          {preview.rewardPointsRedeemed > 0 ? (
            <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Rewards applied
              </dt>
              <dd className="font-semibold text-[var(--heading)]">
                <CheckoutMoney cents={preview.rewardPointsRedeemed} signed />
              </dd>
            </div>
          ) : null}
          {preview.walletAppliedCents > 0 ? (
            <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Wallet applied
              </dt>
              <dd className="font-semibold text-[var(--heading)]">
                <CheckoutMoney
                  cents={preview.walletAppliedCents}
                  signed
                  variant="wallet-deduction"
                />
              </dd>
            </div>
          ) : null}
          <div
            className={`grid gap-1 py-3 sm:grid-cols-[180px_1fr]${
              fullWallet || zeroCashConfirm ? " border-b border-[var(--border)]" : ""
            }`}
          >
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Pay now
            </dt>
            <dd className="font-semibold text-[var(--heading)]">
              <CheckoutMoney cents={preview.gatewayAmountCents} />
            </dd>
          </div>
          {fullWallet ? (
            <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Balance after purchase
              </dt>
              <dd className="font-semibold text-[var(--heading)]">
                <CheckoutMoney
                  cents={balanceAfterPreview}
                  variant="wallet-balance"
                />
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <CheckoutDisplayCurrencyNote />

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
          {gatewayReady ? (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Continue to our secure payment page to pay{" "}
              <CheckoutMoney cents={preview.gatewayAmountCents} />
              {preview.walletAppliedCents > 0 ? (
                <>
                  {" "}
                  after applying{" "}
                  <CheckoutMoney
                    cents={preview.walletAppliedCents}
                    variant="wallet-deduction"
                  />{" "}
                  from your wallet
                </>
              ) : null}
              . Your eSIM is created only after payment is verified.
            </p>
          ) : showGatewayUnavailable ? (
            <>
              <p className="mt-1 text-sm text-[var(--text-muted)]" role="status">
                {CARD_PAYMENT_UNAVAILABLE_MESSAGE}
              </p>
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Remaining due:{" "}
                <CheckoutMoney cents={preview.gatewayAmountCents} />.
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      {zeroCashConfirm ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]"
          role="note"
        >
          {fullWallet
            ? "Confirm below to complete this purchase with your wallet. If the provider confirms failure, the amount will be restored automatically. An uncertain provider result may require support review."
            : "Confirm below to complete this purchase. No card payment is required. If the provider confirms failure, reserved rewards are restored automatically."}
        </div>
      ) : null}

      {alertError ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="alert"
        >
          {alertError}
        </div>
      ) : null}

      {zeroCashConfirm ? (
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
                disabled={busy}
                className="mt-1"
              />
              <span>
                {fullWallet
                  ? "I confirm this wallet purchase and understand funds are reserved before provider checkout."
                  : "I confirm this purchase. No card payment is required."}
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
            disabled={busy || !confirmed}
            className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {pending
              ? fullWallet
                ? "Buying with wallet…"
                : "Completing purchase…"
              : fullWallet
                ? "Buy eSIM with Wallet"
                : "Complete purchase"}
          </button>
        </>
      ) : gatewayReady ? (
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
        >
          {pending ? "Starting secure payment…" : "Continue to Secure Payment"}
        </button>
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
