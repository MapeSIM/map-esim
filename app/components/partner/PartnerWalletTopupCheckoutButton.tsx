"use client";

import { useActionState } from "react";
import { startPartnerWalletTopupCheckoutAction } from "@/app/lib/partner/partnerWalletTopupActions";
import {
  initialPartnerWalletTopupState,
  type PartnerWalletTopupActionState,
} from "@/app/lib/partner/partnerWalletTopupFormState";
import SimpaisaWalletFields from "@/app/components/account/SimpaisaWalletFields";

type Props = {
  topupId: string;
  enabled: boolean;
  simpaisaWalletCheckout?: boolean;
  usdCents?: number;
};

export default function PartnerWalletTopupCheckoutButton({
  topupId,
  enabled,
  simpaisaWalletCheckout = false,
  usdCents = 0,
}: Props) {
  const [state, formAction, pending] = useActionState(
    startPartnerWalletTopupCheckoutAction,
    initialPartnerWalletTopupState
  );
  const errorState = state as PartnerWalletTopupActionState;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="topupId" value={topupId} />
      {simpaisaWalletCheckout && usdCents > 0 ? (
        <SimpaisaWalletFields
          usdCents={usdCents}
          disabled={pending || !enabled}
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
      ) : null}
      <button
        type="submit"
        disabled={pending || !enabled}
        className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Checking payment provider…" : "Continue"}
      </button>
      {errorState.ok === false && errorState.error ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="alert"
        >
          {errorState.error}
        </div>
      ) : null}
    </form>
  );
}
