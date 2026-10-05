"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AddDataPurchaseBadge } from "@/app/components/orders/AddDataPurchaseBadge";
import EsimOrderDetailCard from "@/app/components/orders/EsimOrderDetailCard";
import PartnerEsimInstallPanel from "@/app/components/partner/PartnerEsimInstallPanel";
import PartnerRefundRequestControls, {
  type PartnerRefundRequestCardState,
} from "@/app/components/partner/PartnerRefundRequestControls";
import {
  partnerCardClass,
  partnerSecondaryCtaClass,
  partnerStatusBadgeClass,
} from "@/app/components/partner/partnerPortalUi";
import type { PartnerOrderListRow } from "@/app/lib/partner/partnerOrders";
import {
  isUnlimitedDataAllowance,
  resolveIsUnlimitedPlan,
} from "@/app/lib/orders/esimOrderDetailDisplay";
import {
  partnerOrderInstallAllowed,
  partnerOrderIsRefunded,
  partnerOrderLineReady,
  partnerOrderStatusLabel,
} from "@/app/lib/partner/partnerOrdersDisplay";

function quickDataSummary(row: PartnerOrderListRow): string {
  if (partnerOrderIsRefunded(row.statusBadge)) return "Refunded";
  const unlimited = resolveIsUnlimitedPlan({
    dataAllowance: row.dataAllowance,
    dataPlan: row.planName,
    initialDataGB: row.lifecycle?.initialDataGb,
    remainingDataGB: row.lifecycle?.remainingDataGb,
  });
  if (unlimited || isUnlimitedDataAllowance(row.dataAllowance)) {
    return "∞ Unlimited";
  }
  if (row.remainingDataLabel) return row.remainingDataLabel;
  if (row.dataAllowance && row.dataAllowance !== "Not available") {
    return row.dataAllowance;
  }
  return "View details";
}

type Props = {
  row: PartnerOrderListRow;
  refundRequest: PartnerRefundRequestCardState;
  variant?: "list" | "detail";
  /** Partner share-settings company name for outbound share messages. */
  partnerDisplayName?: string | null;
};

export default function PartnerEsimOrderCard({
  row,
  refundRequest,
  variant = "detail",
  partnerDisplayName = null,
}: Props) {
  const [showRefund, setShowRefund] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const refunded = partnerOrderIsRefunded(row.statusBadge);
  const expired = row.statusBadge === "eSIM Expired";
  const lineReady = partnerOrderLineReady(row.statusBadge) && !refunded;
  const installAllowed =
    partnerOrderInstallAllowed(row.statusBadge) && !refunded;
  const addDataHref = row.addDataEligible
    ? `/partner/orders/${encodeURIComponent(row.orderId)}/add-data`
    : null;
  const detailHref = `/partner/orders/${encodeURIComponent(row.orderId)}`;
  const dataSummary = quickDataSummary(row);
  const qrBase = `/api/partner/orders/${encodeURIComponent(row.orderId)}/qr`;

  if (variant === "list") {
    return (
      <Link
        href={detailHref}
        className="group block min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_22px_rgba(0,0,0,0.12)] transition hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        aria-label={`View eSIM for ${row.destination}`}
      >
        <article className="flex min-w-0 items-center gap-3 px-3.5 py-3.5 sm:gap-4 sm:px-4 sm:py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] sm:h-12 sm:w-12">
            {row.flagUrl ? (
              <Image
                src={row.flagUrl}
                alt=""
                width={40}
                height={30}
                sizes="40px"
                className="h-7 w-auto object-contain"
                unoptimized
              />
            ) : (
              <span className="text-[10px] font-bold text-[var(--text-soft)]">
                eSIM
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-tight text-[var(--heading)] sm:text-lg">
                {row.destination}
              </h2>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${partnerStatusBadgeClass(row.statusBadge)}`}
              >
                {partnerOrderStatusLabel(row.statusBadge)}
              </span>
              <AddDataPurchaseBadge
                isAddDataPurchase={row.isAddDataPurchase}
              />
            </div>
            <p className="mt-1 truncate text-sm font-medium text-[var(--text-muted)]">
              {dataSummary}
            </p>
            {refundRequest ? (
              <p className="mt-0.5 truncate text-xs text-[var(--text-soft)]">
                Refund: {refundRequest.statusLabel}
              </p>
            ) : (
              <p className="mt-0.5 truncate text-xs text-[var(--text-soft)]">
                {row.shortReference}
              </p>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-2 text-xs font-semibold text-[var(--heading)] sm:text-sm">
            View details
            <ChevronRight className="h-4 w-4 opacity-70" aria-hidden="true" />
          </span>
        </article>
      </Link>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <EsimOrderDetailCard
        orderId={row.orderId}
        dataPlan={row.planName}
        validityPeriod={row.validity}
        amountPaid={row.partnerDebitLabel}
        purchasedAt={row.purchasedAtLabel}
        dataAllowance={row.dataAllowance}
        orderStatusLabel={partnerOrderStatusLabel(row.statusBadge)}
        isRefunded={refunded}
        lifecycle={row.lifecycle}
        usagePath={
          lineReady
            ? `/api/partner/orders/${encodeURIComponent(row.orderId)}/usage`
            : null
        }
        usageEligible={lineReady}
        viewQrHref={installAllowed ? qrBase : null}
        qrDownloadHref={installAllowed ? `${qrBase}?download=1` : null}
        enableShare
        shareUrl={`/partner/orders/${encodeURIComponent(row.orderId)}`}
        shareTitle={row.planName}
        addDataHref={addDataHref}
        raiseIssueHref="/support"
        refundAction={
          !expired && !refunded ? (
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
            <p className="text-xs text-white/45">{row.shortReference}</p>
            {installAllowed ? (
              <button
                type="button"
                onClick={() => setShowInstall((v) => !v)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 px-3 text-sm font-semibold text-white/85 transition hover:bg-white/6"
              >
                {showInstall ? "Hide install" : "Install / Share eSIM"}
              </button>
            ) : null}
            {expired && addDataHref ? (
              <Link href={addDataHref} className={partnerSecondaryCtaClass}>
                Add More Data
              </Link>
            ) : null}
            {showInstall && installAllowed ? (
              <div id="partner-install">
                <PartnerEsimInstallPanel
                  orderId={row.orderId}
                  installEligible
                  iccidMasked={row.iccidMasked}
                  iccid={row.iccid}
                  hasActiveShareToken={row.hasActiveShareToken}
                  partnerDisplayName={partnerDisplayName}
                  destination={row.destination}
                  planName={row.planName}
                  dataAllowance={row.dataAllowance}
                  validity={row.validity}
                  addDataHref={addDataHref}
                  defaultExpanded
                />
              </div>
            ) : null}
            {showRefund || refunded ? (
              <div id="partner-refund">
                <PartnerRefundRequestControls
                  purchaseId={row.purchaseId}
                  partnerDebitLabel={row.partnerDebitLabel}
                  alreadyRefunded={refunded}
                  existingRequest={refundRequest}
                />
              </div>
            ) : null}
          </div>
        }
      />

      {!installAllowed && expired ? (
        <section className={partnerCardClass}>
          <p className="text-sm text-[var(--text-muted)]">
            Installation QR is unavailable because this eSIM has expired.
          </p>
        </section>
      ) : null}
    </div>
  );
}
