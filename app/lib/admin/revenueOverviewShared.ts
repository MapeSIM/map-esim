/**
 * Offline-safe revenue period helpers (no database client or mail config).
 */

export type RevenuePeriodKey =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "allTime";

export type DateBound = {
  gte?: Date;
  lt?: Date;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** UTC midnight for the calendar day of `date`. */
export function utcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/**
 * Build exclusive/inclusive UTC windows for revenue + order KPIs.
 * last7 / last30 include today (calendar windows from todayStart).
 */
export function buildRevenuePeriodBounds(now: Date = new Date()): Record<
  RevenuePeriodKey,
  DateBound
> {
  const todayStart = utcDayStart(now);
  const yesterdayStart = new Date(todayStart.getTime() - MS_PER_DAY);
  const last7Start = new Date(todayStart.getTime() - 6 * MS_PER_DAY);
  const last30Start = new Date(todayStart.getTime() - 29 * MS_PER_DAY);

  return {
    today: { gte: todayStart },
    yesterday: { gte: yesterdayStart, lt: todayStart },
    last7Days: { gte: last7Start },
    last30Days: { gte: last30Start },
    allTime: {},
  };
}

export const REVENUE_PERIOD_LABELS: Record<RevenuePeriodKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7Days: "Last 7 days",
  last30Days: "Last 30 days",
  allTime: "All time",
};

export const REVENUE_PERIOD_ORDER: RevenuePeriodKey[] = [
  "today",
  "yesterday",
  "last7Days",
  "last30Days",
  "allTime",
];
