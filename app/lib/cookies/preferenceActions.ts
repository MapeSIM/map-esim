"use server";

import { cookies } from "next/headers";
import {
  COOKIE_CONSENT_NAME,
  parseCookieConsent,
} from "@/app/lib/cookies/consent";
import {
  CURRENCY_PREFERENCE_COOKIE,
  isThemePreference,
  preferenceCookieWriteOptions,
  THEME_PREFERENCE_COOKIE,
} from "@/app/lib/cookies/preferenceCookies";
import { isCurrencyCode } from "@/app/lib/currency/currencies";

async function preferencesConsentGranted(): Promise<boolean> {
  const jar = await cookies();
  const consent = parseCookieConsent(jar.get(COOKIE_CONSENT_NAME)?.value);
  return Boolean(consent?.preferences);
}

/** Write validated theme preference only when Preferences consent is true. */
export async function setThemePreferenceAction(
  theme: string
): Promise<{ ok: boolean }> {
  if (!isThemePreference(theme)) return { ok: false };
  if (!(await preferencesConsentGranted())) return { ok: false };

  const jar = await cookies();
  jar.set(THEME_PREFERENCE_COOKIE, theme, preferenceCookieWriteOptions());
  return { ok: true };
}

/** Write validated currency preference only when Preferences consent is true. */
export async function setCurrencyPreferenceAction(
  currency: string
): Promise<{ ok: boolean }> {
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (!isCurrencyCode(code)) return { ok: false };
  if (!(await preferencesConsentGranted())) return { ok: false };

  const jar = await cookies();
  jar.set(CURRENCY_PREFERENCE_COOKIE, code, preferenceCookieWriteOptions());
  return { ok: true };
}

/** Delete optional preference cookies. Does not touch consent decision cookie. */
export async function clearOptionalPreferenceCookiesAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(THEME_PREFERENCE_COOKIE);
  jar.delete(CURRENCY_PREFERENCE_COOKIE);
}
