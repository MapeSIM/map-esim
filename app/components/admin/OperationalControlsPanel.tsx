"use client";

import { useActionState } from "react";
import {
  pauseOperationalControlAction,
  resumeOperationalControlAction,
  type OperationalControlFormState,
} from "@/app/lib/admin/operationalControlsActions";
import type { SanitizedOperationalControlView } from "@/app/lib/admin/operationalControlsShared";

function FieldError({
  state,
  field,
}: {
  state: OperationalControlFormState;
  field: "reason" | "confirmPhrase" | "controlKey";
}) {
  const msg = state && !state.ok ? state.fieldErrors?.[field] : undefined;
  if (!msg) return null;
  return (
    <p className="mt-1 text-xs text-red-700 dark:text-red-300" role="alert">
      {msg}
    </p>
  );
}

function FormMessage({ state }: { state: OperationalControlFormState }) {
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
    <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300" role="alert">
      {state.error}
    </p>
  );
}

function ControlCard({ control }: { control: SanitizedOperationalControlView }) {
  const [pauseState, pauseAction, pausePending] = useActionState(
    pauseOperationalControlAction,
    null
  );
  const [resumeState, resumeAction, resumePending] = useActionState(
    resumeOperationalControlAction,
    null
  );
  const pending = pausePending || resumePending;
  const latest = resumeState ?? pauseState;

  return (
    <article
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      aria-labelledby={`control-${control.key}-title`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id={`control-${control.key}-title`}
            className="text-sm font-semibold text-[var(--heading)]"
          >
            {control.name}
          </h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{control.scope}</p>
        </div>
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${
            control.paused
              ? "bg-red-500/10 text-red-700 dark:text-red-300"
              : "bg-[var(--accent-strong)]/12 text-[var(--accent-strong)]"
          }`}
        >
          {control.state}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-2">
        <div>
          <dt className="font-semibold uppercase tracking-[0.06em] text-[var(--text-soft)]">
            Last changed
          </dt>
          <dd className="mt-0.5 text-[var(--heading)]">{control.updatedAtLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-[0.06em] text-[var(--text-soft)]">
            Actor
          </dt>
          <dd className="mt-0.5 text-[var(--heading)]">
            {control.updatedByAdminIdSafe ?? "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold uppercase tracking-[0.06em] text-[var(--text-soft)]">
            Reason
          </dt>
          <dd className="mt-0.5 break-words text-[var(--heading)]">
            {control.reasonTruncated ?? "—"}
          </dd>
        </div>
      </dl>

      {control.paused ? (
        <form action={resumeAction} className="mt-4 space-y-3">
          <input type="hidden" name="controlKey" value={control.key} />
          <input
            type="hidden"
            name="expectedVersion"
            value={String(control.version)}
          />
          <div>
            <label
              htmlFor={`resume-reason-${control.key}`}
              className="block text-xs font-semibold text-[var(--heading)]"
            >
              Reason (required)
            </label>
            <textarea
              id={`resume-reason-${control.key}`}
              name="reason"
              rows={2}
              required
              minLength={5}
              maxLength={240}
              disabled={pending}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            />
            <FieldError state={resumeState} field="reason" />
          </div>
          <div>
            <label
              htmlFor={`resume-phrase-${control.key}`}
              className="block text-xs font-semibold text-[var(--heading)]"
            >
              Confirmation phrase
            </label>
            <p className="mt-0.5 text-[11px] text-[var(--text-soft)]">
              Type <span className="font-mono">{control.resumePhrase}</span> exactly
            </p>
            <input
              id={`resume-phrase-${control.key}`}
              name="confirmPhrase"
              type="text"
              autoComplete="off"
              required
              disabled={pending}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-mono"
            />
            <FieldError state={resumeState} field="confirmPhrase" />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--accent-strong)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Working…" : "Resume control"}
          </button>
          <FormMessage state={latest === resumeState ? resumeState : null} />
        </form>
      ) : (
        <form action={pauseAction} className="mt-4 space-y-3">
          <input type="hidden" name="controlKey" value={control.key} />
          <input
            type="hidden"
            name="expectedVersion"
            value={String(control.version)}
          />
          <div>
            <label
              htmlFor={`pause-reason-${control.key}`}
              className="block text-xs font-semibold text-[var(--heading)]"
            >
              Reason (required)
            </label>
            <textarea
              id={`pause-reason-${control.key}`}
              name="reason"
              rows={2}
              required
              minLength={5}
              maxLength={240}
              disabled={pending}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            />
            <FieldError state={pauseState} field="reason" />
          </div>
          <div>
            <label
              htmlFor={`pause-phrase-${control.key}`}
              className="block text-xs font-semibold text-[var(--heading)]"
            >
              Confirmation phrase
            </label>
            <p className="mt-0.5 text-[11px] text-[var(--text-soft)]">
              Type <span className="font-mono">{control.pausePhrase}</span> exactly
            </p>
            <input
              id={`pause-phrase-${control.key}`}
              name="confirmPhrase"
              type="text"
              autoComplete="off"
              required
              disabled={pending}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-mono"
            />
            <FieldError state={pauseState} field="confirmPhrase" />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-red-600/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-800 dark:text-red-200 disabled:opacity-60"
          >
            {pending ? "Working…" : "Pause control"}
          </button>
          <FormMessage state={latest === pauseState ? pauseState : null} />
        </form>
      )}
    </article>
  );
}

export function OperationalControlsPanel({
  controls,
  overallStatus,
  guestCheckoutStatus,
}: {
  controls: SanitizedOperationalControlView[];
  overallStatus: string;
  guestCheckoutStatus: string;
}) {
  return (
    <section
      className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5"
      aria-labelledby="ops-controls-heading"
    >
      <div>
        <h2
          id="ops-controls-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Operational controls
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          Safety pause switches for <strong>new</strong> transaction initiation
          only. Pausing does not cancel in-flight work, issue refunds, call the
          provider, send email, or change wallets, orders, ICCIDs, or
          reconciliation cases. Recovery and reconciliation remain available.
        </p>
        <p className="mt-2 text-sm font-medium text-[var(--heading)]">
          Overall transactions:{" "}
          <span className="font-semibold">{overallStatus}</span>
        </p>
        <p className="mt-1 text-xs text-[var(--text-soft)]">
          Guest checkout: {guestCheckoutStatus}. Payment gateway remains not
          implemented. These controls cannot enable incomplete features.
        </p>
        <p
          className="mt-3 rounded-xl border border-red-600/30 bg-red-500/5 px-3 py-2 text-xs text-red-800 dark:text-red-200"
          role="note"
        >
          Financial / provider warning: pausing stops new risky initiation.
          Confirm phrases are required. Wrong phrases are rejected. Do not use
          these controls to unlock guest checkout or payment gateway.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {controls.map((control) => (
          <ControlCard key={control.key} control={control} />
        ))}
      </div>
    </section>
  );
}
