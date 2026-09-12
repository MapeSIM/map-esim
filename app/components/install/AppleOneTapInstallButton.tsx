"use client";

import { useEffect, useState } from "react";
import {
  buildAppleEsimInstallUrl,
  shouldShowAppleOneTapSafariGuidance,
} from "@/app/lib/install/appleEsimInstall";
import { canAttemptAppleNativeEsimInstall } from "@/app/lib/install/smartEsimInstall";

export type AppleOneTapClientState = {
  /** Direct Apple install URL — iPhone iOS 17.4+, any browser. */
  href: string | null;
  /** Optional Safari reliability hint — does not hide or block install. */
  showSafariGuidance: boolean;
};

/**
 * Client-only Apple install URL from an authorized LPA string.
 * Builds the Apple URL locally — never via a MAP redirect or query param.
 * Does not hide the URL from Chrome/Edge on supported iPhone OS.
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
    if (!url || !canAttemptAppleNativeEsimInstall(ua)) {
      setState({ href: null, showSafariGuidance: false });
      return;
    }
    setState({
      href: url,
      showSafariGuidance: shouldShowAppleOneTapSafariGuidance(ua),
    });
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
        confirm before installing. If automatic install does not open, use
        QR code or manual setup.
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
        Safari is usually the most reliable iPhone browser for automatic
        install
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
        Available on iPhone with iOS 17.4 or later. If automatic install does
        not open, use the QR code or manual details.
      </p>
    </div>
  );
}
