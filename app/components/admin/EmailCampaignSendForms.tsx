"use client";

import { useActionState, useEffect, useRef, type RefObject } from "react";
import {
  resendEmailCampaignFailedAction,
  sendEmailCampaignBulkAction,
  sendEmailCampaignTestAction,
  type EmailCampaignActionState,
} from "@/app/lib/admin/emailCampaignActions";
import {
  EMAIL_CAMPAIGN_CONFIRM_PHRASE,
  EMAIL_CAMPAIGN_RESEND_FAILED_PHRASE,
} from "@/app/lib/admin/emailCampaignShared";

function ActionMessage({ state }: { state: EmailCampaignActionState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="text-sm font-medium text-[var(--accent-strong)]" role="status">
        {state.message}
      </p>
    );
  }
  return (
    <p className="text-sm font-medium text-red-700 dark:text-red-300" role="alert">
      {state.error}
    </p>
  );
}

export function EmailCampaignTestForm({
  campaignId,
  defaultTestEmail,
}: {
  campaignId: string;
  defaultTestEmail: string;
}) {
  const [state, action, pending] = useActionState<
    EmailCampaignActionState,
    FormData
  >(sendEmailCampaignTestAction, null);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        Test recipient
        <input
          name="testEmail"
          type="email"
          required
          defaultValue={defaultTestEmail}
          className="mt-1 w-full rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)]"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] disabled:opacity-60"
      >
        {pending ? "Sending test…" : "Send test email"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

/** Auto-continues while the last success reported remaining recipients. */
function useAutoContinueQueue(options: {
  state: EmailCampaignActionState;
  pending: boolean;
  formRef: RefObject<HTMLFormElement | null>;
  batchDelayMs: number;
}) {
  useEffect(() => {
    if (!options.state?.ok) return;
    if (options.pending) return;
    const remaining = options.state.remaining ?? 0;
    if (remaining <= 0) return;
    const form = options.formRef.current;
    if (!form) return;
    const timer = window.setTimeout(() => {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.submit();
      }
    }, Math.max(0, options.batchDelayMs));
    return () => window.clearTimeout(timer);
  }, [options.state, options.pending, options.formRef, options.batchDelayMs]);
}

export function EmailCampaignBulkSendForm({
  campaignId,
  recipientCount,
  mode,
  batchDelayMs,
  autoStart = false,
}: {
  campaignId: string;
  recipientCount: number;
  mode: "start" | "continue";
  batchDelayMs: number;
  /** When true (continue mode), kick the queue once on mount. */
  autoStart?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const autoStarted = useRef(false);
  const [state, action, pending] = useActionState<
    EmailCampaignActionState,
    FormData
  >(sendEmailCampaignBulkAction, null);

  useAutoContinueQueue({
    state,
    pending,
    formRef,
    batchDelayMs,
  });

  useEffect(() => {
    if (!autoStart || mode !== "continue" || autoStarted.current) return;
    if (pending || state) return;
    const form = formRef.current;
    if (!form) return;
    autoStarted.current = true;
    const timer = window.setTimeout(() => {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.submit();
      }
    }, Math.max(0, batchDelayMs));
    return () => window.clearTimeout(timer);
  }, [autoStart, mode, pending, state, batchDelayMs]);

  const queueing =
    pending || Boolean(state?.ok && (state.remaining ?? 0) > 0);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input
        type="hidden"
        name="expectedRecipientCount"
        value={String(recipientCount)}
      />
      {mode === "start" ? (
        <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          Confirmation phrase
          <input
            name="confirmPhrase"
            type="text"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder={EMAIL_CAMPAIGN_CONFIRM_PHRASE}
            className="mt-1 w-full rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)]"
          />
        </label>
      ) : (
        <input type="hidden" name="confirmPhrase" value="" />
      )}
      {mode === "start" ? (
        <p className="text-xs text-[var(--text-muted)]">
          Type {EMAIL_CAMPAIGN_CONFIRM_PHRASE} exactly to send to{" "}
          <strong>{recipientCount}</strong> customers. Batches queue
          automatically with a {batchDelayMs}ms pause between runs to protect
          SMTP limits.
        </p>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          Queued send continues automatically ({batchDelayMs}ms between runs).
          You can leave this page open until pending recipients reach zero.
        </p>
      )}
      <button
        type="submit"
        disabled={
          pending || queueing || (mode === "start" && recipientCount <= 0)
        }
        className="inline-flex h-10 items-center rounded-[12px] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {queueing
          ? "Sending queue…"
          : mode === "continue"
            ? "Resume send queue"
            : `Send to ${recipientCount} customers`}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function EmailCampaignResendFailedForm({
  campaignId,
  failedCount,
  batchDelayMs,
}: {
  campaignId: string;
  failedCount: number;
  batchDelayMs: number;
}) {
  const [state, action, pending] = useActionState<
    EmailCampaignActionState,
    FormData
  >(resendEmailCampaignFailedAction, null);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        Confirmation phrase
        <input
          name="confirmPhrase"
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder={EMAIL_CAMPAIGN_RESEND_FAILED_PHRASE}
          className="mt-1 w-full rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)]"
        />
      </label>
      <p className="text-xs text-[var(--text-muted)]">
        Type {EMAIL_CAMPAIGN_RESEND_FAILED_PHRASE} exactly. Only{" "}
        <strong>{failedCount}</strong> failed recipients are re-queued. Already
        sent emails are never resent. Batches use a {batchDelayMs}ms delay
        (override with EMAIL_CAMPAIGN_BATCH_DELAY_MS).
      </p>
      <button
        type="submit"
        disabled={pending || failedCount <= 0}
        className="inline-flex h-10 items-center rounded-[12px] border border-red-700/40 bg-red-700/10 px-4 text-sm font-semibold text-red-800 dark:text-red-200 disabled:opacity-60"
      >
        {pending ? "Resending failed…" : "Resend Failed"}
      </button>
      <ActionMessage state={state} />
      {state?.ok && (state.remaining ?? 0) > 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          {state.remaining} still pending — the send queue below will continue
          automatically.
        </p>
      ) : null}
    </form>
  );
}
