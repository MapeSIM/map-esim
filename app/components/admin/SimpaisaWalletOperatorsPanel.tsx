"use client";

import { useActionState, useEffect, useId, useState } from "react";
import {
  saveSimpaisaWalletOperatorConfigAction,
  type SimpaisaWalletOperatorFormState,
} from "@/app/lib/admin/simpaisaWalletOperatorActions";
import type { AdminSimpaisaWalletOperatorView } from "@/app/lib/payments/simpaisaWalletOperatorConfigShared";

function FormMessage({ state }: { state: SimpaisaWalletOperatorFormState }) {
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

export function SimpaisaWalletOperatorsPanel({
  initial,
}: {
  initial: AdminSimpaisaWalletOperatorView;
}) {
  const formId = useId();
  const [state, action, pending] = useActionState(
    saveSimpaisaWalletOperatorConfigAction,
    null
  );
  const [jazzcashEnabled, setJazzcashEnabled] = useState(
    initial.jazzcashEnabled
  );
  const [easypaisaEnabled, setEasypaisaEnabled] = useState(
    initial.easypaisaEnabled
  );
  const [version, setVersion] = useState(initial.version);
  const [updatedAtLabel, setUpdatedAtLabel] = useState(initial.updatedAtLabel);

  useEffect(() => {
    if (state?.ok) {
      setVersion(state.version);
      setJazzcashEnabled(state.jazzcashEnabled);
      setEasypaisaEnabled(state.easypaisaEnabled);
      setUpdatedAtLabel(
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date())
      );
    }
  }, [state]);

  const enabledCount = [jazzcashEnabled, easypaisaEnabled].filter(Boolean)
    .length;
  const statusLabel =
    enabledCount === 0
      ? "Both disabled"
      : enabledCount === 2
        ? "Both enabled"
        : jazzcashEnabled
          ? "JazzCash only"
          : "Easypaisa only";

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
            Simpaisa Wallet Operators
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
            Control which PK mobile wallets appear at customer checkout, top-up,
            and partner catalog payment. Disabled operators are rejected by the
            server even if a client still sends them.
          </p>
        </div>
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${
            enabledCount > 0
              ? "bg-[var(--accent-strong)]/12 text-[var(--accent-strong)]"
              : "bg-[var(--surface)] text-[var(--heading)] border border-[var(--border)]"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <dl className="grid gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-3">
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
        <div>
          <dt className="font-semibold uppercase tracking-[0.06em] text-[var(--text-soft)]">
            Updated by
          </dt>
          <dd className="mt-0.5 text-[var(--heading)]">
            {initial.updatedByAdminIdSafe ?? "—"}
          </dd>
        </div>
      </dl>

      <form action={action} className="space-y-4">
        <input type="hidden" name="expectedVersion" value={String(version)} />
        <input
          type="hidden"
          name="jazzcashEnabled"
          value={jazzcashEnabled ? "true" : "false"}
        />
        <input
          type="hidden"
          name="easypaisaEnabled"
          value={easypaisaEnabled ? "true" : "false"}
        />

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              id={`${formId}-jazzcash`}
              type="checkbox"
              checked={jazzcashEnabled}
              disabled={pending}
              onChange={(e) => setJazzcashEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)]"
            />
            <label
              htmlFor={`${formId}-jazzcash`}
              className="text-sm font-medium text-[var(--heading)]"
            >
              JazzCash enabled
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              id={`${formId}-easypaisa`}
              type="checkbox"
              checked={easypaisaEnabled}
              disabled={pending}
              onChange={(e) => setEasypaisaEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)]"
            />
            <label
              htmlFor={`${formId}-easypaisa`}
              className="text-sm font-medium text-[var(--heading)]"
            >
              Easypaisa enabled
            </label>
          </div>
        </div>

        {enabledCount === 0 ? (
          <p className="text-sm text-[var(--heading)]" role="status">
            Both operators are off — mobile wallet checkout will show as
            unavailable until at least one is re-enabled.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-[12px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save operator settings"}
          </button>
        </div>

        <FormMessage state={state} />
      </form>
    </section>
  );
}
