"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/components/theme/ThemeProvider";

function subscribe() {
  return () => {};
}

/**
 * Theme control always works immediately.
 * Persistence uses consent-gated preference cookies (Preferences consent).
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isDark = resolvedTheme === "dark";

  function toggleTheme() {
    const current =
      resolvedTheme ||
      (document.documentElement.classList.contains("dark") ? "dark" : "light");
    setTheme(current === "dark" ? "light" : "dark");
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={
        !mounted
          ? "Toggle color theme"
          : isDark
            ? "Switch to light mode"
            : "Switch to dark mode"
      }
      className="
        inline-flex h-9 w-9 shrink-0 items-center justify-center
        rounded-[14px] border border-[var(--border-strong)]
        bg-[var(--surface)] text-[var(--text-muted)]
        transition-colors
        hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]
        hover:text-[var(--heading)]
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent)]/60 focus-visible:ring-offset-2
        focus-visible:ring-offset-[var(--page-bg)]
      "
    >
      {!mounted ? (
        <span className="h-4 w-4" aria-hidden="true" />
      ) : isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
