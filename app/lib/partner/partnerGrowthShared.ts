/**
 * Offline-safe Partner Growth period + CSV helpers (no DB / server-only).
 */
import {
  REVENUE_PERIOD_LABELS,
  buildRevenuePeriodBounds,
  type DateBound,
  type RevenuePeriodKey,
} from "@/app/lib/admin/revenueOverviewShared";

export type PartnerGrowthPeriodKey =
  | "today"
  | "last7Days"
  | "last30Days"
  | "allTime";

export const PARTNER_GROWTH_PERIOD_ORDER: PartnerGrowthPeriodKey[] = [
  "today",
  "last7Days",
  "last30Days",
  "allTime",
];

export const PARTNER_GROWTH_PERIOD_LABELS: Record<
  PartnerGrowthPeriodKey,
  string
> = {
  today: REVENUE_PERIOD_LABELS.today,
  last7Days: REVENUE_PERIOD_LABELS.last7Days,
  last30Days: REVENUE_PERIOD_LABELS.last30Days,
  allTime: REVENUE_PERIOD_LABELS.allTime,
};

export const PARTNER_GROWTH_TOP_N = 8;

export function isPartnerGrowthPeriodKey(
  value: string | null | undefined
): value is PartnerGrowthPeriodKey {
  return (
    value === "today" ||
    value === "last7Days" ||
    value === "last30Days" ||
    value === "allTime"
  );
}

export function parsePartnerGrowthPeriod(
  raw: string | null | undefined
): PartnerGrowthPeriodKey {
  const v = (raw ?? "").trim();
  if (isPartnerGrowthPeriodKey(v)) return v;
  return "last30Days";
}

export function partnerGrowthPeriodBound(
  key: PartnerGrowthPeriodKey,
  now: Date = new Date()
): DateBound {
  const bounds = buildRevenuePeriodBounds(now);
  return bounds[key as RevenuePeriodKey];
}

/** RFC4180-ish CSV cell escape. */
export function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildPartnerSalesCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}

export const PARTNER_SALES_CSV_HEADERS = [
  "completedAtUtc",
  "destination",
  "planName",
  "dataAllowance",
  "offerId",
  "retailUsd",
  "partnerSpendUsd",
  "discountSavingsUsd",
  "purchaseReference",
] as const;
