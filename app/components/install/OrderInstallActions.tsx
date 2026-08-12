"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Copy, Download, Eye, Smartphone } from "lucide-react";
import AppleOneTapInstallButton, {
  useAppleOneTapInstallHref,
} from "@/app/components/install/AppleOneTapInstallButton";

export type OrderInstallActionsProps = {
  hasInstallDetails?: boolean;
  hasVerifiedLpa?: boolean;
  hasOfficialIphoneActivationUrl?: boolean;
  iphoneInstallHref?: string;
  iphoneGuideHref?: string;
  qrDownloadHref?: string;
  qrViewHref?: string;
  androidGuideHref?: string;
  androidActivationUrl?: string;
  manualInstallText?: string;
  smdpAddress?: string;
  activationCode?: string;
  qrValue?: string;
  iccid?: string;
};

export default function OrderInstallActions({
  hasInstallDetails,
  hasVerifiedLpa,
  hasOfficialIphoneActivationUrl,
  iphoneInstallHref,
  iphoneGuideHref = "/install/iphone",
  qrDownloadHref,
  qrViewHref,
  androidGuideHref = "/install/android",
  androidActivationUrl,
  manualInstallText,
  smdpAddress,
  activationCode,
  qrValue,
  iccid,
}: OrderInstallActionsProps) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const appleOneTapHref = useAppleOneTapInstallHref(qrValue);

  if (!hasInstallDetails) {
    return null;
  }

  async function copyInstallDetails() {
    if (!manualInstallText) return;
    try {
      await navigator.clipboard.writeText(manualInstallText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  // Provider official URL via MAP redirect — only when one-tap LPA path is unavailable.
  const showIphoneButton = Boolean(
    !appleOneTapHref && hasOfficialIphoneActivationUrl && iphoneInstallHref
  );
  const showQrActions = Boolean(hasVerifiedLpa && (qrDownloadHref || qrViewHref));

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
          <div>
            <h2 className="text-base font-bold text-[var(--heading)]">
              Install your eSIM
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Actions below use verified server-side order data only. One-tap
              Install eSIM appears on supported iPhones when a complete
              activation value is available.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {appleOneTapHref ? (
            <AppleOneTapInstallButton
              href={appleOneTapHref}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-strong)] text-sm font-bold text-[var(--accent-ink)] transition hover:brightness-105"
            />
          ) : null}

          {showIphoneButton && (
            <>
              <a
                href={iphoneInstallHref}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-strong)] text-sm font-bold text-[var(--accent-ink)] transition hover:brightness-105"
              >
                Install on iPhone
              </a>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                On iOS 17.4 or later, tap the button and follow Apple’s Allow /
                Continue confirmation steps.
              </p>
            </>
          )}

          {!appleOneTapHref && !showIphoneButton && (
            <Link
              href={iphoneGuideHref}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40"
            >
              View iPhone Installation Guide
            </Link>
          )}

          {appleOneTapHref ? (
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Or install using QR code / manual details
            </p>
          ) : null}

          {showQrActions && !appleOneTapHref && (
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              On iOS 17.4 or later, you can also press and hold the QR code in
              Mail or Safari and select Add eSIM.
            </p>
          )}

          {showQrActions && qrDownloadHref && (
            <a
              href={qrDownloadHref}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40"
            >
              <Download className="h-4 w-4" />
              Download QR Code
            </a>
          )}

          {showQrActions && qrViewHref && (
            <button
              type="button"
              onClick={() => setShowQr((value) => !value)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40"
            >
              <Eye className="h-4 w-4" />
              {showQr ? "Hide QR Code" : "View QR Code"}
            </button>
          )}

          {showQr && qrViewHref && (
            <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
              <Image
                src={qrViewHref}
                alt="eSIM installation QR code"
                width={280}
                height={280}
                unoptimized
                className="mx-auto h-auto w-[280px] max-w-full"
              />
            </div>
          )}

          {showQrActions && (
            <a
              href={qrDownloadHref || qrViewHref}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40"
            >
              <Download className="h-4 w-4" />
              Download QR for Android
            </a>
          )}

          {androidActivationUrl ? (
            <a
              href={androidActivationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40"
            >
              Open Android activation link
            </a>
          ) : (
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              Android does not offer a universal one-click install for this order.
              Download the QR and follow the Android guide.
            </p>
          )}

          <Link
            href={androidGuideHref}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40"
          >
            View Android Installation Guide
          </Link>

          {manualInstallText && (
            <button
              type="button"
              onClick={copyInstallDetails}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40"
            >
              <Copy className="h-4 w-4" />
              {copied
                ? "Copied installation details"
                : "Copy Manual Installation Details"}
            </button>
          )}
        </div>
      </div>

      {(smdpAddress || activationCode || qrValue || iccid) && (
        <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 text-sm">
          <p className="font-bold text-[var(--heading)]">
            Manual installation fallback
          </p>
          {smdpAddress && (
            <p className="break-all text-[var(--text)]">
              SM-DP+ address: <b>{smdpAddress}</b>
            </p>
          )}
          {activationCode && (
            <p className="break-all text-[var(--text)]">
              Activation code: <b>{activationCode}</b>
            </p>
          )}
          {qrValue && (
            <p className="break-all text-[var(--text)]">
              Complete LPA installation value: <b>{qrValue}</b>
            </p>
          )}
          {iccid && (
            <p className="break-all text-[var(--text)]">
              ICCID: <b>{iccid}</b>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
