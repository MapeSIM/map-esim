"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

/**
 * Soft-navigate destination cards (`a.map-dest-card`) so App Router
 * `loading.tsx` / Suspense skeletons show instantly with 0ms click feedback.
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
  const rootRef = useRef<HTMLDivElement>(null);
  const prefetched = useRef(new Set<string>());
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const prefetchHref = useCallback(
    (href: string) => {
      if (!isSafeCountriesHref(href) || prefetched.current.has(href)) return;
      prefetched.current.add(href);
      router.prefetch(href);
    },
    [router]
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cards = root.querySelectorAll<HTMLAnchorElement>("a.map-dest-card");
    for (const card of cards) {
      const href = card.getAttribute("href");
      const active = Boolean(
        isPending && pendingHref && href && href === pendingHref
      );
      card.classList.toggle("map-dest-card--pending", active);
      if (active) {
        card.setAttribute("aria-busy", "true");
      } else {
        card.removeAttribute("aria-busy");
      }
    }
  }, [isPending, pendingHref, children]);

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

      // Block native hard navigation so App Router soft-nav + loading UI win.
      event.preventDefault();
      event.stopPropagation();
      if (isPending) return;

      setPendingHref(href);
      anchor.classList.add("map-dest-card--pending");
      anchor.setAttribute("aria-busy", "true");
      prefetchHref(href);
      startTransition(() => {
        router.push(href);
      });
    },
    [isPending, prefetchHref, router]
  );

  return (
    <div
      ref={rootRef}
      aria-busy={isPending || undefined}
      onPointerOverCapture={onPointerOverCapture}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}
