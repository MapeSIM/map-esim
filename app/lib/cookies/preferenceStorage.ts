import { CURRENCY_STORAGE_KEY } from "@/app/lib/currency/currencies";
import { DEFAULT_THEME } from "@/app/lib/cookies/preferenceCookies";

export { DEFAULT_THEME };

/** Legacy next-themes / prior localStorage keys — never used for initial state. */
export const THEME_STORAGE_KEY = "theme";
export const LEGACY_THEME_SESSION_KEY = "mapesim-theme-session";

export const CURRENCY_RESET_EVENT = "map-esim-currency-reset";
export const PREFERENCES_GRANTED_EVENT = "map-esim-preferences-granted";

const LEGACY_OPTIONAL_STORAGE_KEYS = new Set([
  CURRENCY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  LEGACY_THEME_SESSION_KEY,
]);

let preferencePersistenceAllowed = false;
let guardInstalled = false;

export function setPreferencePersistenceAllowed(allowed: boolean): void {
  preferencePersistenceAllowed = allowed;
}

export function isPreferencePersistenceAllowed(): boolean {
  return preferencePersistenceAllowed;
}

/**
 * Block durable theme/currency localStorage writes/reads.
 * Persistence is cookie-based; this only prevents legacy key revival.
 */
export function installPreferenceStorageGuard(): void {
  if (typeof window === "undefined" || guardInstalled) return;

  const storage = window.localStorage;
  const rawSetItem = storage.setItem.bind(storage);
  const rawGetItem = storage.getItem.bind(storage);
  const rawRemoveItem = storage.removeItem.bind(storage);

  storage.setItem = (key: string, value: string) => {
    if (LEGACY_OPTIONAL_STORAGE_KEYS.has(key)) {
      // Never persist optional prefs to localStorage (consent-gated cookies only).
      return;
    }
    rawSetItem(key, value);
  };

  storage.getItem = (key: string) => {
    if (LEGACY_OPTIONAL_STORAGE_KEYS.has(key)) {
      return null;
    }
    return rawGetItem(key);
  };

  storage.removeItem = (key: string) => {
    rawRemoveItem(key);
  };

  guardInstalled = true;
}

/**
 * Remove legacy optional preference values from localStorage.
 * Does not touch Auth.js, reset-auth, or mapesim_cookie_consent cookies.
 * Call only from client effects — never via inline scripts.
 */
export function clearOptionalPreferenceStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_OPTIONAL_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors.
  }
}

export function notifyCurrencyReset(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CURRENCY_RESET_EVENT));
}

export function notifyPreferencesGranted(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PREFERENCES_GRANTED_EVENT));
}
