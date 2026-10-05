"use client";

import type { ReactNode } from "react";
import EsimOrderDetailCard from "@/app/components/orders/EsimOrderDetailCard";
import type { ProviderLifecycleCacheView } from "@/app/lib/orders/providerLifecycleShared";

type Props = {
  orderId: string;
  dataPlan: string;
  validityPeriod: string;
  amountPaid: string;
  purchasedAt: string;
  dataAllowance?: string | null;
  orderStatusLabel?: string | null;
  isRefunded: boolean;
  refundedAtLabel?: string | null;
  lifecycle?: ProviderLifecycleCacheView | null;
  addDataHref?: string | null;
  addDataSlot?: ReactNode;
};

/**
 * Admin surface for the shared VeSIM-style Order Details card.
 * Shows cron-synced cache immediately; Update triggers live carrier sync.
 */
export default function AdminEsimUsagePanel({
  orderId,
  dataPlan,
  validityPeriod,
  amountPaid,
  purchasedAt,
  dataAllowance = null,
  orderStatusLabel = null,
  isRefunded,
  refundedAtLabel = null,
  lifecycle = null,
  addDataHref = null,
  addDataSlot = null,
}: Props) {
  return (
    <EsimOrderDetailCard
      orderId={orderId}
      title="Order details"
      dataPlan={dataPlan}
      validityPeriod={validityPeriod}
      amountPaid={amountPaid}
      purchasedAt={purchasedAt}
      dataAllowance={dataAllowance}
      orderStatusLabel={orderStatusLabel}
      isRefunded={isRefunded}
      refundedAtLabel={refundedAtLabel}
      lifecycle={lifecycle}
      usagePath={
        isRefunded
          ? null
          : `/api/admin/orders/${encodeURIComponent(orderId)}/usage`
      }
      usageEligible={!isRefunded}
      addDataHref={addDataHref}
      hideActions={!addDataHref}
      footer={addDataSlot}
    />
  );
}
