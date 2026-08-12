"use client";

import { useEffect, useState } from "react";
import {
  buildAppleEsimInstallUrl,
  shouldShowAppleOneTapSafariGuidance,
  supportsAppleOneTapEsimInstall,
} from "@/app/lib/install/appleEsimInstall";

export type AppleOneTapClientState = {
  /** Direct Apple install URL — only set for supported iPhone Safari. */
  href: string | null;
  /** Supported iPhone OS in a non-Safari browser — guide user to Safari. */
  showSafariGuidance: boolean;
};

/**
 * Client-only one-tap state from an authorized LPA string.
 * Builds the Apple URL locally — never via a MAP redirect or query param.
 * Never returns an Apple href outside supported iPhone Safari.
 */
export function useAppleOneTapInstallState(
  activationLpa: string | null | undefined
): AppleOneTapClientState {
  const [state, setState] = useState<AppleOneTapClientState>({
    href: null,
    showSafariGuidance: false,
  });

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    const url = buildAppleEsimInstallUrl(activationLpa);
    if (!url) {
      setState({ href: null, showSafariGuidance: false });
      return;
    }
    if (supportsAppleOneTapEsimInstall(ua)) {
      setState({ href: url, showSafariGuidance: false });
      return;
    }
    if (shouldShowAppleOneTapSafariGuidance(ua)) {
      setState({ href: null, showSafariGuidance: true });
      return;
    }
    setState({ href: null, showSafariGuidance: false });
  }, [activationLpa]);

  return state;
}

type Props = {
  href: string;
  label?: string;
  className?: string;
};

/** Presentational Install eSIM control; parent supplies a direct Apple href. */
export default function AppleOneTapInstallButton({
  href,
  label = "Install eSIM",
  className = "inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]",
}: Props) {
  return (
    <div className="space-y-2">
      <a href={href} className={className}>
        {label}
      </a>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        Available on iPhone with iOS 17.4 or later. Apple will ask you to
        confirm before installing. Use Safari for one-tap install.
      </p>
    </div>
  );
}

export function AppleOneTapSafariGuidance() {
  return (
    <div
      className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3"
      role="status"
    >
      <p className="text-sm font-semibold text-[var(--heading)]">
        Open this page in Safari for One-Tap Install
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
        Available on iPhone with iOS 17.4 or later. You can still install with
        the QR code or manual details below.
      </p>
    </div>
  );
}
