"use client";

import { useActionState } from "react";
import {
  refreshProviderStatusAction,
  type ProviderRefreshFormState,
} from "@/app/lib/admin/providerRefreshActions";
import { PROVIDER_REFRESH_REASON_MAX } from "@/app/lib/admin/providerRefreshShared";

const initialState: ProviderRefreshFormState = null;

export default function ProviderRefreshForm(props: {
  sourceType: string;
  attemptId: string;
  expectedProviderOrderId: string;
  providerRefMasked: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    refreshProviderStatusAction,
    initialState
  );

  const blocked = Boolean(props.disabled) || pending;

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">
        Provider status refresh
      </h2>
      <p className="text-sm text-[var(--text-muted)]">
        This checks an existing provider order only. It will not place another
        order, charge a wallet or issue a refund.
      </p>
      <p className="text-xs text-[var(--text-soft)]">
        Stored reference: {props.providerRefMasked}
      </p>

      {props.disabled && props.disabledReason ? (
        <p className="text-sm font-medium text-[var(--heading)]" role="status">
          {props.disabledReason}
        </p>
      ) : null}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="sourceType" value={props.sourceType} />
        <input type="hidden" name="attemptId" value={props.attemptId} />
        <input
          type="hidden"
          name="expectedProviderOrderId"
          value={props.expectedProviderOrderId}
        />
        <div>
          <label
            htmlFor="provider-refresh-reason"
            className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Reason (required)
          </label>
          <textarea
            id="provider-refresh-reason"
            name="reason"
            required
            maxLength={PROVIDER_REFRESH_REASON_MAX}
            rows={3}
            disabled={blocked}
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
            placeholder="Why are you refreshing this provider order status?"
          />
          {state && !state.ok && state.fieldErrors?.reason ? (
            <p className="mt-1 text-sm text-[var(--danger-text)]">
              {state.fieldErrors.reason}
            </p>
          ) : null}
        </div>

        {state && !state.ok && state.error && !state.fieldErrors?.reason ? (
          <p className="text-sm text-[var(--danger-text)]" role="alert">
            {state.error}
          </p>
        ) : null}

        {state && state.ok ? (
          <p className="text-sm font-medium text-[var(--heading)]" role="status">
            Provider status check completed. Review the observation panel below.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={blocked}
          className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white outline-none ring-[var(--accent-strong)] focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Refreshing…" : "Refresh provider status"}
        </button>
      </form>
    </section>
  );
}
