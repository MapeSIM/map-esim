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
import {
  partnerCardClass,
  partnerDangerCtaClass,
  partnerFieldClass,
  partnerPrimaryCtaClass,
  partnerSecondaryCtaClass,
  partnerSectionLabelClass,
} from "@/app/components/partner/partnerPortalUi";

const inputClass = partnerFieldClass;

/** Dummy form so iOS color-picker OK cannot POST the branding Server Action. */
const COLOR_SCRATCH_FORM_ID = "partner-share-branding-color-scratch";

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
    <div className="space-y-5">
      <section className={partnerCardClass}>
        <p className={partnerSectionLabelClass}>Brand Identity</p>
        <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--heading)]">
          Logo and company details
        </h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Shown on your shared eSIM installation pages. Public storefront
          branding stays MAP eSIM.
        </p>

        <div className="mt-5 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-24 w-full max-w-[220px] items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4">
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
              <p className="text-center text-sm text-[var(--text-muted)]">
                No custom logo yet. Share pages use the MAP eSIM logo.
              </p>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm font-medium text-[var(--heading)]">Logo</p>
            <p className="text-xs text-[var(--text-muted)]">
              PNG, JPG or WEBP. Max 1 MB. Use a wide logo on a clear background
              for the best result.
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
                className={`${partnerSecondaryCtaClass} sm:w-auto`}
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
                  className={`${partnerDangerCtaClass} sm:w-auto`}
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
        </div>
      </section>

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
        className="space-y-5"
      >
        <section className={partnerCardClass}>
          <p className={partnerSectionLabelClass}>Brand Identity</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-medium text-[var(--heading)]">
              Company Name
              <input
                name="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={SHARE_COMPANY_NAME_MAX}
                autoComplete="organization"
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-[var(--text-muted)]">
                {companyName.length} / {SHARE_COMPANY_NAME_MAX}
              </span>
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
          </div>
        </section>

        <section className={partnerCardClass}>
          <p className={partnerSectionLabelClass}>Button Styling</p>
          <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--heading)]">
            Install button colors
          </h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            These colors apply to the Install eSIM button on your share pages.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-medium text-[var(--heading)]">
              Button Background Color
              <div className="mt-1.5 flex min-w-0 items-center gap-3">
                <input
                  type="color"
                  form={COLOR_SCRATCH_FORM_ID}
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(buttonBackground)
                      ? buttonBackground
                      : "#84ff00"
                  }
                  onChange={(e) => setButtonBackground(e.target.value)}
                  onKeyDown={handleColorPickerKeyDown}
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
                <span
                  className="hidden h-11 w-11 shrink-0 rounded-xl border border-[var(--border)] sm:block"
                  style={{ backgroundColor: previewBg }}
                  aria-hidden="true"
                />
              </div>
            </label>
            <label className="min-w-0 text-sm font-medium text-[var(--heading)]">
              Button Text Color
              <div className="mt-1.5 flex min-w-0 items-center gap-3">
                <input
                  type="color"
                  form={COLOR_SCRATCH_FORM_ID}
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(buttonTextColor)
                      ? buttonTextColor
                      : "#102018"
                  }
                  onChange={(e) => setButtonTextColor(e.target.value)}
                  onKeyDown={handleColorPickerKeyDown}
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
                <span
                  className="hidden h-11 w-11 shrink-0 rounded-xl border border-[var(--border)] sm:block"
                  style={{ backgroundColor: previewFg }}
                  aria-hidden="true"
                />
              </div>
            </label>
          </div>
        </section>

        <section className={partnerCardClass}>
          <p className={`${partnerSectionLabelClass}`}>
            Preview
          </p>
          <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--heading)]">
            Live Preview
          </h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            This is how customers will see your branding on a shared eSIM page.
          </p>
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--page-bg)] px-5 py-6 text-center">
            {previewLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewLogo}
                alt=""
                width={160}
                height={40}
                className="mx-auto h-10 w-auto max-w-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <p className="mt-3 text-lg font-semibold text-[var(--heading)]">
              {companyName.trim() || "MAP eSIM"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Sample destination
            </p>
            <span className="mt-3 inline-flex rounded-full border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 px-3 py-1 text-xs font-semibold text-[var(--heading)]">
              Ready to install
            </span>
            <div
              className="mx-auto mt-4 h-[120px] w-[120px] rounded-xl border border-[var(--border)] bg-white p-3"
              aria-hidden="true"
            >
              <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#111_0_6px,transparent_6px_12px),repeating-linear-gradient(0deg,#111_0_6px,transparent_6px_12px)] opacity-80" />
            </div>
            <button
              type="button"
              tabIndex={-1}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold"
              style={{ backgroundColor: previewBg, color: previewFg }}
            >
              Install eSIM
            </button>
          </div>
        </section>

        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {!state.ok ? (
              <p className="text-sm text-[var(--danger-text)]" role="alert">
                {state.error}
              </p>
            ) : null}
            {state.ok && state.saved ? (
              <p className="text-sm text-[var(--text-muted)]" role="status">
                Share branding saved. Existing share links stay valid.
              </p>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Save to apply these colors and company details to share pages.
              </p>
            )}
          </div>
          <button
            type="button"
            data-branding-save="true"
            disabled={pending}
            onClick={handleSaveBrandingClick}
            className={`${partnerPrimaryCtaClass} sm:w-auto`}
          >
            {pending ? "Saving…" : "Save Branding"}
          </button>
        </div>
      </form>
    </div>
  );
}
