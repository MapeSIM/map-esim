"use client";

import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";
import TawkChat from "@/app/components/support/TawkChat";

/**
 * Central gate for optional third-party scripts.
 * Integrations load only inside the matching consent branch.
 */
export default function ConsentScriptGate() {
  const { consent, canLoad } = useCookieConsent();

  // Essential site code loads from the normal app bundle — never gated here.

  if (!consent) {
    return null;
  }

  if (canLoad("preferences")) {
    // Preference cookies (theme/currency) are handled elsewhere — no scripts here.
  }

  if (canLoad("analytics")) {
    // Future: analytics scripts only after analytics consent.
  }

  const marketingAllowed = canLoad("marketing");

  return (
    <>
      {/* Live chat: marketing consent + public-route allowlist + env configuration. */}
      <TawkChat enabledByConsent={marketingAllowed} />
    </>
  );
}
