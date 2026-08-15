"use client";

import { useActionState, useId } from "react";
import { changePartnerDiscountAction } from "@/app/lib/partner/partnersActions";
import type { PartnersFormState } from "@/app/lib/partner/partnersFormState";
import { formatDiscountBpsAsPercent } from "@/app/lib/partner/discount";

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

export function PartnerDiscountPanel({
  partnerId,
  discountBps,
  discountVersion,
  disabled,
}: {
  partnerId: string;
  discountBps: number;
  discountVersion: number;
  disabled: boolean;
}) {
  const formId = useId();
  const [state, formAction, pending] = useActionState(
    changePartnerDiscountAction,
    null
  );

  if (disabled) {
    return (
      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold tracking-tight text-[var(--heading)]">
          Partner discount
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Discount changes are unavailable while this partner is disabled or
          deleted.
        </p>
      </section>
    );
  }

  return (
    <section
      className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5"
      aria-labelledby={`${formId}-heading`}
    >
      <div>
        <h2
          id={`${formId}-heading`}
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Partner discount
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Current discount: {formatDiscountBpsAsPercent(discountBps)}%. Applied
          at future purchase time (Phase 2).
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="partnerId" value={partnerId} />
        <input
          type="hidden"
          name="expectedVersion"
          value={String(discountVersion)}
        />
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            New discount %
          </span>
          <input
            type="text"
            name="discountPercent"
            required
            inputMode="decimal"
            defaultValue={formatDiscountBpsAsPercent(discountBps)}
            className="w-full max-w-xs rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          {state && !state.ok && state.fieldErrors?.discountPercent ? (
            <span className="mt-1 block text-xs text-red-700 dark:text-red-300">
              {state.fieldErrors.discountPercent}
            </span>
          ) : null}
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--page-bg-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Update discount"}
        </button>
        <FormMessage state={state} />
      </form>
    </section>
  );
}
