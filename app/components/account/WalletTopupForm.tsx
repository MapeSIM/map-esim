"use client";

import { useActionState, useId, useMemo, useRef, useState } from "react";
import { createWalletTopupDraftAction } from "@/app/lib/wallet/topupActions";
import {
  initialWalletTopupState,
  type WalletTopupActionState,
} from "@/app/lib/wallet/topupFormState";
import {
  WALLET_TOPUP_MAX_CENTS,
  WALLET_TOPUP_MIN_CENTS,
} from "@/app/lib/wallet/amount";

type Props = {
  balanceLabel: string;
  gatewayStatusLabel: string;
  /** When true, hide the redundant balance card (used on Wallet dashboard). */
  embedded?: boolean;
};

type AmountPreset = "10" | "50" | "100" | "150" | "500" | "custom";

const AMOUNT_PRESETS: ReadonlyArray<{
  id: AmountPreset;
  label: string;
  value: string | null;
}> = [
  { id: "10", label: "$10", value: "10" },
  { id: "50", label: "$50", value: "50" },
  { id: "100", label: "$100", value: "100" },
  { id: "150", label: "$150", value: "150" },
  { id: "500", label: "$500", value: "500" },
  { id: "custom", label: "Custom", value: null },
];

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `topup_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `topup_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function WalletTopupForm({
  balanceLabel,
  gatewayStatusLabel,
  embedded = false,
}: Props) {
  const [state, formAction, pending] = useActionState(
    createWalletTopupDraftAction,
    initialWalletTopupState
  );
  const amountId = useId();
  const amountInputRef = useRef<HTMLInputElement>(null);
  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);
  const [amount, setAmount] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<AmountPreset | null>(
    null
  );
  const errorState = state as WalletTopupActionState;
  const minLabel = (WALLET_TOPUP_MIN_CENTS / 100).toFixed(2);
  const maxLabel = (WALLET_TOPUP_MAX_CENTS / 100).toFixed(2);

  function selectPreset(preset: (typeof AMOUNT_PRESETS)[number]) {
    setSelectedPreset(preset.id);
    if (preset.value == null) {
      setAmount("");
      queueMicrotask(() => {
        amountInputRef.current?.focus();
      });
      return;
    }
    setAmount(preset.value);
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {!embedded ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Current wallet balance
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--heading)]">
            {balanceLabel}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">USD</p>
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="block text-sm font-semibold text-[var(--heading)]">
          Quick amount
        </p>
        <div
          className="flex min-w-0 flex-wrap gap-2"
          role="group"
          aria-label="Quick top-up amounts"
        >
          {AMOUNT_PRESETS.map((preset) => {
            const active = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                data-topup-preset={preset.id}
                disabled={pending}
                aria-pressed={active}
                onClick={() => selectPreset(preset)}
                className={
                  active
                    ? "inline-flex h-10 min-w-[4.5rem] flex-1 items-center justify-center rounded-[14px] bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60 sm:flex-none"
                    : "inline-flex h-10 min-w-[4.5rem] flex-1 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] disabled:opacity-60 sm:flex-none"
                }
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor={amountId}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          USD wallet credit amount
        </label>
        <input
          id={amountId}
          ref={amountInputRef}
          name="amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={pending}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setSelectedPreset("custom");
          }}
          placeholder={`${minLabel}`}
          className="w-full rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--heading)]"
        />
        <p className="text-xs text-[var(--text-muted)]">
          Minimum ${minLabel} · Maximum ${maxLabel} · Up to two decimal places
        </p>
        {errorState.ok === false && errorState.fieldErrors?.amount ? (
          <p className="text-sm text-[var(--heading)]" role="alert">
            {errorState.fieldErrors.amount}
          </p>
        ) : null}
      </div>

      <div
        className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)] space-y-2"
        role="note"
      >
        <p>
          Wallet funds are stored in USD. Your PKR payment amount will be
          confirmed securely at checkout.
        </p>
        <p>
          Payments are processed by a secure payment provider. Returning from
          checkout or refreshing this page never adds funds by itself — only a
          verified payment confirmation can credit your wallet.
        </p>
        <p className="font-semibold text-[var(--heading)]">
          Gateway status: {gatewayStatusLabel}
        </p>
      </div>

      {errorState.ok === false && errorState.error ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="alert"
        >
          {errorState.error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Preparing top-up…" : "Continue"}
      </button>
    </form>
  );
}
