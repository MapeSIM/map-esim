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
const IDLE_FALLBACK_MS = 2500;

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

function scheduleDeferredInject(run: () => void): () => void {
  let idleId: number | null = null;
  let timeoutId: number | null = null;
  let loadHandler: (() => void) | null = null;
  let cancelled = false;

  const startIdleWindow = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(
        () => {
          if (!cancelled) run();
        },
        { timeout: IDLE_FALLBACK_MS }
      );
      return;
    }
    timeoutId = window.setTimeout(() => {
      if (!cancelled) run();
    }, IDLE_FALLBACK_MS);
  };

  if (document.readyState === "complete") {
    startIdleWindow();
  } else {
    loadHandler = () => {
      startIdleWindow();
    };
    window.addEventListener("load", loadHandler, { once: true });
    // Fallback if `load` already fired in odd SPA cases.
    timeoutId = window.setTimeout(() => {
      if (!cancelled) startIdleWindow();
    }, IDLE_FALLBACK_MS);
  }

  return () => {
    cancelled = true;
    if (loadHandler) window.removeEventListener("load", loadHandler);
    if (idleId != null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleId);
    }
    if (timeoutId != null) window.clearTimeout(timeoutId);
  };
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
      // Allowlisted → allowlisted: keep script, just show.
      showTawkWidget();
      return;
    }

    const cancel = scheduleDeferredInject(() => {
      if (!isTawkEnabledRoute(window.location.pathname || "/")) return;
      ensureTawkScript(embedSrc);
    });

    return () => {
      cancel();
    };
  }, [consentReady, routeAllowed, pathname, embedSrc]);

  useEffect(() => {
    return () => {
      // Unmount (consent revoked / gate removed): full unload.
      unloadTawkWidget();
    };
  }, []);

  // Keep positioning CSS mounted while consent is on and route is allowlisted,
  // or while script exists after an allowlisted visit (hidden on blocked routes
  // after unload — CSS harmless if nodes gone).
  if (!consentReady || !routeAllowed) {
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
