"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  enabledSimpaisaOperatorIds,
}: {
  offer: PartnerCatalogOffer;
  destinationCode: string;
  balanceLabel: string;
  balanceCents: number;
  splitPaymentEnabled?: boolean;
  paymentGatewayConfigured?: boolean;
  enabledSimpaisaOperatorIds?: readonly string[];
}) {
  const [buyState, buyAction, buyPending] = useActionState(
    buyPartnerEsimAction,
    initialPartnerPurchaseActionState
  );
  // Fresh key for every Issue eSIM click (new VeSIM order). Stable only while pending.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const wasPending = useRef(false);
  const payableCents =
    offer.partnerPriceCents > 0
      ? offer.partnerPriceCents
      : splitPaymentEnabled && offer.fundingDisplay
        ? offer.fundingDisplay.totalCents
        : 0;

  useEffect(() => {
    if (wasPending.current && !buyPending) {
      // Attempt finished (success redirects away; failure stays) — next click is unique.
      setIdempotencyKey(newIdempotencyKey());
    }
    wasPending.current = buyPending;
  }, [buyPending]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]">
        <p>
          Purchases are charged from your MAP eSIM Partner balance (
          <span className="font-semibold tabular-nums">{balanceLabel} USD</span>
          ).
        </p>
        <p className="mt-1 text-[var(--text-muted)]">
          The price below is your Partner price for this plan. Each Issue eSIM
          creates a new provider order.
        </p>
        {splitPaymentEnabled ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Choose full Partner balance when it covers the plan. If balance is
            short, apply wallet funds and pay the remainder online, or pay
            online only.
          </p>
        ) : null}
      </div>

      {!buyState.ok ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-[var(--heading)]">
            Unable to purchase
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {"message" in buyState ? buyState.message : null}
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Failed attempts refund Partner balance automatically. Try again to
            issue a new eSIM.
          </p>
          <div className="mt-4">
            <Link
              href="/partner/orders"
              className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)]"
            >
              My eSIMs
            </Link>
          </div>
        </div>
      ) : null}

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
            enabledSimpaisaOperatorIds={enabledSimpaisaOperatorIds}
            buyAction={buyAction}
            buyPending={buyPending}
            buyState={buyState}
          />
        </div>
      </div>
    </div>
  );
}
