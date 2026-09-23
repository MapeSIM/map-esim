"use client";

import { useActionState, useMemo } from "react";
import Link from "next/link";
import { buyPartnerEsimAction } from "@/app/lib/partner/partnerPurchaseActions";
import type { PartnerCatalogOffer } from "@/app/lib/partner/partnerCatalogRead";
import { initialPartnerPurchaseActionState } from "@/app/lib/partner/partnerPurchaseFormState";
import SimpaisaWalletFields from "@/app/components/account/SimpaisaWalletFields";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `pep_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export default function PartnerStorefrontBuy({
  offer,
  destinationCode,
  balanceLabel,
  splitPaymentEnabled = false,
}: {
  offer: PartnerCatalogOffer;
  destinationCode: string;
  balanceLabel: string;
  splitPaymentEnabled?: boolean;
}) {
  const [buyState, buyAction, buyPending] = useActionState(
    buyPartnerEsimAction,
    initialPartnerPurchaseActionState
  );
  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);

  const showResult =
    buyState.kind !== "idle" &&
    (buyState.ok === true
      ? buyState.kind === "success" || buyState.kind === "duplicate_success"
      : true);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]">
        <p>
          Purchases are charged from your MAP eSIM Partner balance (
          <span className="font-semibold tabular-nums">{balanceLabel} USD</span>
          ).
        </p>
        <p className="mt-1 text-[var(--text-muted)]">
          The price below is your Partner price for this plan.
        </p>
      </div>

      {showResult ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4"
          role="status"
        >
          <p className="text-sm font-semibold text-[var(--heading)]">
            {buyState.ok
              ? buyState.kind === "duplicate_success"
                ? "Already completed"
                : "Purchase complete"
              : "Unable to purchase"}
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {"message" in buyState ? buyState.message : null}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/partner/orders"
              className="inline-flex h-10 items-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)]"
            >
              My eSIMs
            </Link>
            <Link
              href="/countries"
              className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)]"
            >
              Browse destinations
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <p className="text-base font-semibold text-[var(--heading)]">
            {offer.name}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {offer.dataLabel} · {offer.validityLabel}
          </p>
          <p className="mt-2 text-lg font-bold tabular-nums text-[var(--heading)]">
            {offer.partnerPriceLabel}
          </p>
          {offer.fundingDisplay?.requiresGateway ? (
            <dl className="mt-3 space-y-1 text-sm text-[var(--text-muted)]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <dt>Total amount</dt>
                <dd className="font-semibold tabular-nums text-[var(--heading)]">
                  {offer.fundingDisplay.totalLabel}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <dt>Wallet applied</dt>
                <dd className="font-semibold tabular-nums text-[var(--heading)]">
                  {offer.fundingDisplay.walletAppliedLabel}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <dt>Remaining to pay</dt>
                <dd className="font-semibold tabular-nums text-[var(--heading)]">
                  {offer.fundingDisplay.gatewayRemainingLabel}
                </dd>
              </div>
            </dl>
          ) : null}
          <form action={buyAction} className="mt-5 space-y-3">
            <input type="hidden" name="offerId" value={offer.offerId} />
            <input
              type="hidden"
              name="destinationCode"
              value={destinationCode}
            />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            {splitPaymentEnabled ? (
              <SimpaisaWalletFields
                usdCents={0}
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
            <button
              type="submit"
              disabled={buyPending}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-60 sm:w-auto"
            >
              {buyPending
                ? "Purchasing…"
                : offer.fundingDisplay?.requiresGateway
                  ? "Continue to payment"
                  : "Buy with Partner balance"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
