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
  partnerSectionLabelClass,
  partnerStatusBadgeClass,
} from "@/app/components/partner/partnerPortalUi";
import type { PartnerOrderListRow } from "@/app/lib/partner/partnerOrders";
import { EsimLifecycleBadges } from "@/app/components/orders/EsimLifecycleBadges";
import {
  partnerOrderInstallAllowed,
  partnerOrderIsRefunded,
  partnerOrderLifecycleIsPrimaryBadge,
  partnerOrderLineReady,
  partnerOrderStatusHelp,
  partnerOrderStatusLabel,
  type PartnerOrderStatusBadge,
} from "@/app/lib/partner/partnerOrdersDisplay";

function StatusBadges({
  status,
  isAddDataPurchase,
}: {
  status: PartnerOrderStatusBadge;
  isAddDataPurchase: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${partnerStatusBadgeClass(status)}`}
      >
        {partnerOrderStatusLabel(status)}
      </span>
      <AddDataPurchaseBadge isAddDataPurchase={isAddDataPurchase} />
    </div>
  );
}

function SummaryFacts({ row }: { row: PartnerOrderListRow }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
        <dt className="text-xs text-[var(--text-soft)]">Data</dt>
        <dd className="mt-1 font-semibold text-[var(--heading)]">
          {row.dataAllowance}
        </dd>
      </div>
      <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
        <dt className="text-xs text-[var(--text-soft)]">Validity</dt>
        <dd className="mt-1 font-semibold text-[var(--heading)]">
          {row.validity}
        </dd>
      </div>
      <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
        <dt className="text-xs text-[var(--text-soft)]">Amount Paid</dt>
        <dd className="mt-1 font-semibold tabular-nums text-[var(--heading)]">
          {row.partnerDebitLabel}
        </dd>
      </div>
      <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
        <dt className="text-xs text-[var(--text-soft)]">Purchased</dt>
        <dd className="mt-1 font-semibold text-[var(--heading)]">
          {row.purchasedAtLabel}
        </dd>
      </div>
    </dl>
  );
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
  const [installFocus, setInstallFocus] = useState(false);
  const refunded = partnerOrderIsRefunded(row.statusBadge);
  const expired = row.statusBadge === "eSIM Expired";
  const lifecyclePrimary = partnerOrderLifecycleIsPrimaryBadge(row.statusBadge);
  const lineReady = partnerOrderLineReady(row.statusBadge) && !refunded;
  const installAllowed =
    partnerOrderInstallAllowed(row.statusBadge) && !refunded;
  const addDataHref = row.addDataEligible
    ? `/partner/orders/${encodeURIComponent(row.orderId)}/add-data`
    : null;
  const detailHref = `/partner/orders/${encodeURIComponent(row.orderId)}`;
  const statusHelp = partnerOrderStatusHelp(row.statusBadge);

  if (variant === "list") {
    return (
      <article className={partnerCardClass}>
        <div className="flex min-w-0 items-start gap-3">
          {row.flagUrl ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <Image
                src={row.flagUrl}
                alt=""
                width={40}
                height={30}
                sizes="40px"
                className="h-7 w-auto object-contain"
                unoptimized
              />
            </div>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--heading)]">
              {row.destination}
            </h2>
            <p className="truncate text-sm text-[var(--text-muted)]">
              {row.planName}
            </p>
            <StatusBadges
              status={row.statusBadge}
              isAddDataPurchase={row.isAddDataPurchase}
            />
            {!refunded ? (
              <EsimLifecycleBadges
                lifecycle={lifecyclePrimary ? null : row.lifecycle}
                remainingDataLabel={row.remainingDataLabel}
              />
            ) : null}
            {statusHelp ? (
              <p className="text-xs font-medium text-[var(--text-muted)]">
                {statusHelp}
              </p>
            ) : null}
            {refundRequest ? (
              <p className="text-xs font-medium text-[var(--text-muted)]">
                Refund: {refundRequest.statusLabel}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-4 font-mono text-xs text-[var(--text-soft)]">
          {row.shortReference}
        </p>

        <div className="mt-4">
          <SummaryFacts row={row} />
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {expired && addDataHref ? (
            <Link href={addDataHref} className={partnerSecondaryCtaClass}>
              Add More Data
            </Link>
          ) : null}
          <Link href={detailHref} className={partnerSecondaryCtaClass}>
            View eSIM
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {!expired && addDataHref ? (
            <Link href={addDataHref} className={partnerSecondaryCtaClass}>
              Add More Data
            </Link>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <article className={partnerCardClass}>
        <p className={partnerSectionLabelClass}>eSIM Summary</p>
        <div className="mt-4 flex min-w-0 items-start gap-3">
          {row.flagUrl ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <Image
                src={row.flagUrl}
                alt=""
                width={40}
                height={30}
                sizes="40px"
                className="h-7 w-auto object-contain"
                unoptimized
              />
            </div>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--heading)]">
              {row.destination}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">{row.planName}</p>
            <StatusBadges
              status={row.statusBadge}
              isAddDataPurchase={row.isAddDataPurchase}
            />
            {!refunded ? (
              <EsimLifecycleBadges
                lifecycle={lifecyclePrimary ? null : row.lifecycle}
                remainingDataLabel={row.remainingDataLabel}
              />
            ) : null}
            {statusHelp ? (
              <p className="text-sm text-[var(--text-muted)]">{statusHelp}</p>
            ) : null}
          </div>
        </div>
        <p className="mt-4 font-mono text-xs text-[var(--text-soft)]">
          {row.shortReference}
        </p>
      </article>

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
        onViewQr={
          installAllowed
            ? () => {
                setInstallFocus(true);
                document
                  .getElementById("partner-install")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            : undefined
        }
        enableShare
        shareUrl={`/partner/orders/${encodeURIComponent(row.orderId)}`}
        shareTitle={row.planName}
        addDataHref={addDataHref}
        raiseIssueHref="/support"
        refundAction={
          !expired && !refunded ? (
            <a
              href="#partner-refund"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 bg-transparent px-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            >
              Refund
            </a>
          ) : null
        }
      />

      {installAllowed ? (
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
            defaultExpanded={installFocus || true}
          />
        </div>
      ) : expired ? (
        <section className={partnerCardClass}>
          <p className={partnerSectionLabelClass}>Installation</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Installation QR is unavailable because this eSIM has expired. Use
            Add More Data when available, or purchase a new plan.
          </p>
          {addDataHref ? (
            <div className="mt-4">
              <Link href={addDataHref} className={partnerSecondaryCtaClass}>
                Add More Data
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      <div id="partner-refund">
        {!expired || refunded ? (
          <PartnerRefundRequestControls
            purchaseId={row.purchaseId}
            partnerDebitLabel={row.partnerDebitLabel}
            alreadyRefunded={refunded}
            existingRequest={refundRequest}
          />
        ) : null}
      </div>
    </div>
  );
}
