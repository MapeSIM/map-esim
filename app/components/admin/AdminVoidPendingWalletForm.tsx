"use client";

import { useActionState, useEffect, useId, useState } from "react";
import {
  voidPendingWalletReservationAction,
  type VoidPendingWalletFormState,
} from "@/app/lib/admin/walletPendingVoidActions";
import { AdminButton } from "@/app/components/admin/ui";

export function AdminVoidPendingWalletForm(props: {
  customerUserId: string;
  walletTransactionId: string;
  returnTo: string;
  compact?: boolean;
}) {
  const formId = useId();
  const customerUserId = props.customerUserId.trim();
  const walletTransactionId = props.walletTransactionId.trim();
  const returnTo = props.returnTo.trim();
  const [confirmed, setConfirmed] = useState(false);
  const [state, formAction, pending] = useActionState<
    VoidPendingWalletFormState,
    FormData
  >(voidPendingWalletReservationAction, null);

  useEffect(() => {
    if (state?.ok) {
      setConfirmed(false);
    }
  }, [state]);

  return (
    <form
      action={formAction}
      className={
        props.compact
          ? "mt-2 max-w-[14rem] space-y-2"
          : "shrink-0 space-y-2"
      }
      aria-busy={pending}
    >
      <input type="hidden" name="customerUserId" value={customerUserId} />
      <input
        type="hidden"
        name="walletTransactionId"
        value={walletTransactionId}
      />
      <input type="hidden" name="returnTo" value={returnTo} />
      {confirmed ? <input type="hidden" name="confirm" value="on" /> : null}
      <label
        htmlFor={`${formId}-confirm`}
        className="flex items-start gap-2 text-xs text-[var(--text-muted)]"
      >
        <input
          id={`${formId}-confirm`}
          type="checkbox"
          className="mt-0.5"
          checked={confirmed}
          disabled={pending || Boolean(state?.ok)}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>Confirm void / restore wallet balance</span>
      </label>
      <AdminButton
        type="submit"
        variant="danger"
        size="sm"
        disabled={pending || Boolean(state?.ok) || !confirmed}
      >
        {pending ? "Processing…" : "Void / Cancel pending"}
      </AdminButton>
      {state && !state.ok ? (
        <p
          className="text-xs font-medium text-red-700 dark:text-red-300"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p
          className="text-xs font-medium text-[var(--accent-strong)]"
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
