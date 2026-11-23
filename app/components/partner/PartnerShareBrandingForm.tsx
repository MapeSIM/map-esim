"use client";

import {
  useActionState,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  removePartnerShareLogoAction,
  updatePartnerShareBrandingAction,
  uploadPartnerShareLogoAction,
} from "@/app/lib/partner/partnerShareBrandingActions";
import {
  publicShareLogoSrc,
  SHARE_COMPANY_NAME_MAX,
  type PartnerShareBrandingFields,
} from "@/app/lib/partner/partnerShareBrandingValidate";
import BrandPendingLabel from "@/app/components/loading/BrandPendingLabel";

/** Dummy form so iOS color-picker OK cannot POST the branding Server Action. */
const COLOR_SCRATCH_FORM_ID = "partner-share-branding-color-scratch";

const fieldClass =
  "mt-1 w-full min-w-0 rounded-lg border border-white/[0.1] bg-[#070D19] px-2.5 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-400/40";

const labelClass = "block min-w-0 text-xs font-semibold text-slate-300";

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
  const brandingFormRef = useRef<HTMLFormElement>(null);

  const previewBg = /^#[0-9a-fA-F]{6}$/.test(buttonBackground)
    ? buttonBackground
    : "#84cc16";
  const previewFg = /^#[0-9a-fA-F]{6}$/.test(buttonTextColor)
    ? buttonTextColor
    : "#ffffff";
  const previewLogo = publicShareLogoSrc(logoUrl);
  const previewName = companyName.trim() || "MAP eSIM";

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
      setLogoMessage(logoUrl ? "Logo replaced." : "Logo uploaded.");
    } catch {
      setLogoError("Logo upload is temporarily unavailable.");
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function preventNativeFormPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function submitBranding(form: HTMLFormElement) {
    formAction(new FormData(form));
  }

  function handleColorScratchSubmit(event: FormEvent<HTMLFormElement>) {
    preventNativeFormPost(event);
  }

  function handleColorPickerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.preventDefault();
  }

  function handleBrandingSubmit(event: FormEvent<HTMLFormElement>) {
    preventNativeFormPost(event);
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "color") {
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLInputElement && submitter.type === "color") {
      return;
    }
    submitBranding(event.currentTarget);
  }

  function handleSaveBrandingClick() {
    const form = brandingFormRef.current;
    if (!form) return;
    submitBranding(form);
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
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D1526]">
      <form
        id={COLOR_SCRATCH_FORM_ID}
        method="dialog"
        onSubmit={handleColorScratchSubmit}
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
      />

      <form
        ref={brandingFormRef}
        method="dialog"
        onSubmit={handleBrandingSubmit}
        className="grid lg:grid-cols-2"
      >
        {/* Left: controls */}
        <div className="space-y-4 border-b border-white/[0.06] p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Brand identity
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Shown on shared eSIM install pages only.
            </p>
          </div>

          {/* Logo thumbnail */}
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.1] bg-[#070D19]">
              {previewLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewLogo}
                  alt=""
                  width={56}
                  height={56}
                  className="h-full w-full object-contain p-1.5"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="px-1 text-center text-[10px] leading-tight text-slate-500">
                  No logo
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200">Logo</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                PNG, JPG, WEBP · max 1 MB
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
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={logoBusy}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex h-7 items-center rounded-md border border-white/[0.12] px-2.5 text-[11px] font-semibold text-slate-200 hover:bg-white/[0.04] disabled:opacity-60"
                >
                  {logoBusy
                    ? "…"
                    : previewLogo
                      ? "Replace"
                      : "Upload"}
                </button>
                {previewLogo ? (
                  <button
                    type="button"
                    disabled={logoBusy}
                    onClick={() => void removeLogo()}
                    className="inline-flex h-7 items-center rounded-md border border-rose-500/30 px-2.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {logoMessage ? (
                <p className="mt-1 text-[11px] text-slate-400" role="status">
                  {logoMessage}
                </p>
              ) : null}
              {logoError ? (
                <p className="mt-1 text-[11px] text-rose-300" role="alert">
                  {logoError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Company Name
              <input
                name="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={SHARE_COMPANY_NAME_MAX}
                autoComplete="organization"
                className={fieldClass}
              />
              <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                {companyName.length}/{SHARE_COMPANY_NAME_MAX}
              </span>
            </label>
            <label className={labelClass}>
              Support Email
              <input
                name="supportEmail"
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                maxLength={254}
                autoComplete="email"
                className={fieldClass}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Company Website URL
              <input
                name="websiteUrl"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                maxLength={2048}
                placeholder="https://"
                autoComplete="url"
                className={fieldClass}
              />
            </label>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Button styling
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Button Background
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    form={COLOR_SCRATCH_FORM_ID}
                    value={
                      /^#[0-9a-fA-F]{6}$/.test(buttonBackground)
                        ? buttonBackground
                        : "#84cc16"
                    }
                    onChange={(e) => setButtonBackground(e.target.value)}
                    onKeyDown={handleColorPickerKeyDown}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-white/[0.1] bg-[#070D19]"
                    aria-label="Pick button background"
                  />
                  <input
                    name="buttonBackground"
                    value={buttonBackground}
                    onChange={(e) => setButtonBackground(e.target.value)}
                    placeholder="#84cc16"
                    maxLength={7}
                    className={`${fieldClass} !mt-0`}
                  />
                </div>
              </label>
              <label className={labelClass}>
                Button Text Color
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    form={COLOR_SCRATCH_FORM_ID}
                    value={
                      /^#[0-9a-fA-F]{6}$/.test(buttonTextColor)
                        ? buttonTextColor
                        : "#ffffff"
                    }
                    onChange={(e) => setButtonTextColor(e.target.value)}
                    onKeyDown={handleColorPickerKeyDown}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-white/[0.1] bg-[#070D19]"
                    aria-label="Pick button text color"
                  />
                  <input
                    name="buttonTextColor"
                    value={buttonTextColor}
                    onChange={(e) => setButtonTextColor(e.target.value)}
                    placeholder="#ffffff"
                    maxLength={7}
                    className={`${fieldClass} !mt-0`}
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
            <div className="min-w-0 text-xs">
              {!state.ok ? (
                <p className="text-rose-300" role="alert">
                  {state.error}
                </p>
              ) : state.saved ? (
                <p
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300"
                  role="status"
                >
                  Branding saved
                </p>
              ) : (
                <p className="text-slate-500">
                  Save to apply branding to share pages.
                </p>
              )}
            </div>
            <button
              type="button"
              data-branding-save="true"
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={handleSaveBrandingClick}
              className="inline-flex h-9 items-center rounded-lg bg-emerald-500 px-3.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? (
                <BrandPendingLabel label="Saving…" />
              ) : (
                "Save Branding"
              )}
            </button>
          </div>
        </div>

        {/* Right: live preview */}
        <div className="flex flex-col bg-[#070D19]/60 p-4 sm:p-5">
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Live preview
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Compact view of the shared eSIM page.
            </p>
          </div>

          <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0D1526] shadow-lg shadow-black/30">
            {/* Brand header */}
            <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-[#070D19]">
                {previewLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewLogo}
                    alt=""
                    width={32}
                    height={32}
                    className="h-full w-full object-contain p-0.5"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-[9px] font-bold text-emerald-400">
                    M
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-50">
                  {previewName}
                </p>
                <p className="truncate text-[10px] text-slate-500">
                  {supportEmail.trim() || "support@example.com"}
                </p>
              </div>
            </div>

            <div className="space-y-2.5 px-3 py-3 text-center">
              <div>
                <p className="text-sm font-bold text-slate-100">Sample Plan</p>
                <p className="text-[11px] text-slate-500">Sample destination</p>
              </div>
              <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                Ready to install
              </span>
              <div
                className="mx-auto h-16 w-16 rounded-lg border border-white/[0.08] bg-white p-1.5"
                aria-hidden="true"
              >
                <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#111_0_3px,transparent_3px_6px),repeating-linear-gradient(0deg,#111_0_3px,transparent_3px_6px)] opacity-80" />
              </div>
              <button
                type="button"
                tabIndex={-1}
                className="inline-flex h-8 w-full items-center justify-center rounded-lg text-xs font-bold"
                style={{ backgroundColor: previewBg, color: previewFg }}
              >
                Install eSIM
              </button>
              {websiteUrl.trim() ? (
                <p className="truncate text-[10px] text-slate-500">
                  {websiteUrl.trim()}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
