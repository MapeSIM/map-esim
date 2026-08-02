"use client";

import { useActionState } from "react";
import type { AuthActionState } from "@/app/lib/auth/actions";

const initialState: AuthActionState = { ok: false };

export default function OtpVerifyForm({
  email,
  verifyAction,
  resendAction,
  submitLabel = "Verify code",
}: {
  email: string;
  verifyAction: (
    prev: AuthActionState,
    formData: FormData
  ) => Promise<AuthActionState>;
  resendAction: (
    prev: AuthActionState,
    formData: FormData
  ) => Promise<AuthActionState>;
  submitLabel?: string;
}) {
  const [verifyState, verifyFormAction, verifyPending] = useActionState(
    verifyAction,
    initialState
  );
  const [resendState, resendFormAction, resendPending] = useActionState(
    resendAction,
    initialState
  );

  const message = verifyState.error || resendState.error;
  const messageOk = Boolean(
    (verifyState.error && verifyState.ok) ||
      (resendState.error && resendState.ok)
  );

  return (
    <div className="space-y-4">
      <form action={verifyFormAction} className="space-y-4" noValidate>
        <input type="hidden" name="email" value={email} />
        <div>
          <label
            htmlFor="email-display"
            className="mb-1.5 block text-sm font-medium text-[var(--heading)]"
          >
            Email
          </label>
          <input
            id="email-display"
            type="email"
            value={email}
            readOnly
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          />
        </div>
        <div>
          <label
            htmlFor="otp"
            className="mb-1.5 block text-sm font-medium text-[var(--heading)]"
          >
            6-digit code
          </label>
          <input
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 py-3 text-center text-lg tracking-[0.35em] text-[var(--heading)] outline-none focus:border-[var(--accent-strong)]"
          />
        </div>

        {message ? (
          <p
            className={`rounded-xl border px-3 py-2 text-sm ${
              messageOk
                ? "border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 text-[var(--heading)]"
                : "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]"
            }`}
            role="alert"
          >
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={verifyPending}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent-strong)] text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
        >
          {verifyPending ? "Verifying…" : submitLabel}
        </button>
      </form>

      <form action={resendFormAction}>
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={resendPending}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
        >
          {resendPending ? "Sending…" : "Resend code"}
        </button>
      </form>
    </div>
  );
}
