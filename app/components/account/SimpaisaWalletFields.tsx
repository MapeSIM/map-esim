/**
 * Shared Simpaisa wallet checkout fields (operator + MSISDN).
 * Amounts are display-only; the server recomputes the PKR charge.
 */
"use client";

import { useId } from "react";
import {
  formatSimpaisaPkrChargeLabel,
  quoteSimpaisaPkrChargeFromUsdCents,
  SIMPAISA_WALLET_OPERATOR_OPTIONS,
} from "@/app/lib/payments/simpaisaPkrQuote";

type Props = {
  usdCents: number;
  disabled?: boolean;
  operatorError?: string;
  msisdnError?: string;
};

export default function SimpaisaWalletFields({
  usdCents,
  disabled = false,
  operatorError,
  msisdnError,
}: Props) {
  const operatorName = "walletOperatorId";
  const msisdnId = useId();
  const quote = quoteSimpaisaPkrChargeFromUsdCents(usdCents);

  return (
    <div className="mt-4 space-y-4">
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-semibold text-[var(--heading)]">
          Mobile wallet
        </legend>
        <p className="text-sm text-[var(--text-muted)]">
          Choose Easypaisa or JazzCash. Enter the 10-digit mobile number
          (without country code) that will receive the payment request.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SIMPAISA_WALLET_OPERATOR_OPTIONS.map((option) => (
            <label
              key={option.id}
              className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--heading)]"
            >
              <input
                type="radio"
                name={operatorName}
                value={option.id}
                required
                className="mt-0.5"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {operatorError ? (
          <p className="text-sm text-[var(--heading)]" role="alert">
            {operatorError}
          </p>
        ) : null}
      </fieldset>

      <div className="space-y-2">
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
          className="w-full rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--heading)]"
        />
        <p className="text-xs text-[var(--text-muted)]">
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
        <p className="text-sm text-[var(--heading)]">
          Amount to pay:{" "}
          <span className="font-semibold">
            {formatSimpaisaPkrChargeLabel(quote.pkrRupees)}
          </span>
          <span className="block text-xs font-medium text-[var(--text-muted)]">
            Charged in PKR. Wallet and order values stay in USD.
          </span>
        </p>
      ) : null}
    </div>
  );
}
