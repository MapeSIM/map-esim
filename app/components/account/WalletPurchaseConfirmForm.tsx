"use client";

import {
  useActionState,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  confirmWalletEsimPurchaseAction,
  cancelPendingEsimGatewayCheckoutAction,
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
import { CUSTOMER_PAYMENT_TEMPORARILY_UNAVAILABLE_MESSAGE } from "@/app/lib/payments/customerPaymentCheckoutPolicy";
import type { CustomerEsimPaymentMode } from "@/app/lib/esim/walletPurchaseValidation";
import { useWalletFromPaymentMode } from "@/app/lib/esim/walletPurchaseValidation";
import type { WalletPurchaseReview } from "@/app/lib/esim/walletPurchaseRead";
import { WalletEsimPurchaseStatus } from "@prisma/client";
import CheckoutPromoCodeSection from "@/app/components/account/CheckoutPromoCodeSection";
import CheckoutDeliveryEmailSection from "@/app/components/account/CheckoutDeliveryEmailSection";
import {
  CheckoutDisplayCurrencyNote,
  CheckoutMoney,
} from "@/app/components/account/CheckoutMoney";
import { CheckoutTrustPanel } from "@/app/components/account/CheckoutTrustPanel";
import SimpaisaWalletFields from "@/app/components/account/SimpaisaWalletFields";

type Props = {
  review: WalletPurchaseReview;
};

function defaultPaymentMode(
  review: WalletPurchaseReview
): CustomerEsimPaymentMode {
  const afterPromo = Math.max(
    0,
    Math.trunc(Number(review.payableCents ?? review.priceCents))
  );
  const rewards =
    review.useRewards && review.rewardEligible
      ? Math.min(
          Math.max(0, Math.trunc(Number(review.rewardPointsBalance))),
          afterPromo
        )
      : 0;
  const cashPayable = Math.max(0, afterPromo - rewards);
  const balance = Math.max(0, Math.trunc(Number(review.balanceCents)));
  if (cashPayable <= 0) return "full_wallet";
  if (balance <= 0) return "mobile_only";
  if (balance >= cashPayable) return "full_wallet";
  if (review.useWallet) return "wallet_and_mobile";
  return "mobile_only";
}

/**
 * Live checkout funding preview from the same rules as the server.
 * Never falls back to a fake gateway-only breakdown when the wallet is selected.
 */
function previewPurchaseFunding(
  review: WalletPurchaseReview,
  useWallet: boolean,
  useRewards: boolean
): PurchaseFundingBreakdown & { rewardPointsRedeemed: number } {
  const afterPromoCents = Math.trunc(
    Number(review.payableCents ?? review.priceCents)
  );
  const pointsBalance = Math.max(
    0,
    Math.trunc(Number(review.rewardPointsBalance))
  );
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
  const [paymentMode, setPaymentMode] = useState<CustomerEsimPaymentMode>(() =>
    defaultPaymentMode(review)
  );
  const [useRewards, setUseRewards] = useState(review.useRewards);
  const [deliveryBlocksPurchase, setDeliveryBlocksPurchase] = useState(false);
  const [fundingPending, startFundingTransition] = useTransition();
  const fundingChoiceGen = useRef(0);
  const confirmId = useId();
  const useRewardsId = useId();
  const planHeadingId = useId();
  const customerHeadingId = useId();
  const paymentModeHeadingId = useId();
  const rewardsHeadingId = useId();
  const orderHeadingId = useId();
  const paymentHeadingId = useId();
  const errorState = state as WalletPurchaseActionState;

  const useWallet = useWalletFromPaymentMode(paymentMode);
  const preview = previewPurchaseFunding(review, useWallet, useRewards);
  const gatewayRequired = preview.gatewayAmountCents > 0;
  const walletFundsApplied = preview.walletAppliedCents > 0;
  const fullWallet = !gatewayRequired && walletFundsApplied;
  const zeroCashConfirm = !gatewayRequired;
  const rewardsDisabled = !review.rewardEligible;
  const walletDisabled = review.balanceCents <= 0;
  const paymentGatewayConfigured = review.paymentGatewayConfigured === true;
  const simpaisaCheckout = review.activePaymentProvider === "SIMPAISA";
  const gatewayReady = gatewayRequired && paymentGatewayConfigured;
  const showGatewayUnavailable = gatewayRequired && !paymentGatewayConfigured;
  const afterPromoCents = Math.max(
    0,
    Math.trunc(Number(review.payableCents ?? review.priceCents))
  );
  const cashPayablePreview = Math.max(
    0,
    afterPromoCents - preview.rewardPointsRedeemed
  );
  const canFullWallet =
    !walletDisabled &&
    review.balanceCents >= cashPayablePreview &&
    cashPayablePreview > 0;
  const canWalletAndMobile =
    !walletDisabled &&
    review.balanceCents > 0 &&
    review.balanceCents < cashPayablePreview;
  const balanceAfterPreview = Math.max(
    0,
    review.balanceCents - preview.walletAppliedCents
  );
  const busy = pending || fundingPending;
  const purchaseBlocked = busy || deliveryBlocksPurchase;
  const alertError =
    errorState.ok === false && errorState.error
      ? errorState.error === CARD_PAYMENT_UNAVAILABLE_MESSAGE ||
        errorState.error === CUSTOMER_PAYMENT_TEMPORARILY_UNAVAILABLE_MESSAGE
        ? null
        : errorState.fieldErrors?.walletOperatorId ||
            errorState.fieldErrors?.customerMsisdn ||
            errorState.fieldErrors?.paymentMode
          ? null
          : errorState.error
      : null;

  function persistFundingChoice(
    nextMode: CustomerEsimPaymentMode,
    nextRewards: boolean
  ) {
    const gen = ++fundingChoiceGen.current;
    startFundingTransition(async () => {
      const fd = new FormData();
      fd.set("purchaseId", review.purchaseId);
      fd.set("paymentMode", nextMode);
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

  function onPaymentModeChange(next: CustomerEsimPaymentMode) {
    setPaymentMode(next);
    persistFundingChoice(next, useRewards && !rewardsDisabled);
  }

  function onUseRewardsChange(checked: boolean) {
    setUseRewards(checked);
    persistFundingChoice(paymentMode, checked);
  }

  const cardClass =
    "rounded-[24px] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 sm:px-6";

  const paymentOptionClass = (selected: boolean, disabled: boolean) =>
    [
      "flex min-w-0 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition",
      selected
        ? "border-[var(--accent-strong)] bg-[color-mix(in_srgb,var(--accent-strong)_8%,var(--surface))]"
        : "border-[var(--border)] bg-[var(--surface)]",
      disabled
        ? "cursor-not-allowed opacity-55"
        : "hover:border-[var(--border-strong)]",
    ].join(" ");

  const awaitingGatewayPayment =
    review.status === WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT;

  return (
    <div className="space-y-6">
      {awaitingGatewayPayment ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Mobile payment is still pending. Wallet funds stay reserved until
            payment is verified or you cancel.
          </p>
          <form
            action={cancelPendingEsimGatewayCheckoutAction}
            className="mt-3"
          >
            <input type="hidden" name="purchaseId" value={review.purchaseId} />
            {review.pendingGatewayAttemptId ? (
              <input
                type="hidden"
                name="attemptId"
                value={review.pendingGatewayAttemptId}
              />
            ) : null}
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface)]/80"
            >
              Cancel payment & unlock wallet
            </button>
          </form>
        </div>
      ) : null}

    <form
      action={formAction}
      className="space-y-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0"
      noValidate
    >
      <input type="hidden" name="purchaseId" value={review.purchaseId} />
      <input type="hidden" name="idempotencyKey" value={review.idempotencyKey} />
      <input type="hidden" name="paymentMode" value={paymentMode} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-5">
          <section className={cardClass} aria-labelledby={planHeadingId}>
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

          <section className={cardClass} aria-labelledby={customerHeadingId}>
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
            <CheckoutDeliveryEmailSection
              key={`${review.purchaseId}:${review.alternateDeliveryEmail ?? ""}:${review.deliveryEmailEditable ? "1" : "0"}`}
              purchaseId={review.purchaseId}
              accountEmail={review.customerEmail}
              savedAlternateEmail={review.alternateDeliveryEmail}
              editable={review.deliveryEmailEditable}
              disabled={busy}
              onBlockingChange={setDeliveryBlocksPurchase}
            />
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

          <section className={cardClass} aria-labelledby={rewardsHeadingId}>
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
                    onChange={(event) =>
                      onUseRewardsChange(event.target.checked)
                    }
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
                  Earn {review.rewardPointsToUnlock} more points to unlock
                  rewards.
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
            className={cardClass}
            aria-labelledby={paymentModeHeadingId}
          >
            <h2
              id={paymentModeHeadingId}
              className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
            >
              How do you want to pay?
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Current wallet balance:{" "}
              <CheckoutMoney
                cents={review.balanceCents}
                variant="wallet-balance"
              />
              {walletDisabled ? " (no funds available)" : null}
            </p>

            <div
              role="radiogroup"
              aria-labelledby={paymentModeHeadingId}
              className="mt-4 space-y-3"
            >
              <label
                className={paymentOptionClass(
                  paymentMode === "full_wallet",
                  !canFullWallet && cashPayablePreview > 0
                )}
              >
                <input
                  type="radio"
                  name="paymentModeChoice"
                  value="full_wallet"
                  checked={paymentMode === "full_wallet"}
                  disabled={busy || (!canFullWallet && cashPayablePreview > 0)}
                  onChange={() => onPaymentModeChange("full_wallet")}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold text-[var(--heading)]">
                    Full wallet
                  </span>
                  <span className="mt-1 block text-[var(--text-muted)]">
                    Pay the full amount from your wallet balance.
                  </span>
                </span>
              </label>

              <label
                className={paymentOptionClass(
                  paymentMode === "wallet_and_mobile",
                  !canWalletAndMobile
                )}
              >
                <input
                  type="radio"
                  name="paymentModeChoice"
                  value="wallet_and_mobile"
                  checked={paymentMode === "wallet_and_mobile"}
                  disabled={busy || !canWalletAndMobile}
                  onChange={() => onPaymentModeChange("wallet_and_mobile")}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold text-[var(--heading)]">
                    {simpaisaCheckout
                      ? "Wallet + mobile payment"
                      : "Wallet + online payment"}
                  </span>
                  <span className="mt-1 block text-[var(--text-muted)]">
                    {simpaisaCheckout
                      ? "Use available wallet funds, then pay the remainder with Easypaisa or JazzCash."
                      : "Use available wallet funds, then pay the remainder on our secure payment page."}
                  </span>
                </span>
              </label>

              <label
                className={paymentOptionClass(
                  paymentMode === "mobile_only",
                  false
                )}
              >
                <input
                  type="radio"
                  name="paymentModeChoice"
                  value="mobile_only"
                  checked={paymentMode === "mobile_only"}
                  disabled={busy}
                  onChange={() => onPaymentModeChange("mobile_only")}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold text-[var(--heading)]">
                    {simpaisaCheckout
                      ? "Mobile payment only"
                      : "Online payment only"}
                  </span>
                  <span className="mt-1 block text-[var(--text-muted)]">
                    {simpaisaCheckout
                      ? "Pay the full amount with Easypaisa or JazzCash. Your wallet balance will not be used for this purchase."
                      : "Pay the full amount on our secure payment page. Your wallet balance will not be used for this purchase."}
                  </span>
                </span>
              </label>
            </div>

            {errorState.ok === false && errorState.fieldErrors?.paymentMode ? (
              <p className="mt-3 text-sm text-[var(--heading)]" role="alert">
                {errorState.fieldErrors.paymentMode}
              </p>
            ) : null}
          </section>

          {gatewayRequired ? (
            <section className={cardClass} aria-labelledby={paymentHeadingId}>
              <h2
                id={paymentHeadingId}
                className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                {simpaisaCheckout ? "Mobile payment" : "Payment method"}
              </h2>
              {gatewayReady ? (
                <>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Amount due online:{" "}
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
                  {simpaisaCheckout ? (
                    <SimpaisaWalletFields
                      usdCents={preview.gatewayAmountCents}
                      disabled={busy}
                      operatorError={
                        errorState.ok === false
                          ? errorState.fieldErrors?.walletOperatorId
                          : undefined
                      }
                      msisdnError={
                        errorState.ok === false
                          ? errorState.fieldErrors?.customerMsisdn
                          : undefined
                      }
                    />
                  ) : (
                    <p className="mt-3 text-sm font-semibold text-[var(--heading)]">
                      Continue to our secure payment page.
                    </p>
                  )}
                </>
              ) : showGatewayUnavailable ? (
                <>
                  <p
                    className="mt-1 text-sm font-medium text-[var(--heading)]"
                    role="status"
                  >
                    {review.customerPaymentsTemporarilyUnavailable
                      ? CUSTOMER_PAYMENT_TEMPORARILY_UNAVAILABLE_MESSAGE
                      : CARD_PAYMENT_UNAVAILABLE_MESSAGE}
                  </p>
                  <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Remaining due:{" "}
                    <CheckoutMoney cents={preview.gatewayAmountCents} />.
                  </p>
                </>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6">
          <section className={cardClass} aria-labelledby={orderHeadingId}>
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
                  fullWallet || zeroCashConfirm || walletFundsApplied
                    ? " border-b border-[var(--border)]"
                    : ""
                }`}
              >
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Pay now
                </dt>
                <dd className="font-semibold text-[var(--heading)]">
                  <CheckoutMoney cents={preview.gatewayAmountCents} />
                </dd>
              </div>
              {fullWallet || walletFundsApplied ? (
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

          {deliveryBlocksPurchase ? (
            <p className="text-sm text-[var(--text-muted)]" role="status">
              Save or cancel the delivery email before continuing this purchase.
            </p>
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
                    disabled={purchaseBlocked}
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
                disabled={purchaseBlocked || !confirmed}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-60"
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
              disabled={purchaseBlocked}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-60"
            >
              {pending
                ? simpaisaCheckout
                  ? "Sending payment request…"
                  : "Starting secure payment…"
                : simpaisaCheckout
                  ? "Continue with mobile payment"
                  : "Continue to Secure Payment"}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] opacity-60"
            >
              Continue to Payment
            </button>
          )}

          {/* Trust sits below Pay CTA so mobile users see action first. */}
          <CheckoutTrustPanel />
        </aside>
      </div>

      {/* Mobile sticky pay action — mirrors aside CTA without changing funding logic. */}
      {!awaitingGatewayPayment ? (
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
        role="region"
        aria-label="Checkout payment action"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Pay now
            </p>
            <p className="truncate text-sm font-semibold text-[var(--heading)]">
              <CheckoutMoney cents={preview.gatewayAmountCents} />
            </p>
          </div>
          {zeroCashConfirm ? (
            <button
              type="submit"
              disabled={purchaseBlocked || !confirmed}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-60"
            >
              {pending
                ? "Working…"
                : fullWallet
                  ? "Buy with Wallet"
                  : "Complete"}
            </button>
          ) : gatewayReady ? (
            <button
              type="submit"
              disabled={purchaseBlocked}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-60"
            >
              {pending
                ? "Working…"
                : simpaisaCheckout
                  ? "Continue"
                  : "Pay securely"}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] opacity-60"
            >
              Unavailable
            </button>
          )}
        </div>
      </div>
      ) : null}
    </form>
    </div>
  );
}
