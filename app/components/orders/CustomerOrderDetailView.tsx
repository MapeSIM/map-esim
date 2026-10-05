"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import EsimOrderDetailCard from "@/app/components/orders/EsimOrderDetailCard";
import CustomerEsimInstallPanel from "@/app/components/orders/CustomerEsimInstallPanel";
import { CustomerEsimInstallHelpLinks } from "@/app/components/orders/CustomerEsimInstallHelpLinks";
import CustomerRefundRequestForm from "@/app/components/orders/CustomerRefundRequestForm";
import IccidRevealPanel from "@/app/components/orders/IccidRevealPanel";
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
 * Streamlined customer order detail — single VeSIM-style card.
 * Install, ICCID, and refund live in compact collapsible sections.
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
  iccidMasked,
  canRequestRefund,
  openRefundStatusLabel,
  autoRefreshUsage = false,
  refundRequestsSlot = null,
  refundJustRequested = false,
  rewardsEarnedLabel = null,
  rewardsAppliedLabel = null,
}: CustomerOrderDetailViewProps) {
  const [showRefund, setShowRefund] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [showIccid, setShowIccid] = useState(false);

  const qrBase = `/api/account/orders/${encodeURIComponent(orderId)}/qr`;
  const canQr = installEligible && !isRefunded;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <Link
        href="/account/orders"
        className="inline-flex text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        ← Back to My eSIMs
      </Link>

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
        viewQrHref={canQr ? qrBase : null}
        qrDownloadHref={canQr ? `${qrBase}?download=1` : null}
        enableShare
        shareUrl={`/account/orders/${encodeURIComponent(orderId)}`}
        shareTitle={planName}
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
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 bg-transparent px-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            >
              {showRefund ? "Hide refund" : "Request Refund"}
            </button>
          ) : null
        }
        footer={
          <div className="space-y-3 border-t border-white/8 pt-3">
            <p className="text-xs text-white/45">
              Order {shortReference}
            </p>
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

            <div className="flex flex-wrap gap-2">
              {canQr ? (
                <button
                  type="button"
                  onClick={() => setShowInstall((v) => !v)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 px-3 text-sm font-semibold text-white/85 transition hover:bg-white/6"
                >
                  {showInstall ? "Hide install help" : "Install eSIM"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowIccid((v) => !v)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 px-3 text-sm font-semibold text-white/85 transition hover:bg-white/6"
              >
                {showIccid ? "Hide ICCID" : "Show ICCID"}
              </button>
            </div>

            {showIccid ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <IccidRevealPanel
                  orderId={orderId}
                  iccid={iccid}
                  unavailableLabel={iccidMasked}
                />
              </div>
            ) : null}

            {showInstall ? (
              <div id="install" className="space-y-3">
                <CustomerEsimInstallPanel
                  orderId={orderId}
                  installEligible={installEligible}
                  isRefunded={isRefunded}
                />
                <CustomerEsimInstallHelpLinks className="text-sm text-white/55" />
              </div>
            ) : null}

            {showRefund ? (
              <div
                id="refund-request"
                className="rounded-xl border border-white/10 bg-white/[0.04] p-1"
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
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80"
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
