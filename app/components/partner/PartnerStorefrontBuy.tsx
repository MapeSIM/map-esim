"use client";

import { useActionState, useMemo } from "react";
import Link from "next/link";
import { buyPartnerEsimAction } from "@/app/lib/partner/partnerPurchaseActions";
import type { PartnerCatalogOffer } from "@/app/lib/partner/partnerCatalogRead";
import { initialPartnerPurchaseActionState } from "@/app/lib/partner/partnerPurchaseFormState";
import PartnerOfferPaymentForm from "@/app/components/partner/PartnerOfferPaymentForm";

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
  balanceCents,
  splitPaymentEnabled = false,
  paymentGatewayConfigured = false,
}: {
  offer: PartnerCatalogOffer;
  destinationCode: string;
  balanceLabel: string;
  balanceCents: number;
  splitPaymentEnabled?: boolean;
  paymentGatewayConfigured?: boolean;
}) {
  const [buyState, buyAction, buyPending] = useActionState(
    buyPartnerEsimAction,
    initialPartnerPurchaseActionState
  );
  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);
  const payableCents =
    splitPaymentEnabled && offer.fundingDisplay
      ? offer.fundingDisplay.totalCents
      : 0;

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
        {splitPaymentEnabled ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Choose full Partner balance when it covers the plan. If balance is
            short, apply wallet funds and pay the remainder online, or pay
            online only.
          </p>
        ) : null}
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
          <div className="mt-5">
            <PartnerOfferPaymentForm
              offerId={offer.offerId}
              destinationCode={destinationCode}
              idempotencyKey={idempotencyKey}
              payableCents={payableCents}
              balanceCents={balanceCents}
              splitPaymentEnabled={splitPaymentEnabled}
              paymentGatewayConfigured={paymentGatewayConfigured}
              buyAction={buyAction}
              buyPending={buyPending}
              buyState={buyState}
            />
          </div>
        </div>
      )}
    </div>
  );
}
