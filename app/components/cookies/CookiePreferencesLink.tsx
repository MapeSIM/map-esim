"use client";

import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";

export default function CookiePreferencesLink({
  className = "transition hover:text-[var(--accent-strong)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60",
}: {
  className?: string;
}) {
  const { openPreferences } = useCookieConsent();

  return (
    <button type="button" onClick={openPreferences} className={className}>
      Cookie Preferences
    </button>
  );
}
