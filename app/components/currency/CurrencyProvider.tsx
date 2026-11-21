"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";
import { readBrowserCookie } from "@/app/lib/cookies/browserCookie";
import {
  DEFAULT_CURRENCY,
  FALLBACK_USD_RATES,
  type CurrencyCode,
} from "@/app/lib/currency/currencies";
import { pathnameNeedsLiveCurrencyRates } from "@/app/lib/currency/currencyRatesScope";
import { resolveAutoDisplayCurrency } from "@/app/lib/currency/destinationCurrency";
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

function readManualCurrencyPreference(): CurrencyCode | null {
  return parseCurrencyPreferenceCookie(
    readBrowserCookie(CURRENCY_PREFERENCE_COOKIE)
  );
}

export function CurrencyProvider({
  children,
  initialCurrency = DEFAULT_CURRENCY,
}: {
  children: ReactNode;
  /** Server-resolved currency; must match first client render. */
  initialCurrency?: CurrencyCode;
}) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const countryQuery =
    searchParams?.get("country") ??
    searchParams?.get("destination") ??
    null;

  const { canLoad } = useCookieConsent();
  const persistPreferences = canLoad("preferences");
  const previousPersist = useRef<boolean | null>(null);

  const [currency, setCurrencyState] =
    useState<CurrencyCode>(initialCurrency);
  const [rates, setRates] = useState<CurrencyRates>(FALLBACK_USD_RATES);
  const currencyRef = useRef(currency);
  /** True after an explicit header selection (preference cookie written/read). */
  const manualOverrideRef = useRef(false);
  const softHydratedRef = useRef(false);
  const liveRatesLoadedRef = useRef(false);

  useEffect(() => {
    currencyRef.current = currency;
  }, [currency]);

  const applyAutoCurrency = useCallback(() => {
    if (manualOverrideRef.current) return;
    const next = resolveAutoDisplayCurrency({
      pathname,
      countryQuery,
    });
    setCurrencyState((prev) => (prev === next ? prev : next));
  }, [pathname, countryQuery]);

  // Preference cookie = manual override. Soft destination default otherwise.
  // useLayoutEffect so Pakistan → PKR applies before first painted price labels.
  useLayoutEffect(() => {
    if (persistPreferences) {
      const stored = readManualCurrencyPreference();
      if (stored) {
        manualOverrideRef.current = true;
        // Intentional: client-only preference cookie rehydrate after cacheable SSR.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- browser cookie sync
        setCurrencyState(stored);
        softHydratedRef.current = true;
        return;
      }
    }

    softHydratedRef.current = true;
    applyAutoCurrency();
  }, [persistPreferences, applyAutoCurrency]);

  // Destination-based soft default when the user has not manually chosen
  // (e.g. navigate into /countries/pakistan without a preference cookie).
  useLayoutEffect(() => {
    if (!softHydratedRef.current) return;
    applyAutoCurrency();
  }, [applyAutoCurrency]);

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
      manualOverrideRef.current = false;
      setCurrencyState(
        resolveAutoDisplayCurrency({ pathname, countryQuery })
      );
    } else if (!prev && persistPreferences) {
      // Persist only an explicit manual choice — never lock in auto-PKR.
      if (manualOverrideRef.current) {
        void setCurrencyPreferenceAction(currencyRef.current);
      }
    }

    previousPersist.current = persistPreferences;
  }, [persistPreferences, pathname, countryQuery]);

  useEffect(() => {
    const onReset = () => {
      manualOverrideRef.current = false;
      const path =
        typeof window !== "undefined" ? window.location.pathname : "/";
      const country =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("country")
          : null;
      setCurrencyState(
        resolveAutoDisplayCurrency({ pathname: path, countryQuery: country })
      );
    };
    const onGranted = () => {
      if (manualOverrideRef.current) {
        void setCurrencyPreferenceAction(currencyRef.current);
      }
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
      manualOverrideRef.current = true;
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
