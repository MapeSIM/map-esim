/**
 * Shared Simpaisa wallet checkout fields (operator + MSISDN).
 * Amounts are display-only; the server recomputes the PKR charge.
 * UI only shows JazzCash and Easypaisa (no card option).
 */
"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import {
  formatSimpaisaPkrChargeLabel,
  quoteSimpaisaPkrChargeFromUsdCents,
} from "@/app/lib/payments/simpaisaPkrQuote";
import { SIMPAISA_MOBILE_WALLET_METHODS } from "@/app/components/account/simpaisaWalletMethodPresentation";

type Props = {
  usdCents: number;
  disabled?: boolean;
  operatorError?: string;
  msisdnError?: string;
};

const operatorName = "walletOperatorId";

export default function SimpaisaWalletFields({
  usdCents,
  disabled = false,
  operatorError,
  msisdnError,
}: Props) {
  const legendId = useId();
  const operatorGroupId = useId();
  const msisdnId = useId();
  const quote = quoteSimpaisaPkrChargeFromUsdCents(usdCents);

  return (
    <div className="mt-3 min-w-0 space-y-4">
      <fieldset disabled={disabled} className="min-w-0 space-y-2.5">
        <legend
          id={legendId}
          className="text-sm font-semibold text-[var(--heading)]"
        >
          Pay with
        </legend>

        <div
          id={operatorGroupId}
          role="radiogroup"
          aria-labelledby={legendId}
          aria-invalid={operatorError ? true : undefined}
          aria-describedby={
            operatorError ? `${operatorGroupId}-error` : undefined
          }
          className="grid min-w-0 grid-cols-2 gap-2.5"
        >
          {SIMPAISA_MOBILE_WALLET_METHODS.map((method) => (
            <label
              key={method.id}
              className={[
                "group relative flex min-h-[7.5rem] min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border bg-[#071e2e] px-3 py-3.5 text-center transition",
                "border-[#1a4a63] hover:border-[#2f6f90]",
                "has-[:checked]:border-[var(--accent-strong)] has-[:checked]:bg-[color-mix(in_srgb,var(--accent-strong)_10%,#071e2e)]",
                "has-[:checked]:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-strong)_35%,transparent)]",
                "focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--accent-strong)]/60 focus-within:ring-offset-2 focus-within:ring-offset-[var(--surface)]",
                disabled ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
            >
              <input
                type="radio"
                name={operatorName}
                value={method.id}
                required
                disabled={disabled}
                className="peer sr-only"
              />

              <span
                aria-hidden="true"
                className="absolute top-2.5 right-2.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#1e5470] bg-[#082433] text-transparent transition group-has-[:checked]:border-[var(--accent-strong)] group-has-[:checked]:bg-[var(--accent-strong)] group-has-[:checked]:text-[var(--accent-ink)]"
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>

              <span className="flex h-12 w-full items-center justify-center sm:h-14">
                <img
                  src={method.logoSrc}
                  alt=""
                  className={method.logoClassName}
                  aria-hidden="true"
                />
              </span>

              <span className="block text-xs font-semibold text-white sm:text-sm">
                {method.label}
              </span>

              <span className="sr-only">{method.logoAlt}</span>
            </label>
          ))}
        </div>

        {operatorError ? (
          <p
            id={`${operatorGroupId}-error`}
            className="text-sm text-[var(--heading)]"
            role="alert"
          >
            {operatorError}
          </p>
        ) : null}
      </fieldset>

      <div className="min-w-0 space-y-1.5">
        <label
          htmlFor={msisdnId}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Mobile number
        </label>
        <input
          id={msisdnId}
          name="customerMsisdn"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          disabled={disabled}
          placeholder="3XXXXXXXXX"
          className="w-full min-w-0 rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        <p className="text-xs text-[var(--text-muted)]">
          10 digits, no country code (e.g. 3001234567).
        </p>
        {msisdnError ? (
          <p className="text-sm text-[var(--heading)]" role="alert">
            {msisdnError}
          </p>
        ) : null}
      </div>

      {quote ? (
        <div
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5"
          role="note"
        >
          <p className="text-sm text-[var(--heading)]">
            Amount:{" "}
            <span className="font-semibold">
              {formatSimpaisaPkrChargeLabel(quote.pkrRupees)}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
