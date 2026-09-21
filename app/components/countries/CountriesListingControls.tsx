"use client";

import {
  Earth,
  Flag,
  MapPinned,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  COUNTRY_LISTING_FILTERS,
  type CountryListingFilterId,
} from "@/app/lib/vesim/countriesListingModel";

const FILTER_ICONS: Record<CountryListingFilterId, LucideIcon> = {
  Country: Flag,
  Popular: Sparkles,
  Regional: MapPinned,
  Global: Earth,
};

type SharedProps = {
  search: string;
  onSearchChange: (value: string) => void;
  filter: CountryListingFilterId;
  onFilterChange: (filter: CountryListingFilterId) => void;
};

/** Hero search field. */
export function CountriesListingHeroSearch({
  search,
  onSearchChange,
}: Pick<SharedProps, "search" | "onSearchChange">) {
  return (
    <div className="relative mx-auto mt-4 w-full max-w-[620px] sm:mt-7">
      <label htmlFor="destination-search" className="sr-only">
        Search by country or region
      </label>
      <Search
        className="
          pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px]
          -translate-y-1/2 text-[var(--text-soft)]
        "
        aria-hidden="true"
      />
      <input
        id="destination-search"
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by country or region"
        className="
          w-full rounded-[16px]
          border border-[var(--border-strong)]
          bg-[var(--surface-2)]
          py-3 pl-11 pr-4
          text-sm text-[var(--heading)] placeholder:text-[var(--text-soft)]
          shadow-[0_8px_30px_rgba(0,0,0,0.25)]
          transition-all
          hover:border-[var(--border-hover)]
          focus:border-[var(--accent-strong)]/50 focus:outline-none
          focus:ring-2 focus:ring-[var(--accent-strong)]/25
          sm:py-3.5 sm:text-[15px]
        "
      />
    </div>
  );
}

/** Sticky mobile search + filter chips (outside hero). */
export default function CountriesListingControls({
  search,
  onSearchChange,
  filter,
  onFilterChange,
}: SharedProps) {
  return (
    <div
      className="
        sticky top-16 z-40 sm:top-[72px]
        border-b border-[var(--border)]
        bg-[var(--page-bg)]/95 backdrop-blur-md
      "
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="pt-2.5 sm:hidden">
          <div className="relative">
            <label htmlFor="destination-search-sticky" className="sr-only">
              Search by country or region
            </label>
            <Search
              className="
                pointer-events-none absolute left-3 top-1/2 h-4 w-4
                -translate-y-1/2 text-[var(--text-soft)]
              "
              aria-hidden="true"
            />
            <input
              id="destination-search-sticky"
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search destinations"
              className="
                w-full rounded-full
                border border-[var(--border-strong)]
                bg-[var(--surface)]
                py-2 pl-9 pr-3
                text-sm text-[var(--heading)] placeholder:text-[var(--text-soft)]
                focus:border-[var(--accent-strong)]/50 focus:outline-none
                focus:ring-2 focus:ring-[var(--accent-strong)]/25
              "
            />
          </div>
        </div>
        <div
          className="
            flex flex-wrap items-center justify-center gap-2
            py-2.5 sm:gap-2.5 sm:py-4
          "
          role="group"
          aria-label="Destination filters"
        >
          {COUNTRY_LISTING_FILTERS.map(({ id, label }) => {
            const Icon = FILTER_ICONS[id];
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onFilterChange(id)}
                aria-pressed={active}
                className={`
                  inline-flex min-h-10 items-center gap-1.5
                  rounded-full border px-3 text-xs font-medium
                  transition-all sm:gap-2 sm:px-4 sm:text-sm
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--accent-strong)]/55 focus-visible:ring-offset-2
                  focus-visible:ring-offset-[var(--page-bg)]
                  ${
                    active
                      ? "border-transparent bg-[var(--accent-strong)] text-[var(--accent-ink)] shadow-[0_4px_14px_rgba(124,255,0,0.2)]"
                      : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)] hover:text-[var(--heading)]"
                  }
                `}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
