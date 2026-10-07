"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_POLLS = 120;

type Props = {
  enabled: boolean;
  intervalMs?: number;
  maxPolls?: number;
};

/**
 * Soft refresh poller for payment pending/verified screens.
 * Display-only — never calls gateway Verify, never credits wallets, never
 * marks purchases paid.
 *
 * Stops immediately on unmount, when `enabled` becomes false, or on browser
 * Back (`popstate`) so `router.refresh()` cannot race outbound navigation.
 */
export default function StatusRefreshPoller({
  enabled,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxPolls = DEFAULT_MAX_POLLS,
}: Props) {
  const router = useRouter();
  const polls = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    if (!enabled) {
      clearTimer();
      return;
    }

    polls.current = 0;
    clearTimer();
    timerRef.current = window.setInterval(() => {
      polls.current += 1;
      if (polls.current > maxPolls) {
        clearTimer();
        return;
      }
      router.refresh();
    }, intervalMs);

    const onPopState = () => {
      clearTimer();
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      clearTimer();
      window.removeEventListener("popstate", onPopState);
    };
  }, [enabled, intervalMs, maxPolls, router]);

  return null;
}
