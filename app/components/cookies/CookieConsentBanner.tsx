"use client";

import Link from "next/link";
import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";

/**
 * Compact floating cookie consent card (mobile + desktop).
 * Visual redesign only — actions/handlers unchanged.
 * Outer shell is positioning-only; the navy card itself never spans edge-to-edge.
 * z-40 stays above WhatsApp (z-30) and typical Tawk chrome while visible.
 */
export default function CookieConsentBanner({ pending }: { pending: boolean }) {
  const {
    bannerVisible,
    preferencesOpen,
    acceptAll,
    rejectNonEssential,
    openPreferences,
  } = useCookieConsent();

  // Hide while preferences panel is open to avoid competing dialogs.
  if (!bannerVisible || preferencesOpen) {
    return null;
  }

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7cff00]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a2838]";

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40"
      role="presentation"
      aria-hidden={false}
    >
      <div
        className="pointer-events-auto absolute left-1/2 w-[calc(100%-32px)] max-w-[800px] -translate-x-1/2 rounded-2xl border border-[#1e5470] bg-[#0a2838] p-3 shadow-[0_16px_48px_rgba(2,8,23,0.55)] bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-5 sm:p-3.5"
        role="region"
        aria-label="Cookie consent"
      >
        <div className="flex flex-col gap-2.5 sm:gap-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-white">
              Your privacy choices
            </p>
            <p className="mt-1 text-[13px] leading-snug text-[#b8c9d6] sm:mt-1 sm:text-[13px] sm:leading-snug">
              MAP eSIM uses essential cookies for login, security and core
              website functions. With your permission, we may also use optional
              cookies for preferences, analytics or marketing.{" "}
              <Link
                href="/cookie-policy"
                className="font-medium text-[#7cff00] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7cff00]/70"
              >
                Cookie Policy
              </Link>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => void rejectNonEssential()}
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-[#2f6f90] bg-[#071e2e] px-2.5 text-[13px] font-semibold text-white transition hover:border-[#3d84a8] hover:bg-[#082433] disabled:opacity-60 sm:min-h-10 sm:px-3 sm:text-sm ${focusRing}`}
              >
                Reject non-essential
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void acceptAll()}
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-[#7cff00]/50 bg-[#071e2e] px-2.5 text-[13px] font-semibold text-[#eaffd6] transition hover:border-[#7cff00]/75 hover:bg-[#0a2f20] disabled:opacity-60 sm:min-h-10 sm:px-3 sm:text-sm ${focusRing}`}
              >
                Accept all
              </button>
            </div>

            <button
              type="button"
              disabled={pending}
              onClick={openPreferences}
              className={`mx-auto inline-flex min-h-8 items-center justify-center rounded-lg px-2.5 text-xs font-medium text-[#9fe870] underline-offset-2 hover:underline disabled:opacity-60 sm:min-h-8 sm:text-[13px] ${focusRing}`}
            >
              Manage preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
