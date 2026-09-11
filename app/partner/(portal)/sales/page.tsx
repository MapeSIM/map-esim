import Link from "next/link";
import {
  getPartnerGrowthSummary,
  type PartnerGrowthMetricBlock,
  type PartnerGrowthRankRow,
} from "@/app/lib/partner/partnerGrowth";
import {
  PARTNER_GROWTH_PERIOD_ORDER,
  parsePartnerGrowthPeriod,
  type PartnerGrowthPeriodKey,
} from "@/app/lib/partner/partnerGrowthShared";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

const SALES_UNAVAILABLE =
  "Sales data is temporarily unavailable. Please refresh shortly.";

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--heading)]">
        {value}
      </p>
      {note ? (
        <p className="mt-2 text-xs leading-snug text-[var(--text-muted)]">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function PeriodTabs({
  selected,
}: {
  selected: PartnerGrowthPeriodKey;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label="Sales period"
    >
      {PARTNER_GROWTH_PERIOD_ORDER.map((key) => {
        const active = key === selected;
        return (
          <Link
            key={key}
            href={`/partner/sales?period=${key}`}
            role="tab"
            aria-selected={active}
            className={`inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] ${
              active
                ? "bg-[var(--accent-strong)] text-[var(--accent-ink)]"
                : "border border-[var(--border-strong)] text-[var(--heading)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {
              (
                {
                  today: "Today",
                  last7Days: "Last 7 days",
                  last30Days: "Last 30 days",
                  allTime: "All time",
                } as const
              )[key]
            }
          </Link>
        );
      })}
    </div>
  );
}

function RankTable({
  title,
  caption,
  rows,
  emptyLabel,
}: {
  title: string;
  caption: string;
  rows: PartnerGrowthRankRow[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
      <h3 className="text-sm font-semibold text-[var(--heading)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{caption}</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">{emptyLabel}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.08em] text-[var(--text-soft)]">
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Orders</th>
                <th className="py-2 pr-3 font-semibold">Retail</th>
                <th className="py-2 pr-3 font-semibold">Spend</th>
                <th className="py-2 font-semibold">Savings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${title}-${row.key}`}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <td className="py-2.5 pr-3 text-[var(--text-muted)]">
                    {index + 1}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-[var(--heading)]">
                    {row.label}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--heading)]">
                    {row.purchaseCount}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--heading)]">
                    {row.retailValueLabel}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--heading)]">
                    {row.partnerSpendLabel}
                  </td>
                  <td className="py-2.5 font-semibold text-[var(--heading)]">
                    {row.discountSavingsLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PeriodOverviewCards({ periods }: { periods: PartnerGrowthMetricBlock[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {periods.map((block) => (
        <div
          key={block.key}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
            {block.label}
          </p>
          <p className="mt-2 text-lg font-bold tracking-tight text-[var(--heading)]">
            {block.completedOrders}{" "}
            <span className="text-sm font-semibold text-[var(--text-muted)]">
              orders
            </span>
          </p>
          <dl className="mt-3 space-y-1.5 text-xs text-[var(--text-muted)]">
            <div className="flex justify-between gap-2">
              <dt>Retail</dt>
              <dd className="font-semibold text-[var(--heading)]">
                {block.retailValueLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Spend</dt>
              <dd className="font-semibold text-[var(--heading)]">
                {block.partnerSpendLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Savings</dt>
              <dd className="font-semibold text-[var(--heading)]">
                {block.discountSavingsLabel}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

export default async function PartnerSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireRole("PARTNER");
  const params = await searchParams;
  const period = parsePartnerGrowthPeriod(params.period);

  let summary: Awaited<ReturnType<typeof getPartnerGrowthSummary>>;
  try {
    summary = await getPartnerGrowthSummary({
      userId: user.id,
      period,
    });
  } catch {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        </header>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {SALES_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        </header>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Partner access is unavailable.
          </p>
        </div>
      </div>
    );
  }

  const selected = summary.selected;
  const exportHref = `/api/partner/sales/export?period=${selected.key}`;

  return (
    <div className="space-y-8">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Partner purchase summary from completed eSIM orders. Discount
            savings equal retail minus Partner wallet spend.
          </p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">
            Generated {summary.generatedAtLabel}
          </p>
        </div>
        <a
          href={exportHref}
          className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        >
          Export CSV
        </a>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Period overview
        </h2>
        <PeriodOverviewCards periods={summary.periods} />
      </section>

      <section className="space-y-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Selected period · {selected.label}
          </h2>
          <PeriodTabs selected={selected.key} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Completed orders"
            value={selected.completedOrders}
            note="Completed Partner eSIM purchases with an order"
          />
          <StatCard
            label="Retail value"
            value={selected.retailValueLabel}
            note="Catalog retail total (USD)"
          />
          <StatCard
            label="Partner spend"
            value={selected.partnerSpendLabel}
            note="Wallet debit total after Partner discount"
          />
          <StatCard
            label="Discount savings"
            value={selected.discountSavingsLabel}
            note="Retail minus Partner spend"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <RankTable
          title="Top destinations"
          caption={`By completed orders · ${selected.label}`}
          rows={summary.topDestinations}
          emptyLabel="No completed sales in this period yet."
        />
        <RankTable
          title="Top packages"
          caption={`By completed orders · ${selected.label}`}
          rows={summary.topPackages}
          emptyLabel="No completed sales in this period yet."
        />
      </section>

      <p className="text-xs text-[var(--text-soft)]">
        CSV export includes retail, Partner spend, and discount savings only.
      </p>
    </div>
  );
}
