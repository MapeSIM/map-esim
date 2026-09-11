/**
 * Admin business insights — read-only aggregations (Day 10 MVP).
 * Customer sell metrics use completed WalletEsimPurchase (excludes COMPANY_FUNDED).
 * Partner Add More Data revenue stays separate (partnerChargeCents).
 * Never mixes provider cost into revenue totals. No schema / payment / order mutations.
 */
import "server-only";

import {
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  Prisma,
  Role,
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
import { ADD_DATA_IDEMPOTENCY_PREFIX } from "@/app/lib/esim/addDataCheckout";
import { formatUsdCents } from "@/app/lib/wallet/display";

export type { RevenuePeriodKey } from "@/app/lib/admin/revenueOverviewShared";

export const BUSINESS_INSIGHTS_TOP_N = 5;

export type InsightRankRow = {
  key: string;
  label: string;
  purchaseCount: number;
  revenueCents: number;
  revenueLabel: string;
};

export type InsightPeriodMetrics = {
  key: RevenuePeriodKey;
  label: string;
  /** New CUSTOMER accounts created in the period. */
  newCustomers: number;
  /**
   * Distinct customers with ≥2 completed (non-company) purchases in the period.
   */
  repeatCustomers: number;
  /** Customer Add More Data catalog sell revenue. */
  customerAddMoreDataRevenueCents: number;
  customerAddMoreDataRevenueLabel: string;
  /** Partner Add More Data wallet charge (separate stream). */
  partnerAddMoreDataRevenueCents: number;
  partnerAddMoreDataRevenueLabel: string;
};

export type AdminBusinessInsightsData = {
  generatedAtLabel: string;
  periods: InsightPeriodMetrics[];
  topCountriesLast30Days: InsightRankRow[];
  topCountriesAllTime: InsightRankRow[];
  topPackagesLast30Days: InsightRankRow[];
  topPackagesAllTime: InsightRankRow[];
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
  return {
    OR: [
      { completedAt: range },
      { AND: [{ completedAt: null }, { createdAt: range }] },
    ],
  };
}

function userCreatedAtFilter(bound: DateBound) {
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

function customerCompletedSalesWhere(
  bound: DateBound
): Prisma.WalletEsimPurchaseWhereInput {
  return {
    status: WalletEsimPurchaseStatus.COMPLETED,
    NOT: { fundingSource: OrderFundingSource.COMPANY_FUNDED },
    ...purchaseCompletedAtFilter(bound),
  };
}

function partnerCompletedSalesWhere(
  bound: DateBound
): Prisma.PartnerEsimPurchaseWhereInput {
  return {
    status: PartnerEsimPurchaseStatus.COMPLETED,
    ...purchaseCompletedAtFilter(bound),
  };
}

function countryLabel(code: string | null): string {
  const trimmed = (code ?? "").trim();
  return trimmed || "Unknown";
}

function packageLabel(row: {
  offerId: string;
  planName: string | null;
  dataAllowance: string | null;
}): string {
  const plan = (row.planName ?? "").trim();
  const data = (row.dataAllowance ?? "").trim();
  if (plan && data) return `${plan} · ${data}`;
  if (plan) return plan;
  if (data) return data;
  return row.offerId;
}

async function resolvePackageLabels(
  offerIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (offerIds.length === 0) return map;

  const rows = await prisma.walletEsimPurchase.findMany({
    where: {
      offerId: { in: offerIds },
      status: WalletEsimPurchaseStatus.COMPLETED,
      NOT: { fundingSource: OrderFundingSource.COMPANY_FUNDED },
    },
    select: {
      offerId: true,
      planName: true,
      dataAllowance: true,
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take: offerIds.length * 4,
  });

  for (const row of rows) {
    if (!map.has(row.offerId)) {
      map.set(row.offerId, packageLabel(row));
    }
  }
  for (const id of offerIds) {
    if (!map.has(id)) map.set(id, id);
  }
  return map;
}

function mapCountryRows(
  rows: Array<{
    destinationCode: string | null;
    _count: { _all: number };
    _sum: { priceCents: number | null };
  }>
): InsightRankRow[] {
  return rows.map((row) => {
    const key = countryLabel(row.destinationCode);
    const revenueCents = centsFromAggregate(row._sum.priceCents);
    return {
      key,
      label: key,
      purchaseCount: row._count._all,
      revenueCents,
      revenueLabel: formatUsdCents(revenueCents),
    };
  });
}

function mapPackageRows(
  rows: Array<{
    offerId: string;
    _count: { _all: number };
    _sum: { priceCents: number | null };
  }>,
  labels: Map<string, string>
): InsightRankRow[] {
  return rows.map((row) => {
    const revenueCents = centsFromAggregate(row._sum.priceCents);
    return {
      key: row.offerId,
      label: labels.get(row.offerId) ?? row.offerId,
      purchaseCount: row._count._all,
      revenueCents,
      revenueLabel: formatUsdCents(revenueCents),
    };
  });
}

/**
 * Aggregated admin business insights. Call only after requireRole("ADMIN").
 * Uses Prisma batch `$transaction([...])` (not interactive, not Promise.all).
 */
export async function getAdminBusinessInsights(
  now: Date = new Date()
): Promise<AdminBusinessInsightsData> {
  const bounds = buildRevenuePeriodBounds(now);
  const last30 = bounds.last30Days;
  const allTime = bounds.allTime;

  const periodOps = REVENUE_PERIOD_ORDER.flatMap((key) => {
    const bound = bounds[key];
    const customerWhere = customerCompletedSalesWhere(bound);
    const partnerWhere = partnerCompletedSalesWhere(bound);
    const addMoreFilter = {
      idempotencyKey: { startsWith: ADD_DATA_IDEMPOTENCY_PREFIX },
    };

    return [
      prisma.user.count({
        where: {
          role: Role.CUSTOMER,
          deletedAt: null,
          ...userCreatedAtFilter(bound),
        },
      }),
      prisma.walletEsimPurchase.groupBy({
        by: ["customerUserId"],
        where: customerWhere,
        _count: { _all: true },
        having: {
          customerUserId: {
            _count: { gte: 2 },
          },
        },
      }),
      prisma.walletEsimPurchase.aggregate({
        _sum: { priceCents: true },
        where: {
          ...customerWhere,
          ...addMoreFilter,
        },
      }),
      prisma.partnerEsimPurchase.aggregate({
        _sum: { partnerChargeCents: true },
        where: {
          ...partnerWhere,
          ...addMoreFilter,
        },
      }),
    ];
  });

  const rankingOps = [
    prisma.walletEsimPurchase.groupBy({
      by: ["destinationCode"],
      where: customerCompletedSalesWhere(last30),
      _count: { _all: true },
      _sum: { priceCents: true },
      orderBy: { _count: { destinationCode: "desc" } },
      take: BUSINESS_INSIGHTS_TOP_N,
    }),
    prisma.walletEsimPurchase.groupBy({
      by: ["destinationCode"],
      where: customerCompletedSalesWhere(allTime),
      _count: { _all: true },
      _sum: { priceCents: true },
      orderBy: { _count: { destinationCode: "desc" } },
      take: BUSINESS_INSIGHTS_TOP_N,
    }),
    prisma.walletEsimPurchase.groupBy({
      by: ["offerId"],
      where: customerCompletedSalesWhere(last30),
      _count: { _all: true },
      _sum: { priceCents: true },
      orderBy: { _count: { offerId: "desc" } },
      take: BUSINESS_INSIGHTS_TOP_N,
    }),
    prisma.walletEsimPurchase.groupBy({
      by: ["offerId"],
      where: customerCompletedSalesWhere(allTime),
      _count: { _all: true },
      _sum: { priceCents: true },
      orderBy: { _count: { offerId: "desc" } },
      take: BUSINESS_INSIGHTS_TOP_N,
    }),
  ];

  const results = await prisma.$transaction([...periodOps, ...rankingOps]);

  const periods: InsightPeriodMetrics[] = REVENUE_PERIOD_ORDER.map(
    (key, index) => {
      const base = index * 4;
      const newCustomers = results[base] as number;
      const repeatGroups = results[base + 1] as Array<{
        customerUserId: string;
        _count: { _all: number };
      }>;
      const customerAddAgg = results[base + 2] as {
        _sum: { priceCents: number | null };
      };
      const partnerAddAgg = results[base + 3] as {
        _sum: { partnerChargeCents: number | null };
      };

      const customerAddMoreDataRevenueCents = centsFromAggregate(
        customerAddAgg._sum.priceCents
      );
      const partnerAddMoreDataRevenueCents = centsFromAggregate(
        partnerAddAgg._sum.partnerChargeCents
      );

      return {
        key,
        label: REVENUE_PERIOD_LABELS[key],
        newCustomers,
        repeatCustomers: repeatGroups.length,
        customerAddMoreDataRevenueCents,
        customerAddMoreDataRevenueLabel: formatUsdCents(
          customerAddMoreDataRevenueCents
        ),
        partnerAddMoreDataRevenueCents,
        partnerAddMoreDataRevenueLabel: formatUsdCents(
          partnerAddMoreDataRevenueCents
        ),
      };
    }
  );

  const rankingBase = REVENUE_PERIOD_ORDER.length * 4;
  const countriesLast30 = results[rankingBase] as Array<{
    destinationCode: string | null;
    _count: { _all: number };
    _sum: { priceCents: number | null };
  }>;
  const countriesAllTime = results[rankingBase + 1] as Array<{
    destinationCode: string | null;
    _count: { _all: number };
    _sum: { priceCents: number | null };
  }>;
  const packagesLast30 = results[rankingBase + 2] as Array<{
    offerId: string;
    _count: { _all: number };
    _sum: { priceCents: number | null };
  }>;
  const packagesAllTime = results[rankingBase + 3] as Array<{
    offerId: string;
    _count: { _all: number };
    _sum: { priceCents: number | null };
  }>;

  const packageOfferIds = [
    ...new Set([
      ...packagesLast30.map((r) => r.offerId),
      ...packagesAllTime.map((r) => r.offerId),
    ]),
  ];
  const packageLabels = await resolvePackageLabels(packageOfferIds);

  return {
    generatedAtLabel: formatGeneratedAt(now),
    periods,
    topCountriesLast30Days: mapCountryRows(countriesLast30),
    topCountriesAllTime: mapCountryRows(countriesAllTime),
    topPackagesLast30Days: mapPackageRows(packagesLast30, packageLabels),
    topPackagesAllTime: mapPackageRows(packagesAllTime, packageLabels),
  };
}
