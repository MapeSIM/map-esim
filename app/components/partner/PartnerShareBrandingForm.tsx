"use client";

import { useActionState, useRef, useState } from "react";
import {
  removePartnerShareLogoAction,
  updatePartnerShareBrandingAction,
  uploadPartnerShareLogoAction,
} from "@/app/lib/partner/partnerShareBrandingActions";
import {
  publicShareLogoSrc,
  type PartnerShareBrandingFields,
} from "@/app/lib/partner/partnerShareBrandingValidate";

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
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [buttonBackground, setButtonBackground] = useState(
    saved.buttonBackground ?? ""
  );
  const [buttonTextColor, setButtonTextColor] = useState(
    saved.buttonTextColor ?? ""
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const previewBg = /^#[0-9a-fA-F]{6}$/.test(buttonBackground)
    ? buttonBackground
    : "var(--accent-strong)";
  const previewFg = /^#[0-9a-fA-F]{6}$/.test(buttonTextColor)
    ? buttonTextColor
    : "var(--accent-ink)";
  const previewLogo = publicShareLogoSrc(logoUrl);

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    setLogoError(null);
    setLogoMessage(null);
    try {
      const data = new FormData();
      data.set("logo", file);
      const result = await uploadPartnerShareLogoAction(data);
      if (!result.ok) {
        setLogoError(result.error);
        return;
      }
      setLogoUrl(result.branding.logoUrl ?? "");
      setLogoMessage(
        logoUrl ? "Logo replaced." : "Logo uploaded."
      );
    } catch {
      setLogoError("Logo upload is temporarily unavailable.");
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    setLogoError(null);
    setLogoMessage(null);
    try {
      const result = await removePartnerShareLogoAction();
      if (!result.ok) {
        setLogoError(result.error);
        return;
      }
      setLogoUrl("");
      setLogoMessage("Logo removed. Share pages will use MAP eSIM branding.");
    } catch {
      setLogoError("Logo could not be removed right now.");
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-medium text-[var(--heading)]">Logo</p>
        {previewLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewLogo}
            alt=""
            width={160}
            height={40}
            className="h-10 w-auto max-w-full object-contain"
            referrerPolicy="no-referrer"
          />
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            No custom logo yet. Share pages use the MAP eSIM logo.
          </p>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          PNG, JPG or WEBP. Max 1 MB.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          className="sr-only"
          aria-label="Upload logo"
          disabled={logoBusy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadLogo(file);
          }}
        />
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={logoBusy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] outline-none hover:bg-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
          >
            {logoBusy
              ? "Uploading…"
              : previewLogo
                ? "Replace Logo"
                : "Upload Logo"}
          </button>
          {previewLogo ? (
            <button
              type="button"
              disabled={logoBusy}
              onClick={() => void removeLogo()}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--danger-border)] px-4 text-sm font-semibold text-[var(--danger-text)] outline-none hover:bg-[var(--danger-bg)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
            >
              Remove Logo
            </button>
          ) : null}
        </div>
        {logoMessage ? (
          <p className="text-sm text-[var(--text-muted)]" role="status">
            {logoMessage}
          </p>
        ) : null}
        {logoError ? (
          <p className="text-sm text-[var(--danger-text)]" role="alert">
            {logoError}
          </p>
        ) : null}
      </div>

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
          <label className="min-w-0 text-sm font-medium text-[var(--heading)]">
            Button Background Color
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <input
                type="color"
                value={
                  /^#[0-9a-fA-F]{6}$/.test(buttonBackground)
                    ? buttonBackground
                    : "#84ff00"
                }
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
                value={
                  /^#[0-9a-fA-F]{6}$/.test(buttonTextColor)
                    ? buttonTextColor
                    : "#102018"
                }
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
          {previewLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewLogo}
              alt=""
              width={160}
              height={40}
              className="mt-3 h-10 w-auto max-w-full object-contain"
              referrerPolicy="no-referrer"
            />
          ) : null}
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
    </div>
  );
}
