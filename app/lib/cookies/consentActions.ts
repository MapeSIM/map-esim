"use server";

import { cookies } from "next/headers";
import {
  COOKIE_CONSENT_MAX_AGE_SEC,
  COOKIE_CONSENT_NAME,
  createConsentRecord,
  parseCookieConsent,
  serializeCookieConsent,
  type CookieConsentRecord,
} from "@/app/lib/cookies/consent";
import {
  CURRENCY_PREFERENCE_COOKIE,
  THEME_PREFERENCE_COOKIE,
} from "@/app/lib/cookies/preferenceCookies";

function cookieOptions() {
  return {
    httpOnly: false, // readable by consent UI; still first-party and SameSite=Lax
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_CONSENT_MAX_AGE_SEC,
  };
}

function clearOptionalPreferenceCookies(
  jar: Awaited<ReturnType<typeof cookies>>
): void {
  jar.delete(THEME_PREFERENCE_COOKIE);
  jar.delete(CURRENCY_PREFERENCE_COOKIE);
}

export async function getServerCookieConsent(): Promise<CookieConsentRecord | null> {
  const jar = await cookies();
  return parseCookieConsent(jar.get(COOKIE_CONSENT_NAME)?.value);
}

export async function saveCookieConsentAction(input: {
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
}): Promise<CookieConsentRecord> {
  const record = createConsentRecord({
    preferences: Boolean(input.preferences),
    analytics: Boolean(input.analytics),
    marketing: Boolean(input.marketing),
  });

  const jar = await cookies();
  jar.set(COOKIE_CONSENT_NAME, serializeCookieConsent(record), cookieOptions());

  // Optional preference cookies may exist only with Preferences consent.
  if (!record.preferences) {
    clearOptionalPreferenceCookies(jar);
  }

  return record;
}
