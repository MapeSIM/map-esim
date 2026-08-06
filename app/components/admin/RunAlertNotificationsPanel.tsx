"use client";

import { useActionState } from "react";
import {
  runAlertNotificationsAction,
  type RunAlertNotificationsFormState,
} from "@/app/lib/admin/alertNotificationActions";
import { ALERT_NOTIFICATION_CONFIRM_PHRASE } from "@/app/lib/admin/alertNotificationShared";

export function RunAlertNotificationsPanel() {
  const [state, action, pending] = useActionState<
    RunAlertNotificationsFormState,
    FormData
  >(runAlertNotificationsAction, null);

  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4"
      aria-labelledby="run-alert-notifications-heading"
    >
      <h2
        id="run-alert-notifications-heading"
        className="text-base font-semibold tracking-tight text-[var(--heading)]"
      >
        Run alert notifications
      </h2>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Manually evaluate eligible CRITICAL / allowlisted HIGH alerts and deliver
        evidence-safe emails via the support channel. Does not run on page load.
        Pausing Alert notification emails blocks sends only.
      </p>
      <form action={action} className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-[var(--heading)]">
          Confirmation phrase
          <input
            name="confirmPhrase"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={ALERT_NOTIFICATION_CONFIRM_PHRASE}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)]"
            required
          />
        </label>
        <p className="text-[11px] text-[var(--text-soft)]">
          Type {ALERT_NOTIFICATION_CONFIRM_PHRASE} exactly.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent-strong)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Running…" : "Run alert notifications"}
        </button>
      </form>
      {state?.ok ? (
        <p className="mt-3 text-sm text-[var(--accent-strong)]" role="status">
          Run complete — eligible {state.counts?.eligible ?? 0}, sent{" "}
          {state.counts?.sent ?? 0}, suppressed {state.counts?.suppressed ?? 0},
          cooldown {state.counts?.cooldown ?? 0}, failed {state.counts?.failed ?? 0},
          recovery {state.counts?.recovery ?? 0}
          {state.snapshotComplete === false ? " (incomplete snapshot)" : ""}.
        </p>
      ) : null}
      {state && !state.ok ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {state.error ?? "Unable to run alert notifications."}
        </p>
      ) : null}
    </section>
  );
}
