"use client";

import { type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Filter } from "lucide-react";
import {
  formatValidityPill,
  type CategoryFilter,
  type PlanTypeFilter,
  type SortOption,
} from "@/app/lib/plans/plan-utils";

const SortSelect = dynamic(() => import("@/app/components/plans/SortSelect"), {
  ssr: false,
  loading: () => (
    <div
      className="h-11 min-w-[10.5rem] rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)]"
      aria-hidden
    />
  ),
});

export type PlansListingControlsProps = {
  showPlanTypeToggle: boolean;
  planType: PlanTypeFilter;
  onPlanTypeChange: (next: PlanTypeFilter) => void;
  planTypeSummary: { dataOnly: number; withVoice: number };
  showPackageTabs: boolean;
  activeCategory: CategoryFilter;
  onCategoryChange: (next: CategoryFilter) => void;
  categorySummary: { standard: number; unlimited: number };
  unlimitedTabEnabled: boolean;
  filtersOpen: boolean;
  onToggleFiltersOpen: () => void;
  activeFilterCount: number;
  sort: SortOption;
  onSortChange: (next: SortOption) => void;
  sortOptions: { value: SortOption; label: string }[];
  dataOptions: string[];
  dataAmounts: string[];
  onToggleDataAmount: (value: string) => void;
  validityOptions: number[];
  validities: number[];
  onToggleValidity: (value: number) => void;
  coverageOptions: string[];
  coveredCountries: string[];
  onToggleCoverage: (value: string) => void;
  countryNames: Record<string, string>;
  onClearFilters: () => void;
};

function PillButton({
  active,
  onClick,
  children,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex h-10 items-center justify-center rounded-full
        border px-3 text-xs font-semibold transition
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent-strong)]/55 focus-visible:ring-offset-2
        focus-visible:ring-offset-[var(--page-bg)]
        disabled:cursor-not-allowed disabled:opacity-45
        sm:px-4 sm:text-sm
        ${
          active
            ? "border-[var(--accent-strong)] bg-[var(--accent-strong)] text-[var(--accent-ink)] shadow-[0_0_0_1px_rgba(124,255,0,0.25)]"
            : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]"
        }
      `}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        rounded-full border px-3.5 py-2 text-xs font-semibold transition
        ${
          active
            ? "border-[var(--accent-strong)] bg-[var(--accent-strong)] text-[var(--accent-ink)] shadow-[0_0_0_1px_rgba(124,255,0,0.2)]"
            : "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--border-hover)]"
        }
      `}
    >
      {children}
    </button>
  );
}

/** Filters, package tabs, and sort — client-only interactive chrome. */
export default function PlansListingControls({
  showPlanTypeToggle,
  planType,
  onPlanTypeChange,
  planTypeSummary,
  showPackageTabs,
  activeCategory,
  onCategoryChange,
  categorySummary,
  unlimitedTabEnabled,
  filtersOpen,
  onToggleFiltersOpen,
  activeFilterCount,
  sort,
  onSortChange,
  sortOptions,
  dataOptions,
  dataAmounts,
  onToggleDataAmount,
  validityOptions,
  validities,
  onToggleValidity,
  coverageOptions,
  coveredCountries,
  onToggleCoverage,
  countryNames,
  onClearFilters,
}: PlansListingControlsProps) {
  return (
    <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.22)] sm:p-5">
      <div className="flex flex-col gap-2.5 sm:gap-4">
        {showPlanTypeToggle && (
          <div className="flex flex-wrap gap-2">
            <PillButton
              active={planType === "data"}
              onClick={() => onPlanTypeChange("data")}
            >
              Data only ({planTypeSummary.dataOnly})
            </PillButton>
            <PillButton
              active={planType === "voice"}
              onClick={() => onPlanTypeChange("voice")}
            >
              Data + SMS & Voice ({planTypeSummary.withVoice})
            </PillButton>
          </div>
        )}

        {showPackageTabs && (
          <div className="space-y-1.5 sm:space-y-2">
            <p className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] sm:block">
              Package type
            </p>
            <div className="flex w-full flex-row flex-wrap gap-2">
              <PillButton
                active={activeCategory === "standard"}
                onClick={() => onCategoryChange("standard")}
                disabled={categorySummary.standard === 0}
              >
                {`Standard · ${categorySummary.standard} plan${
                  categorySummary.standard === 1 ? "" : "s"
                }`}
              </PillButton>
              <PillButton
                active={activeCategory === "unlimited"}
                onClick={() => onCategoryChange("unlimited")}
                disabled={!unlimitedTabEnabled}
              >
                {`Unlimited · ${categorySummary.unlimited} plan${
                  categorySummary.unlimited === 1 ? "" : "s"
                }`}
              </PillButton>
            </div>
          </div>
        )}

        <div className="flex w-full flex-row items-center gap-2 sm:justify-between">
          <button
            type="button"
            onClick={onToggleFiltersOpen}
            className={`
              inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2
              rounded-full border px-4 text-sm font-semibold transition
              sm:h-11 sm:w-auto sm:flex-none sm:px-5
              ${
                filtersOpen || activeFilterCount > 0
                  ? "border-[var(--accent-strong)] bg-[var(--accent-strong)]/12 text-[var(--heading)]"
                  : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--heading)] hover:border-[var(--border-hover)]"
              }
            `}
          >
            <Filter className="h-4 w-4 text-[var(--accent-strong)]" />
            Filters
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-[var(--accent-strong)] px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)]">
                {activeFilterCount}
              </span>
            )}
          </button>

          <SortSelect
            value={sort}
            onChange={onSortChange}
            options={sortOptions}
          />
        </div>
      </div>

      {filtersOpen && (
        <div className="mt-5 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-3)] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Refine plans
            </h2>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onClearFilters}
                className="text-xs font-semibold text-[var(--accent-strong)] hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-3 text-sm font-semibold text-[var(--heading)]">
                Data amount
              </p>
              <div className="flex flex-wrap gap-2">
                {dataOptions.map((amount) => (
                  <FilterChip
                    key={amount}
                    active={dataAmounts.includes(amount)}
                    onClick={() => onToggleDataAmount(amount)}
                  >
                    {amount}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-[var(--heading)]">
                Validity period
              </p>
              <div className="flex flex-wrap gap-2">
                {validityOptions.map((days) => (
                  <FilterChip
                    key={days}
                    active={validities.includes(days)}
                    onClick={() => onToggleValidity(days)}
                  >
                    {formatValidityPill(days)}
                  </FilterChip>
                ))}
              </div>
            </div>

            {coverageOptions.length > 0 && (
              <div>
                <p className="mb-3 text-sm font-semibold text-[var(--heading)]">
                  Countries covered
                </p>
                <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                  {coverageOptions.map((code) => (
                    <FilterChip
                      key={code}
                      active={coveredCountries.includes(code)}
                      onClick={() => onToggleCoverage(code)}
                    >
                      {countryNames[code] || code}
                    </FilterChip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
