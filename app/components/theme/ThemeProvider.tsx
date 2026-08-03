"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import PreferenceStorageSync from "@/app/components/cookies/PreferenceStorageSync";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
} from "@/app/lib/cookies/preferenceStorage";

export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      <PreferenceStorageSync />
      {children}
    </NextThemesProvider>
  );
}
