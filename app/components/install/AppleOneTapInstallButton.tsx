"use client";

import { useEffect, useState } from "react";
import {
  buildAppleEsimInstallUrl,
  supportsAppleOneTapEsimInstall,
} from "@/app/lib/install/appleEsimInstall";

/**
 * Client-only: resolve Apple's official one-tap install URL when the device
 * is a supported iPhone and a complete LPA string is available.
 * Builds the URL locally — never via a MAP redirect or query param.
 */
export function useAppleOneTapInstallHref(
  activationLpa: string | null | undefined
): string | null {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!supportsAppleOneTapEsimInstall(navigator.userAgent)) {
      setHref(null);
      return;
    }
    setHref(buildAppleEsimInstallUrl(activationLpa));
  }, [activationLpa]);

  return href;
}

type Props = {
  href: string;
  className?: string;
};

/** Presentational Install eSIM control; parent supplies a direct Apple href. */
export default function AppleOneTapInstallButton({
  href,
  className = "inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]",
}: Props) {
  return (
    <div className="space-y-2">
      <a href={href} className={className}>
        Install eSIM
      </a>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        Available on iPhone with iOS 17.5 or later. Apple will ask you to
        confirm before installing.
      </p>
    </div>
  );
}
