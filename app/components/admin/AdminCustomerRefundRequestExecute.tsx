"use client";

import { useActionState } from "react";
import {
  adminCustomerRefundRequestExecuteAction,
  type AdminCustomerRefundExecuteFormState,
} from "@/app/lib/refunds/refundRequestExecutionActions";
import { REFUND_CUSTOMER_WALLET_PHRASE } from "@/app/lib/refunds/refundRequestConstants";

const initialState: AdminCustomerRefundExecuteFormState = null;

type Props = {
  requestId: string;
  amountLabel: string;
  compositionLabel: string;
  statusLabel: string;
  lastExecutionError: string | null;
};

export default function AdminCustomerRefundRequestExecute({
  requestId,
  amountLabel,
  compositionLabel,
  statusLabel,
  lastExecutionError,
}: Props) {
  const [state, formAction, pending] = useActionState(
    adminCustomerRefundRequestExecuteAction,
    initialState
  );

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">
        Execute customer refund
      </h2>
      <p className="text-sm font-semibold text-[var(--heading)]">
        {statusLabel}
      </p>
      <p className="text-sm text-[var(--text-muted)]">
        Standard refund credits the approved amount to the customer&apos;s MAP
        Wallet. This does not reverse Simpaisa/gateway payments. Original-payment
        refunds remain exceptional and manual.
      </p>
      <p className="text-sm text-[var(--heading)]">
        MAP Wallet credit:{" "}
        <span className="font-semibold tabular-nums">{amountLabel}</span>
      </p>
      <p className="text-sm text-[var(--text-muted)]">
        Payment composition (evidence only): {compositionLabel}
      </p>

      {lastExecutionError ? (
        <p
          className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]"
          role="status"
        >
          Last execution error: {lastExecutionError}. Safe to retry — duplicate
          wallet credit is blocked.
        </p>
      ) : null}

      <form action={formAction} className="min-w-0 space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <div className="min-w-0">
          <label
            htmlFor="customer-refund-execute-confirm"
            className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Type {REFUND_CUSTOMER_WALLET_PHRASE}
          </label>
          <input
            id="customer-refund-execute-confirm"
            name="confirmPhrase"
            required
            disabled={pending}
            autoComplete="off"
            className="mt-1 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
          />
          {state && !state.ok && state.fieldErrors?.confirmPhrase ? (
            <p className="mt-1 text-sm text-[var(--danger-text)]">
              {state.fieldErrors.confirmPhrase}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 min-w-0 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Executing…" : "Credit MAP Wallet"}
        </button>
        {state && !state.ok && state.error && !state.fieldErrors ? (
          <p className="text-sm text-[var(--danger-text)]" role="alert">
            {state.error}
          </p>
        ) : null}
        {state && state.ok ? (
          <p className="text-sm font-medium text-[var(--heading)]" role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
