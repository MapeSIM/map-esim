"use client";

import { useActionState, useId, useState } from "react";
import {
  creditPartnerWalletAction,
  debitPartnerWalletAction,
} from "@/app/lib/partner/partnersActions";
import {
  initialPartnerWalletActionState,
  type PartnerWalletActionState,
} from "@/app/lib/partner/partnersFormState";
import { PARTNER_ADMIN_DEBIT_MIN_CENTS } from "@/app/lib/partner/partnerWalletAmount";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `partnerwallet${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function WalletFormMessage({ state }: { state: PartnerWalletActionState }) {
  if (!state.message && !state.error) return null;
  if (state.ok && state.message) {
    return (
      <p
        className="mt-2 text-sm font-medium text-[var(--accent-strong)]"
        role="status"
      >
        {state.message}
      </p>
    );
  }
  if (state.error) {
    return (
      <p
        className="mt-2 text-sm font-medium text-red-700 dark:text-red-300"
        role="alert"
      >
        {state.error}
      </p>
    );
  }
  return null;
}

function PartnerWalletCreditForm({
  partnerId,
  partnerName,
  balanceLabel,
}: {
  partnerId: string;
  partnerName: string;
  balanceLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    creditPartnerWalletAction,
    initialPartnerWalletActionState
  );
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [amount, setAmount] = useState("");
  const confirmId = useId();

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="partnerId" value={partnerId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <p className="text-sm text-[var(--text-muted)]">
        Credit {partnerName}&apos;s prepaid balance. Current balance:{" "}
        <span className="font-semibold text-[var(--heading)]">
          {balanceLabel} USD
        </span>
      </p>

      <div className="space-y-2">
        <label
          htmlFor={`credit-amount-${partnerId}`}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Credit amount (USD)
        </label>
        <input
          id={`credit-amount-${partnerId}`}
          name="amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.10"
          required
          disabled={pending}
          className="w-full max-w-xs rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        {state.fieldErrors?.amount ? (
          <p className="text-sm text-[var(--danger-text)]">
            {state.fieldErrors.amount}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-soft)]">
            Minimum $0.10 · Maximum $500.00
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor={`credit-reason-${partnerId}`}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Reason
        </label>
        <textarea
          id={`credit-reason-${partnerId}`}
          name="reason"
          required
          minLength={5}
          maxLength={200}
          rows={2}
          disabled={pending}
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        {state.fieldErrors?.reason ? (
          <p className="text-sm text-[var(--danger-text)]">
            {state.fieldErrors.reason}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor={`credit-ref-${partnerId}`}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Internal reference{" "}
          <span className="font-normal text-[var(--text-soft)]">(optional)</span>
        </label>
        <input
          id={`credit-ref-${partnerId}`}
          name="internalReference"
          type="text"
          maxLength={100}
          autoComplete="off"
          disabled={pending}
          className="w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
      </div>

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
        <span>I verified the partner and amount before crediting.</span>
      </label>
      {state.fieldErrors?.confirm ? (
        <p className="text-sm text-[var(--danger-text)]">
          {state.fieldErrors.confirm}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
      >
        {pending ? "Crediting…" : "Credit wallet"}
      </button>
      <WalletFormMessage state={state} />
    </form>
  );
}

function PartnerWalletDebitForm({
  partnerId,
  partnerName,
  balanceLabel,
  balanceCents,
}: {
  partnerId: string;
  partnerName: string;
  balanceLabel: string;
  balanceCents: number;
}) {
  const [state, formAction, pending] = useActionState(
    debitPartnerWalletAction,
    initialPartnerWalletActionState
  );
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [amount, setAmount] = useState("");
  const confirmId = useId();

  const canDebit = balanceCents >= PARTNER_ADMIN_DEBIT_MIN_CENTS;

  if (!canDebit) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No wallet funds are available to deduct.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="partnerId" value={partnerId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <p className="text-sm text-[var(--text-muted)]">
        Deduct from {partnerName}&apos;s prepaid balance. Available:{" "}
        <span className="font-semibold text-[var(--heading)]">
          {balanceLabel} USD
        </span>
      </p>

      <div className="space-y-2">
        <label
          htmlFor={`debit-amount-${partnerId}`}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Debit amount (USD)
        </label>
        <input
          id={`debit-amount-${partnerId}`}
          name="amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.10"
          required
          disabled={pending}
          className="w-full max-w-xs rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        {state.fieldErrors?.amount ? (
          <p className="text-sm text-[var(--danger-text)]">
            {state.fieldErrors.amount}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-soft)]">
            Cannot exceed available balance · Max $500.00
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor={`debit-reason-${partnerId}`}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Reason
        </label>
        <textarea
          id={`debit-reason-${partnerId}`}
          name="reason"
          required
          minLength={5}
          maxLength={200}
          rows={2}
          disabled={pending}
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        {state.fieldErrors?.reason ? (
          <p className="text-sm text-[var(--danger-text)]">
            {state.fieldErrors.reason}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor={`debit-ref-${partnerId}`}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Internal reference{" "}
          <span className="font-normal text-[var(--text-soft)]">(optional)</span>
        </label>
        <input
          id={`debit-ref-${partnerId}`}
          name="internalReference"
          type="text"
          maxLength={100}
          autoComplete="off"
          disabled={pending}
          className="w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
      </div>

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
        <span>I verified the partner and amount before deducting.</span>
      </label>
      {state.fieldErrors?.confirm ? (
        <p className="text-sm text-[var(--danger-text)]">
          {state.fieldErrors.confirm}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
      >
        {pending ? "Debiting…" : "Debit wallet"}
      </button>
      <WalletFormMessage state={state} />
    </form>
  );
}

export function PartnerWalletPanel({
  partnerId,
  partnerName,
  balanceCents,
  balanceLabel,
  totalAddedLabel,
  totalDeductedLabel,
  walletActive,
  transactions,
}: {
  partnerId: string;
  partnerName: string;
  balanceCents: number;
  balanceLabel: string;
  totalAddedLabel: string;
  totalDeductedLabel: string;
  walletActive: boolean;
  transactions: Array<{
    id: string;
    typeLabel: string;
    amountLabel: string;
    balanceAfterLabel: string;
    reason: string;
    createdAtLabel: string;
    createdByAdminLabel: string;
  }>;
}) {
  return (
    <section className="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-[var(--heading)]">
          Partner wallet
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Separate prepaid balance for partner purchases (Phase 2). Admin
          credit/debit only in Phase 1.
        </p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Balance
          </dt>
          <dd className="mt-1 font-semibold tabular-nums text-[var(--heading)]">
            {balanceLabel} USD
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Total added
          </dt>
          <dd className="mt-1 font-semibold tabular-nums text-[var(--heading)]">
            {totalAddedLabel} USD
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Total deducted
          </dt>
          <dd className="mt-1 font-semibold tabular-nums text-[var(--heading)]">
            {totalDeductedLabel} USD
          </dd>
        </div>
      </dl>

      {walletActive ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-sm font-semibold text-[var(--heading)]">
              Add credit
            </h3>
            <div className="mt-3">
              <PartnerWalletCreditForm
                partnerId={partnerId}
                partnerName={partnerName}
                balanceLabel={balanceLabel}
              />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-sm font-semibold text-[var(--heading)]">
              Deduct funds
            </h3>
            <div className="mt-3">
              <PartnerWalletDebitForm
                partnerId={partnerId}
                partnerName={partnerName}
                balanceLabel={balanceLabel}
                balanceCents={balanceCents}
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          Wallet adjustments are unavailable while this partner is disabled or
          deleted.
        </p>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--heading)]">
          Recent transactions
        </h3>
        {transactions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-4 text-sm text-[var(--text-muted)]">
            No wallet transactions yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {transactions.map((tx) => (
              <li
                key={tx.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--heading)]">
                      {tx.typeLabel}
                    </p>
                    <p className="mt-1 text-[var(--text-muted)]">{tx.reason}</p>
                  </div>
                  <p className="font-semibold tabular-nums text-[var(--heading)]">
                    {tx.amountLabel}
                  </p>
                </div>
                <p className="mt-2 text-xs text-[var(--text-soft)]">
                  {tx.createdAtLabel} · Balance after {tx.balanceAfterLabel} ·
                  By {tx.createdByAdminLabel}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
