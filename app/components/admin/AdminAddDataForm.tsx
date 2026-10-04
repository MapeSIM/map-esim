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
    <form action={formAction} className="space-y-2.5" noValidate>
      <input type="hidden" name="orderId" value={orderId} />

      <div>
        <label htmlFor={reasonId} className="sr-only">
          Reason for assisted top-up
        </label>
        <input
          id={reasonId}
          name="reason"
          type="text"
          required
          maxLength={ASSISTED_WALLET_REASON_MAX}
          disabled={pending}
          placeholder="Reason for assisted top-up (required)"
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none transition placeholder:text-[var(--text-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
        />
        {fieldErrors?.reason ? (
          <p className="mt-1 text-xs text-[var(--danger-text)]" role="alert">
            {fieldErrors.reason}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-muted)]"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Preparing…" : "Add More Data"}
      </button>
    </form>
  );
}
