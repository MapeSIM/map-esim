"use client";

import Link from "next/link";
import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";

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

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-strong)] bg-[var(--surface)]/95 p-4 shadow-[var(--shadow-strong)] backdrop-blur-md sm:p-5"
      role="region"
      aria-label="Cookie consent"
    >
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
        <div className="max-w-[65ch]">
          <p className="text-sm font-semibold text-[var(--heading)]">
            Your privacy choices
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
            MAP eSIM uses essential cookies for login, security and core website
            functions. With your permission, we may also use optional cookies for
            preferences, analytics or marketing.{" "}
            <Link
              href="/cookie-policy"
              className="font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Cookie Policy
            </Link>
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={pending}
            onClick={() => void rejectNonEssential()}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60 sm:min-w-[160px]"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void acceptAll()}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60 sm:min-w-[160px]"
          >
            Accept all
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={openPreferences}
            className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60 sm:min-w-[160px]"
          >
            Manage preferences
          </button>
        </div>
      </div>
    </div>
  );
}
