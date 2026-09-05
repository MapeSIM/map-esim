"use client";

import { useActionState, useId, useMemo, useRef, useState } from "react";
import { startPartnerWalletAddFundsAction } from "@/app/lib/partner/partnerWalletTopupActions";
import {
  initialPartnerWalletTopupState,
  type PartnerWalletTopupActionState,
} from "@/app/lib/partner/partnerWalletTopupFormState";
import {
  PARTNER_TOPUP_MAX_CENTS,
  PARTNER_TOPUP_MIN_CENTS,
} from "@/app/lib/partner/partnerWalletTopupConstants";
import SimpaisaWalletFields from "@/app/components/account/SimpaisaWalletFields";

type Props = {
  balanceLabel: string;
  gatewayReady: boolean;
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
    return `ptop_draft_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `ptop_draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function PartnerWalletAddFundsForm({
  balanceLabel,
  gatewayReady,
}: Props) {
  const [state, formAction, pending] = useActionState(
    startPartnerWalletAddFundsAction,
    initialPartnerWalletTopupState
  );
  const amountId = useId();
  const amountInputRef = useRef<HTMLInputElement>(null);
  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);
  const [amount, setAmount] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<AmountPreset | null>(
    null
  );
  const errorState = state as PartnerWalletTopupActionState;
  const minLabel = (PARTNER_TOPUP_MIN_CENTS / 100).toFixed(2);
  const maxLabel = (PARTNER_TOPUP_MAX_CENTS / 100).toFixed(2);
  const amountCents = (() => {
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  })();

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

  if (!gatewayReady) {
    return (
      <div
        className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-6"
        role="status"
      >
        <h2 className="text-lg font-semibold tracking-tight text-[var(--heading)]">
          Add Funds
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Adding funds online is not available yet. Payment provider setup is
          still in progress. Admin funding continues to credit this wallet.
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Current balance:{" "}
          <span className="font-semibold text-[var(--heading)]">
            {balanceLabel}
          </span>{" "}
          USD
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 sm:p-6"
      noValidate
      data-partner-add-funds="true"
    >
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--heading)]">
          Add Funds
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Top up your Partner balance with Easypaisa or JazzCash. Only a verified
          payment credits this wallet.
        </p>
      </div>

      <div className="space-y-3">
        <p className="block text-sm font-semibold text-[var(--heading)]">
          Quick amount
        </p>
        <div
          className="flex min-w-0 flex-wrap gap-2"
          role="group"
          aria-label="Quick Add Funds amounts"
        >
          {AMOUNT_PRESETS.map((preset) => {
            const active = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                data-partner-topup-preset={preset.id}
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
          Custom USD amount
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

      {amountCents > 0 ? (
        <SimpaisaWalletFields
          usdCents={amountCents}
          disabled={pending}
          operatorError={
            errorState.ok === false
              ? errorState.fieldErrors?.walletOperatorId
              : undefined
          }
          msisdnError={
            errorState.ok === false
              ? errorState.fieldErrors?.customerMsisdn
              : undefined
          }
        />
      ) : null}

      <button
        type="submit"
        disabled={pending || amountCents <= 0}
        className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Sending payment request…" : "Continue"}
      </button>

      {errorState.ok === false && errorState.error ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--heading)]"
          role="alert"
        >
          {errorState.error}
        </div>
      ) : null}
    </form>
  );
}
