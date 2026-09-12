"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Signal } from "lucide-react";
import { AddDataPurchaseBadge } from "@/app/components/orders/AddDataPurchaseBadge";
import CustomerEsimUsagePanel from "@/app/components/orders/CustomerEsimUsagePanel";
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
import {
  PARTNER_ESIM_READY_LABEL,
  type PartnerOrderStatusBadge,
} from "@/app/lib/partner/partnerOrdersDisplay";

function StatusBadges({
  status,
  isAddDataPurchase,
  completed,
}: {
  status: PartnerOrderStatusBadge;
  isAddDataPurchase: boolean;
  completed: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${partnerStatusBadgeClass(status)}`}
      >
        {status}
      </span>
      <AddDataPurchaseBadge isAddDataPurchase={isAddDataPurchase} />
      {completed ? (
        <span className="inline-flex rounded-full border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--heading)]">
          {PARTNER_ESIM_READY_LABEL}
        </span>
      ) : null}
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
};

export default function PartnerEsimOrderCard({
  row,
  refundRequest,
  variant = "detail",
}: Props) {
  const [showUsage, setShowUsage] = useState(false);
  const completed = row.statusBadge === "Completed";
  const addDataHref = row.addDataEligible
    ? `/partner/orders/${encodeURIComponent(row.orderId)}/add-data`
    : null;
  const detailHref = `/partner/orders/${encodeURIComponent(row.orderId)}`;

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
                className="h-7 w-auto object-cover"
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
              completed={completed}
            />
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
          <Link href={detailHref} className={partnerSecondaryCtaClass}>
            View eSIM
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {addDataHref ? (
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
                className="h-7 w-auto object-cover"
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
              completed={completed}
            />
          </div>
        </div>
        <p className="mt-4 font-mono text-xs text-[var(--text-soft)]">
          {row.shortReference}
        </p>
        <div className="mt-4">
          <SummaryFacts row={row} />
        </div>
      </article>

      {completed ? (
        <>
          <section className={partnerCardClass}>
            <p className={partnerSectionLabelClass}>Usage Statistics</p>
            <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--heading)]">
              Data usage
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Check used, remaining, and expiry when you need it.
            </p>
            <div className="mt-4">
              {!showUsage ? (
                <button
                  type="button"
                  onClick={() => setShowUsage(true)}
                  className={partnerSecondaryCtaClass}
                >
                  <Signal className="h-4 w-4" aria-hidden="true" />
                  Show eSIM Status & Usage
                </button>
              ) : (
                <CustomerEsimUsagePanel
                  orderId={row.orderId}
                  usageEligible
                  compact
                  autoOpen
                  usagePath={`/api/partner/orders/${encodeURIComponent(row.orderId)}/usage`}
                />
              )}
            </div>
          </section>

          <PartnerEsimInstallPanel
            orderId={row.orderId}
            installEligible
            iccidMasked={row.iccidMasked}
            iccidRevealable={row.iccidRevealable}
            hasActiveShareToken={row.hasActiveShareToken}
            destination={row.destination}
            planName={row.planName}
            dataAllowance={row.dataAllowance}
            validity={row.validity}
            addDataHref={addDataHref}
            defaultExpanded
          />

          <PartnerRefundRequestControls
            purchaseId={row.purchaseId}
            partnerDebitLabel={row.partnerDebitLabel}
            alreadyRefunded={false}
            existingRequest={refundRequest}
          />
        </>
      ) : null}
    </div>
  );
}
