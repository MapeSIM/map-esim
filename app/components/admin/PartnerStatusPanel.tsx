"use client";

import { useActionState, useId } from "react";
import {
  disablePartnerAction,
  reactivatePartnerAction,
} from "@/app/lib/partner/partnersActions";
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

export function PartnerStatusPanel({
  partnerId,
  statusVersion,
  mode,
}: {
  partnerId: string;
  statusVersion: number;
  mode: "disable" | "reactivate";
}) {
  const formId = useId();
  const action =
    mode === "disable" ? disablePartnerAction : reactivatePartnerAction;
  const [state, formAction, pending] = useActionState(action, null);
  const title = mode === "disable" ? "Disable partner" : "Reactivate partner";
  const confirmLabel =
    mode === "disable" ? "Confirm disable" : "Confirm reactivate";
  const reasonLabel =
    mode === "disable"
      ? "Disable reason (required)"
      : "Reactivation note (required)";
  const help =
    mode === "disable"
      ? "Denies partner portal access and revokes active sessions. Wallet balance is preserved."
      : "Restores partner portal access. The partner must sign in again.";

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
          {title}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{help}</p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="partnerId" value={partnerId} />
        <input
          type="hidden"
          name="expectedVersion"
          value={String(statusVersion)}
        />
        <div>
          <label
            htmlFor={`${formId}-reason`}
            className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            {reasonLabel}
          </label>
          <textarea
            id={`${formId}-reason`}
            name="reason"
            required
            minLength={8}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            placeholder="8–500 characters"
          />
          {state && !state.ok && state.fieldErrors?.reason ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              {state.fieldErrors.reason}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--page-bg-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
        >
          {pending ? "Saving…" : confirmLabel}
        </button>
        <FormMessage state={state} />
      </form>
    </section>
  );
}
