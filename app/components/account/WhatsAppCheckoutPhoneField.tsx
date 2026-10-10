"use client";

import { useId } from "react";
import {
  WHATSAPP_CHECKOUT_DEFAULT_DIAL_CODE,
  WHATSAPP_CHECKOUT_DIAL_CODES,
  composeWhatsAppCheckoutPhoneDigits,
} from "@/app/lib/support/whatsappCheckoutOrderShared";

export type WhatsAppCheckoutPhoneFieldProps = {
  dialCode: string;
  localNumber: string;
  onDialCodeChange: (code: string) => void;
  onLocalNumberChange: (value: string) => void;
  disabled?: boolean;
  /** Show validation error when the user has interacted / tried to submit. */
  showError?: boolean;
};

export default function WhatsAppCheckoutPhoneField({
  dialCode,
  localNumber,
  onDialCodeChange,
  onLocalNumberChange,
  disabled = false,
  showError = false,
}: WhatsAppCheckoutPhoneFieldProps) {
  const fieldId = useId();
  const parsed = composeWhatsAppCheckoutPhoneDigits({ dialCode, localNumber });

  return (
    <div className="mt-4 space-y-2">
      <label
        htmlFor={`${fieldId}-local`}
        className="block text-xs font-semibold text-[var(--heading)]"
      >
        WhatsApp Number (For Order Updates &amp; QR Delivery)
      </label>
      <p className="text-[11px] text-[var(--text-soft)]">
        Required for Buy via WhatsApp. We use this to confirm payment and send
        install help.
      </p>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`${fieldId}-dial`}>
          Country code
        </label>
        <select
          id={`${fieldId}-dial`}
          value={dialCode || WHATSAPP_CHECKOUT_DEFAULT_DIAL_CODE}
          disabled={disabled}
          onChange={(e) => onDialCodeChange(e.target.value)}
          className="h-11 w-full shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--heading)] sm:w-[9.5rem]"
        >
          {WHATSAPP_CHECKOUT_DIAL_CODES.map((row) => (
            <option key={row.code} value={row.code}>
              {row.short}
            </option>
          ))}
        </select>
        <input
          id={`${fieldId}-local`}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          disabled={disabled}
          value={localNumber}
          onChange={(e) => onLocalNumberChange(e.target.value)}
          placeholder="300 1234567"
          className="h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--heading)]"
          required
          aria-invalid={showError && !parsed.ok ? true : undefined}
        />
      </div>
      {showError && !parsed.ok ? (
        <p className="text-xs text-red-700 dark:text-red-300" role="alert">
          {parsed.error}
        </p>
      ) : parsed.ok ? (
        <p className="text-[11px] text-[var(--text-soft)]">
          Will save as +{parsed.digits}
        </p>
      ) : null}
    </div>
  );
}
