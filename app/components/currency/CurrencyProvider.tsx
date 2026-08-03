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
import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";
import {
  DEFAULT_CURRENCY,
  FALLBACK_USD_RATES,
  isCurrencyCode,
  type CurrencyCode,
} from "@/app/lib/currency/currencies";
import { formatMoney, type CurrencyRates } from "@/app/lib/currency/format";
import {
  CURRENCY_RESET_EVENT,
  PREFERENCES_GRANTED_EVENT,
  readOptionalCurrencyStorage,
  writeOptionalCurrencyStorage,
} from "@/app/lib/cookies/preferenceStorage";

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  rates: CurrencyRates;
  formatPrice: (amountUsd: number | null | undefined) => string;
  ready: boolean;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function readStoredCurrencyOrDefault(): CurrencyCode {
  const stored = readOptionalCurrencyStorage();
  if (isCurrencyCode(stored)) return stored;
  return DEFAULT_CURRENCY;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { canLoad } = useCookieConsent();
  const persistPreferences = canLoad("preferences");
  const previousPersist = useRef<boolean | null>(null);

  // Server + first client render must both be USD (no localStorage during render).
  const [currency, setCurrencyState] =
    useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [rates, setRates] = useState<CurrencyRates>(FALLBACK_USD_RATES);
  const currencyRef = useRef(currency);
  currencyRef.current = currency;

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      try {
        const response = await fetch("/api/currency/rates", {
          cache: "force-cache",
        });
        const data = await response.json();
        if (!cancelled && data?.rates && typeof data.rates === "object") {
          setRates({
            ...FALLBACK_USD_RATES,
            ...data.rates,
          });
        }
      } catch {
        // Keep fallback rates.
      }
    }

    loadRates();
    return () => {
      cancelled = true;
    };
  }, []);

  // Post-hydration restore + consent transitions only (never during render).
  useEffect(() => {
    const prev = previousPersist.current;

    if (prev === null) {
      // First mount after hydration.
      if (persistPreferences) {
        setCurrencyState(readStoredCurrencyOrDefault());
      }
      previousPersist.current = persistPreferences;
      return;
    }

    if (prev && !persistPreferences) {
      setCurrencyState(DEFAULT_CURRENCY);
    } else if (!prev && persistPreferences) {
      writeOptionalCurrencyStorage(currencyRef.current);
    }

    previousPersist.current = persistPreferences;
  }, [persistPreferences]);

  useEffect(() => {
    const onReset = () => {
      setCurrencyState(DEFAULT_CURRENCY);
    };
    const onGranted = () => {
      writeOptionalCurrencyStorage(currencyRef.current);
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
        writeOptionalCurrencyStorage(next);
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
