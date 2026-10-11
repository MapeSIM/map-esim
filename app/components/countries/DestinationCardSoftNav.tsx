"use client";

import {
  useCallback,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

/**
 * Soft-navigate destination cards rendered as plain <a.map-dest-card> HTML
 * (default /countries A–Z grid) so App Router `loading.tsx` shows instantly.
 * Filtered React grids already use next/link.
 */
function isSafeCountriesHref(href: string): boolean {
  return /^\/countries\/[A-Za-z0-9][A-Za-z0-9_-]*(?:\?[A-Za-z0-9_=&.-]*)?$/.test(
    href
  );
}

export default function DestinationCardSoftNav({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const prefetched = useRef(new Set<string>());

  const prefetchHref = useCallback(
    (href: string) => {
      if (!isSafeCountriesHref(href) || prefetched.current.has(href)) return;
      prefetched.current.add(href);
      router.prefetch(href);
    },
    [router]
  );

  const onPointerOverCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a.map-dest-card");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href");
      if (href) prefetchHref(href);
    },
    [prefetchHref]
  );

  const onClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a.map-dest-card");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href");
      if (!href || !isSafeCountriesHref(href)) return;
      event.preventDefault();
      prefetchHref(href);
      router.push(href);
    },
    [prefetchHref, router]
  );

  return (
    <div
      onPointerOverCapture={onPointerOverCapture}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}
