"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Filter,
  Globe2,
  MapPinned,
} from "lucide-react";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import type { VesimDestination } from "@/app/lib/vesim/destinations";
import { destinationPath } from "@/app/lib/vesim/destinations";
import { PAKISTAN_FLAG_PUBLIC_PATH } from "@/app/lib/seo/siteGraph";
import PlanDetailsModal from "@/app/components/plans/PlanDetailsModal";
import SortSelect from "@/app/components/plans/SortSelect";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";
import {
  buildCheckoutHref,
  filterOffers,
  formatValidityPhrase,
  formatValidityPill,
  groupOffersByDuration,
  isUnlimitedOffer,
  sortOffers,
  summarizeCategories,
  summarizePlanTypes,
  uniqueCoveredCountries,
  uniqueDataAmounts,
  uniqueValidities,
  type CategoryFilter,
  type PlanFiltersState,
  type PlanTypeFilter,
  type SortOption,
} from "@/app/lib/plans/plan-utils";

type PlansListingProps = {
  destination: VesimDestination;
  offers: VesimOffer[];
  loading?: boolean;
  error?: string;
  countryNames?: Record<string, string>;
  relatedRegional?: VesimDestination | null;
};

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "data-asc", label: "Data: Low to High" },
  { value: "data-desc", label: "Data: High to Low" },
  { value: "validity-asc", label: "Validity: Shortest" },
  { value: "validity-desc", label: "Validity: Longest" },
];

function getFlagUrl(code?: string) {
  if (!code || code.length !== 2) return null;
  // Local asset — avoids blank placeholder when remote/emoji flags fail.
  if (code.toUpperCase() === "PK") {
    return PAKISTAN_FLAG_PUBLIC_PATH;
  }
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

function PillButton({
  active,
  onClick,
  children,
  disabled = false,
  fullWidthOnMobile = false,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  fullWidthOnMobile?: boolean;
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
        ${fullWidthOnMobile ? "w-full min-[400px]:w-auto" : ""}
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

export default function PlansListing({
  destination,
  offers,
  loading = false,
  error = "",
  countryNames = {},
  relatedRegional = null,
}: PlansListingProps) {
  const isRegionalOrGlobal =
    destination.kind === "regional" || destination.kind === "global";

  const [planType, setPlanType] = useState<PlanTypeFilter>("data");
  const [category, setCategory] = useState<CategoryFilter>("standard");
  const [dataAmounts, setDataAmounts] = useState<string[]>([]);
  const [validities, setValidities] = useState<number[]>([]);
  const [coveredCountries, setCoveredCountries] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>("price-asc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<VesimOffer | null>(null);
  const { formatPrice } = useCurrency();

  const planTypeSummary = useMemo(() => summarizePlanTypes(offers), [offers]);
  const categorySummary = useMemo(() => summarizeCategories(offers), [offers]);
  const showPlanTypeToggle =
    planTypeSummary.dataOnly > 0 && planTypeSummary.withVoice > 0;

  // Regional/global: always expose package tabs when offers exist.
  // Country pages: only when real unlimited offers exist.
  const showPackageTabs =
    offers.length > 0 &&
    (isRegionalOrGlobal || categorySummary.unlimited > 0);
  const showUnlimitedTab =
    categorySummary.unlimited > 0 || isRegionalOrGlobal;
  const unlimitedTabEnabled = categorySummary.unlimited > 0;

  // Clamp via derived state so disabled Unlimited never filters/shows as active.
  const activeCategory: CategoryFilter =
    showPackageTabs && category === "unlimited" && unlimitedTabEnabled
      ? "unlimited"
      : "standard";

  const categoryOffers = useMemo(
    () =>
      offers.filter((offer) =>
        activeCategory === "unlimited"
          ? isUnlimitedOffer(offer)
          : !isUnlimitedOffer(offer)
      ),
    [offers, activeCategory]
  );

  const filters: PlanFiltersState = useMemo(
    () => ({
      planType: showPlanTypeToggle ? planType : "data",
      category: activeCategory,
      dataAmounts,
      validities,
      coveredCountries,
    }),
    [
      showPlanTypeToggle,
      planType,
      activeCategory,
      dataAmounts,
      validities,
      coveredCountries,
    ]
  );

  const filtered = useMemo(
    () => sortOffers(filterOffers(offers, filters), sort),
    [offers, filters, sort]
  );

  const groups = useMemo(
    () => groupOffersByDuration(filtered, sort),
    [filtered, sort]
  );
  // Filter pills reflect the active package tab only.
  const dataOptions = useMemo(
    () => uniqueDataAmounts(categoryOffers),
    [categoryOffers]
  );
  const validityOptions = useMemo(
    () => uniqueValidities(categoryOffers),
    [categoryOffers]
  );
  const coverageOptions = useMemo(
    () =>
      isRegionalOrGlobal ? uniqueCoveredCountries(categoryOffers) : [],
    [isRegionalOrGlobal, categoryOffers]
  );

  function selectCategory(next: CategoryFilter) {
    if (next === "unlimited" && !unlimitedTabEnabled) return;
    setCategory(next);
    setDataAmounts([]);
    setValidities([]);
    setCoveredCountries([]);
  }

  const activeFilterCount =
    dataAmounts.length + validities.length + coveredCountries.length;

  const flagUrl =
    destination.kind === "country" ? getFlagUrl(destination.code) : null;

  function toggleDataAmount(value: string) {
    setDataAmounts((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  function toggleValidity(value: number) {
    setValidities((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  function toggleCoverage(value: string) {
    setCoveredCountries((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  function clearFilters() {
    setDataAmounts([]);
    setValidities([]);
    setCoveredCountries([]);
  }

  const heading =
    destination.kind === "country"
      ? `${destination.name} eSIM Plans`
      : `${destination.name} eSIM Plans`;

  const heroSummary = loading
    ? "Loading available plans..."
    : `${offers.length} plan${offers.length === 1 ? "" : "s"} available`;

  return (
    <main className="min-h-screen overflow-x-clip bg-[var(--page-bg)] text-[var(--heading)]">
      <section className="theme-hero border-b border-[var(--border)]">
        {/* Extra mobile top padding keeps hero clear of the sticky navbar. */}
        <div className="mx-auto max-w-[1200px] px-4 pb-5 pt-8 sm:px-6 sm:py-8">
          <Link
            href="/countries"
            className="
              mb-4 inline-flex max-w-full items-center gap-2 text-sm font-medium
              text-[var(--text-muted)] transition hover:text-[var(--accent-strong)]
              sm:mb-5
            "
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">All Destinations</span>
          </Link>

          <div className="flex items-start gap-3 sm:gap-4">
            <div
              className="
                flex h-12 w-12 shrink-0 items-center justify-center
                rounded-2xl border border-[var(--border-strong)]
                bg-[var(--surface)] shadow-[0_10px_30px_rgba(0,0,0,0.25)]
                sm:h-16 sm:w-16
              "
            >
              {flagUrl ? (
                <Image
                  src={flagUrl}
                  alt={`${destination.name} flag`}
                  width={64}
                  height={64}
                  sizes="64px"
                  priority
                  className="h-full w-full rounded-2xl object-cover"
                />
              ) : destination.kind === "country" && destination.flag ? (
                <span className="text-2xl sm:text-3xl">{destination.flag}</span>
              ) : destination.kind === "regional" ? (
                <span className="flex h-full w-full flex-col items-center justify-center rounded-2xl bg-[var(--accent-strong)]/10 text-[var(--accent-strong)]">
                  <MapPinned className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                </span>
              ) : (
                <Globe2 className="h-6 w-6 text-[var(--accent-strong)] sm:h-7 sm:w-7" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
                {destination.kind === "country"
                  ? "Country plans"
                  : destination.kind === "regional"
                    ? "Regional plans"
                    : "Global plans"}
              </p>
              <h1 className="mt-1 break-words text-[1.65rem] font-bold leading-tight tracking-tight text-[var(--heading)] sm:text-4xl sm:leading-none">
                {heading}
              </h1>
              <p className="mt-1.5 text-sm text-[var(--text-muted)] sm:text-base">
                {heroSummary}
              </p>
            </div>
          </div>

          {destination.kind === "country" && relatedRegional && (
            <Link
              href={destinationPath(relatedRegional)}
              className="
                mt-5 flex items-center justify-between gap-3 rounded-2xl
                border border-[var(--border-strong)] bg-[var(--surface-3)]
                px-4 py-3.5 text-sm text-[var(--text)] transition
                hover:border-[var(--accent-strong)]/45 hover:bg-[var(--surface)]
              "
            >
              <div className="min-w-0">
                <p className="font-semibold text-[var(--heading)]">
                  Browse regional plans
                </p>
                <p className="mt-0.5 text-[var(--text-muted)]">
                  Explore {relatedRegional.name} multi-country eSIMs — sometimes
                  better value across a trip.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10">
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
            <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] sm:p-5">
              <div className="flex flex-col gap-4">
                {showPlanTypeToggle && (
                  <div className="flex flex-wrap gap-2">
                    <PillButton
                      active={planType === "data"}
                      onClick={() => setPlanType("data")}
                    >
                      Data only ({planTypeSummary.dataOnly})
                    </PillButton>
                    <PillButton
                      active={planType === "voice"}
                      onClick={() => setPlanType("voice")}
                    >
                      Data + SMS & Voice ({planTypeSummary.withVoice})
                    </PillButton>
                  </div>
                )}

                {showPackageTabs && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Package type
                    </p>
                    <div className="flex w-full flex-col gap-2 min-[400px]:flex-row min-[400px]:flex-wrap">
                      <PillButton
                        active={activeCategory === "standard"}
                        onClick={() => selectCategory("standard")}
                        disabled={categorySummary.standard === 0}
                        fullWidthOnMobile
                      >
                        {`Standard · ${categorySummary.standard} plan${
                          categorySummary.standard === 1 ? "" : "s"
                        }`}
                      </PillButton>
                      {showUnlimitedTab && (
                        <PillButton
                          active={activeCategory === "unlimited"}
                          onClick={() => selectCategory("unlimited")}
                          disabled={!unlimitedTabEnabled}
                          fullWidthOnMobile
                        >
                          {`Unlimited · ${categorySummary.unlimited} plan${
                            categorySummary.unlimited === 1 ? "" : "s"
                          }`}
                        </PillButton>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((open) => !open)}
                    className={`
                      inline-flex h-11 w-full items-center justify-center gap-2
                      rounded-full border px-5 text-sm font-semibold transition
                      sm:w-auto
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
                    onChange={setSort}
                    options={SORT_OPTIONS}
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
                        onClick={clearFilters}
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
                            onClick={() => toggleDataAmount(amount)}
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
                            onClick={() => toggleValidity(days)}
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
                              onClick={() => toggleCoverage(code)}
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

            <div className="mt-8 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-[var(--text-muted)]">
                Showing {filtered.length} of {categoryOffers.length}{" "}
                {activeCategory === "unlimited" ? "unlimited" : "standard"}{" "}
                plans
                {showPackageTabs && categoryOffers.length !== offers.length
                  ? ` (${offers.length} total)`
                  : ""}
              </p>
            </div>

            {filtered.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center">
                <h3 className="text-lg font-semibold">No matching plans</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {activeCategory === "unlimited" &&
                  categorySummary.unlimited === 0
                    ? "This destination has no unlimited packages right now."
                    : "Try clearing one or more filters to see more results."}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-10">
                {groups.map((group) => (
                  <section key={group.label}>
                    <div className="mb-4 flex items-end justify-between gap-3 border-b border-[var(--border)] pb-3">
                      <h2 className="text-xl font-bold text-[var(--heading)] sm:text-2xl">
                        {group.label}
                      </h2>
                      <p className="text-sm text-[var(--text-soft)]">
                        {`${group.plans.length} plan${group.plans.length === 1 ? "" : "s"}`}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.plans.map((offer) => (
                        <article
                          key={offer.id}
                          className="
                            group flex h-full min-w-0 flex-col rounded-[22px]
                            border border-[var(--border)] bg-[var(--surface)]
                            p-4 shadow-[0_10px_28px_rgba(0,0,0,0.2)]
                            transition duration-200
                            hover:-translate-y-1 hover:border-[var(--border-hover)]
                            hover:shadow-[0_18px_40px_rgba(0,0,0,0.32)]
                            sm:p-5
                          "
                        >
                          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <h3 className="min-w-0 break-words text-xl font-bold tracking-tight text-[var(--heading)] sm:text-2xl">
                              {offer.dataFormatted}
                            </h3>
                            <p className="shrink-0 text-xl font-bold text-[var(--accent-strong)] sm:text-2xl">
                              {formatPrice(offer.priceUSD)}
                            </p>
                          </div>

                          <div className="mt-4 space-y-2 text-sm text-[var(--text)]">
                            <p>{formatValidityPhrase(offer.durationDays)}</p>
                            {isRegionalOrGlobal &&
                              offer.coveredCountriesCount != null &&
                              offer.coveredCountriesCount > 0 && (
                                <p>
                                  {offer.coveredCountriesCount} countries
                                  covered
                                </p>
                              )}
                            {destination.kind === "country" &&
                              (offer.packageInfo || offer.network) && (
                                <p className="break-words text-[var(--text-soft)]">
                                  {offer.packageInfo || offer.network}
                                </p>
                              )}
                          </div>

                          <div className="mt-auto grid grid-cols-1 gap-3 pt-6 min-[400px]:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => setSelectedOffer(offer)}
                              className="
                                inline-flex min-h-11 items-center justify-center
                                rounded-xl border border-[var(--border-strong)]
                                bg-[var(--surface-2)] px-3 text-sm font-semibold text-[var(--heading)]
                                transition hover:border-[var(--accent-strong)]/50
                              "
                            >
                              {isRegionalOrGlobal
                                ? "Coverage details"
                                : "Plan details"}
                            </button>
                            <Link
                              href={buildCheckoutHref(offer, destination.code)}
                              className="
                                inline-flex min-h-11 items-center justify-center
                                rounded-xl bg-[var(--accent-strong)] px-3 text-sm font-bold
                                text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]
                              "
                            >
                              Buy now
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <PlanDetailsModal
        offer={selectedOffer}
        destination={destination}
        countryNames={countryNames}
        onClose={() => setSelectedOffer(null)}
        coverageFocused={isRegionalOrGlobal}
      />
    </main>
  );
}
