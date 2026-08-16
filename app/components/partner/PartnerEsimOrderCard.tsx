"use client";

import { useState } from "react";
import Image from "next/image";
import { Signal } from "lucide-react";
import CustomerEsimUsagePanel from "@/app/components/orders/CustomerEsimUsagePanel";
import PartnerEsimInstallPanel from "@/app/components/partner/PartnerEsimInstallPanel";
import type { PartnerOrderListRow } from "@/app/lib/partner/partnerOrders";
import {
  PARTNER_ESIM_READY_LABEL,
  type PartnerOrderStatusBadge,
} from "@/app/lib/partner/partnerOrdersDisplay";

function statusBadgeClass(status: PartnerOrderStatusBadge): string {
  switch (status) {
    case "Completed":
      return "bg-[var(--accent)]/15 text-[var(--heading)] border-[var(--accent-strong)]/40";
    case "Processing":
      return "bg-[var(--surface)] text-[var(--text)] border-[var(--border-hover)]";
    case "Under review":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Failed — balance returned":
      return "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]";
    default:
      return "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]";
  }
}

type Props = {
  row: PartnerOrderListRow;
};

export default function PartnerEsimOrderCard({ row }: Props) {
  const [showUsage, setShowUsage] = useState(false);
  const completed = row.statusBadge === "Completed";

  return (
    <article className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        {row.flagUrl ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <Image
              src={row.flagUrl}
              alt=""
              width={40}
              height={30}
              className="h-6 w-auto object-cover"
              unoptimized
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-[var(--heading)]">
              {row.destination}
            </h2>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.statusBadge)}`}
            >
              {row.statusBadge}
            </span>
            {completed ? (
              <span className="inline-flex rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--heading)]">
                {PARTNER_ESIM_READY_LABEL}
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
            {row.shortReference}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-[var(--text-soft)]">Data</dt>
          <dd className="font-medium text-[var(--heading)]">{row.dataAllowance}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--text-soft)]">Validity</dt>
          <dd className="font-medium text-[var(--heading)]">{row.validity}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--text-soft)]">Amount Paid</dt>
          <dd className="font-medium tabular-nums text-[var(--heading)]">
            {row.partnerDebitLabel}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--text-soft)]">Purchased</dt>
          <dd className="font-medium text-[var(--heading)]">
            {row.purchasedAtLabel}
          </dd>
        </div>
      </dl>

      {completed ? (
        <div className="mt-4 space-y-3">
          {!showUsage ? (
            <button
              type="button"
              onClick={() => setShowUsage(true)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
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
          />
        </div>
      ) : null}
    </article>
  );
}
