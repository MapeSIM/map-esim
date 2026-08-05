"use client";

import Script from "next/script";
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
    if (!consentReady) {
      unloadTawkWidget();
      return;
    }

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

    if (widgetVisible) {
      try {
        window.Tawk_API.showWidget?.();
      } catch {
        // Script may still be loading.
      }
    } else {
      hideTawkWidget();
    }
  }, [consentReady, widgetVisible]);

  useEffect(() => {
    return () => {
      unloadTawkWidget();
    };
  }, []);

  if (!consentReady || !embedSrc) {
    return null;
  }

  return (
    <>
      <Script
        id={SCRIPT_ID}
        src={embedSrc}
        strategy="lazyOnload"
        onError={() => {
          unloadTawkWidget();
        }}
      />
      <style>{`
        #tawkchat-minified-box,
        #tawkchat-minified-wrapper,
        .widget-visible {
          bottom: max(1rem, env(safe-area-inset-bottom, 0px)) !important;
          right: max(1rem, env(safe-area-inset-right, 0px)) !important;
        }
      `}</style>
    </>
  );
}
