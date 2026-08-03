import { CURRENCY_STORAGE_KEY } from "@/app/lib/currency/currencies";

/** next-themes storage key — single source of truth */
export const THEME_STORAGE_KEY = "theme";

/** Default theme when no Preference consent / no stored preference. */
export const DEFAULT_THEME = "dark";

export const CURRENCY_RESET_EVENT = "map-esim-currency-reset";
export const PREFERENCES_GRANTED_EVENT = "map-esim-preferences-granted";

const OPTIONAL_STORAGE_KEYS = new Set([
  CURRENCY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  "mapesim-theme-session",
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
 * Block durable theme/currency localStorage writes/reads until Preference consent.
 * next-themes can still update React state + the document class when setItem is a no-op.
 */
export function installPreferenceStorageGuard(): void {
  if (typeof window === "undefined" || guardInstalled) return;

  const storage = window.localStorage;
  const rawSetItem = storage.setItem.bind(storage);
  const rawGetItem = storage.getItem.bind(storage);
  const rawRemoveItem = storage.removeItem.bind(storage);

  storage.setItem = (key: string, value: string) => {
    if (OPTIONAL_STORAGE_KEYS.has(key) && !preferencePersistenceAllowed) {
      return;
    }
    rawSetItem(key, value);
  };

  storage.getItem = (key: string) => {
    if (OPTIONAL_STORAGE_KEYS.has(key) && !preferencePersistenceAllowed) {
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
 * Remove optional preference values from localStorage.
 * Does not touch Auth.js, reset-auth, or mapesim_cookie_consent cookies.
 */
export function clearOptionalPreferenceStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of OPTIONAL_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors.
  }
}

export function readOptionalCurrencyStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CURRENCY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeOptionalCurrencyStorage(value: string): void {
  if (typeof window === "undefined") return;
  if (!preferencePersistenceAllowed) return;
  try {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, value);
  } catch {
    // Ignore storage write errors.
  }
}

export function writeOptionalThemeStorage(value: string): void {
  if (typeof window === "undefined") return;
  if (!preferencePersistenceAllowed) return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Ignore storage write errors.
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
