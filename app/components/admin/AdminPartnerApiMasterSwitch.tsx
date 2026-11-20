"use client";

import { useActionState } from "react";
import {
  pauseOperationalControlAction,
  resumeOperationalControlAction,
  type OperationalControlFormState,
} from "@/app/lib/admin/operationalControlsActions";
import { CONTROL_CONFIRM_PHRASES } from "@/app/lib/admin/operationalControlsShared";

export default function AdminPartnerApiMasterSwitch({
  globallyPaused,
}: {
  globallyPaused: boolean;
}) {
  const action = globallyPaused
    ? resumeOperationalControlAction
    : pauseOperationalControlAction;
  const [state, formAction, pending] = useActionState(
    action,
    null as OperationalControlFormState
  );
  const phrase = globallyPaused
    ? CONTROL_CONFIRM_PHRASES.PARTNER_PUBLIC_API.resume
    : CONTROL_CONFIRM_PHRASES.PARTNER_PUBLIC_API.pause;

  return (
    <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--heading)]">
            Partner API Master Switch
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Global kill-switch for{" "}
            <code className="text-xs">/api/v1/partner/*</code>. Paused =
            all partners receive HTTP 503.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
            globallyPaused
              ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]"
              : "border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 text-[var(--heading)]"
          }`}
        >
          {globallyPaused ? "Globally paused" : "Globally live"}
        </span>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="controlKey" value="PARTNER_PUBLIC_API" />
        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Reason
          </label>
          <input
            name="reason"
            required
            minLength={5}
            maxLength={240}
            disabled={pending}
            placeholder="Short ops reason"
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Type {phrase}
          </label>
          <input
            name="confirmPhrase"
            required
            disabled={pending}
            autoComplete="off"
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending
            ? "Updating…"
            : globallyPaused
              ? "Resume Partner Public API"
              : "Pause Partner Public API"}
        </button>
        {state && !state.ok ? (
          <p className="text-sm text-[var(--danger-text)]" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.ok ? (
          <p className="text-sm text-[var(--heading)]" role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
