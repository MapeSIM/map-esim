"use client";

import { useActionState, useId } from "react";
import { createPartnerAction } from "@/app/lib/partner/partnersActions";
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

export function PartnerCreateForm() {
  const formId = useId();
  const [state, formAction, pending] = useActionState(createPartnerAction, null);

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
          Create Partner
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Creates a dedicated PARTNER account and emails a secure password setup
          link. Existing emails in any role cannot be reused.
        </p>
      </div>

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Name
          </span>
          <input
            type="text"
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          {state && !state.ok && state.fieldErrors?.name ? (
            <span className="mt-1 block text-xs text-red-700 dark:text-red-300">
              {state.fieldErrors.name}
            </span>
          ) : null}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Email
          </span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          {state && !state.ok && state.fieldErrors?.email ? (
            <span className="mt-1 block text-xs text-red-700 dark:text-red-300">
              {state.fieldErrors.email}
            </span>
          ) : null}
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Discount %
          </span>
          <input
            type="text"
            name="discountPercent"
            required
            inputMode="decimal"
            placeholder="5 or 7.5"
            className="w-full max-w-xs rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          {state && !state.ok && state.fieldErrors?.discountPercent ? (
            <span className="mt-1 block text-xs text-red-700 dark:text-red-300">
              {state.fieldErrors.discountPercent}
            </span>
          ) : (
            <span className="mt-1 block text-xs text-[var(--text-soft)]">
              0–99% · up to two decimal places
            </span>
          )}
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white outline-none hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create partner"}
          </button>
          <FormMessage state={state} />
        </div>
      </form>
    </section>
  );
}
