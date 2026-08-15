"use client";

import { useActionState, useId } from "react";
import { resendPartnerInvitationAction } from "@/app/lib/partner/partnersActions";
import type { PartnersFormState } from "@/app/lib/partner/partnersFormState";

function FormMessage({ state }: { state: PartnersFormState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p
        className="mt-2 text-sm font-medium text-[var(--accent-strong)]"
        role="status"
      >
        {state.message}
      </p>
    );
  }
  return (
    <p
      className="mt-2 text-sm font-medium text-red-700 dark:text-red-300"
      role="alert"
    >
      {state.error}
    </p>
  );
}

export function PartnerInviteResendPanel({ partnerId }: { partnerId: string }) {
  const formId = useId();
  const [state, formAction, pending] = useActionState(
    resendPartnerInvitationAction,
    null
  );

  return (
    <section
      className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
      aria-labelledby={`${formId}-heading`}
    >
      <div>
        <h2
          id={`${formId}-heading`}
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Resend setup link
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          This Partner has not set a password yet. Resending invalidates any
          previous unused setup link and emails a new one (expires in 30
          minutes).
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="partnerId" value={partnerId} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-contrast)] outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
        >
          {pending ? "Sending…" : "Resend setup link"}
        </button>
        <FormMessage state={state} />
      </form>
    </section>
  );
}
