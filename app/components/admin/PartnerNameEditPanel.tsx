"use client";

import { useActionState, useId } from "react";
import { updatePartnerDisplayNameAction } from "@/app/lib/partner/partnersActions";
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

export function PartnerNameEditPanel({
  partnerId,
  currentName,
  disabled,
}: {
  partnerId: string;
  currentName: string;
  disabled?: boolean;
}) {
  const formId = useId();
  const [state, formAction, pending] = useActionState(
    updatePartnerDisplayNameAction,
    null
  );

  if (disabled) {
    return (
      <section
        id="partner-name"
        className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5"
      >
        <h2 className="text-base font-semibold tracking-tight text-[var(--heading)]">
          Edit partner name
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Name edits are unavailable for deleted partners. Email and other
          profile fields stay unchanged.
        </p>
      </section>
    );
  }

  return (
    <section
      id="partner-name"
      className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5"
      aria-labelledby={`${formId}-heading`}
    >
      <div>
        <h2
          id={`${formId}-heading`}
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Edit partner name
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Updates the display name only. Email, discount, wallet, and status are
          not changed here.
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="partnerId" value={partnerId} />
        <div>
          <label
            htmlFor={`${formId}-name`}
            className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Partner name
          </label>
          <input
            id={`${formId}-name`}
            type="text"
            name="name"
            required
            minLength={1}
            maxLength={120}
            defaultValue={currentName}
            autoComplete="organization"
            className="mt-1 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          {state && !state.ok && state.fieldErrors?.name ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              {state.fieldErrors.name}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--page-bg-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save name"}
        </button>
        <FormMessage state={state} />
      </form>
    </section>
  );
}
