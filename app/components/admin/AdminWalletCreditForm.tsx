"use client";

import { useActionState, useId, useState } from "react";
import { creditCustomerWalletAction } from "@/app/lib/wallet/adminCreditActions";
import {
  initialAdminWalletCreditState,
  type AdminWalletCreditActionState,
} from "@/app/lib/wallet/adminCreditFormState";

type AdminWalletCreditFormProps = {
  customerUserId: string;
  customerName: string;
  customerEmailMasked: string;
  balanceLabel: string;
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `admincredit${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export default function AdminWalletCreditForm({
  customerUserId,
  customerName,
  customerEmailMasked,
  balanceLabel,
}: AdminWalletCreditFormProps) {
  const [state, formAction, pending] = useActionState(
    creditCustomerWalletAction,
    initialAdminWalletCreditState
  );
  // Stable across validation retries / double-clicks — regenerate only on remount.
  const [idempotencyKey] = useState(newIdempotencyKey);
  // Blank on first open; controlled so validation failures keep the ADMIN-entered amount.
  const [amount, setAmount] = useState("");
  const confirmId = useId();

  const errorState = state as AdminWalletCreditActionState;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="customerUserId" value={customerUserId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
          Customer
        </p>
        <dl className="mt-3 space-y-2">
          <div>
            <dt className="text-[var(--text-soft)]">Name</dt>
            <dd className="font-semibold text-[var(--heading)] break-words">
              {customerName}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-soft)]">Email</dt>
            <dd className="font-semibold text-[var(--heading)] break-words">
              {customerEmailMasked}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-soft)]">Current balance</dt>
            <dd className="font-semibold text-[var(--heading)]">
              {balanceLabel} USD
            </dd>
          </div>
        </dl>
      </div>

      <div
        className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]"
        role="note"
      >
        This action immediately adds USD wallet credit and is recorded in the
        audit ledger. Verify the customer and amount before continuing.
      </div>

      {errorState.error ? (
        <div
          className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--heading)]"
          role="alert"
        >
          {errorState.error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label
          htmlFor="admin-credit-amount"
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Credit amount (USD)
        </label>
        <input
          id="admin-credit-amount"
          name="amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.10"
          required
          disabled={pending}
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        {errorState.fieldErrors?.amount ? (
          <p className="text-sm text-[var(--danger-text)]">
            {errorState.fieldErrors.amount}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-soft)]">
            Minimum $0.10 · Maximum $500.00 · Up to two decimal places
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="admin-credit-reason"
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Reason
        </label>
        <textarea
          id="admin-credit-reason"
          name="reason"
          required
          minLength={5}
          maxLength={200}
          rows={3}
          disabled={pending}
          placeholder="Why this credit is being issued"
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        {errorState.fieldErrors?.reason ? (
          <p className="text-sm text-[var(--danger-text)]">
            {errorState.fieldErrors.reason}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-soft)]">
            Required · 5–200 characters · ADMIN-only
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="admin-credit-reference"
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Internal reference{" "}
          <span className="font-normal text-[var(--text-soft)]">(optional)</span>
        </label>
        <input
          id="admin-credit-reference"
          name="internalReference"
          type="text"
          maxLength={100}
          autoComplete="off"
          disabled={pending}
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        {errorState.fieldErrors?.internalReference ? (
          <p className="text-sm text-[var(--danger-text)]">
            {errorState.fieldErrors.internalReference}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor={confirmId}
          className="flex items-start gap-3 text-sm text-[var(--heading)]"
        >
          <input
            id={confirmId}
            name="confirm"
            type="checkbox"
            disabled={pending}
            className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border-strong)]"
          />
          <span>
            I verified the customer and amount. This credit cannot be undone from
            this screen.
          </span>
        </label>
        {errorState.fieldErrors?.confirm ? (
          <p className="text-sm text-[var(--danger-text)]">
            {errorState.fieldErrors.confirm}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
      >
        {pending ? "Crediting…" : "Credit wallet"}
      </button>
    </form>
  );
}
