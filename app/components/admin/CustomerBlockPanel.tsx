"use client";

import { useActionState, useId } from "react";
import {
  blockCustomerAction,
  reactivateCustomerAction,
  type CustomerBlockFormState,
} from "@/app/lib/admin/customerBlockActions";

function FormMessage({ state }: { state: CustomerBlockFormState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p
        className="mt-2 text-sm font-medium text-[var(--accent-strong)]"
        role="status"
      >
        {state.message}
      </p>
    );
  }
  return (
    <p
      className="mt-2 text-sm font-medium text-red-700 dark:text-red-300"
      role="alert"
    >
      {state.error}
    </p>
  );
}

export function CustomerBlockPanel({
  customerUserId,
  accountStatusVersion,
  mode,
}: {
  customerUserId: string;
  accountStatusVersion: number;
  mode: "block" | "reactivate";
}) {
  const formId = useId();
  const action = mode === "block" ? blockCustomerAction : reactivateCustomerAction;
  const [state, formAction, pending] = useActionState(action, null);
  const title = mode === "block" ? "Block customer" : "Reactivate customer";
  const confirmLabel =
    mode === "block" ? "Confirm block" : "Confirm reactivate";
  const reasonLabel =
    mode === "block" ? "Block reason (required)" : "Reactivation note (required)";
  const help =
    mode === "block"
      ? "Blocks new purchases and wallet top-ups. Existing eSIMs and history remain available to the customer."
      : "Restores ability to purchase and top up. Existing orders and wallet history are unchanged.";

  return (
    <section
      className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5"
      aria-labelledby={`${formId}-heading`}
    >
      <div>
        <h2
          id={`${formId}-heading`}
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          {title}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{help}</p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="customerUserId" value={customerUserId} />
        <input
          type="hidden"
          name="expectedVersion"
          value={String(accountStatusVersion)}
        />
        <div>
          <label
            htmlFor={`${formId}-reason`}
            className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            {reasonLabel}
          </label>
          <textarea
            id={`${formId}-reason`}
            name="reason"
            required
            minLength={8}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            placeholder="8–500 characters"
          />
          {state && !state.ok && state.fieldErrors?.reason ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              {state.fieldErrors.reason}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--page-bg-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
        >
          {pending ? "Saving…" : confirmLabel}
        </button>
        <FormMessage state={state} />
      </form>
    </section>
  );
}
