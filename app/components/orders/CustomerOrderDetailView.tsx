"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import EsimOrderDetailCard from "@/app/components/orders/EsimOrderDetailCard";
import CustomerEsimInstallPanel from "@/app/components/orders/CustomerEsimInstallPanel";
import CustomerRefundRequestForm from "@/app/components/orders/CustomerRefundRequestForm";
import { customerEsimLineReady } from "@/app/lib/orders/customerOrderDisplay";
import type { CustomerEsimStatusBadge } from "@/app/lib/orders/customerOrderDisplay";
import type { ProviderLifecycleCacheView } from "@/app/lib/orders/providerLifecycleShared";

export type CustomerOrderDetailViewProps = {
  orderId: string;
  shortReference: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  amountLabel: string;
  createdAtLabel: string;
  statusBadge: CustomerEsimStatusBadge;
  orderStatusLabel: string;
  isRefunded: boolean;
  refundedAtLabel: string | null;
  lifecycle: ProviderLifecycleCacheView | null;
  installEligible: boolean;
  addDataEligible: boolean;
  iccid: string | null;
  iccidMasked: string;
  canRequestRefund: boolean;
  openRefundStatusLabel: string | null;
  autoRefreshUsage?: boolean;
  refundRequestsSlot?: ReactNode;
  refundJustRequested?: boolean;
  rewardsEarnedLabel?: string | null;
  rewardsAppliedLabel?: string | null;
};

/**
 * Premium customer order detail — install hero front-and-center, then usage metrics.
 */
export default function CustomerOrderDetailView({
  orderId,
  shortReference,
  planName,
  dataAllowance,
  validity,
  amountLabel,
  createdAtLabel,
  statusBadge,
  orderStatusLabel,
  isRefunded,
  refundedAtLabel,
  lifecycle,
  installEligible,
  addDataEligible,
  iccid,
  canRequestRefund,
  openRefundStatusLabel,
  autoRefreshUsage = false,
  refundRequestsSlot = null,
  refundJustRequested = false,
  rewardsEarnedLabel = null,
  rewardsAppliedLabel = null,
}: CustomerOrderDetailViewProps) {
  const [showRefund, setShowRefund] = useState(false);
  const orderPath = `/account/orders/${encodeURIComponent(orderId)}`;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <Link
        href="/account/orders"
        className="inline-flex text-sm font-semibold text-[#00B8E6] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[#00B8E6]"
      >
        ← Back to My eSIMs
      </Link>

      <CustomerEsimInstallPanel
        orderId={orderId}
        installEligible={installEligible}
        isRefunded={isRefunded}
        iccid={iccid}
        shareUrl={orderPath}
        shareTitle={planName}
      />

      <EsimOrderDetailCard
        orderId={orderId}
        dataPlan={planName}
        validityPeriod={validity}
        amountPaid={amountLabel}
        purchasedAt={createdAtLabel}
        dataAllowance={dataAllowance}
        orderStatusLabel={orderStatusLabel}
        isRefunded={isRefunded}
        refundedAtLabel={refundedAtLabel}
        lifecycle={lifecycle}
        usagePath={`/api/account/orders/${encodeURIComponent(orderId)}/usage`}
        usageEligible={customerEsimLineReady(statusBadge) && !isRefunded}
        autoRefresh={autoRefreshUsage}
        viewQrHref={null}
        qrDownloadHref={null}
        enableShare={false}
        addDataHref={
          addDataEligible
            ? `/account/orders/${encodeURIComponent(orderId)}/add-data`
            : null
        }
        raiseIssueHref="/support"
        refundAction={
          !isRefunded ? (
            <button
              type="button"
              onClick={() => setShowRefund((v) => !v)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[#1E3A5F] bg-transparent px-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B8E6]"
            >
              {showRefund ? "Hide refund" : "Request Refund"}
            </button>
          ) : null
        }
        footer={
          <div className="space-y-3 border-t border-[#1E3A5F] pt-3">
            <p className="text-xs text-white/45">Order {shortReference}</p>
            {rewardsAppliedLabel || rewardsEarnedLabel ? (
              <dl className="grid gap-1 text-xs text-white/65 sm:grid-cols-2">
                {rewardsAppliedLabel ? (
                  <div>
                    <dt className="inline font-semibold text-white/45">
                      Rewards applied:{" "}
                    </dt>
                    <dd className="inline">{rewardsAppliedLabel}</dd>
                  </div>
                ) : null}
                {rewardsEarnedLabel ? (
                  <div>
                    <dt className="inline font-semibold text-white/45">
                      Rewards earned:{" "}
                    </dt>
                    <dd className="inline">{rewardsEarnedLabel}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {showRefund ? (
              <div
                id="refund-request"
                className="rounded-xl border border-[#1E3A5F] bg-white/[0.04] p-1"
              >
                <CustomerRefundRequestForm
                  orderId={orderId}
                  canRequest={canRequestRefund}
                  openStatusLabel={openRefundStatusLabel}
                />
              </div>
            ) : null}

            {refundJustRequested ? (
              <p
                className="rounded-xl border border-[#1E3A5F] bg-white/5 px-3 py-2 text-sm text-white/80"
                role="status"
              >
                Your refund request was submitted for review. No funds have been
                moved yet.
              </p>
            ) : null}

            {refundRequestsSlot}
          </div>
        }
      />
    </div>
  );
}
