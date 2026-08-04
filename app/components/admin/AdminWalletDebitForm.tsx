"use client";

import { useActionState, useId, useState } from "react";
import { debitCustomerWalletAction } from "@/app/lib/wallet/adminDebitActions";
import {
  initialAdminWalletDebitState,
  type AdminWalletDebitActionState,
} from "@/app/lib/wallet/adminDebitFormState";

type AdminWalletDebitFormProps = {
  customerUserId: string;
  customerName: string;
  customerEmailMasked: string;
  balanceLabel: string;
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `admindebit${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export default function AdminWalletDebitForm({
  customerUserId,
  customerName,
  customerEmailMasked,
  balanceLabel,
}: AdminWalletDebitFormProps) {
  const [state, formAction, pending] = useActionState(
    debitCustomerWalletAction,
    initialAdminWalletDebitState
  );
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [amount, setAmount] = useState("");
  const confirmId = useId();

  const errorState = state as AdminWalletDebitActionState;

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
        This action immediately deducts USD from the customer wallet and is
        recorded in the audit ledger. The wallet balance cannot become negative.
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
          htmlFor="admin-debit-amount"
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Debit amount (USD)
        </label>
        <input
          id="admin-debit-amount"
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
            Minimum $0.10 · Maximum $500.00 · Cannot exceed available balance · Up
            to two decimal places
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="admin-debit-reason"
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Reason
        </label>
        <textarea
          id="admin-debit-reason"
          name="reason"
          required
          minLength={5}
          maxLength={200}
          rows={3}
          disabled={pending}
          placeholder="Why this debit is being issued"
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
          htmlFor="admin-debit-reference"
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Internal reference{" "}
          <span className="font-normal text-[var(--text-soft)]">(optional)</span>
        </label>
        <input
          id="admin-debit-reference"
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
            I verified the customer and amount. This debit cannot be undone from
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
        className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
      >
        {pending ? "Deducting…" : "Deduct wallet funds"}
      </button>
    </form>
  );
}
