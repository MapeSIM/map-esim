"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";
import { setThemePreferenceAction } from "@/app/lib/cookies/preferenceActions";
import {
  DEFAULT_THEME,
  isThemePreference,
  type ThemePreference,
} from "@/app/lib/cookies/preferenceCookies";

type ThemeContextValue = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference | string) => void;
  resolvedTheme: "dark" | "light";
  systemTheme: "dark" | "light";
  themes: ThemePreference[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyResolvedTheme(resolved: "dark" | "light"): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

export default function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME,
}: {
  children: ReactNode;
  /** Server-resolved theme; must match html className for first paint. */
  initialTheme?: ThemePreference;
}) {
  const { canLoad } = useCookieConsent();
  const persistPreferences = canLoad("preferences");

  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">("dark");

  const resolvedTheme: "dark" | "light" =
    theme === "system" ? systemTheme : theme;

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      setSystemTheme(media.matches ? "dark" : "light");
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    const resolved = theme === "system" ? readSystemTheme() : theme;
    applyResolvedTheme(resolved);
  }, [theme, systemTheme]);

  const setTheme = useCallback(
    (next: ThemePreference | string) => {
      const value = typeof next === "string" ? next.trim().toLowerCase() : next;
      if (!isThemePreference(value)) return;
      setThemeState(value);
      if (persistPreferences) {
        void setThemePreferenceAction(value);
      }
    },
    [persistPreferences]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      systemTheme,
      themes: ["dark", "light", "system"],
    }),
    [theme, setTheme, resolvedTheme, systemTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
