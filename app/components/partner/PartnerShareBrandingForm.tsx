"use client";

import { useActionState, useState } from "react";
import { updatePartnerShareBrandingAction } from "@/app/lib/partner/partnerShareBrandingActions";
import type { PartnerShareBrandingFields } from "@/app/lib/partner/partnerShareBrandingValidate";

const inputClass =
  "mt-1 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]";

export default function PartnerShareBrandingForm({
  initial,
}: {
  initial: PartnerShareBrandingFields;
}) {
  const [state, formAction, pending] = useActionState(
    updatePartnerShareBrandingAction,
    { ok: true, branding: initial, saved: false }
  );
  const saved = state.ok ? state.branding : initial;
  const [companyName, setCompanyName] = useState(saved.companyName ?? "");
  const [supportEmail, setSupportEmail] = useState(saved.supportEmail ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(saved.websiteUrl ?? "");
  const [logoUrl, setLogoUrl] = useState(saved.logoUrl ?? "");
  const [buttonBackground, setButtonBackground] = useState(
    saved.buttonBackground ?? ""
  );
  const [buttonTextColor, setButtonTextColor] = useState(
    saved.buttonTextColor ?? ""
  );

  const previewBg = /^#[0-9a-fA-F]{6}$/.test(buttonBackground)
    ? buttonBackground
    : "var(--accent-strong)";
  const previewFg = /^#[0-9a-fA-F]{6}$/.test(buttonTextColor)
    ? buttonTextColor
    : "var(--accent-ink)";

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-medium text-[var(--heading)]">
          Company Name
          <input
            name="companyName"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            maxLength={80}
            autoComplete="organization"
            className={inputClass}
          />
        </label>
        <label className="min-w-0 text-sm font-medium text-[var(--heading)]">
          Support Email
          <input
            name="supportEmail"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            maxLength={254}
            autoComplete="email"
            className={inputClass}
          />
        </label>
        <label className="min-w-0 text-sm font-medium text-[var(--heading)] sm:col-span-2">
          Company Website URL
          <input
            name="websiteUrl"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            maxLength={2048}
            placeholder="https://"
            autoComplete="url"
            className={inputClass}
          />
        </label>
        <label className="min-w-0 text-sm font-medium text-[var(--heading)] sm:col-span-2">
          Logo
          <input
            name="logoUrl"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            maxLength={2048}
            placeholder="https://mapesim.com/brand/your-logo.png"
            className={inputClass}
          />
          <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">
            HTTPS image URL only. Share pages show MAP-hosted logos; other URLs
            stay off the public share page.
          </span>
        </label>
        <label className="min-w-0 text-sm font-medium text-[var(--heading)]">
          Button Background Color
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(buttonBackground) ? buttonBackground : "#84ff00"}
              onChange={(e) => setButtonBackground(e.target.value)}
              className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)]"
              aria-label="Pick button background"
            />
            <input
              name="buttonBackground"
              value={buttonBackground}
              onChange={(e) => setButtonBackground(e.target.value)}
              placeholder="#84ff00"
              maxLength={7}
              className={inputClass + " mt-0"}
            />
          </div>
        </label>
        <label className="min-w-0 text-sm font-medium text-[var(--heading)]">
          Button Text Color
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(buttonTextColor) ? buttonTextColor : "#102018"}
              onChange={(e) => setButtonTextColor(e.target.value)}
              className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)]"
              aria-label="Pick button text color"
            />
            <input
              name="buttonTextColor"
              value={buttonTextColor}
              onChange={(e) => setButtonTextColor(e.target.value)}
              placeholder="#102018"
              maxLength={7}
              className={inputClass + " mt-0"}
            />
          </div>
        </label>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          Preview
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--heading)]">
          {companyName.trim() || "MAP eSIM"}
        </p>
        <button
          type="button"
          tabIndex={-1}
          className="mt-3 inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold"
          style={{ backgroundColor: previewBg, color: previewFg }}
        >
          Check usage
        </button>
      </div>

      {!state.ok ? (
        <p className="text-sm text-[var(--danger-text)]" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.saved ? (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          Share branding saved. Existing share links stay valid.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] outline-none hover:bg-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Saving…" : "Save Branding"}
      </button>
    </form>
  );
}
