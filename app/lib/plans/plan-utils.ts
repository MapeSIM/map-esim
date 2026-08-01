import type { VesimOffer } from "@/app/lib/vesim/offers";
import { getOfferDataMb } from "@/app/lib/vesim/offers";

export type PlanTypeFilter = "data" | "voice";
export type CategoryFilter = "standard" | "unlimited";
export type SortOption =
  | "price-asc"
  | "price-desc"
  | "data-asc"
  | "data-desc"
  | "validity-asc"
  | "validity-desc";

export type PlanFiltersState = {
  planType: PlanTypeFilter;
  category: CategoryFilter;
  dataAmounts: string[];
  validities: number[];
  coveredCountries: string[];
};

export type DurationGroup = {
  days: number;
  label: string;
  plans: VesimOffer[];
};

function validityLabel(days: number): string {
  return days === 1 ? "1 Day" : `${days} Days`;
}

export function offerHasVoiceSms(offer: VesimOffer): boolean {
  return offer.hasVoiceSms === true;
}

export function dataAmountKey(offer: VesimOffer): string {
  if (offer.dataUnlimited) return "Unlimited";
  return offer.dataFormatted;
}

export function buildCheckoutHref(
  offer: VesimOffer,
  destinationCode: string
): string {
  // Price is intentionally omitted — checkout verifies the offer by offerId.
  const params = new URLSearchParams({
    offerId: offer.id,
    name: offer.name,
    data: offer.dataFormatted,
    validity:
      offer.durationDays != null
        ? `${offer.durationDays} ${offer.validityUnit || "Days"}`
        : "",
    country: destinationCode,
  });

  return `/checkout?${params.toString()}`;
}

export function summarizePlanTypes(offers: VesimOffer[]) {
  const dataOnly = offers.filter((offer) => !offerHasVoiceSms(offer)).length;
  const withVoice = offers.filter(offerHasVoiceSms).length;
  return { dataOnly, withVoice };
}

export function summarizeCategories(offers: VesimOffer[]) {
  const unlimited = offers.filter((offer) => offer.dataUnlimited).length;
  const standard = offers.length - unlimited;
  return { standard, unlimited };
}

function parseAmountToMb(label: string): number {
  if (/unlimited/i.test(label)) return Number.POSITIVE_INFINITY;
  const value = parseFloat(label.replace(/,/g, ""));
  if (!Number.isFinite(value)) return 0;
  if (/tb/i.test(label)) return value * 1024 * 1024;
  if (/gb/i.test(label)) return value * 1024;
  if (/mb/i.test(label)) return value;
  return value;
}

export function uniqueDataAmounts(offers: VesimOffer[]): string[] {
  const amounts = Array.from(new Set(offers.map(dataAmountKey)));

  return amounts.sort((a, b) => parseAmountToMb(a) - parseAmountToMb(b));
}

export function uniqueValidities(offers: VesimOffer[]): number[] {
  return Array.from(
    new Set(
      offers
        .map((offer) => offer.durationDays)
        .filter((days): days is number => days != null && days > 0)
    )
  ).sort((a, b) => a - b);
}

export function uniqueCoveredCountries(offers: VesimOffer[]): string[] {
  return Array.from(
    new Set(
      offers.flatMap((offer) => offer.coveredCountries || []).filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

export function filterOffers(
  offers: VesimOffer[],
  filters: PlanFiltersState
): VesimOffer[] {
  return offers.filter((offer) => {
    if (filters.planType === "voice" && !offerHasVoiceSms(offer)) return false;
    if (filters.planType === "data" && offerHasVoiceSms(offer)) return false;

    if (filters.category === "unlimited" && !offer.dataUnlimited) return false;
    if (filters.category === "standard" && offer.dataUnlimited) return false;

    if (
      filters.dataAmounts.length > 0 &&
      !filters.dataAmounts.includes(dataAmountKey(offer))
    ) {
      return false;
    }

    if (
      filters.validities.length > 0 &&
      (offer.durationDays == null ||
        !filters.validities.includes(offer.durationDays))
    ) {
      return false;
    }

    if (filters.coveredCountries.length > 0) {
      const covered = offer.coveredCountries || [];
      const matches = filters.coveredCountries.every((code) =>
        covered.includes(code)
      );
      if (!matches) return false;
    }

    return true;
  });
}

function offerSortPrice(offer: VesimOffer): number {
  const value = offer.priceUSD ?? offer.price ?? offer.displayPrice;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.POSITIVE_INFINITY;
}

function offerSortDataMb(offer: VesimOffer): number {
  if (offer.dataUnlimited) return Number.POSITIVE_INFINITY;
  const mb = getOfferDataMb(offer);
  return mb != null && Number.isFinite(mb) ? mb : 0;
}

function offerSortDays(offer: VesimOffer): number {
  return offer.durationDays != null && Number.isFinite(offer.durationDays)
    ? offer.durationDays
    : 0;
}

function compareOffers(a: VesimOffer, b: VesimOffer, sort: SortOption): number {
  const priceA = offerSortPrice(a);
  const priceB = offerSortPrice(b);
  const dataA = offerSortDataMb(a);
  const dataB = offerSortDataMb(b);
  const daysA = offerSortDays(a);
  const daysB = offerSortDays(b);

  let result = 0;

  switch (sort) {
    case "price-desc":
      result = priceB - priceA;
      break;
    case "data-asc":
      result = dataA - dataB;
      break;
    case "data-desc":
      result = dataB - dataA;
      break;
    case "validity-asc":
      result = daysA - daysB;
      break;
    case "validity-desc":
      result = daysB - daysA;
      break;
    case "price-asc":
    default:
      result = priceA - priceB;
      break;
  }

  if (result !== 0) return result;
  return a.id.localeCompare(b.id);
}

export function sortOffers(
  offers: VesimOffer[],
  sort: SortOption
): VesimOffer[] {
  return [...offers].sort((a, b) => compareOffers(a, b, sort));
}

export function groupOffersByDuration(
  offers: VesimOffer[],
  sort: SortOption = "price-asc"
): DurationGroup[] {
  const map = new Map<number, VesimOffer[]>();

  for (const offer of offers) {
    const days = offerSortDays(offer);
    const list = map.get(days) || [];
    list.push(offer);
    map.set(days, list);
  }

  const groups = Array.from(map.entries()).map(([days, plans]) => ({
    days,
    label: days > 0 ? validityLabel(days) : "Other",
    // Keep duration headings, but apply the active sort inside every group.
    plans: sortOffers(plans, sort),
  }));

  groups.sort((a, b) => {
    if (sort === "validity-desc") return b.days - a.days;
    // Price/data sorts and validity-shortest keep shortest duration groups first.
    return a.days - b.days;
  });

  return groups;
}

export function formatValidityPhrase(days: number | null | undefined): string {
  if (days == null || days <= 0) return "Validity varies";
  if (days === 1) return "Valid for 1 day";
  return `Valid for ${days} days`;
}

export function formatValidityPill(days: number): string {
  return validityLabel(days);
}
