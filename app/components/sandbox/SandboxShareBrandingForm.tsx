"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  readSandboxShareBranding,
  writeSandboxShareBranding,
  SANDBOX_DEFAULT_BUTTON_BG,
  SANDBOX_DEFAULT_BUTTON_FG,
  SANDBOX_LOGO_MAX_BYTES,
  type SandboxShareBranding,
} from "@/app/lib/sandbox/sandboxClientStorage";
import { SHARE_COMPANY_NAME_MAX } from "@/app/lib/partner/partnerShareBrandingValidate";

const COLOR_SCRATCH_FORM_ID = "sandbox-share-branding-color-scratch";

const fieldClass =
  "mt-1 w-full min-w-0 rounded-lg border border-white/[0.1] bg-[#070D19] px-2.5 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-400/40";

const labelClass = "block min-w-0 text-xs font-semibold text-slate-300";

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
const LOGO_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image."));
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

export default function SandboxShareBrandingForm() {
  const [hydrated, setHydrated] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [buttonBackground, setButtonBackground] = useState(
    SANDBOX_DEFAULT_BUTTON_BG
  );
  const [buttonTextColor, setButtonTextColor] = useState(
    SANDBOX_DEFAULT_BUTTON_FG
  );
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = readSandboxShareBranding();
    setCompanyName(saved.companyName);
    setSupportEmail(saved.supportEmail);
    setLogoUrl(saved.logoUrl);
    setButtonBackground(saved.buttonBackground);
    setButtonTextColor(saved.buttonTextColor);
    setHydrated(true);
  }, []);

  const previewBg = HEX6.test(buttonBackground)
    ? buttonBackground
    : SANDBOX_DEFAULT_BUTTON_BG;
  const previewFg = HEX6.test(buttonTextColor)
    ? buttonTextColor
    : SANDBOX_DEFAULT_BUTTON_FG;
  const previewName = companyName.trim() || "MAP Partner Co";

  function preventNativeFormPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleColorPickerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.preventDefault();
  }

  function persistPartial(
    patch: Partial<SandboxShareBranding>
  ): SandboxShareBranding {
    const current = readSandboxShareBranding();
    return writeSandboxShareBranding({
      companyName: patch.companyName ?? current.companyName,
      supportEmail: patch.supportEmail ?? current.supportEmail,
      logoUrl:
        patch.logoUrl !== undefined ? patch.logoUrl : current.logoUrl,
      buttonBackground: patch.buttonBackground ?? current.buttonBackground,
      buttonTextColor: patch.buttonTextColor ?? current.buttonTextColor,
    });
  }

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    setLogoError(null);
    setLogoMessage(null);
    setError(null);
    try {
      if (!LOGO_MIME.has(file.type)) {
        setLogoError("Logo must be a PNG, JPG, or WEBP image.");
        return;
      }
      if (file.size > SANDBOX_LOGO_MAX_BYTES) {
        setLogoError("Logo must be 1 MB or smaller.");
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      const next = persistPartial({ logoUrl: dataUrl });
      if (!next.logoUrl) {
        setLogoError("Logo could not be saved in this browser.");
        return;
      }
      setLogoUrl(next.logoUrl);
      setLogoMessage("Logo uploaded.");
    } catch {
      setLogoError("Logo upload failed. Try a smaller PNG, JPG, or WEBP.");
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeLogo() {
    setLogoBusy(true);
    setLogoError(null);
    setLogoMessage(null);
    try {
      persistPartial({ logoUrl: null });
      setLogoUrl(null);
      setLogoMessage("Logo removed.");
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function saveBranding() {
    setError(null);
    const name = companyName.trim();
    if (!name) {
      setError("Enter a company name.");
      return;
    }
    if (name.length > SHARE_COMPANY_NAME_MAX) {
      setError(
        `Company name must be ${SHARE_COMPANY_NAME_MAX} characters or fewer.`
      );
      return;
    }
    const email = supportEmail.trim();
    if (
      email &&
      !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)
    ) {
      setError("Enter a valid support email, or leave it blank.");
      return;
    }
    if (!HEX6.test(buttonBackground) || !HEX6.test(buttonTextColor)) {
      setError("Button colors must be hex values like #84cc16.");
      return;
    }

    const next = writeSandboxShareBranding({
      companyName: name,
      supportEmail: email || "support@example.com",
      logoUrl,
      buttonBackground: buttonBackground.toLowerCase(),
      buttonTextColor: buttonTextColor.toLowerCase(),
    });
    setCompanyName(next.companyName);
    setSupportEmail(next.supportEmail);
    setLogoUrl(next.logoUrl);
    setButtonBackground(next.buttonBackground);
    setButtonTextColor(next.buttonTextColor);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2500);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    preventNativeFormPost(event);
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "color") {
      return;
    }
    saveBranding();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D1526]">
      <form
        id={COLOR_SCRATCH_FORM_ID}
        method="dialog"
        onSubmit={preventNativeFormPost}
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
      />

      <form
        method="dialog"
        onSubmit={handleSubmit}
        className={`grid lg:grid-cols-2 ${hydrated ? "" : "opacity-70"}`}
      >
        <div className="space-y-4 border-b border-white/[0.06] p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Brand identity
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Shown on shared eSIM install pages only.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.1] bg-[#070D19]">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="h-full w-full object-contain p-1.5"
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
                accept={LOGO_ACCEPT}
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
                  {logoBusy ? "…" : logoUrl ? "Replace" : "Upload"}
                </button>
                {logoUrl ? (
                  <button
                    type="button"
                    disabled={logoBusy}
                    onClick={removeLogo}
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
                      HEX6.test(buttonBackground)
                        ? buttonBackground
                        : SANDBOX_DEFAULT_BUTTON_BG
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
                    placeholder={SANDBOX_DEFAULT_BUTTON_BG}
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
                      HEX6.test(buttonTextColor)
                        ? buttonTextColor
                        : SANDBOX_DEFAULT_BUTTON_FG
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
                    placeholder={SANDBOX_DEFAULT_BUTTON_FG}
                    maxLength={7}
                    className={`${fieldClass} !mt-0`}
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
            <div className="min-w-0 text-xs">
              {error ? (
                <p className="text-rose-300" role="alert">
                  {error}
                </p>
              ) : savedFlash ? (
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
              type="submit"
              className="inline-flex h-9 items-center rounded-lg bg-emerald-500 px-3.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Save Branding
            </button>
          </div>
        </div>

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
            <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-[#070D19]">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt=""
                    width={32}
                    height={32}
                    className="h-full w-full object-contain p-0.5"
                  />
                ) : (
                  <span className="text-[9px] font-bold text-emerald-400">
                    {(previewName[0] || "M").toUpperCase()}
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
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
