"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  readSandboxShareBranding,
  writeSandboxShareBranding,
  SANDBOX_DEFAULT_BUTTON_BG,
  SANDBOX_DEFAULT_BUTTON_FG,
  type SandboxShareBranding,
} from "@/app/lib/sandbox/sandboxClientStorage";
import { SHARE_COMPANY_NAME_MAX } from "@/app/lib/partner/partnerShareBrandingValidate";

const COLOR_SCRATCH_FORM_ID = "sandbox-share-branding-color-scratch";

const fieldClass =
  "mt-1 w-full min-w-0 rounded-lg border border-white/[0.1] bg-[#070D19] px-2.5 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-400/40";

const labelClass = "block min-w-0 text-xs font-semibold text-slate-300";

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export default function SandboxShareBrandingForm() {
  const [hydrated, setHydrated] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [buttonBackground, setButtonBackground] = useState(
    SANDBOX_DEFAULT_BUTTON_BG
  );
  const [buttonTextColor, setButtonTextColor] = useState(
    SANDBOX_DEFAULT_BUTTON_FG
  );
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const saved = readSandboxShareBranding();
    setCompanyName(saved.companyName);
    setSupportEmail(saved.supportEmail);
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

  function saveBranding() {
    setError(null);
    const name = companyName.trim();
    if (!name) {
      setError("Enter a company name.");
      return;
    }
    if (name.length > SHARE_COMPANY_NAME_MAX) {
      setError(`Company name must be ${SHARE_COMPANY_NAME_MAX} characters or fewer.`);
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

    const next: SandboxShareBranding = writeSandboxShareBranding({
      companyName: name,
      supportEmail: email || "support@example.com",
      buttonBackground: buttonBackground.toLowerCase(),
      buttonTextColor: buttonTextColor.toLowerCase(),
    });
    setCompanyName(next.companyName);
    setSupportEmail(next.supportEmail);
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
                <span className="text-[9px] font-bold text-emerald-400">
                  {(previewName[0] || "M").toUpperCase()}
                </span>
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
