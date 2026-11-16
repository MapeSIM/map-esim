"use client";

import { useState, type FormEvent } from "react";
import {
  type RunAlertNotificationsFormState,
} from "@/app/lib/admin/alertNotificationActions";
import { ALERT_NOTIFICATION_CONFIRM_PHRASE } from "@/app/lib/admin/alertNotificationShared";

/** Under route maxDuration=60; leave a small client buffer. */
const CLIENT_RUN_TIMEOUT_MS = 55_000;

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
 * Posts to `/api/admin/operations/alert-notifications` (maxDuration=60) so Vercel
 * does not kill the run at the default 10s serverless limit.
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
    const confirmPhrase = String(formData.get("confirmPhrase") ?? "");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      CLIENT_RUN_TIMEOUT_MS
    );

    try {
      const res = await fetch("/api/admin/operations/alert-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPhrase }),
        signal: controller.signal,
        credentials: "same-origin",
      });

      let payload: RunAlertNotificationsFormState = null;
      try {
        payload = (await res.json()) as RunAlertNotificationsFormState;
      } catch {
        payload = null;
      }

      if (!payload || typeof payload.ok !== "boolean") {
        setState({
          ok: false,
          error: "Unable to run alert notifications. Please try again.",
          sentCount: 0,
          skippedCount: 0,
          remainingCount: 0,
          processedCount: 0,
          aggregationMs: 0,
          sendMs: 0,
        });
        return;
      }

      setState(payload);
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "AbortError" || error.message === "CLIENT_TIMEOUT");
      setState({
        ok: false,
        error: timedOut
          ? "Alert notification run timed out on the client. The server may still be finishing — wait a moment before retrying."
          : "Unable to run alert notifications. Please try again.",
        sentCount: 0,
        skippedCount: 0,
        remainingCount: 0,
        processedCount: 0,
        aggregationMs: 0,
        sendMs: 0,
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
        Pausing Alert notification emails blocks sends only. Processes up to 3
        alerts per click (local DB aggregation only — no provider HTTP).
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
          {state.progressMessage
            ? `${state.progressMessage}. `
            : null}
          Completed: {sentFromState(state)} sent, {skippedFromState(state)}{" "}
          skipped
          {state.counts
            ? ` (eligible ${state.counts.eligible}, failed ${state.counts.failed}, recovery ${state.counts.recovery}${
                typeof state.remainingCount === "number" &&
                state.remainingCount > 0
                  ? `, remaining ${state.remainingCount}`
                  : ""
              })`
            : ""}
          {typeof state.aggregationMs === "number" ||
          typeof state.sendMs === "number"
            ? ` · timing aggregation ${state.aggregationMs ?? 0}ms / send ${state.sendMs ?? 0}ms / processed ${state.processedCount ?? 0}`
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
          {state.progressMessage ? ` ${state.progressMessage}.` : null}
          {typeof state.aggregationMs === "number" ||
          typeof state.sendMs === "number"
            ? ` (aggregation ${state.aggregationMs ?? 0}ms / send ${state.sendMs ?? 0}ms / processed ${state.processedCount ?? 0})`
            : null}
        </p>
      ) : null}
    </section>
  );
}
