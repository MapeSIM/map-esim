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
 */
export default function StatusRefreshPoller({
  enabled,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxPolls = DEFAULT_MAX_POLLS,
}: Props) {
  const router = useRouter();
  const polls = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    polls.current = 0;
    const timer = window.setInterval(() => {
      polls.current += 1;
      if (polls.current > maxPolls) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, maxPolls, router]);

  return null;
}
