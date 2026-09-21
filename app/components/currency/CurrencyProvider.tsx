"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";
import { readBrowserCookie } from "@/app/lib/cookies/browserCookie";
import {
  DEFAULT_CURRENCY,
  FALLBACK_USD_RATES,
  type CurrencyCode,
} from "@/app/lib/currency/currencies";
import { pathnameNeedsLiveCurrencyRates } from "@/app/lib/currency/currencyRatesScope";
import { formatMoney, type CurrencyRates } from "@/app/lib/currency/format";
import { setCurrencyPreferenceAction } from "@/app/lib/cookies/preferenceActions";
import {
  CURRENCY_PREFERENCE_COOKIE,
  parseCurrencyPreferenceCookie,
} from "@/app/lib/cookies/preferenceCookies";
import {
  CURRENCY_RESET_EVENT,
  PREFERENCES_GRANTED_EVENT,
} from "@/app/lib/cookies/preferenceStorage";

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  rates: CurrencyRates;
  formatPrice: (amountUsd: number | null | undefined) => string;
  ready: boolean;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
  children,
  initialCurrency = DEFAULT_CURRENCY,
}: {
  children: ReactNode;
  /** Server-resolved currency; must match first client render. */
  initialCurrency?: CurrencyCode;
}) {
  const pathname = usePathname() || "/";
  const { canLoad } = useCookieConsent();
  const persistPreferences = canLoad("preferences");
  const previousPersist = useRef<boolean | null>(null);

  const [currency, setCurrencyState] =
    useState<CurrencyCode>(initialCurrency);
  const [rates, setRates] = useState<CurrencyRates>(FALLBACK_USD_RATES);
  const currencyRef = useRef(currency);
  const hydratedPreference = useRef(false);
  const liveRatesLoadedRef = useRef(false);

  useEffect(() => {
    currencyRef.current = currency;
  }, [currency]);

  // Cacheable public shell cannot read preference cookies on the server.
  useEffect(() => {
    if (!persistPreferences || hydratedPreference.current) return;
    hydratedPreference.current = true;
    const stored = parseCurrencyPreferenceCookie(
      readBrowserCookie(CURRENCY_PREFERENCE_COOKIE)
    );
    if (stored) {
      // Intentional: client-only preference cookie rehydrate after cacheable SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser cookie sync
      setCurrencyState(stored);
    }
  }, [persistPreferences]);

  // Live FX only on routes that display converted prices; elsewhere keep fallbacks.
  useEffect(() => {
    if (!pathnameNeedsLiveCurrencyRates(pathname)) return;
    if (liveRatesLoadedRef.current) return;

    let cancelled = false;

    async function loadRates() {
      try {
        const response = await fetch("/api/currency/rates", {
          cache: "force-cache",
        });
        const data = await response.json();
        if (cancelled) return;
        if (data?.rates && typeof data.rates === "object") {
          setRates({
            ...FALLBACK_USD_RATES,
            ...data.rates,
          });
        }
        liveRatesLoadedRef.current = true;
      } catch {
        // Keep fallback rates; allow retry on the next priced-route visit.
      }
    }

    void loadRates();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Consent transitions only — never restore from localStorage.
  useEffect(() => {
    const prev = previousPersist.current;

    if (prev === null) {
      previousPersist.current = persistPreferences;
      return;
    }

    if (prev && !persistPreferences) {
      setCurrencyState(DEFAULT_CURRENCY);
    } else if (!prev && persistPreferences) {
      void setCurrencyPreferenceAction(currencyRef.current);
    }

    previousPersist.current = persistPreferences;
  }, [persistPreferences]);

  useEffect(() => {
    const onReset = () => {
      setCurrencyState(DEFAULT_CURRENCY);
    };
    const onGranted = () => {
      void setCurrencyPreferenceAction(currencyRef.current);
    };
    window.addEventListener(CURRENCY_RESET_EVENT, onReset);
    window.addEventListener(PREFERENCES_GRANTED_EVENT, onGranted);
    return () => {
      window.removeEventListener(CURRENCY_RESET_EVENT, onReset);
      window.removeEventListener(PREFERENCES_GRANTED_EVENT, onGranted);
    };
  }, []);

  const setCurrency = useCallback(
    (next: CurrencyCode) => {
      setCurrencyState(next);
      if (persistPreferences) {
        void setCurrencyPreferenceAction(next);
      }
    },
    [persistPreferences]
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
      rates,
      formatPrice: (amountUsd) => formatMoney(amountUsd, currency, rates),
      ready: true,
    }),
    [currency, setCurrency, rates]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within CurrencyProvider");
  }
  return context;
}
