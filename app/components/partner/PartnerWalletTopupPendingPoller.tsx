"use client";

import StatusRefreshPoller from "@/app/components/payments/StatusRefreshPoller";

type Props = {
  enabled: boolean;
};

/**
 * Refresh-only poller for Partner Add Funds pending page.
 * Never calls Verify or credits the Partner wallet.
 */
export default function PartnerWalletTopupPendingPoller({ enabled }: Props) {
  return <StatusRefreshPoller enabled={enabled} />;
}
