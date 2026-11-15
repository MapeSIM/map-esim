"use client";

import { useState, type FormEvent } from "react";
import {
  runAlertNotificationsAction,
  type RunAlertNotificationsFormState,
} from "@/app/lib/admin/alertNotificationActions";
import { ALERT_NOTIFICATION_CONFIRM_PHRASE } from "@/app/lib/admin/alertNotificationShared";

const CLIENT_RUN_TIMEOUT_MS = 15_000;

function skippedFromState(state: NonNullable<RunAlertNotificationsFormState>): number {
  if (typeof state.skippedCount === "number") return state.skippedCount;
  const counts = state.counts;
  if (!counts) return 0;
  return counts.suppressed + counts.cooldown;
}

function sentFromState(state: NonNullable<RunAlertNotificationsFormState>): number {
  if (typeof state.sentCount === "number") return state.sentCount;
  return state.counts?.sent ?? 0;
}

/**
 * Manual alert-notification runner.
 * Local `running` + hard 15s client timeout so the button never sticks on Running…
 * even if the server action hangs or the connection drops mid-flight.
 */
export function RunAlertNotificationsPanel() {
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<RunAlertNotificationsFormState>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setState(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_RUN_TIMEOUT_MS);

    try {
      const actionPromise = runAlertNotificationsAction(null, formData);
      const timeoutPromise = new Promise<never>((_, reject) => {
        const onAbort = () => {
          reject(new Error("CLIENT_TIMEOUT"));
        };
        if (controller.signal.aborted) {
          onAbort();
          return;
        }
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });

      const result = await Promise.race([actionPromise, timeoutPromise]);
      setState(result);
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.message === "CLIENT_TIMEOUT" || error.name === "AbortError");
      setState({
        ok: false,
        error: timedOut
          ? "Alert notification run timed out after 15 seconds. The server may still be finishing — wait a moment before retrying."
          : "Unable to run alert notifications. Please try again.",
        sentCount: 0,
        skippedCount: 0,
      });
    } finally {
      window.clearTimeout(timeoutId);
      if (!controller.signal.aborted) {
        controller.abort();
      }
      setRunning(false);
    }
  }

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
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-[var(--heading)]">
          Confirmation phrase
          <input
            name="confirmPhrase"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={ALERT_NOTIFICATION_CONFIRM_PHRASE}
            disabled={running}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] disabled:opacity-60"
            required
          />
        </label>
        <p className="text-[11px] text-[var(--text-soft)]">
          Type {ALERT_NOTIFICATION_CONFIRM_PHRASE} exactly.
        </p>
        <button
          type="submit"
          disabled={running}
          aria-busy={running || undefined}
          className="rounded-lg bg-[var(--accent-strong)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {running ? "Running…" : "Run alert notifications"}
        </button>
      </form>

      {state?.ok ? (
        <p
          className="mt-3 rounded-lg border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 px-3 py-2 text-sm text-[var(--heading)]"
          role="status"
        >
          Completed: {sentFromState(state)} sent, {skippedFromState(state)}{" "}
          skipped
          {state.counts
            ? ` (eligible ${state.counts.eligible}, failed ${state.counts.failed}, recovery ${state.counts.recovery})`
            : ""}
          {state.snapshotComplete === false ? " — incomplete snapshot" : ""}.
        </p>
      ) : null}

      {state && !state.ok ? (
        <p
          className="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
          role="alert"
        >
          {state.error ?? "Unable to run alert notifications."}
        </p>
      ) : null}
    </section>
  );
}
