"use client";

import { useState } from "react";
import Link from "next/link";
import AppleOneTapInstallButton, {
  AppleOneTapSafariGuidance,
} from "@/app/components/install/AppleOneTapInstallButton";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import ManualInstallSheet from "@/app/components/install/ManualInstallSheet";
import {
  INSTALL_SHEET_STEPS_GENERIC,
  INSTALL_SHEET_STEPS_IPHONE,
  ONE_TAP_FALLBACK,
} from "@/app/lib/install/progressiveInstallCopy";

type Props = {
  appleOneTapHref: string | null;
  showSafariOneTapGuidance: boolean;
  qrViewHref?: string | null;
  qrDataUrl?: string | null;
  smdpAddress?: string | null;
  activationCode?: string | null;
  lpa?: string | null;
  iphoneGuideHref?: string;
  androidGuideHref?: string;
};

export default function InstallEsimSheet({
  appleOneTapHref,
  showSafariOneTapGuidance,
  qrViewHref,
  qrDataUrl,
  smdpAddress,
  activationCode,
  lpa,
  iphoneGuideHref = "/install/iphone",
  androidGuideHref = "/install/android",
}: Props) {
  const [open, setOpen] = useState(false);
  const eligibleIphone = Boolean(appleOneTapHref);
  const qrSrc = qrViewHref || qrDataUrl || null;
  const steps = eligibleIphone
    ? INSTALL_SHEET_STEPS_IPHONE
    : INSTALL_SHEET_STEPS_GENERIC;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] outline-none transition hover:bg-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        Install eSIM
      </button>
      <EsimActionSheet
        open={open}
        title="Install eSIM"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-4">
          {qrSrc ? (
            <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
              {/* data URL or authorized partner QR route */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt="eSIM installation QR code"
                width={240}
                height={240}
                className="mx-auto h-auto w-full max-w-[220px]"
              />
            </div>
          ) : null}

          {eligibleIphone ? (
            <AppleOneTapInstallButton
              href={appleOneTapHref!}
              label="One-Tap Install eSIM"
            />
          ) : null}

          {showSafariOneTapGuidance && !eligibleIphone ? (
            <AppleOneTapSafariGuidance />
          ) : null}

          {eligibleIphone ? (
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              {ONE_TAP_FALLBACK}
            </p>
          ) : null}

          <ol className="space-y-2">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm text-[var(--text)]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/20 text-xs font-bold text-[var(--heading)]">
                  {index + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <div className="grid gap-2">
            <ManualInstallSheet
              smdpAddress={smdpAddress}
              activationCode={activationCode}
              lpa={lpa}
            />
            {eligibleIphone ? (
              <Link
                href={iphoneGuideHref}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                Installation Guide
              </Link>
            ) : (
              <Link
                href={androidGuideHref}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                Android Guide
              </Link>
            )}
          </div>
        </div>
      </EsimActionSheet>
    </>
  );
}
