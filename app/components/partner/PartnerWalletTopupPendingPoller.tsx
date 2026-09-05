"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 120;

type Props = {
  enabled: boolean;
};

/**
 * Refresh-only poller for Partner Add Funds pending page.
 * Never calls Verify or credits the Partner wallet.
 */
export default function PartnerWalletTopupPendingPoller({ enabled }: Props) {
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
