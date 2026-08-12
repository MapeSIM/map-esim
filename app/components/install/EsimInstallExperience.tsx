"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  Info,
  Smartphone,
  Wifi,
} from "lucide-react";
import AppleOneTapInstallButton, {
  AppleOneTapSafariGuidance,
} from "@/app/components/install/AppleOneTapInstallButton";

const INSTALL_STEPS = [
  "Tap Install eSIM / One-Tap Install",
  "Review and confirm on your device",
  "Wait for activation to finish",
  "Enable or select this eSIM for mobile data",
  "Turn on data roaming for this eSIM",
] as const;

const INSTALL_TIPS = [
  "Install over a stable Wi-Fi connection",
  "Your eSIM may activate when you reach your destination",
  "Keep your physical SIM active if you still need that number",
  "Turn on data roaming for this eSIM line after install",
] as const;

export type EsimInstallExperienceProps = {
  appleOneTapHref: string | null;
  /** Supported iPhone OS in non-Safari — show open-in-Safari guidance, no Apple href. */
  showSafariOneTapGuidance?: boolean;
  hasOfficialIphoneActivationUrl?: boolean;
  iphoneInstallHref?: string | null;
  iphoneGuideHref?: string;
  androidGuideHref?: string;
  androidActivationUrl?: string | null;
  hasVerifiedLpa?: boolean;
  qrViewHref?: string | null;
  qrDownloadHref?: string | null;
  smdpAddress?: string | null;
  activationCode?: string | null;
  lpa?: string | null;
  /** Only pass when already authorized for this surface (e.g. masked on /success). */
  iccid?: string | null;
  manualInstallText?: string | null;
};

export default function EsimInstallExperience({
  appleOneTapHref,
  showSafariOneTapGuidance = false,
  hasOfficialIphoneActivationUrl,
  iphoneInstallHref,
  iphoneGuideHref = "/install/iphone",
  androidGuideHref = "/install/android",
  androidActivationUrl,
  hasVerifiedLpa,
  qrViewHref,
  qrDownloadHref,
  smdpAddress,
  activationCode,
  lpa,
  iccid,
  manualInstallText,
}: EsimInstallExperienceProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setCopiedKey(null);
    }
  }

  // Never launch Apple activation URLs outside supported iPhone Safari.
  const showOfficialIphone = Boolean(
    !appleOneTapHref &&
      !showSafariOneTapGuidance &&
      hasOfficialIphoneActivationUrl &&
      iphoneInstallHref
  );
  const showQr = Boolean(hasVerifiedLpa && qrViewHref);
  const hasManual = Boolean(smdpAddress || activationCode || lpa || iccid);

  return (
    <div className="space-y-5">
      {showQr ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
          <Image
            src={qrViewHref!}
            alt="MAP eSIM installation QR code"
            width={320}
            height={320}
            unoptimized
            className="mx-auto h-auto w-full max-w-[280px] sm:max-w-[320px]"
          />
        </div>
      ) : null}

      <div className="space-y-3">
        {appleOneTapHref ? (
          <AppleOneTapInstallButton
            href={appleOneTapHref}
            label="One-Tap Install eSIM"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          />
        ) : null}

        {showSafariOneTapGuidance && !appleOneTapHref ? (
          <AppleOneTapSafariGuidance />
        ) : null}

        {showOfficialIphone ? (
          <div className="space-y-2">
            <a
              href={iphoneInstallHref!}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              Install eSIM
            </a>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              Follow Apple’s confirmation steps to finish installation.
            </p>
          </div>
        ) : null}

        {!appleOneTapHref &&
        !showOfficialIphone &&
        !showSafariOneTapGuidance ? (
          <Link
            href={iphoneGuideHref}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            View iPhone installation guide
          </Link>
        ) : null}

        <p className="text-sm leading-relaxed text-[var(--text-muted)]">
          If one-tap does not work, use manual install or the QR code.
        </p>
      </div>

      {hasManual ? (
        <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-[var(--accent-strong)]" />
            <h3 className="text-sm font-bold text-[var(--heading)]">
              Manual installation details
            </h3>
          </div>
          <p className="text-xs text-[var(--text-soft)]">
            Or install using QR code / manual details
          </p>
          {smdpAddress ? (
            <CopyRow
              label="SM-DP+ address"
              value={smdpAddress}
              copied={copiedKey === "smdp"}
              onCopy={() => void copyText("smdp", smdpAddress)}
            />
          ) : null}
          {activationCode ? (
            <CopyRow
              label="Activation code"
              value={activationCode}
              copied={copiedKey === "activation"}
              onCopy={() => void copyText("activation", activationCode)}
            />
          ) : null}
          {lpa ? (
            <CopyRow
              label="LPA / full activation value"
              value={lpa}
              copied={copiedKey === "lpa"}
              onCopy={() => void copyText("lpa", lpa)}
            />
          ) : null}
          {iccid ? (
            <CopyRow
              label="ICCID"
              value={iccid}
              copied={copiedKey === "iccid"}
              onCopy={() => void copyText("iccid", iccid)}
            />
          ) : null}
          {manualInstallText ? (
            <button
              type="button"
              onClick={() => void copyText("manual-all", manualInstallText)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              <Copy className="h-4 w-4" />
              {copiedKey === "manual-all"
                ? "Copied installation details"
                : "Copy all manual details"}
            </button>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {hasVerifiedLpa && qrDownloadHref ? (
          <a
            href={qrDownloadHref}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <Download className="h-4 w-4" />
            Download QR Code
          </a>
        ) : null}
        {androidActivationUrl ? (
          <a
            href={androidActivationUrl}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Open Android activation link
          </a>
        ) : null}
        <Link
          href={androidGuideHref}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:col-span-2"
        >
          View Android installation guide
        </Link>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <h3 className="text-sm font-bold text-[var(--heading)]">
          Installation guide
        </h3>
        <ol className="mt-3 space-y-2.5">
          {INSTALL_STEPS.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm text-[var(--text)]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/20 text-xs font-bold text-[var(--heading)]">
                {index + 1}
              </span>
              <span className="pt-0.5 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-3)]/60 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-[var(--accent-strong)]" />
          <h3 className="text-sm font-bold text-[var(--heading)]">
            Important tips
          </h3>
        </div>
        <ul className="mt-3 space-y-2.5">
          {INSTALL_TIPS.map((tip) => (
            <li
              key={tip}
              className="flex gap-2.5 text-sm leading-relaxed text-[var(--text)]"
            >
              {tip.startsWith("Install over") ? (
                <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
              )}
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          {label}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--accent-strong)] transition hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 break-all text-sm font-medium text-[var(--heading)]">
        {value}
      </p>
    </div>
  );
}
