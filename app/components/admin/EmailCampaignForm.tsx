"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createEmailCampaignAction,
  type EmailCampaignActionState,
} from "@/app/lib/admin/emailCampaignActions";
import {
  EMAIL_CAMPAIGN_AUDIENCE_HELP,
  EMAIL_CAMPAIGN_AUDIENCES,
  EMAIL_CAMPAIGN_BODY_MAX,
  EMAIL_CAMPAIGN_SELECTABLE_TEMPLATES,
  EMAIL_CAMPAIGN_SUBJECT_MAX,
  EMAIL_CAMPAIGN_TEMPLATE_PRESETS,
  emailCampaignAudienceLabel,
  parseEmailCampaignTemplateKey,
  type EmailCampaignTemplateKey,
} from "@/app/lib/admin/emailCampaignShared";

const DEFAULT_TEMPLATE: EmailCampaignTemplateKey = "ANNOUNCEMENT";

export default function EmailCampaignForm() {
  const [state, action, pending] = useActionState<
    EmailCampaignActionState,
    FormData
  >(createEmailCampaignAction, null);

  const [templateKey, setTemplateKey] =
    useState<EmailCampaignTemplateKey>(DEFAULT_TEMPLATE);
  const preset = useMemo(
    () => EMAIL_CAMPAIGN_TEMPLATE_PRESETS[templateKey],
    [templateKey]
  );
  const [subject, setSubject] = useState(preset.defaultSubject);
  const [bodyText, setBodyText] = useState(preset.defaultBody);

  function applyTemplate(nextKey: EmailCampaignTemplateKey) {
    const next = EMAIL_CAMPAIGN_TEMPLATE_PRESETS[nextKey];
    setTemplateKey(nextKey);
    setSubject(next.defaultSubject);
    setBodyText(next.defaultBody);
  }

  return (
    <form action={action} className="space-y-5">
      <div>
        <label
          htmlFor="campaign-template"
          className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
        >
          Template
        </label>
        <select
          id="campaign-template"
          name="templateKey"
          required
          value={templateKey}
          onChange={(event) =>
            applyTemplate(parseEmailCampaignTemplateKey(event.target.value))
          }
          className="mt-1 w-full rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)]"
        >
          {EMAIL_CAMPAIGN_SELECTABLE_TEMPLATES.map((key) => (
            <option key={key} value={key}>
              {EMAIL_CAMPAIGN_TEMPLATE_PRESETS[key].label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {preset.description} Subject and content load from the template and
          stay fully editable.
        </p>
        {state && !state.ok && state.fieldErrors?.templateKey ? (
          <p className="mt-1 text-sm text-red-700 dark:text-red-300" role="alert">
            {state.fieldErrors.templateKey}
          </p>
        ) : null}
      </div>

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
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
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
          value={bodyText}
          onChange={(event) => setBodyText(event.target.value)}
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
