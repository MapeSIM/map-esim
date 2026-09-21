"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import { getTawkEmbedSrc } from "@/app/lib/support/tawkConfig";
import { isTawkEnabledRoute } from "@/app/lib/support/tawkRoutes";

type TawkApi = {
  hideWidget?: () => void;
  showWidget?: () => void;
  onLoad?: () => void;
  shutdown?: () => void;
};

declare global {
  interface Window {
    Tawk_API?: TawkApi;
    Tawk_LoadStart?: Date;
  }
}

const SCRIPT_ID = "map-esim-tawk-embed";

function hideTawkWidget(): void {
  if (typeof window === "undefined") return;
  try {
    window.Tawk_API?.hideWidget?.();
  } catch {
    // Widget may not be ready.
  }
}

function showTawkWidget(): void {
  if (typeof window === "undefined") return;
  try {
    window.Tawk_API?.showWidget?.();
  } catch {
    // Script may still be loading.
  }
}

function unloadTawkWidget(): void {
  if (typeof window === "undefined") return;

  hideTawkWidget();
  try {
    window.Tawk_API?.shutdown?.();
  } catch {
    // Continue DOM cleanup.
  }

  document
    .querySelectorAll(
      'script[src*="embed.tawk.to"], script[src*="tawk.to"], iframe[src*="tawk.to"]'
    )
    .forEach((node) => node.remove());

  document
    .querySelectorAll(
      '[id^="tawk"], [class*="tawk-"], #tawkchat-container, #tawkchat-minified-container'
    )
    .forEach((node) => node.remove());

  try {
    delete window.Tawk_API;
    delete window.Tawk_LoadStart;
  } catch {
    window.Tawk_API = undefined;
    window.Tawk_LoadStart = undefined;
  }
}

function hasTawkScript(embedSrc: string): boolean {
  return Boolean(
    document.getElementById(SCRIPT_ID) ||
      document.querySelector(`script[src="${embedSrc}"]`) ||
      document.querySelector('script[src*="embed.tawk.to"]')
  );
}

/** Bind onLoad so the bubble appears once Tawk finishes bootstrapping. */
function bindTawkOnLoad(): void {
  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = window.Tawk_LoadStart || new Date();
  // Intentionally do not set visitor name/email or custom attributes.

  window.Tawk_API.onLoad = () => {
    try {
      if (isTawkEnabledRoute(window.location.pathname || "/")) {
        window.Tawk_API?.showWidget?.();
      } else {
        window.Tawk_API?.hideWidget?.();
      }
    } catch {
      // Ignore widget API errors.
    }
  };
}

/**
 * Inject the embed once. next/script remount after unload often skips re-exec
 * for a stable id under App Router SPA navigations.
 */
function ensureTawkScript(embedSrc: string): void {
  if (hasTawkScript(embedSrc)) return;

  bindTawkOnLoad();

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = embedSrc;
  script.charset = "UTF-8";
  script.setAttribute("crossorigin", "*");
  script.onerror = () => {
    unloadTawkWidget();
  };
  document.body.appendChild(script);
}

/**
 * Consent- and route-gated Tawk widget.
 * Does not attach visitor identity, order data, or other account attributes.
 */
export default function TawkChat({
  enabledByConsent,
}: {
  /** True only when marketing cookie consent is granted. */
  enabledByConsent: boolean;
}) {
  const pathname = usePathname() || "/";
  const embedSrc = useMemo(() => getTawkEmbedSrc(), []);
  const routeAllowed = useMemo(
    () => isTawkEnabledRoute(pathname),
    [pathname]
  );

  const consentReady = Boolean(enabledByConsent && embedSrc);
  const widgetVisible = consentReady && routeAllowed;

  useEffect(() => {
    if (!consentReady || !embedSrc) {
      unloadTawkWidget();
      return;
    }

    if (!routeAllowed) {
      // Restricted routes: fully unload (privacy), not merely hide.
      unloadTawkWidget();
      return;
    }

    bindTawkOnLoad();

    if (hasTawkScript(embedSrc)) {
      // SPA navigation back onto an allowlisted route: script already present.
      showTawkWidget();
      return;
    }

    ensureTawkScript(embedSrc);
  }, [consentReady, routeAllowed, widgetVisible, pathname, embedSrc]);

  useEffect(() => {
    return () => {
      unloadTawkWidget();
    };
  }, []);

  if (!widgetVisible) {
    return null;
  }

  return (
    <style>{`
      #tawkchat-minified-box,
      #tawkchat-minified-wrapper,
      .widget-visible {
        bottom: max(1rem, env(safe-area-inset-bottom, 0px)) !important;
        right: max(1rem, env(safe-area-inset-right, 0px)) !important;
      }
    `}</style>
  );
}
