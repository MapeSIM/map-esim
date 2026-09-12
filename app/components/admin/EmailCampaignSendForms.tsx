"use client";

import { useActionState } from "react";
import {
  sendEmailCampaignBulkAction,
  sendEmailCampaignTestAction,
  type EmailCampaignActionState,
} from "@/app/lib/admin/emailCampaignActions";
import { EMAIL_CAMPAIGN_CONFIRM_PHRASE } from "@/app/lib/admin/emailCampaignShared";

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

export function EmailCampaignBulkSendForm({
  campaignId,
  recipientCount,
  mode,
}: {
  campaignId: string;
  recipientCount: number;
  mode: "start" | "continue";
}) {
  const [state, action, pending] = useActionState<
    EmailCampaignActionState,
    FormData
  >(sendEmailCampaignBulkAction, null);

  return (
    <form action={action} className="space-y-3">
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
          <strong>{recipientCount}</strong> customers.
        </p>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          Continue the confirmed send. Remaining recipients are processed in
          batches.
        </p>
      )}
      <button
        type="submit"
        disabled={pending || (mode === "start" && recipientCount <= 0)}
        className="inline-flex h-10 items-center rounded-[12px] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending
          ? "Sending…"
          : mode === "continue"
            ? "Continue sending"
            : `Send to ${recipientCount} customers`}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}
