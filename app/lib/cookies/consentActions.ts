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

function cookieOptions() {
  return {
    httpOnly: false, // readable by consent UI; still first-party and SameSite=Lax
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_CONSENT_MAX_AGE_SEC,
  };
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
  return record;
}
