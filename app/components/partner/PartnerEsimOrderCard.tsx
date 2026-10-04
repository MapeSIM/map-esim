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
import { EsimLifecycleBadges } from "@/app/components/orders/EsimLifecycleBadges";
import {
  PARTNER_ESIM_READY_LABEL,
  partnerOrderInstallAllowed,
  partnerOrderIsRefunded,
  partnerOrderLineReady,
  partnerOrderStatusHelp,
  type PartnerOrderStatusBadge,
} from "@/app/lib/partner/partnerOrdersDisplay";

function StatusBadges({
  status,
  isAddDataPurchase,
  showReady,
}: {
  status: PartnerOrderStatusBadge;
  isAddDataPurchase: boolean;
  showReady: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${partnerStatusBadgeClass(status)}`}
      >
        {status}
      </span>
      <AddDataPurchaseBadge isAddDataPurchase={isAddDataPurchase} />
      {showReady ? (
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
  /** Partner share-settings company name for outbound share messages. */
  partnerDisplayName?: string | null;
};

export default function PartnerEsimOrderCard({
  row,
  refundRequest,
  variant = "detail",
  partnerDisplayName = null,
}: Props) {
  const [showUsage, setShowUsage] = useState(false);
  const refunded = partnerOrderIsRefunded(row.statusBadge);
  const expired = row.statusBadge === "eSIM Expired";
  const lineReady = partnerOrderLineReady(row.statusBadge) && !refunded;
  const installAllowed = partnerOrderInstallAllowed(row.statusBadge) && !refunded;
  const addDataHref = row.addDataEligible
    ? `/partner/orders/${encodeURIComponent(row.orderId)}/add-data`
    : null;
  const detailHref = `/partner/orders/${encodeURIComponent(row.orderId)}`;
  const expiredHelp = partnerOrderStatusHelp(row.statusBadge);

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
              showReady={installAllowed}
            />
            {!refunded && !expired ? (
              <EsimLifecycleBadges
                lifecycle={row.lifecycle}
                remainingDataLabel={row.remainingDataLabel}
              />
            ) : expired && row.remainingDataLabel ? (
              <EsimLifecycleBadges
                lifecycle={null}
                remainingDataLabel={row.remainingDataLabel}
              />
            ) : null}
            {expiredHelp ? (
              <p className="text-xs font-medium text-[var(--text-muted)]">
                {expiredHelp}
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
              showReady={installAllowed}
            />
            {!refunded && !expired ? (
              <EsimLifecycleBadges
                lifecycle={row.lifecycle}
                remainingDataLabel={row.remainingDataLabel}
              />
            ) : expired && row.remainingDataLabel ? (
              <EsimLifecycleBadges
                lifecycle={null}
                remainingDataLabel={row.remainingDataLabel}
              />
            ) : null}
            {expiredHelp ? (
              <p className="text-sm text-[var(--text-muted)]">{expiredHelp}</p>
            ) : null}
          </div>
        </div>
        <p className="mt-4 font-mono text-xs text-[var(--text-soft)]">
          {row.shortReference}
        </p>
        <div className="mt-4">
          <SummaryFacts row={row} />
        </div>
        {expired && addDataHref ? (
          <div className="mt-5">
            <Link href={addDataHref} className={partnerSecondaryCtaClass}>
              Add More Data
            </Link>
          </div>
        ) : null}
      </article>

      {lineReady ? (
        <>
          <section className={partnerCardClass}>
            <p className={partnerSectionLabelClass}>Usage Statistics</p>
            <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--heading)]">
              Data usage
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Refresh to load live VeSIM status (Active / Expired / Depleted)
              and remaining data.
            </p>
            <div className="mt-4">
              {!showUsage ? (
                <button
                  type="button"
                  onClick={() => setShowUsage(true)}
                  className={partnerSecondaryCtaClass}
                >
                  <Signal className="h-4 w-4" aria-hidden="true" />
                  Refresh Status
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

          {installAllowed ? (
            <PartnerEsimInstallPanel
              orderId={row.orderId}
              installEligible
              iccidMasked={row.iccidMasked}
              iccidRevealable={row.iccidRevealable}
              hasActiveShareToken={row.hasActiveShareToken}
              partnerDisplayName={partnerDisplayName}
              destination={row.destination}
              planName={row.planName}
              dataAllowance={row.dataAllowance}
              validity={row.validity}
              addDataHref={addDataHref}
              defaultExpanded
            />
          ) : (
            <section className={partnerCardClass}>
              <p className={partnerSectionLabelClass}>Installation</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Installation QR is unavailable because this eSIM has expired.
                Use Add More Data when available, or purchase a new plan.
              </p>
              {addDataHref ? (
                <div className="mt-4">
                  <Link href={addDataHref} className={partnerSecondaryCtaClass}>
                    Add More Data
                  </Link>
                </div>
              ) : null}
            </section>
          )}

          {!expired ? (
            <PartnerRefundRequestControls
              purchaseId={row.purchaseId}
              partnerDebitLabel={row.partnerDebitLabel}
              alreadyRefunded={false}
              existingRequest={refundRequest}
            />
          ) : null}
        </>
      ) : refunded ? (
        <section className={partnerCardClass}>
          <p className={partnerSectionLabelClass}>Refunded</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            This eSIM was refunded. Installation QR and live usage are no longer
            available.
          </p>
          <PartnerRefundRequestControls
            purchaseId={row.purchaseId}
            partnerDebitLabel={row.partnerDebitLabel}
            alreadyRefunded
            existingRequest={refundRequest}
          />
        </section>
      ) : null}
    </div>
  );
}
