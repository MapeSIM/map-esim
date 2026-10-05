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
  /** When true, show View/Download QR against the admin QR API. */
  qrEligible?: boolean;
  addDataEligible?: boolean;
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
  qrEligible = false,
  addDataEligible = false,
  addDataSlot = null,
}: Props) {
  const qrBase = `/api/admin/orders/${encodeURIComponent(orderId)}/qr`;
  const showQr = qrEligible && !isRefunded;
  const showAddData = addDataEligible && !isRefunded;

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
      viewQrHref={showQr ? qrBase : null}
      qrDownloadHref={showQr ? `${qrBase}?download=1` : null}
      addDataHref={showAddData ? "#admin-add-data" : null}
      hideActions={isRefunded && !showQr && !showAddData}
      footer={
        addDataSlot ? (
          <div id="admin-add-data">{addDataSlot}</div>
        ) : null
      }
    />
  );
}
