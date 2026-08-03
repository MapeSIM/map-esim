"use client";

import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";

/**
 * Central gate for future optional scripts.
 * No analytics/marketing/preference third-party scripts are loaded today.
 * Add integrations only inside the matching consent branch.
 */
export default function ConsentScriptGate() {
  const { consent, canLoad } = useCookieConsent();

  // Essential site code loads from the normal app bundle — never gated here.

  if (!consent) {
    return null;
  }

  if (canLoad("preferences")) {
    // Future: preference-related optional scripts only.
  }

  if (canLoad("analytics")) {
    // Future: analytics scripts only after analytics consent.
    // Do not add Google Analytics / similar until product confirms and Cookie Policy is updated.
  }

  if (canLoad("marketing")) {
    // Future: marketing pixels only after marketing consent.
    // Do not add Meta Pixel / ads tags until product confirms and Cookie Policy is updated.
  }

  return null;
}
