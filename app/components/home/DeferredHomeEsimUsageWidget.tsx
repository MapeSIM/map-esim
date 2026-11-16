"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const HomeEsimUsageWidget = dynamic(
  () => import("@/app/components/home/HomeEsimUsageWidget"),
  { ssr: false }
);

function scheduleIdle(callback: () => void, timeoutMs: number): () => void {
  if (typeof window === "undefined") return () => {};

  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(() => callback(), {
      timeout: timeoutMs,
    });
    return () => window.cancelIdleCallback(id);
  }

  const timer = window.setTimeout(callback, timeoutMs);
  return () => window.clearTimeout(timer);
}

/**
 * Keeps `#esim-usage` in the document for Navbar deep-links, but defers
 * mounting/fetching the heavy client widget until near viewport or idle.
 */
export default function DeferredHomeEsimUsageWidget() {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (shouldMount) return;

    const hashWantsUsage =
      typeof window !== "undefined" &&
      window.location.hash.replace(/^#/, "") === "esim-usage";
    if (hashWantsUsage) {
      setShouldMount(true);
      return;
    }

    const node = anchorRef.current;
    let cancelIdle: (() => void) | undefined;
    let observer: IntersectionObserver | null = null;

    if (node && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setShouldMount(true);
          }
        },
        { root: null, rootMargin: "300px", threshold: 0 }
      );
      observer.observe(node);
    }

    cancelIdle = scheduleIdle(() => setShouldMount(true), 2500);

    return () => {
      observer?.disconnect();
      cancelIdle?.();
    };
  }, [shouldMount]);

  return (
    <div ref={anchorRef} id="esim-usage" className="scroll-mt-28">
      {shouldMount ? <HomeEsimUsageWidget /> : null}
    </div>
  );
}
