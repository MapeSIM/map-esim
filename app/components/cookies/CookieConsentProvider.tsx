"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  acceptAllConsent,
  createConsentRecord,
  rejectNonEssentialConsent,
  type CookieConsentRecord,
  type OptionalCookieCategory,
} from "@/app/lib/cookies/consent";
import { saveCookieConsentAction } from "@/app/lib/cookies/consentActions";
import {
  installPreferenceStorageGuard,
  setPreferencePersistenceAllowed,
} from "@/app/lib/cookies/preferenceStorage";
import CookieConsentBanner from "@/app/components/cookies/CookieConsentBanner";
import CookiePreferencesModal from "@/app/components/cookies/CookiePreferencesModal";
import ConsentScriptGate from "@/app/components/cookies/ConsentScriptGate";

type CookieConsentContextValue = {
  consent: CookieConsentRecord | null;
  bannerVisible: boolean;
  preferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  acceptAll: () => Promise<void>;
  rejectNonEssential: () => Promise<void>;
  savePreferences: (next: {
    preferences: boolean;
    analytics: boolean;
    marketing: boolean;
  }) => Promise<void>;
  canLoad: (category: OptionalCookieCategory) => boolean;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(
  null
);

export function useCookieConsent(): CookieConsentContextValue {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    throw new Error("useCookieConsent must be used within CookieConsentProvider");
  }
  return ctx;
}

export default function CookieConsentProvider({
  initialConsent,
  initialPreferencesAllowed = false,
  children,
}: {
  initialConsent: CookieConsentRecord | null;
  /** Server-parsed Preferences consent; do not re-read cookies in render. */
  initialPreferencesAllowed?: boolean;
  children: ReactNode;
}) {
  const [consent, setConsent] = useState<CookieConsentRecord | null>(
    initialConsent
  );
  const [bannerVisible, setBannerVisible] = useState(!initialConsent);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [pending, setPending] = useState(false);

  // Keep the storage guard in sync after mount (never touch window during render).
  useEffect(() => {
    installPreferenceStorageGuard();
    setPreferencePersistenceAllowed(
      Boolean(consent?.preferences ?? initialPreferencesAllowed)
    );
  }, [consent?.preferences, initialPreferencesAllowed]);

  const persist = useCallback(async (record: CookieConsentRecord) => {
    setPending(true);
    try {
      // Persist consent cookie first so preference cookie actions can verify it.
      setPreferencePersistenceAllowed(record.preferences);
      await saveCookieConsentAction({
        preferences: record.preferences,
        analytics: record.analytics,
        marketing: record.marketing,
      });
      setConsent(record);
      setBannerVisible(false);
      setPreferencesOpen(false);
    } finally {
      setPending(false);
    }
  }, []);

  const acceptAll = useCallback(async () => {
    await persist(acceptAllConsent());
  }, [persist]);

  const rejectNonEssential = useCallback(async () => {
    await persist(rejectNonEssentialConsent());
  }, [persist]);

  const savePreferences = useCallback(
    async (next: {
      preferences: boolean;
      analytics: boolean;
      marketing: boolean;
    }) => {
      await persist(createConsentRecord(next));
    },
    [persist]
  );

  const openPreferences = useCallback(() => {
    setPreferencesOpen(true);
  }, []);

  const closePreferences = useCallback(() => {
    setPreferencesOpen(false);
  }, []);

  const canLoad = useCallback(
    (category: OptionalCookieCategory) => {
      if (!consent) return false;
      return Boolean(consent[category]);
    },
    [consent]
  );

  const value = useMemo(
    () => ({
      consent,
      bannerVisible,
      preferencesOpen,
      openPreferences,
      closePreferences,
      acceptAll,
      rejectNonEssential,
      savePreferences,
      canLoad,
    }),
    [
      consent,
      bannerVisible,
      preferencesOpen,
      openPreferences,
      closePreferences,
      acceptAll,
      rejectNonEssential,
      savePreferences,
      canLoad,
    ]
  );

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
      <ConsentScriptGate />
      <CookieConsentBanner pending={pending} />
      <CookiePreferencesModal pending={pending} />
    </CookieConsentContext.Provider>
  );
}
