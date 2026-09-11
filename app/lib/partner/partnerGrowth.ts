/**
 * Partner Growth MVP — read-only sales summary from PartnerEsimPurchase snapshots.
 * Discount savings only (wallet discount model). Never selects or returns provider cost.
 */
import "server-only";

import {
  PartnerEsimPurchaseStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
  PARTNER_GROWTH_PERIOD_LABELS,
  PARTNER_GROWTH_PERIOD_ORDER,
  PARTNER_GROWTH_TOP_N,
  PARTNER_SALES_CSV_HEADERS,
  buildPartnerSalesCsv,
  partnerGrowthPeriodBound,
  type PartnerGrowthPeriodKey,
} from "@/app/lib/partner/partnerGrowthShared";
import { formatUsdCents, formatWalletDateTime } from "@/app/lib/wallet/display";

export type PartnerGrowthMetricBlock = {
  key: PartnerGrowthPeriodKey;
  label: string;
  completedOrders: number;
  retailValueCents: number;
  retailValueLabel: string;
  partnerSpendCents: number;
  partnerSpendLabel: string;
  discountSavingsCents: number;
  discountSavingsLabel: string;
};

export type PartnerGrowthRankRow = {
  key: string;
  label: string;
  purchaseCount: number;
  retailValueCents: number;
  retailValueLabel: string;
  partnerSpendCents: number;
  partnerSpendLabel: string;
  discountSavingsCents: number;
  discountSavingsLabel: string;
};

export type PartnerGrowthSummary = {
  generatedAtLabel: string;
  selectedPeriod: PartnerGrowthPeriodKey;
  periods: PartnerGrowthMetricBlock[];
  selected: PartnerGrowthMetricBlock;
  topDestinations: PartnerGrowthRankRow[];
  topPackages: PartnerGrowthRankRow[];
};

function centsFromAggregate(value: number | bigint | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "bigint" ? Number(value) : value;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function purchaseCompletedAtFilter(bound: {
  gte?: Date;
  lt?: Date;
}): Prisma.PartnerEsimPurchaseWhereInput {
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

function completedSalesWhere(
  partnerId: string,
  bound: { gte?: Date; lt?: Date }
): Prisma.PartnerEsimPurchaseWhereInput {
  return {
    partnerId,
    status: PartnerEsimPurchaseStatus.COMPLETED,
    orderId: { not: null },
    ...purchaseCompletedAtFilter(bound),
  };
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

function shortPurchaseReference(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function destinationLabel(code: string | null, name: string | null): string {
  const n = (name ?? "").trim();
  if (n) return n;
  const c = (code ?? "").trim();
  return c || "Unknown";
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

function toMetricBlock(
  key: PartnerGrowthPeriodKey,
  agg: {
    _count: { _all: number };
    _sum: {
      retailPriceCents: number | null;
      partnerChargeCents: number | null;
    };
  }
): PartnerGrowthMetricBlock {
  const retailValueCents = centsFromAggregate(agg._sum.retailPriceCents);
  const partnerSpendCents = centsFromAggregate(agg._sum.partnerChargeCents);
  const discountSavingsCents = Math.max(0, retailValueCents - partnerSpendCents);
  return {
    key,
    label: PARTNER_GROWTH_PERIOD_LABELS[key],
    completedOrders: agg._count._all,
    retailValueCents,
    retailValueLabel: formatUsdCents(retailValueCents),
    partnerSpendCents,
    partnerSpendLabel: formatUsdCents(partnerSpendCents),
    discountSavingsCents,
    discountSavingsLabel: formatUsdCents(discountSavingsCents),
  };
}

function toRankRows(
  rows: Array<{
    key: string;
    label: string;
    _count: { _all: number };
    _sum: {
      retailPriceCents: number | null;
      partnerChargeCents: number | null;
    };
  }>
): PartnerGrowthRankRow[] {
  return rows.map((row) => {
    const retailValueCents = centsFromAggregate(row._sum.retailPriceCents);
    const partnerSpendCents = centsFromAggregate(row._sum.partnerChargeCents);
    const discountSavingsCents = Math.max(
      0,
      retailValueCents - partnerSpendCents
    );
    return {
      key: row.key,
      label: row.label,
      purchaseCount: row._count._all,
      retailValueCents,
      retailValueLabel: formatUsdCents(retailValueCents),
      partnerSpendCents,
      partnerSpendLabel: formatUsdCents(partnerSpendCents),
      discountSavingsCents,
      discountSavingsLabel: formatUsdCents(discountSavingsCents),
    };
  });
}

/**
 * Partner-facing growth summary. Call after requireRole("PARTNER").
 * Uses batch `$transaction([...])` — not interactive, not Promise.all.
 */
export async function getPartnerGrowthSummary(options: {
  userId: string;
  period: PartnerGrowthPeriodKey;
  now?: Date;
}): Promise<PartnerGrowthSummary | null> {
  const actor = await requireActivePartnerActor(options.userId);
  if (!actor) return null;

  const now = options.now ?? new Date();
  const selectedPeriod = options.period;

  const periodOps = PARTNER_GROWTH_PERIOD_ORDER.map((key) => {
    const bound = partnerGrowthPeriodBound(key, now);
    return prisma.partnerEsimPurchase.aggregate({
      where: completedSalesWhere(actor.partnerId, bound),
      _count: { _all: true },
      _sum: {
        retailPriceCents: true,
        partnerChargeCents: true,
      },
    });
  });

  const selectedBound = partnerGrowthPeriodBound(selectedPeriod, now);
  const selectedWhere = completedSalesWhere(actor.partnerId, selectedBound);

  const rankingOps = [
    prisma.partnerEsimPurchase.groupBy({
      by: ["destinationCode"],
      where: selectedWhere,
      _count: { _all: true },
      _sum: {
        retailPriceCents: true,
        partnerChargeCents: true,
      },
      orderBy: { _count: { destinationCode: "desc" } },
      take: PARTNER_GROWTH_TOP_N,
    }),
    prisma.partnerEsimPurchase.groupBy({
      by: ["offerId"],
      where: selectedWhere,
      _count: { _all: true },
      _sum: {
        retailPriceCents: true,
        partnerChargeCents: true,
      },
      orderBy: { _count: { offerId: "desc" } },
      take: PARTNER_GROWTH_TOP_N,
    }),
  ];

  const results = await prisma.$transaction([...periodOps, ...rankingOps]);

  const periods: PartnerGrowthMetricBlock[] = PARTNER_GROWTH_PERIOD_ORDER.map(
    (key, index) => {
      const agg = results[index] as {
        _count: { _all: number };
        _sum: {
          retailPriceCents: number | null;
          partnerChargeCents: number | null;
        };
      };
      return toMetricBlock(key, agg);
    }
  );

  const selected =
    periods.find((p) => p.key === selectedPeriod) ?? periods[0]!;

  const destGroups = results[periodOps.length] as Array<{
    destinationCode: string | null;
    _count: { _all: number };
    _sum: {
      retailPriceCents: number | null;
      partnerChargeCents: number | null;
    };
  }>;
  const packageGroups = results[periodOps.length + 1] as Array<{
    offerId: string;
    _count: { _all: number };
    _sum: {
      retailPriceCents: number | null;
      partnerChargeCents: number | null;
    };
  }>;

  const destCodes = destGroups
    .map((r) => r.destinationCode)
    .filter((c): c is string => Boolean(c && c.trim()));
  const offerIds = packageGroups.map((r) => r.offerId);

  const labelRows =
    destCodes.length || offerIds.length
      ? await prisma.partnerEsimPurchase.findMany({
          where: {
            partnerId: actor.partnerId,
            status: PartnerEsimPurchaseStatus.COMPLETED,
            orderId: { not: null },
            OR: [
              ...(destCodes.length
                ? [{ destinationCode: { in: destCodes } }]
                : []),
              ...(offerIds.length ? [{ offerId: { in: offerIds } }] : []),
            ],
          },
          select: {
            destinationCode: true,
            destinationName: true,
            offerId: true,
            planName: true,
            dataAllowance: true,
          },
          orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
          take: (destCodes.length + offerIds.length) * 4 || 1,
        })
      : [];

  const destLabelMap = new Map<string, string>();
  const packageLabelMap = new Map<string, string>();
  for (const row of labelRows) {
    const code = (row.destinationCode ?? "").trim();
    if (code && !destLabelMap.has(code)) {
      destLabelMap.set(
        code,
        destinationLabel(row.destinationCode, row.destinationName)
      );
    }
    if (!packageLabelMap.has(row.offerId)) {
      packageLabelMap.set(row.offerId, packageLabel(row));
    }
  }

  return {
    generatedAtLabel: formatGeneratedAt(now),
    selectedPeriod,
    periods,
    selected,
    topDestinations: toRankRows(
      destGroups.map((row) => {
        const code = (row.destinationCode ?? "").trim() || "unknown";
        return {
          key: code,
          label:
            destLabelMap.get(code) ??
            destinationLabel(row.destinationCode, null),
          _count: row._count,
          _sum: row._sum,
        };
      })
    ),
    topPackages: toRankRows(
      packageGroups.map((row) => ({
        key: row.offerId,
        label: packageLabelMap.get(row.offerId) ?? row.offerId,
        _count: row._count,
        _sum: row._sum,
      }))
    ),
  };
}

/**
 * CSV bytes for partner sales in a period. Omits provider cost fields.
 */
export async function buildPartnerSalesExportCsv(options: {
  userId: string;
  period: PartnerGrowthPeriodKey;
  now?: Date;
}): Promise<{ filename: string; csv: string } | null> {
  const actor = await requireActivePartnerActor(options.userId);
  if (!actor) return null;

  const now = options.now ?? new Date();
  const bound = partnerGrowthPeriodBound(options.period, now);
  const rows = await prisma.partnerEsimPurchase.findMany({
    where: completedSalesWhere(actor.partnerId, bound),
    select: {
      id: true,
      completedAt: true,
      createdAt: true,
      destinationCode: true,
      destinationName: true,
      planName: true,
      dataAllowance: true,
      offerId: true,
      retailPriceCents: true,
      partnerChargeCents: true,
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take: 5_000,
  });

  const csvRows: string[][] = [[...PARTNER_SALES_CSV_HEADERS]];
  for (const row of rows) {
    const when = row.completedAt ?? row.createdAt;
    const retail = Math.max(0, row.retailPriceCents);
    const spend = Math.max(0, row.partnerChargeCents);
    const savings = Math.max(0, retail - spend);
    csvRows.push([
      formatWalletDateTime(when),
      destinationLabel(row.destinationCode, row.destinationName),
      (row.planName ?? "").trim(),
      (row.dataAllowance ?? "").trim(),
      row.offerId,
      formatUsdCents(retail),
      formatUsdCents(spend),
      formatUsdCents(savings),
      shortPurchaseReference(row.id),
    ]);
  }

  const stamp = now.toISOString().slice(0, 10);
  return {
    filename: `partner-sales-${options.period}-${stamp}.csv`,
    csv: buildPartnerSalesCsv(csvRows),
  };
}
