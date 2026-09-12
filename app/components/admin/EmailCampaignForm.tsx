"use client";

import { useActionState } from "react";
import {
  createEmailCampaignAction,
  type EmailCampaignActionState,
} from "@/app/lib/admin/emailCampaignActions";
import {
  EMAIL_CAMPAIGN_AUDIENCE_HELP,
  EMAIL_CAMPAIGN_AUDIENCES,
  EMAIL_CAMPAIGN_BODY_MAX,
  EMAIL_CAMPAIGN_SUBJECT_MAX,
  emailCampaignAudienceLabel,
} from "@/app/lib/admin/emailCampaignShared";

export default function EmailCampaignForm() {
  const [state, action, pending] = useActionState<
    EmailCampaignActionState,
    FormData
  >(createEmailCampaignAction, null);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label
          htmlFor="campaign-subject"
          className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Subject
        </label>
        <input
          id="campaign-subject"
          name="subject"
          type="text"
          required
          maxLength={EMAIL_CAMPAIGN_SUBJECT_MAX}
          className="mt-1 w-full rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)]"
        />
        {state && !state.ok && state.fieldErrors?.subject ? (
          <p className="mt-1 text-sm text-red-700 dark:text-red-300" role="alert">
            {state.fieldErrors.subject}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="campaign-body"
          className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Email content
        </label>
        <textarea
          id="campaign-body"
          name="bodyText"
          required
          rows={10}
          maxLength={EMAIL_CAMPAIGN_BODY_MAX}
          className="mt-1 w-full rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)]"
        />
        {state && !state.ok && state.fieldErrors?.bodyText ? (
          <p className="mt-1 text-sm text-red-700 dark:text-red-300" role="alert">
            {state.fieldErrors.bodyText}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="campaign-audience"
          className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Audience
        </label>
        <select
          id="campaign-audience"
          name="audience"
          required
          defaultValue="ALL_CUSTOMERS"
          className="mt-1 w-full rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)]"
        >
          {EMAIL_CAMPAIGN_AUDIENCES.map((audience) => (
            <option key={audience} value={audience}>
              {emailCampaignAudienceLabel(audience)}
            </option>
          ))}
        </select>
        <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
          {EMAIL_CAMPAIGN_AUDIENCES.map((audience) => (
            <li key={audience}>
              <strong>{emailCampaignAudienceLabel(audience)}:</strong>{" "}
              {EMAIL_CAMPAIGN_AUDIENCE_HELP[audience]}
            </li>
          ))}
        </ul>
        {state && !state.ok && state.fieldErrors?.audience ? (
          <p className="mt-1 text-sm text-red-700 dark:text-red-300" role="alert">
            {state.fieldErrors.audience}
          </p>
        ) : null}
      </div>

      {state && !state.ok ? (
        <p className="text-sm font-medium text-red-700 dark:text-red-300" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center rounded-[12px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Create campaign"}
      </button>
    </form>
  );
}
