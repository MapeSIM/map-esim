"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 120; // ~10 minutes; webhook/Inquire remain authoritative

type Props = {
  enabled: boolean;
};

/**
 * Safely refresh the top-up status page while awaiting wallet approval.
 * Does not call Simpaisa Verify or any payment API — only router.refresh().
 */
export default function WalletTopupPendingPoller({ enabled }: Props) {
  const router = useRouter();
  const polls = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    polls.current = 0;
    const timer = window.setInterval(() => {
      polls.current += 1;
      if (polls.current > MAX_POLLS) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, router]);

  return null;
}
