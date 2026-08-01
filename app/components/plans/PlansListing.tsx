"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Filter, Globe2 } from "lucide-react";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import type { VesimDestination } from "@/app/lib/vesim/destinations";
import PlanDetailsModal from "@/app/components/plans/PlanDetailsModal";
import SortSelect from "@/app/components/plans/SortSelect";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";
import {
  buildCheckoutHref,
  filterOffers,
  formatValidityPhrase,
  formatValidityPill,
  groupOffersByDuration,
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
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

function PillButton({
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
        inline-flex h-10 items-center justify-center rounded-full
        border px-4 text-sm font-semibold transition
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent-strong)]/55 focus-visible:ring-offset-2
        focus-visible:ring-offset-[var(--page-bg)]
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
            ? "border-[var(--accent-strong)] bg-[var(--accent-strong)]/15 text-[var(--accent-strong)]"
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
}: PlansListingProps) {
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
  const showCategoryToggle =
    categorySummary.standard > 0 && categorySummary.unlimited > 0;

  const filters: PlanFiltersState = useMemo(
    () => ({
      planType: showPlanTypeToggle ? planType : "data",
      category: showCategoryToggle ? category : "standard",
      dataAmounts,
      validities,
      coveredCountries,
    }),
    [
      showPlanTypeToggle,
      showCategoryToggle,
      planType,
      category,
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
  const dataOptions = useMemo(() => uniqueDataAmounts(offers), [offers]);
  const validityOptions = useMemo(() => uniqueValidities(offers), [offers]);
  const coverageOptions = useMemo(
    () =>
      destination.kind === "country" ? [] : uniqueCoveredCountries(offers),
    [destination.kind, offers]
  );

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

  const heroSummary = showPlanTypeToggle
    ? `${planTypeSummary.dataOnly} data-only · ${planTypeSummary.withVoice} with SMS & voice`
    : `${offers.length} data plan${offers.length === 1 ? "" : "s"} available`;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      <section className="theme-hero border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10">
          <Link
            href="/countries"
            className="
              mb-6 inline-flex items-center gap-2 text-sm font-medium
              text-[var(--text-muted)] transition hover:text-[var(--accent-strong)]
            "
          >
            <ArrowLeft className="h-4 w-4" />
            All Destinations
          </Link>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className="
                  flex h-16 w-16 shrink-0 items-center justify-center
                  overflow-hidden rounded-2xl border border-[var(--border-strong)]
                  bg-[var(--surface)] shadow-[0_10px_30px_rgba(0,0,0,0.25)]
                "
              >
                {flagUrl ? (
                  <Image
                    src={flagUrl}
                    alt={`${destination.name} flag`}
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                ) : destination.kind === "country" && destination.flag ? (
                  <span className="text-3xl">{destination.flag}</span>
                ) : (
                  <Globe2 className="h-7 w-7 text-[var(--accent-strong)]" />
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]/90">
                  {destination.kind === "country"
                    ? "Country plans"
                    : destination.kind === "regional"
                      ? "Regional plans"
                      : "Global plans"}
                </p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl md:text-[2.75rem]">
                  {destination.kind === "country"
                    ? `${destination.name} eSIM Plans`
                    : destination.name}
                </h1>
                <p className="mt-2 text-sm text-[var(--text-muted)] sm:text-base">
                  {loading ? "Loading available plans..." : heroSummary}
                </p>
              </div>
            </div>

            {!loading && !error && offers.length > 0 && (
              <div className="whitespace-nowrap rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)]">
                From{" "}
                <span className="font-bold text-[var(--accent-strong)]">
                  {formatPrice(
                    destination.minPrice ??
                      offers
                        .map((offer) => offer.priceUSD)
                        .filter((price): price is number => price != null)
                        .sort((a, b) => a - b)[0] ??
                      null
                  )}
                </span>
              </div>
            )}
          </div>

          {destination.kind === "country" && (
            <div className="mt-5 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-3)] px-4 py-3 text-sm text-[var(--text)]">
              Browse regional plans — sometimes regional eSIMs offer better
              value across multiple countries.
            </div>
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

                {showCategoryToggle && (
                  <div className="flex flex-wrap gap-2">
                    <PillButton
                      active={category === "standard"}
                      onClick={() => setCategory("standard")}
                    >
                      Standard ({categorySummary.standard})
                    </PillButton>
                    <PillButton
                      active={category === "unlimited"}
                      onClick={() => setCategory("unlimited")}
                    >
                      Unlimited ({categorySummary.unlimited})
                    </PillButton>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((open) => !open)}
                    className="
                      inline-flex h-11 items-center justify-center gap-2
                      rounded-full border border-[var(--border-strong)] bg-[var(--surface)]
                      px-5 text-sm font-semibold text-[var(--heading)] transition
                      hover:border-[var(--border-hover)]
                    "
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
                        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
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
                Showing {filtered.length} of {offers.length} plans
              </p>
            </div>

            {filtered.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center">
                <h3 className="text-lg font-semibold">No matching plans</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Try clearing one or more filters to see more results.
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
                            group flex h-full flex-col rounded-[22px]
                            border border-[var(--border)] bg-[var(--surface)]
                            p-5 shadow-[0_10px_28px_rgba(0,0,0,0.2)]
                            transition duration-200
                            hover:-translate-y-1 hover:border-[var(--border-hover)]
                            hover:shadow-[0_18px_40px_rgba(0,0,0,0.32)]
                          "
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
                              {offer.dataFormatted}
                            </h3>
                            <p className="text-2xl font-bold text-[var(--accent-strong)]">
                              {formatPrice(offer.priceUSD)}
                            </p>
                          </div>

                          <div className="mt-4 space-y-2 text-sm text-[var(--text)]">
                            <p>{formatValidityPhrase(offer.durationDays)}</p>
                            {(destination.kind === "regional" ||
                              destination.kind === "global") &&
                              offer.coveredCountriesCount != null && (
                                <p>
                                  {offer.coveredCountriesCount} countries
                                  covered
                                </p>
                              )}
                            {destination.kind === "country" &&
                              (offer.packageInfo || offer.network) && (
                                <p className="text-[var(--text-soft)]">
                                  {offer.packageInfo || offer.network}
                                </p>
                              )}
                          </div>

                          <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
                            <button
                              type="button"
                              onClick={() => setSelectedOffer(offer)}
                              className="
                                h-11 rounded-xl border border-[var(--border-strong)]
                                bg-[var(--surface-2)] text-sm font-semibold text-[var(--heading)]
                                transition hover:border-[var(--accent-strong)]/50
                              "
                            >
                              Plan Details
                            </button>
                            <Link
                              href={buildCheckoutHref(offer, destination.code)}
                              className="
                                inline-flex h-11 items-center justify-center
                                rounded-xl bg-[var(--accent-strong)] text-sm font-bold
                                text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]
                              "
                            >
                              Buy Now
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
      />
    </main>
  );
}
