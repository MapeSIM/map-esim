"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Phase = "idle" | "start" | "trickle" | "done";

function isModifiedClick(event: MouseEvent): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

function resolveInternalHref(anchor: HTMLAnchorElement): string | null {
  const hrefAttr = anchor.getAttribute("href");
  if (!hrefAttr || hrefAttr.startsWith("#")) return null;
  if (hrefAttr.startsWith("mailto:") || hrefAttr.startsWith("tel:")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;

  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;

  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return null;
  return next;
}

/**
 * Slim lime-green top progress bar for App Router soft navigations.
 * Starts on internal link clicks; completes when pathname/search updates.
 */
export default function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const trickleTimer = useRef<number | null>(null);
  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const routeKeyRef = useRef(routeKey);

  const clearTimers = useCallback(() => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (trickleTimer.current != null) {
      window.clearInterval(trickleTimer.current);
      trickleTimer.current = null;
    }
  }, []);

  const complete = useCallback(() => {
    clearTimers();
    setPhase("done");
    setVisible(true);
    hideTimer.current = window.setTimeout(() => {
      setVisible(false);
      setPhase("idle");
    }, 280);
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    setVisible(true);
    setPhase("start");
    // Soft trickle so long navigations still feel alive.
    window.requestAnimationFrame(() => setPhase("trickle"));
    trickleTimer.current = window.setInterval(() => {
      setPhase((prev) => (prev === "idle" || prev === "done" ? prev : "trickle"));
    }, 1200);
    // Safety complete if something stalls (e.g. same-URL soft refresh).
    hideTimer.current = window.setTimeout(() => {
      complete();
    }, 12_000);
  }, [clearTimers, complete]);

  useEffect(() => {
    if (routeKeyRef.current === routeKey) return;
    routeKeyRef.current = routeKey;
    if (phase === "idle" && !visible) return;
    complete();
  }, [routeKey, phase, visible, complete]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (isModifiedClick(event)) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || !resolveInternalHref(anchor)) return;
      start();
    }

    function onKeyDown(event: KeyboardEvent) {
      // Enter on focused link
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return;
      const active = document.activeElement as HTMLAnchorElement | null;
      if (!active || active.tagName !== "A") return;
      if (!resolveInternalHref(active)) return;
      start();
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      clearTimers();
    };
  }, [start, clearTimers]);

  if (!visible && phase === "idle") return null;

  return (
    <div
      className="map-nav-progress"
      data-phase={phase}
      role="progressbar"
      aria-hidden={phase === "idle" || phase === "done"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={phase === "done" ? "Loaded" : "Loading page"}
    >
      <div className="map-nav-progress__bar" />
    </div>
  );
}
