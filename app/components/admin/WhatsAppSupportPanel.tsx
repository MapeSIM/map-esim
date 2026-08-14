"use client";

import { useActionState, useEffect, useId, useState } from "react";
import {
  saveWhatsAppSupportConfigAction,
  type WhatsAppSupportFormState,
} from "@/app/lib/admin/whatsappSupportActions";
import type { AdminWhatsAppSupportView } from "@/app/lib/support/whatsappSupportShared";

function FormMessage({ state }: { state: WhatsAppSupportFormState }) {
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

export function WhatsAppSupportPanel({
  initial,
}: {
  initial: AdminWhatsAppSupportView;
}) {
  const formId = useId();
  const [state, action, pending] = useActionState(
    saveWhatsAppSupportConfigAction,
    null
  );
  const [enabled, setEnabled] = useState(initial.enabled);
  const [phone, setPhone] = useState(initial.phoneDisplay);
  const [message, setMessage] = useState(initial.message);
  const [version, setVersion] = useState(initial.version);
  const [updatedAtLabel, setUpdatedAtLabel] = useState(initial.updatedAtLabel);

  useEffect(() => {
    if (state?.ok) {
      setVersion(state.version);
      setEnabled(state.enabled);
      setUpdatedAtLabel(
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date())
      );
    }
  }, [state]);

  const statusLabel = enabled ? "Enabled" : "Disabled";

  return (
    <section
      className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5"
      aria-labelledby={`${formId}-heading`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`${formId}-heading`}
            className="text-base font-semibold tracking-tight text-[var(--heading)]"
          >
            WhatsApp Support Button
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
            Floating public support link (bottom-left). Changes apply to the
            public website without redeploy.
          </p>
        </div>
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${
            enabled
              ? "bg-[var(--accent-strong)]/12 text-[var(--accent-strong)]"
              : "bg-[var(--surface)] text-[var(--heading)] border border-[var(--border)]"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <dl className="grid gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-2">
        <div>
          <dt className="font-semibold uppercase tracking-[0.06em] text-[var(--text-soft)]">
            Current status
          </dt>
          <dd className="mt-0.5 text-[var(--heading)]">{statusLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-[0.06em] text-[var(--text-soft)]">
            Last updated
          </dt>
          <dd className="mt-0.5 text-[var(--heading)]">
            {updatedAtLabel ?? "—"}
          </dd>
        </div>
      </dl>

      <form action={action} className="space-y-4">
        <input type="hidden" name="expectedVersion" value={String(version)} />
        {/* unchecked checkbox is omitted from FormData — always send explicit value */}
        <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />

        <div className="flex items-center gap-3">
          <input
            id={`${formId}-enabled`}
            type="checkbox"
            checked={enabled}
            disabled={pending}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border)]"
          />
          <label
            htmlFor={`${formId}-enabled`}
            className="text-sm font-semibold text-[var(--heading)]"
          >
            Enabled
          </label>
        </div>

        <div>
          <label
            htmlFor={`${formId}-phone`}
            className="block text-xs font-semibold text-[var(--heading)]"
          >
            WhatsApp number
          </label>
          <p className="mt-0.5 text-[11px] text-[var(--text-soft)]">
            International format, e.g. +923001234567
          </p>
          <input
            id={`${formId}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            disabled={pending}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+923001234567"
            className="mt-1 w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          {state && !state.ok && state.fieldErrors?.phone ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300" role="alert">
              {state.fieldErrors.phone}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor={`${formId}-message`}
            className="block text-xs font-semibold text-[var(--heading)]"
          >
            Default message
          </label>
          <p className="mt-0.5 text-[11px] text-[var(--text-soft)]">
            Optional plain text prefilled in WhatsApp (max 500 characters)
          </p>
          <textarea
            id={`${formId}-message`}
            name="message"
            rows={3}
            disabled={pending}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            className="mt-1 w-full max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          {state && !state.ok && state.fieldErrors?.message ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300" role="alert">
              {state.fieldErrors.message}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <FormMessage state={state} />
      </form>
    </section>
  );
}
