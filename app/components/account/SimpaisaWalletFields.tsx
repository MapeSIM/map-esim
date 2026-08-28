/**
 * Shared Simpaisa wallet checkout fields (operator + MSISDN).
 * Amounts are display-only; the server recomputes the PKR charge.
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
    <div className="mt-4 min-w-0 space-y-5">
      <fieldset disabled={disabled} className="min-w-0 space-y-3">
        <legend
          id={legendId}
          className="text-sm font-semibold text-[var(--heading)]"
        >
          Mobile wallet
        </legend>
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">
          Choose Easypaisa or JazzCash. Enter the 10-digit mobile number
          (without country code) that will receive the payment request.
        </p>
        <p className="text-xs leading-relaxed text-[var(--text-soft)]">
          Wallet icons are temporary sandbox placeholders — not official
          Easypaisa or JazzCash brand assets.
        </p>

        <div
          id={operatorGroupId}
          role="radiogroup"
          aria-labelledby={legendId}
          aria-invalid={operatorError ? true : undefined}
          aria-describedby={
            operatorError ? `${operatorGroupId}-error` : undefined
          }
          className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {SIMPAISA_MOBILE_WALLET_METHODS.map((method) => (
            <label
              key={method.id}
              className={[
                "group relative flex min-h-[5.5rem] min-w-0 cursor-pointer items-start gap-3 rounded-2xl border bg-[var(--surface)] p-4 text-left transition",
                "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
                "has-[:checked]:border-[var(--accent-strong)] has-[:checked]:bg-[color-mix(in_srgb,var(--accent-strong)_10%,var(--surface))]",
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
                className={[
                  "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-gradient-to-br",
                  method.accentClass,
                  "group-has-[:checked]:border-[var(--accent-strong)]/40",
                ].join(" ")}
              >
                <img
                  src={method.placeholderMarkSrc}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                  aria-hidden="true"
                />
              </span>

              <span className="min-w-0 flex-1 pt-0.5">
                <span className="flex items-start justify-between gap-2">
                  <span className="block text-sm font-semibold text-[var(--heading)]">
                    {method.label}
                  </span>
                  <span
                    aria-hidden="true"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] text-transparent transition group-has-[:checked]:border-[var(--accent-strong)] group-has-[:checked]:bg-[var(--accent-strong)] group-has-[:checked]:text-[var(--accent-ink)]"
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">
                  {method.description}
                </span>
              </span>

              <span className="sr-only">{method.placeholderMarkAlt}</span>
            </label>
          ))}

          {/*
            Future card payment option (disabled placeholder — not wired):
            <div className="rounded-2xl border border-dashed ...">{FUTURE_CARD_PAYMENT_METHOD_LABEL}</div>
          */}
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

      <div className="min-w-0 space-y-2">
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
          className="w-full min-w-0 rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          10-digit Pakistani mobile number without country code, for example
          3001234567.
        </p>
        {msisdnError ? (
          <p className="text-sm text-[var(--heading)]" role="alert">
            {msisdnError}
          </p>
        ) : null}
      </div>

      {quote ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
          role="note"
        >
          <p className="text-sm text-[var(--heading)]">
            Amount to pay:{" "}
            <span className="font-semibold">
              {formatSimpaisaPkrChargeLabel(quote.pkrRupees)}
            </span>
          </p>
          <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
            Charged in PKR. Wallet and order values stay in USD.
          </p>
        </div>
      ) : null}
    </div>
  );
}
