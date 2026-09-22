"use client";

import { useActionState, useState } from "react";
import { startWalletTopupCheckoutAction } from "@/app/lib/wallet/topupActions";
import {
  initialWalletTopupState,
  type WalletTopupActionState,
} from "@/app/lib/wallet/topupFormState";
import SimpaisaWalletFields from "@/app/components/account/SimpaisaWalletFields";

type Props = {
  topupId: string;
  enabled: boolean;
  simpaisaWalletCheckout?: boolean;
  usdCents?: number;
};

export default function WalletTopupCheckoutButton({
  topupId,
  enabled,
  simpaisaWalletCheckout = false,
  usdCents = 0,
}: Props) {
  const [state, formAction, pending] = useActionState(
    startWalletTopupCheckoutAction,
    initialWalletTopupState
  );
  const errorState = state as WalletTopupActionState;
  const [simpaisaFieldsReady, setSimpaisaFieldsReady] = useState(false);
  const needsSimpaisaFields = simpaisaWalletCheckout && usdCents > 0;
  const submitEnabled =
    enabled && (!needsSimpaisaFields || simpaisaFieldsReady);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="topupId" value={topupId} />
      {needsSimpaisaFields ? (
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
          onValidityChange={setSimpaisaFieldsReady}
        />
      ) : null}
      <button
        type="submit"
        disabled={pending || !submitEnabled}
        className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Checking payment provider…" : "Continue to secure payment"}
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
