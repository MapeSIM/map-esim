"use client";

import { useEffect, useRef } from "react";
import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";
import { useTheme } from "@/app/components/theme/ThemeProvider";
import {
  clearOptionalPreferenceCookiesAction,
  setThemePreferenceAction,
} from "@/app/lib/cookies/preferenceActions";
import {
  clearOptionalPreferenceStorage,
  DEFAULT_THEME,
  installPreferenceStorageGuard,
  notifyCurrencyReset,
  notifyPreferencesGranted,
  setPreferencePersistenceAllowed,
} from "@/app/lib/cookies/preferenceStorage";

/**
 * Consent controls persistence only.
 * Legacy localStorage cleanup runs in effects (never via layout bootstrap scripts).
 * Durable theme/currency state uses consent-gated cookies.
 */
export default function PreferenceStorageSync() {
  const { canLoad } = useCookieConsent();
  const { setTheme, theme } = useTheme();
  const persistPreferences = canLoad("preferences");
  const previousPersist = useRef<boolean | null>(null);
  const themeRef = useRef(theme);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    installPreferenceStorageGuard();
    setPreferencePersistenceAllowed(persistPreferences);

    const prev = previousPersist.current;

    if (prev === null) {
      // First mount: clear legacy optional keys; never use them for init.
      clearOptionalPreferenceStorage();
      previousPersist.current = persistPreferences;
      return;
    }

    if (prev && !persistPreferences) {
      // Withdrawal once — reset to Dark + USD; drop cookies + legacy storage.
      clearOptionalPreferenceStorage();
      void clearOptionalPreferenceCookiesAction();
      setTheme(DEFAULT_THEME);
      notifyCurrencyReset();
    } else if (!prev && persistPreferences) {
      // Preferences enabled — persist current in-memory theme via cookie.
      setPreferencePersistenceAllowed(true);
      void setThemePreferenceAction(themeRef.current || DEFAULT_THEME);
      notifyPreferencesGranted();
    }

    previousPersist.current = persistPreferences;
  }, [persistPreferences, setTheme]);

  return null;
}
