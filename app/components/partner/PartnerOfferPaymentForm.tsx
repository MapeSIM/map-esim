"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { PartnerPurchaseActionState } from "@/app/lib/partner/partnerPurchaseFormState";
import type { PartnerEsimPaymentMode } from "@/app/lib/partner/partnerPurchaseValidation";
import {
  clampPartnerPaymentMode,
  previewPartnerPaymentFunding,
  resolvePartnerPaymentModeVisibility,
} from "@/app/lib/partner/partnerPaymentModeUi";
import SimpaisaWalletFields from "@/app/components/account/SimpaisaWalletFields";
import { formatUsdCents } from "@/app/lib/wallet/display";

type Props = {
  offerId: string;
  destinationCode: string;
  idempotencyKey: string;
  /** Final Partner price after discount (integer USD cents). */
  payableCents: number;
  balanceCents: number;
  splitPaymentEnabled: boolean;
  paymentGatewayConfigured: boolean;
  buyAction: (payload: FormData) => void;
  buyPending: boolean;
  buyState: PartnerPurchaseActionState;
  /** Compact layout for catalog list cards. */
  compact?: boolean;
};

function paymentOptionClass(selected: boolean): string {
  return `flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm transition ${
    selected
      ? "border-[var(--accent-strong)] bg-[var(--surface)]"
      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-hover)]"
  }`;
}

/**
 * Partner buy payment mode + CTA. Display only for money preview;
 * server recomputes funding from paymentMode.
 */
export default function PartnerOfferPaymentForm({
  offerId,
  destinationCode,
  idempotencyKey,
  payableCents,
  balanceCents,
  splitPaymentEnabled,
  paymentGatewayConfigured,
  buyAction,
  buyPending,
  buyState,
  compact = false,
}: Props) {
  const paymentModeHeadingId = useId();
  const onlineAllowed = splitPaymentEnabled && paymentGatewayConfigured;
  const visibility = useMemo(
    () =>
      resolvePartnerPaymentModeVisibility({
        payableCents,
        balanceCents,
        onlinePaymentsAllowed: onlineAllowed,
      }),
    [payableCents, balanceCents, onlineAllowed]
  );

  const [paymentMode, setPaymentMode] = useState<PartnerEsimPaymentMode>(
    visibility.defaultMode
  );

  useEffect(() => {
    setPaymentMode((prev) => clampPartnerPaymentMode(prev, visibility));
  }, [visibility]);

  const preview = useMemo(() => {
    if (payableCents <= 0) {
      return {
        useWallet: true,
        walletAppliedCents: 0,
        gatewayAmountCents: 0,
        fundingKind: "wallet_only" as const,
      };
    }
    const funded = previewPartnerPaymentFunding({
      payableCents,
      balanceCents,
      mode: paymentMode,
    });
    return {
      useWallet: funded.useWallet,
      walletAppliedCents: funded.walletAppliedCents,
      gatewayAmountCents: funded.gatewayAmountCents,
      fundingKind: funded.fundingKind,
    };
  }, [payableCents, balanceCents, paymentMode]);

  const gatewayRequired =
    splitPaymentEnabled && preview.gatewayAmountCents > 0;
  const showModePicker = splitPaymentEnabled && payableCents > 0;
  const showSimpaisa = onlineAllowed && gatewayRequired;
  const ctaLabel = gatewayRequired
    ? "Continue to payment"
    : "Buy with Partner balance";
  const ctaPendingLabel = gatewayRequired
    ? "Starting payment…"
    : "Purchasing…";

  const submitDisabled =
    buyPending ||
    visibility.walletOnlyInsufficient ||
    (gatewayRequired && !onlineAllowed);

  return (
    <form
      action={buyAction}
      className={compact ? "shrink-0 space-y-3 sm:min-w-[240px]" : "space-y-4"}
    >
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="destinationCode" value={destinationCode} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {splitPaymentEnabled ? (
        <input type="hidden" name="paymentMode" value={paymentMode} />
      ) : null}

      {showModePicker ? (
        <section aria-labelledby={paymentModeHeadingId} className="space-y-2">
          <h3
            id={paymentModeHeadingId}
            className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Payment
          </h3>
          <p className="text-sm text-[var(--text-muted)]">
            Partner balance:{" "}
            <span className="font-semibold tabular-nums text-[var(--heading)]">
              {formatUsdCents(balanceCents)} USD
            </span>
          </p>

          {visibility.walletOnlyInsufficient ? (
            <p className="text-sm text-[var(--heading)]" role="status">
              Partner balance is not enough for this plan, and online payment is
              unavailable right now.
            </p>
          ) : (
            <div
              role="radiogroup"
              aria-labelledby={paymentModeHeadingId}
              className="space-y-2"
            >
              {visibility.showFullWalletOption ? (
                <label
                  className={paymentOptionClass(paymentMode === "full_wallet")}
                >
                  <input
                    type="radio"
                    name="paymentModeChoice"
                    value="full_wallet"
                    checked={paymentMode === "full_wallet"}
                    disabled={buyPending}
                    onChange={() => setPaymentMode("full_wallet")}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="font-semibold text-[var(--heading)]">
                    Buy with Partner balance
                  </span>
                </label>
              ) : null}

              {visibility.showWalletAndOnlineOption ? (
                <label
                  className={paymentOptionClass(
                    paymentMode === "wallet_and_mobile"
                  )}
                >
                  <input
                    type="radio"
                    name="paymentModeChoice"
                    value="wallet_and_mobile"
                    checked={paymentMode === "wallet_and_mobile"}
                    disabled={buyPending}
                    onChange={() => setPaymentMode("wallet_and_mobile")}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="font-semibold text-[var(--heading)]">
                    Partner balance + online payment
                  </span>
                </label>
              ) : null}

              {visibility.showOnlinePaymentOption ? (
                <label
                  className={paymentOptionClass(paymentMode === "mobile_only")}
                >
                  <input
                    type="radio"
                    name="paymentModeChoice"
                    value="mobile_only"
                    checked={paymentMode === "mobile_only"}
                    disabled={buyPending}
                    onChange={() => setPaymentMode("mobile_only")}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="font-semibold text-[var(--heading)]">
                    Pay online
                  </span>
                </label>
              ) : null}
            </div>
          )}

          {!buyState.ok && buyState.fieldErrors?.paymentMode ? (
            <p className="text-sm text-[var(--heading)]" role="alert">
              {buyState.fieldErrors.paymentMode}
            </p>
          ) : null}
        </section>
      ) : null}

      {showModePicker && gatewayRequired ? (
        <dl className="space-y-1 text-sm text-[var(--text-muted)]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <dt>Total amount</dt>
            <dd className="font-semibold tabular-nums text-[var(--heading)]">
              {formatUsdCents(payableCents)} USD
            </dd>
          </div>
          {preview.walletAppliedCents > 0 ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <dt>Wallet applied</dt>
              <dd className="font-semibold tabular-nums text-[var(--heading)]">
                {formatUsdCents(preview.walletAppliedCents)} USD
              </dd>
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <dt>Remaining to pay</dt>
            <dd className="font-semibold tabular-nums text-[var(--heading)]">
              {formatUsdCents(preview.gatewayAmountCents)} USD
            </dd>
          </div>
        </dl>
      ) : null}

      {showSimpaisa ? (
        <SimpaisaWalletFields
          usdCents={preview.gatewayAmountCents}
          disabled={buyPending}
          operatorError={
            !buyState.ok && buyState.fieldErrors?.walletOperatorId
              ? buyState.fieldErrors.walletOperatorId
              : undefined
          }
          msisdnError={
            !buyState.ok && buyState.fieldErrors?.customerMsisdn
              ? buyState.fieldErrors.customerMsisdn
              : undefined
          }
        />
      ) : null}

      {gatewayRequired && splitPaymentEnabled && !paymentGatewayConfigured ? (
        <p className="text-sm text-[var(--heading)]" role="status">
          Online payment is unavailable right now. Use full Partner balance when
          available, or try again later.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitDisabled}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-[var(--accent-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {buyPending ? ctaPendingLabel : ctaLabel}
      </button>
    </form>
  );
}
