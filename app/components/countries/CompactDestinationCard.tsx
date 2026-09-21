import Link from "next/link";
import { ArrowRight, Earth, Globe2, MapPinned } from "lucide-react";
import CurrencyPrice from "@/app/components/plans/CurrencyPrice";
import DestinationFlagBadge from "@/app/components/countries/DestinationFlagBadge";
import type { DestinationCard } from "@/app/lib/vesim/countriesListingModel";

/**
 * Presentational destination card — safe for Server Components.
 * Price uses CurrencyPrice island; flag uses a tiny client badge.
 */
export default function CompactDestinationCard({
  destination,
  href,
}: {
  destination: DestinationCard;
  href: string;
}) {
  const Icon =
    destination.kind === "global"
      ? Earth
      : destination.kind === "regional"
        ? MapPinned
        : Globe2;

  return (
    <Link
      href={href}
      className="
        group flex h-full min-h-[84px] items-center justify-between gap-3
        rounded-2xl border border-[var(--border)] bg-[var(--surface)]
        px-4 py-3
        shadow-[0_6px_16px_rgba(15,23,42,0.06)]
        transition-all duration-200
        hover:-translate-y-[2px]
        hover:border-[var(--border-hover)]
        hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)]
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent-strong)]/55 focus-visible:ring-offset-2
        focus-visible:ring-offset-[var(--page-bg)]
      "
    >
      <div className="flex min-w-0 items-center gap-3">
        <DestinationFlagBadge
          destination={destination}
          iconFallback={<Icon className="h-4 w-4" />}
        />

        <div className="min-w-0 text-left">
          <h3 className="truncate text-[15px] font-semibold text-[var(--heading)]">
            {destination.name}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {destination.plans} {destination.plans === 1 ? "plan" : "plans"}
          </p>
        </div>
      </div>

      <div className="flex max-w-[42%] shrink-0 items-center gap-2 sm:max-w-none sm:gap-2.5">
        <div className="min-w-0 text-right">
          <p className="text-[11px] font-medium text-[var(--text-soft)]">From</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-[var(--accent-soft)]">
            <CurrencyPrice amountUsd={destination.minPriceUsd} />
          </p>
        </div>
        <ArrowRight
          className="
            h-4 w-4 text-[var(--text-soft)] transition-transform
            group-hover:translate-x-0.5 group-hover:text-[var(--heading)]
          "
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
