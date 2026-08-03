"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";
import {
  clearOptionalPreferenceStorage,
  DEFAULT_THEME,
  installPreferenceStorageGuard,
  notifyCurrencyReset,
  notifyPreferencesGranted,
  setPreferencePersistenceAllowed,
  writeOptionalThemeStorage,
} from "@/app/lib/cookies/preferenceStorage";

/**
 * Consent controls persistence only.
 * Never continuously resets the user's in-session theme/currency choices.
 */
export default function PreferenceStorageSync() {
  const { canLoad } = useCookieConsent();
  const { setTheme, theme } = useTheme();
  const persistPreferences = canLoad("preferences");
  const previousPersist = useRef<boolean | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    installPreferenceStorageGuard();
    setPreferencePersistenceAllowed(persistPreferences);

    const prev = previousPersist.current;

    if (prev === null) {
      // First mount without Preference consent: clear leftover optional keys.
      if (!persistPreferences) {
        clearOptionalPreferenceStorage();
      }
      previousPersist.current = persistPreferences;
      return;
    }

    if (prev && !persistPreferences) {
      // Withdrawal once — reset to Dark + USD.
      clearOptionalPreferenceStorage();
      setTheme(DEFAULT_THEME);
      notifyCurrencyReset();
    } else if (!prev && persistPreferences) {
      // Accept All / Preferences enabled — persist current session theme now.
      setPreferencePersistenceAllowed(true);
      writeOptionalThemeStorage(themeRef.current || DEFAULT_THEME);
      notifyPreferencesGranted();
    }

    previousPersist.current = persistPreferences;
  }, [persistPreferences, setTheme]);

  return null;
}
