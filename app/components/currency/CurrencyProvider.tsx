"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  CURRENCY_STORAGE_KEY,
  DEFAULT_CURRENCY,
  FALLBACK_USD_RATES,
  isCurrencyCode,
  type CurrencyCode,
} from "@/app/lib/currency/currencies";
import { formatMoney, type CurrencyRates } from "@/app/lib/currency/format";

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  rates: CurrencyRates;
  formatPrice: (amountUsd: number | null | undefined) => string;
  ready: boolean;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);
const CURRENCY_CHANGE_EVENT = "map-esim-currency-change";

function readStoredCurrency(): CurrencyCode {
  try {
    const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (isCurrencyCode(stored)) return stored;
  } catch {
    // Ignore storage access errors.
  }
  return DEFAULT_CURRENCY;
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CURRENCY_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CURRENCY_CHANGE_EVENT, onStoreChange);
  };
}

function getServerSnapshot() {
  return DEFAULT_CURRENCY;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const currency = useSyncExternalStore(
    subscribe,
    readStoredCurrency,
    getServerSnapshot
  );
  const [rates, setRates] = useState<CurrencyRates>(FALLBACK_USD_RATES);

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

  const setCurrency = useCallback((next: CurrencyCode) => {
    try {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, next);
    } catch {
      // Ignore storage write errors.
    }
    window.dispatchEvent(new Event(CURRENCY_CHANGE_EVENT));
  }, []);

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
