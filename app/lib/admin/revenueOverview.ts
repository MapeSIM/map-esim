/**
 * Admin revenue overview — read-only aggregations.
 * Customer revenue = completed WalletEsimPurchase.priceCents (excludes COMPANY_FUNDED).
 * Partner revenue = completed PartnerEsimPurchase.partnerChargeCents (separate).
 * Never mixes provider cost into revenue totals.
 */
import "server-only";

import {
  OrderFundingSource,
  OrderStatus,
  PartnerEsimPurchaseStatus,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import {
  REVENUE_PERIOD_LABELS,
  REVENUE_PERIOD_ORDER,
  buildRevenuePeriodBounds,
  type DateBound,
  type RevenuePeriodKey,
} from "@/app/lib/admin/revenueOverviewShared";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";

export type { RevenuePeriodKey } from "@/app/lib/admin/revenueOverviewShared";
export {
  REVENUE_PERIOD_LABELS,
  buildRevenuePeriodBounds,
  utcDayStart,
} from "@/app/lib/admin/revenueOverviewShared";

export type RevenuePeriodMetrics = {
  key: RevenuePeriodKey;
  label: string;
  /** Customer catalog sell price from completed wallet purchases. */
  customerRevenueCents: number;
  customerRevenueLabel: string;
  /** Partner wallet debit from completed Partner purchases. */
  partnerRevenueCents: number;
  partnerRevenueLabel: string;
  ordersTotal: number;
  ordersCompleted: number;
  ordersPending: number;
  ordersFailed: number;
};

export type AdminRevenueOverviewData = {
  generatedAtLabel: string;
  periods: RevenuePeriodMetrics[];
};

function centsFromAggregate(value: number | bigint | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "bigint" ? Number(value) : value;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function purchaseCompletedAtFilter(bound: DateBound) {
  if (!bound.gte && !bound.lt) return {};
  const range: { gte?: Date; lt?: Date } = {};
  if (bound.gte) range.gte = bound.gte;
  if (bound.lt) range.lt = bound.lt;
  // Prefer completedAt; fall back to createdAt when completedAt was never set.
  return {
    OR: [
      { completedAt: range },
      { AND: [{ completedAt: null }, { createdAt: range }] },
    ],
  };
}

function orderCreatedAtFilter(bound: DateBound) {
  if (!bound.gte && !bound.lt) return {};
  const range: { gte?: Date; lt?: Date } = {};
  if (bound.gte) range.gte = bound.gte;
  if (bound.lt) range.lt = bound.lt;
  return { createdAt: range };
}

function formatGeneratedAt(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

/**
 * Aggregated admin revenue KPIs. Call only after requireRole("ADMIN").
 *
 * Uses Prisma batch `$transaction([...])` (not interactive, not Promise.all)
 * to avoid pool exhaustion on remote DB.
 */
export async function getAdminRevenueOverview(
  now: Date = new Date()
): Promise<AdminRevenueOverviewData> {
  const bounds = buildRevenuePeriodBounds(now);

  const ops = REVENUE_PERIOD_ORDER.flatMap((key) => {
    const bound = bounds[key];
    const purchaseWhen = purchaseCompletedAtFilter(bound);
    const orderWhen = orderCreatedAtFilter(bound);

    return [
      prisma.walletEsimPurchase.aggregate({
        _sum: { priceCents: true },
        where: {
          status: WalletEsimPurchaseStatus.COMPLETED,
          NOT: { fundingSource: OrderFundingSource.COMPANY_FUNDED },
          ...purchaseWhen,
        },
      }),
      prisma.partnerEsimPurchase.aggregate({
        _sum: { partnerChargeCents: true },
        where: {
          status: PartnerEsimPurchaseStatus.COMPLETED,
          ...purchaseWhen,
        },
      }),
      prisma.order.count({ where: { ...orderWhen } }),
      prisma.order.count({
        where: { status: OrderStatus.COMPLETED, ...orderWhen },
      }),
      prisma.order.count({
        where: { status: OrderStatus.PENDING, ...orderWhen },
      }),
      prisma.order.count({
        where: { status: OrderStatus.FAILED, ...orderWhen },
      }),
    ];
  });

  const results = await prisma.$transaction(ops);

  const periods: RevenuePeriodMetrics[] = REVENUE_PERIOD_ORDER.map(
    (key, index) => {
      const base = index * 6;
      const customerAgg = results[base] as {
        _sum: { priceCents: number | null };
      };
      const partnerAgg = results[base + 1] as {
        _sum: { partnerChargeCents: number | null };
      };
      const ordersTotal = results[base + 2] as number;
      const ordersCompleted = results[base + 3] as number;
      const ordersPending = results[base + 4] as number;
      const ordersFailed = results[base + 5] as number;

      const customerRevenueCents = centsFromAggregate(
        customerAgg._sum.priceCents
      );
      const partnerRevenueCents = centsFromAggregate(
        partnerAgg._sum.partnerChargeCents
      );

      return {
        key,
        label: REVENUE_PERIOD_LABELS[key],
        customerRevenueCents,
        customerRevenueLabel: formatUsdCents(customerRevenueCents),
        partnerRevenueCents,
        partnerRevenueLabel: formatUsdCents(partnerRevenueCents),
        ordersTotal,
        ordersCompleted,
        ordersPending,
        ordersFailed,
      };
    }
  );

  return {
    generatedAtLabel: formatGeneratedAt(now),
    periods,
  };
}
