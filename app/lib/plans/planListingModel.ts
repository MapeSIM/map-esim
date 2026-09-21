import type { VesimOffer } from "@/app/lib/vesim/offers";
import type { VesimDestination } from "@/app/lib/vesim/destinations";
import {
  filterOffers,
  groupOffersByDuration,
  isUnlimitedOffer,
  sortOffers,
  summarizeCategories,
  summarizePlanTypes,
  type CategoryFilter,
  type DurationGroup,
  type PlanFiltersState,
  type PlanTypeFilter,
  type SortOption,
} from "@/app/lib/plans/plan-utils";

export type PlansListingModelInput = {
  offers: VesimOffer[];
  destination: VesimDestination;
  planType: PlanTypeFilter;
  category: CategoryFilter;
  dataAmounts: string[];
  validities: number[];
  coveredCountries: string[];
  sort: SortOption;
};

export type PlansListingModel = {
  isRegionalOrGlobal: boolean;
  planTypeSummary: ReturnType<typeof summarizePlanTypes>;
  categorySummary: ReturnType<typeof summarizeCategories>;
  showPlanTypeToggle: boolean;
  showPackageTabs: boolean;
  unlimitedTabEnabled: boolean;
  activeCategory: CategoryFilter;
  categoryOffers: VesimOffer[];
  filters: PlanFiltersState;
  filtered: VesimOffer[];
  groups: DurationGroup[];
};

export const DEFAULT_PLAN_TYPE: PlanTypeFilter = "data";
export const DEFAULT_CATEGORY: CategoryFilter = "standard";
export const DEFAULT_SORT: SortOption = "price-asc";

export function buildPlansListingModel(
  input: PlansListingModelInput
): PlansListingModel {
  const {
    offers,
    destination,
    planType,
    category,
    dataAmounts,
    validities,
    coveredCountries,
    sort,
  } = input;

  const isRegionalOrGlobal =
    destination.kind === "regional" || destination.kind === "global";

  const planTypeSummary = summarizePlanTypes(offers);
  const categorySummary = summarizeCategories(offers);
  const showPlanTypeToggle =
    planTypeSummary.dataOnly > 0 && planTypeSummary.withVoice > 0;
  const showPackageTabs = offers.length > 0 && categorySummary.unlimited > 0;
  const unlimitedTabEnabled = categorySummary.unlimited > 0;

  const activeCategory: CategoryFilter =
    showPackageTabs && category === "unlimited" && unlimitedTabEnabled
      ? "unlimited"
      : "standard";

  const categoryOffers = offers.filter((offer) =>
    activeCategory === "unlimited"
      ? isUnlimitedOffer(offer)
      : !isUnlimitedOffer(offer)
  );

  const filters: PlanFiltersState = {
    planType: showPlanTypeToggle ? planType : "data",
    category: activeCategory,
    dataAmounts,
    validities,
    coveredCountries,
  };

  const filtered = sortOffers(filterOffers(offers, filters), sort);
  const groups = groupOffersByDuration(filtered, sort);

  return {
    isRegionalOrGlobal,
    planTypeSummary,
    categorySummary,
    showPlanTypeToggle,
    showPackageTabs,
    unlimitedTabEnabled,
    activeCategory,
    categoryOffers,
    filters,
    filtered,
    groups,
  };
}

export function buildDefaultPlansListingModel(
  offers: VesimOffer[],
  destination: VesimDestination
): PlansListingModel {
  return buildPlansListingModel({
    offers,
    destination,
    planType: DEFAULT_PLAN_TYPE,
    category: DEFAULT_CATEGORY,
    dataAmounts: [],
    validities: [],
    coveredCountries: [],
    sort: DEFAULT_SORT,
  });
}

export function isDefaultPlansListingState(state: {
  planType: PlanTypeFilter;
  category: CategoryFilter;
  dataAmounts: string[];
  validities: number[];
  coveredCountries: string[];
  sort: SortOption;
  showPlanTypeToggle: boolean;
  showPackageTabs: boolean;
  unlimitedTabEnabled: boolean;
}): boolean {
  const effectiveCategory =
    state.showPackageTabs &&
    state.category === "unlimited" &&
    state.unlimitedTabEnabled
      ? "unlimited"
      : "standard";

  if (effectiveCategory !== DEFAULT_CATEGORY) return false;
  if (state.sort !== DEFAULT_SORT) return false;
  if (state.dataAmounts.length > 0) return false;
  if (state.validities.length > 0) return false;
  if (state.coveredCountries.length > 0) return false;
  if (state.showPlanTypeToggle && state.planType !== DEFAULT_PLAN_TYPE) {
    return false;
  }
  return true;
}
