"use client";

import Link from "next/link";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import ManualInstallSheet from "@/app/components/install/ManualInstallSheet";
import {
  AUTOMATIC_INSTALL_HANDOFF_BODY,
  AUTOMATIC_INSTALL_HANDOFF_TITLE,
  AUTOMATIC_INSTALL_UNAVAILABLE_BODY,
  AUTOMATIC_INSTALL_UNAVAILABLE_TITLE,
  DEVICE_COMPATIBILITY_HREF,
} from "@/app/lib/install/smartEsimInstall";

type Props = {
  open: boolean;
  onClose: () => void;
  variant?: "unavailable" | "handoff";
  qrViewHref?: string | null;
  smdpAddress?: string | null;
  activationCode?: string | null;
  lpa?: string | null;
  iphoneGuideHref?: string;
  androidGuideHref?: string;
};

export default function SmartInstallFallbackSheet({
  open,
  onClose,
  variant = "unavailable",
  qrViewHref,
  smdpAddress,
  activationCode,
  lpa,
  iphoneGuideHref = "/install/iphone",
  androidGuideHref = "/install/android",
}: Props) {
  const hasQr = Boolean(qrViewHref);
  const hasManual = Boolean(smdpAddress || activationCode || lpa);
  const title =
    variant === "handoff"
      ? AUTOMATIC_INSTALL_HANDOFF_TITLE
      : AUTOMATIC_INSTALL_UNAVAILABLE_TITLE;
  const body =
    variant === "handoff"
      ? AUTOMATIC_INSTALL_HANDOFF_BODY
      : AUTOMATIC_INSTALL_UNAVAILABLE_BODY;

  return (
    <EsimActionSheet open={open} title="Install eSIM" onClose={onClose}>
      <div className="space-y-4">
        <div role="status">
          <p className="text-sm font-semibold text-[var(--heading)]">
            {title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
            {body}
          </p>
        </div>

        {hasQr ? (
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
            {/* authorized install QR route or data URL */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrViewHref!}
              alt="eSIM installation QR code"
              width={240}
              height={240}
              className="mx-auto h-auto w-full max-w-[220px]"
            />
          </div>
        ) : null}

        <div className="grid gap-2">
          {hasQr ? (
            <a
              href={qrViewHref!}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] outline-none hover:bg-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              View QR Code
            </a>
          ) : null}
          {hasManual ? (
            <ManualInstallSheet
              smdpAddress={smdpAddress}
              activationCode={activationCode}
              lpa={lpa}
              label="Manual Installation"
            />
          ) : null}
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
  );
}
