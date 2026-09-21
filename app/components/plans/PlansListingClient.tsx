"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import type { VesimDestination } from "@/app/lib/vesim/destinations";
import {
  buildCheckoutHref,
  buildPartnerCheckoutHref,
  uniqueCoveredCountries,
  uniqueDataAmounts,
  uniqueValidities,
  type CategoryFilter,
  type PlanTypeFilter,
  type SortOption,
} from "@/app/lib/plans/plan-utils";
import { planPurchaseTrustLine } from "@/app/lib/plans/planCardConversion";
import {
  buildPlansListingModel,
  DEFAULT_CATEGORY,
  DEFAULT_PLAN_TYPE,
  DEFAULT_SORT,
  isDefaultPlansListingState,
} from "@/app/lib/plans/planListingModel";
import { useShellAuth } from "@/app/components/auth/ShellAuthContext";
import PlansListingControls from "@/app/components/plans/PlansListingControls";
import PlansOfferGroups from "@/app/components/plans/PlansOfferGroups";
import { PlansListingChromeProvider } from "@/app/components/plans/PlansListingChrome";

const PlanDetailsModal = dynamic(
  () => import("@/app/components/plans/PlanDetailsModal"),
  { ssr: false }
);

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "data-asc", label: "Data: Low to High" },
  { value: "data-desc", label: "Data: High to Low" },
  { value: "validity-asc", label: "Validity: Shortest" },
  { value: "validity-desc", label: "Validity: Longest" },
];

export type PlansListingClientProps = {
  destination: VesimDestination;
  offers: VesimOffer[];
  loading?: boolean;
  error?: string;
  countryNames?: Record<string, string>;
  /** RSC default card grid — shown until filters/sort diverge from defaults. */
  defaultGrid: ReactNode;
};

export default function PlansListingClient({
  destination,
  offers,
  loading = false,
  error = "",
  countryNames = {},
  defaultGrid,
}: PlansListingClientProps) {
  const [planType, setPlanType] = useState<PlanTypeFilter>(DEFAULT_PLAN_TYPE);
  const [category, setCategory] = useState<CategoryFilter>(DEFAULT_CATEGORY);
  const [dataAmounts, setDataAmounts] = useState<string[]>([]);
  const [validities, setValidities] = useState<number[]>([]);
  const [coveredCountries, setCoveredCountries] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<VesimOffer | null>(null);
  const { signedIn, isPartner: partnerCheckout } = useShellAuth();
  const purchaseTrustLine = planPurchaseTrustLine(signedIn);

  const resolveCheckoutHref = partnerCheckout
    ? buildPartnerCheckoutHref
    : buildCheckoutHref;

  const model = useMemo(
    () =>
      buildPlansListingModel({
        offers,
        destination,
        planType,
        category,
        dataAmounts,
        validities,
        coveredCountries,
        sort,
      }),
    [
      offers,
      destination,
      planType,
      category,
      dataAmounts,
      validities,
      coveredCountries,
      sort,
    ]
  );

  const usingDefaults = isDefaultPlansListingState({
    planType,
    category,
    dataAmounts,
    validities,
    coveredCountries,
    sort,
    showPlanTypeToggle: model.showPlanTypeToggle,
    showPackageTabs: model.showPackageTabs,
    unlimitedTabEnabled: model.unlimitedTabEnabled,
  });

  const dataOptions = useMemo(
    () => uniqueDataAmounts(model.categoryOffers),
    [model.categoryOffers]
  );
  const validityOptions = useMemo(
    () => uniqueValidities(model.categoryOffers),
    [model.categoryOffers]
  );
  const coverageOptions = useMemo(
    () =>
      model.isRegionalOrGlobal
        ? uniqueCoveredCountries(model.categoryOffers)
        : [],
    [model.isRegionalOrGlobal, model.categoryOffers]
  );

  function selectCategory(next: CategoryFilter) {
    if (next === "unlimited" && !model.unlimitedTabEnabled) return;
    setCategory(next);
    setDataAmounts([]);
    setValidities([]);
    setCoveredCountries([]);
  }

  const activeFilterCount =
    dataAmounts.length + validities.length + coveredCountries.length;

  const emptyHint =
    model.activeCategory === "unlimited" &&
    model.categorySummary.unlimited === 0
      ? "This destination has no unlimited packages right now."
      : "Try clearing one or more filters to see more results.";

  const detailsLabel = model.isRegionalOrGlobal
    ? "Coverage details"
    : "Plan Details";

  return (
    <PlansListingChromeProvider
      offers={offers}
      detailsLabel={detailsLabel}
      resolveCheckoutHref={resolveCheckoutHref}
      purchaseTrustLine={purchaseTrustLine || undefined}
      onOpenDetails={setSelectedOffer}
    >
      <section className="mx-auto max-w-[1200px] px-4 pt-4 pb-6 sm:px-6 sm:py-10">
        <p className="mb-3 text-xs leading-snug text-[var(--text-muted)] sm:mb-6 sm:text-sm sm:leading-relaxed">
          Confirm your phone supports eSIM and is unlocked.{" "}
          <Link
            href="/device-compatibility"
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            Check compatibility →
          </Link>
        </p>

        {loading && (
          <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-10 text-center text-[var(--text)]">
            Loading eSIM plans...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-8 text-center">
            <h2 className="text-xl font-bold text-[var(--danger-text)]">
              Could not load plans
            </h2>
            <p className="mt-3 text-sm text-[var(--danger-text)]">{error}</p>
          </div>
        )}

        {!loading && !error && offers.length === 0 && (
          <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-10 text-center">
            <h2 className="text-xl font-bold">No plans available</h2>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              No eSIM offers were returned for {destination.name} right now.
            </p>
          </div>
        )}

        {!loading && !error && offers.length > 0 && (
          <>
            <PlansListingControls
              showPlanTypeToggle={model.showPlanTypeToggle}
              planType={planType}
              onPlanTypeChange={setPlanType}
              planTypeSummary={model.planTypeSummary}
              showPackageTabs={model.showPackageTabs}
              activeCategory={model.activeCategory}
              onCategoryChange={selectCategory}
              categorySummary={model.categorySummary}
              unlimitedTabEnabled={model.unlimitedTabEnabled}
              filtersOpen={filtersOpen}
              onToggleFiltersOpen={() => setFiltersOpen((open) => !open)}
              activeFilterCount={activeFilterCount}
              sort={sort}
              onSortChange={setSort}
              sortOptions={SORT_OPTIONS}
              dataOptions={dataOptions}
              dataAmounts={dataAmounts}
              onToggleDataAmount={(value) =>
                setDataAmounts((current) =>
                  current.includes(value)
                    ? current.filter((item) => item !== value)
                    : [...current, value]
                )
              }
              validityOptions={validityOptions}
              validities={validities}
              onToggleValidity={(value) =>
                setValidities((current) =>
                  current.includes(value)
                    ? current.filter((item) => item !== value)
                    : [...current, value]
                )
              }
              coverageOptions={coverageOptions}
              coveredCountries={coveredCountries}
              onToggleCoverage={(value) =>
                setCoveredCountries((current) =>
                  current.includes(value)
                    ? current.filter((item) => item !== value)
                    : [...current, value]
                )
              }
              countryNames={countryNames}
              onClearFilters={() => {
                setDataAmounts([]);
                setValidities([]);
                setCoveredCountries([]);
              }}
            />

            {usingDefaults ? (
              defaultGrid
            ) : (
              <PlansOfferGroups
                groups={model.groups}
                destination={destination}
                isRegionalOrGlobal={model.isRegionalOrGlobal}
                filteredCount={model.filtered.length}
                categoryOffersCount={model.categoryOffers.length}
                activeCategoryLabel={model.activeCategory}
                totalOffersCount={offers.length}
                showPackageTabs={model.showPackageTabs}
                emptyHint={emptyHint}
              />
            )}
          </>
        )}
      </section>

      <PlanDetailsModal
        offer={selectedOffer}
        destination={destination}
        countryNames={countryNames}
        onClose={() => setSelectedOffer(null)}
        coverageFocused={model.isRegionalOrGlobal}
        checkoutHref={resolveCheckoutHref}
        purchaseTrustLine={purchaseTrustLine}
      />
    </PlansListingChromeProvider>
  );
}
