import {
  DEFAULT_CURRENCY,
  isCurrencyCode,
  type CurrencyCode,
} from "@/app/lib/currency/currencies";

/** Consent-gated optional preference cookies (not essential). */
export const THEME_PREFERENCE_COOKIE = "mapesim_theme_preference";
export const CURRENCY_PREFERENCE_COOKIE = "mapesim_currency_preference";

/** ~6 months — aligned with consent cookie lifetime. */
export const PREFERENCE_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 183;

export const THEME_PREFERENCES = ["dark", "light", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Default when Preferences consent is absent or value is invalid. */
export const DEFAULT_THEME: ThemePreference = "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

export function parseThemePreferenceCookie(
  raw: string | undefined | null
): ThemePreference | null {
  if (!raw || typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return isThemePreference(v) ? v : null;
}

export function parseCurrencyPreferenceCookie(
  raw: string | undefined | null
): CurrencyCode | null {
  if (!raw || typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  return isCurrencyCode(v) ? v : null;
}

export function resolveServerThemePreference(
  preferencesAllowed: boolean,
  cookieRaw: string | undefined | null
): ThemePreference {
  if (!preferencesAllowed) return DEFAULT_THEME;
  return parseThemePreferenceCookie(cookieRaw) ?? DEFAULT_THEME;
}

export function resolveServerCurrencyPreference(
  preferencesAllowed: boolean,
  cookieRaw: string | undefined | null
): CurrencyCode {
  if (!preferencesAllowed) return DEFAULT_CURRENCY;
  return parseCurrencyPreferenceCookie(cookieRaw) ?? DEFAULT_CURRENCY;
}

/**
 * SSR html class. System preference is unknown on the server — use dark
 * (matches DEFAULT_THEME) until the client resolves prefers-color-scheme.
 */
export function themePreferenceToHtmlClass(
  theme: ThemePreference
): "dark" | "light" {
  if (theme === "light") return "light";
  return "dark";
}

export function preferenceCookieWriteOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PREFERENCE_COOKIE_MAX_AGE_SEC,
  };
}
