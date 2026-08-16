"use client";

import { useActionState } from "react";
import { REFUND_PARTNER_FUNDS_PHRASE } from "@/app/lib/admin/reconciliationCaseShared";
import {
  adminPartnerRefundRequestExecuteAction,
  type AdminPartnerRefundExecuteFormState,
} from "@/app/lib/partner/partnerRefundRequestExecutionActions";

const initialState: AdminPartnerRefundExecuteFormState = null;

type Props = {
  requestId: string;
  debitLabel: string;
  refundBasisLabel: string;
  localBlockerLabel: string | null;
};

export default function AdminPartnerRefundRequestExecute({
  requestId,
  debitLabel,
  refundBasisLabel,
  localBlockerLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(
    adminPartnerRefundRequestExecuteAction,
    initialState
  );

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">
        Execute Partner refund
      </h2>
      <p className="text-sm font-semibold text-[var(--heading)]">
        Approved — refund pending
      </p>
      <p className="text-sm text-[var(--text-muted)]">
        Provider/order evidence must pass before funds are returned. This
        credits the exact Partner debit to the Partner wallet only. It does not
        refund a card or create a provider purchase.
      </p>
      <p className="text-sm text-[var(--heading)]">
        Partner paid:{" "}
        <span className="font-semibold tabular-nums">{debitLabel}</span>
      </p>
      <p className="text-sm text-[var(--heading)]">
        Refund amount:{" "}
        <span className="font-semibold tabular-nums">{refundBasisLabel}</span>
      </p>

      {localBlockerLabel ? (
        <p
          className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]"
          role="status"
        >
          {localBlockerLabel}
        </p>
      ) : null}

      <form action={formAction} className="min-w-0 space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <div className="min-w-0">
          <label
            htmlFor="partner-refund-execute-confirm"
            className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Type {REFUND_PARTNER_FUNDS_PHRASE}
          </label>
          <input
            id="partner-refund-execute-confirm"
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
          Execute Partner refund
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
