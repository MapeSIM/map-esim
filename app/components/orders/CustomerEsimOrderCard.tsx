"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AddDataPurchaseBadge } from "@/app/components/orders/AddDataPurchaseBadge";
import {
  customerEsimStatusLabel,
  type CustomerEsimStatusBadge,
} from "@/app/lib/orders/customerOrderDisplay";
import {
  isUnlimitedDataAllowance,
  resolveIsUnlimitedPlan,
} from "@/app/lib/orders/esimOrderDetailDisplay";
import type { ProviderLifecycleCacheView } from "@/app/lib/orders/providerLifecycleShared";

export type CustomerEsimOrderCardOrder = {
  id: string;
  shortReference: string;
  destination: string;
  flagUrl: string | null;
  planName: string;
  dataAllowance: string;
  validity: string;
  statusBadge: CustomerEsimStatusBadge;
  amountLabel: string;
  createdAtLabel: string;
  /** Full plaintext ICCID when stored; otherwise pending/not-provided label. */
  iccidMasked: string;
  iccid?: string | null;
  emailDeliveryLabel: string | null;
  /** Read-model gate — show Add More Data CTA only when true. */
  addDataEligible?: boolean;
  /** True when this order itself was created by an Add More Data top-up. */
  isAddDataPurchase?: boolean;
  lifecycle?: ProviderLifecycleCacheView | null;
  remainingDataLabel?: string | null;
};

function statusBadgeClass(status: CustomerEsimStatusBadge): string {
  switch (status) {
    case "Completed":
    case "Active":
      return "bg-[var(--accent-strong)]/18 text-[var(--heading)] border-[var(--accent-strong)]/45";
    case "Data Depleted":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Processing":
      return "bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-hover)]";
    case "Review needed":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Refunded":
    case "Failed":
    case "eSIM Expired":
      return "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]";
    default:
      return "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]";
  }
}

function quickDataSummary(order: CustomerEsimOrderCardOrder): string {
  if (order.statusBadge === "Refunded") return "Refunded";
  const unlimited = resolveIsUnlimitedPlan({
    dataAllowance: order.dataAllowance,
    dataPlan: order.planName,
    initialDataGB: order.lifecycle?.initialDataGb,
    remainingDataGB: order.lifecycle?.remainingDataGb,
  });
  if (unlimited || isUnlimitedDataAllowance(order.dataAllowance)) {
    return "∞ Unlimited";
  }
  if (order.remainingDataLabel) return order.remainingDataLabel;
  if (order.dataAllowance && order.dataAllowance !== "Not available") {
    return order.dataAllowance;
  }
  return "View details";
}

/**
 * Lightweight My eSIMs list row — VeSIM-style.
 * Whole card opens order details; no stacked action clutter.
 */
export function CustomerEsimOrderCard({
  order,
}: {
  order: CustomerEsimOrderCardOrder;
}) {
  const href = `/account/orders/${encodeURIComponent(order.id)}`;
  const dataSummary = quickDataSummary(order);

  return (
    <Link
      href={href}
      className="group block min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_22px_rgba(0,0,0,0.12)] transition hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      aria-label={`View details for ${order.destination}`}
    >
      <article className="flex min-w-0 items-center gap-3 px-3.5 py-3.5 sm:gap-4 sm:px-4 sm:py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] sm:h-12 sm:w-12 sm:rounded-2xl">
          {order.flagUrl ? (
            <Image
              src={order.flagUrl}
              alt=""
              width={48}
              height={36}
              sizes="48px"
              className="h-7 w-auto object-contain sm:h-8"
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
            <h2 className="truncate text-base font-bold tracking-tight text-[var(--heading)] sm:text-lg">
              {order.destination}
            </h2>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wide ${statusBadgeClass(order.statusBadge)}`}
            >
              {customerEsimStatusLabel(order.statusBadge)}
            </span>
            <AddDataPurchaseBadge
              isAddDataPurchase={Boolean(order.isAddDataPurchase)}
            />
          </div>
          <p className="mt-1 truncate text-sm font-medium text-[var(--text-muted)]">
            {dataSummary}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--text-soft)]">
            Ref {order.shortReference}
          </p>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-2 text-xs font-semibold text-[var(--heading)] transition group-hover:border-[var(--accent-strong)]/45 sm:px-3 sm:text-sm">
          View details
          <ChevronRight className="h-4 w-4 opacity-70" aria-hidden="true" />
        </span>
      </article>
    </Link>
  );
}
