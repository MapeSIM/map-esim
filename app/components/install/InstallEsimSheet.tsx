"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import ManualInstallSheet from "@/app/components/install/ManualInstallSheet";
import {
  INSTALL_SHEET_STEPS_GENERIC,
  ONE_TAP_FALLBACK,
} from "@/app/lib/install/progressiveInstallCopy";
import {
  AUTOMATIC_INSTALL_UNAVAILABLE_BODY,
  AUTOMATIC_INSTALL_UNAVAILABLE_TITLE,
  DEVICE_COMPATIBILITY_HREF,
  launchSmartEsimInstallPath,
  resolveSmartEsimInstallFromLpa,
  scheduleNativeHandoffFallback,
  SMART_INSTALL_BUTTON_LABEL,
} from "@/app/lib/install/smartEsimInstall";

type Props = {
  appleOneTapHref?: string | null;
  showSafariOneTapGuidance?: boolean;
  qrViewHref?: string | null;
  qrDataUrl?: string | null;
  smdpAddress?: string | null;
  activationCode?: string | null;
  lpa?: string | null;
  iphoneOfficialHref?: string | null;
  androidOfficialHref?: string | null;
  iphoneGuideHref?: string;
  androidGuideHref?: string;
};

export default function InstallEsimSheet({
  qrViewHref,
  qrDataUrl,
  smdpAddress,
  activationCode,
  lpa,
  iphoneOfficialHref,
  androidOfficialHref,
  iphoneGuideHref = "/install/iphone",
  androidGuideHref = "/install/android",
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const qrSrc = qrViewHref || qrDataUrl || null;
  const steps = INSTALL_SHEET_STEPS_GENERIC;
  const cancelHandoffRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cancelHandoffRef.current?.();
    };
  }, []);

  async function onInstall() {
    if (pending) return;
    cancelHandoffRef.current?.();
    setPending(true);
    try {
      const path = resolveSmartEsimInstallFromLpa({
        userAgent:
          typeof navigator === "undefined" ? "" : navigator.userAgent,
        activationLpa: lpa,
        iphoneOfficialHref,
        androidOfficialHref,
      });
      if (launchSmartEsimInstallPath(path) === "fallback") {
        setOpen(true);
        return;
      }
      cancelHandoffRef.current = scheduleNativeHandoffFallback(() => {
        setOpen(true);
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onInstall()}
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] outline-none transition hover:bg-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Preparing…" : SMART_INSTALL_BUTTON_LABEL}
      </button>
      <EsimActionSheet
        open={open}
        title="Install eSIM"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-4">
          <div role="status">
            <p className="text-sm font-semibold text-[var(--heading)]">
              {AUTOMATIC_INSTALL_UNAVAILABLE_TITLE}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
              {AUTOMATIC_INSTALL_UNAVAILABLE_BODY}
            </p>
          </div>

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

          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            {ONE_TAP_FALLBACK}
          </p>

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
            {qrSrc ? (
              <a
                href={qrSrc}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] outline-none hover:bg-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                View QR Code
              </a>
            ) : null}
            <ManualInstallSheet
              smdpAddress={smdpAddress}
              activationCode={activationCode}
              lpa={lpa}
              label="Manual Installation"
            />
            <Link
              href={DEVICE_COMPATIBILITY_HREF}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              Check Device Compatibility
            </Link>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                href={iphoneGuideHref}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                iPhone Guide
              </Link>
              <Link
                href={androidGuideHref}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                Android Guide
              </Link>
            </div>
          </div>
        </div>
      </EsimActionSheet>
    </>
  );
}
