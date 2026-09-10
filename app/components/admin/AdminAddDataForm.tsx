"use client";

import { useActionState, useId } from "react";
import { startAdminAddDataCheckoutAction } from "@/app/lib/esim/adminWalletPurchaseActions";
import {
  initialAdminWalletPurchaseState,
  type AdminWalletPurchaseActionState,
} from "@/app/lib/esim/adminWalletPurchaseFormState";
import { ASSISTED_WALLET_REASON_MAX } from "@/app/lib/esim/adminWalletPurchaseValidation";

type Props = {
  /** MAP local order id only — never VeSIM provider ids. */
  orderId: string;
};

export default function AdminAddDataForm({ orderId }: Props) {
  const [state, formAction, pending] = useActionState(
    startAdminAddDataCheckoutAction,
    initialAdminWalletPurchaseState
  );
  const reasonId = useId();
  const errorState = state as AdminWalletPurchaseActionState;
  const fieldErrors =
    errorState.ok === false ? errorState.fieldErrors : undefined;
  const formError = errorState.ok === false ? errorState.error : undefined;

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <input type="hidden" name="orderId" value={orderId} />

      <div>
        <label
          htmlFor={reasonId}
          className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Reason for assisted top-up
        </label>
        <textarea
          id={reasonId}
          name="reason"
          required
          rows={2}
          maxLength={ASSISTED_WALLET_REASON_MAX}
          disabled={pending}
          placeholder="Why is MAP topping up this customer eSIM?"
          className="mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
        />
        {fieldErrors?.reason ? (
          <p className="mt-1 text-xs text-[var(--danger-text)]" role="alert">
            {fieldErrors.reason}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-muted)]"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] shadow-[0_8px_16px_rgba(0,0,0,0.14)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Preparing…" : "Add More Data"}
      </button>
    </form>
  );
}
