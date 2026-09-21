import {
  destinationRouteId,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import { destinationDisplayName } from "@/app/lib/vesim/destinationPresentation";
import { popularDestinationDisplayRank } from "@/app/lib/home/homeConversionSections";

export const COUNTRY_LISTING_FILTERS = [
  { id: "Country", label: "Country" },
  { id: "Popular", label: "Popular" },
  { id: "Regional", label: "Regional" },
  { id: "Global", label: "Global" },
] as const;

export type CountryListingFilterId =
  (typeof COUNTRY_LISTING_FILTERS)[number]["id"];

export type DestinationCard = {
  id: string;
  name: string;
  code: string;
  flag?: string;
  plans: number;
  minPriceUsd: number | null;
  kind: VesimDestination["kind"];
  isPopular: boolean;
};

export type LetterGroup = {
  letter: string;
  items: DestinationCard[];
};

export function parseCountryListingFilter(
  value: string | null
): CountryListingFilterId {
  if (value === "All" || value === "Country") return "Country";
  if (value === "Popular" || value === "Regional" || value === "Global") {
    return value;
  }
  return "Country";
}

export function toDestinationCard(
  destination: VesimDestination
): DestinationCard {
  return {
    // Route segment from provider identity (ISO SEO slug vs code for USPR).
    id: destinationRouteId(destination),
    // Display label only — provider code/slug/path stay on the destination.
    name: destinationDisplayName(destination),
    code: destination.code,
    flag: destination.flag,
    plans: destination.offerCount || 0,
    minPriceUsd: destination.minPrice ?? null,
    kind: destination.kind,
    isPopular: destination.isPopular === true,
  };
}

/** Stable React list key — includes provider code so PR/USPR stay distinct. */
export function destinationReactKey(
  destination: Pick<DestinationCard, "kind" | "code" | "id">
): string {
  return `${destination.kind}-${destination.code}-${destination.id}`;
}

export function matchesCountryListingFilter(
  item: DestinationCard,
  filter: CountryListingFilterId
): boolean {
  switch (filter) {
    case "Country":
      return item.kind === "country";
    case "Popular":
      return item.kind === "country" && item.isPopular;
    case "Regional":
      return item.kind === "regional";
    case "Global":
      return item.kind === "global";
    default:
      return false;
  }
}

export function sortDestinationsByName(items: DestinationCard[]) {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    })
  );
}

/** Popular tab: pin preferred codes first, then keep remaining A–Z. */
export function sortPopularDestinations(items: DestinationCard[]) {
  return [...items].sort((a, b) => {
    const rankDelta =
      popularDestinationDisplayRank(a.code) -
      popularDestinationDisplayRank(b.code);
    if (rankDelta !== 0) return rankDelta;
    return a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}

export function groupDestinationsAlphabetically(
  items: DestinationCard[]
): LetterGroup[] {
  const sorted = sortDestinationsByName(items);
  const map = new Map<string, DestinationCard[]>();

  for (const item of sorted) {
    const first = item.name.trim().charAt(0);
    const letter = first ? first.toLocaleUpperCase() : "#";
    const key = /^[A-Z]$/.test(letter) ? letter : "#";
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    })
    .map(([letter, groupItems]) => ({ letter, items: groupItems }));
}

export function filterDestinationCards(
  destinations: DestinationCard[],
  filter: CountryListingFilterId,
  search: string
): DestinationCard[] {
  const query = search.trim().toLowerCase();
  return destinations.filter((item) => {
    const searchMatch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      (item.kind === "country" && item.code.toLowerCase().includes(query));
    return searchMatch && matchesCountryListingFilter(item, filter);
  });
}

export function buildDefaultCountryLetterGroups(
  destinations: VesimDestination[]
): LetterGroup[] {
  const cards = destinations.map(toDestinationCard);
  const filtered = filterDestinationCards(cards, "Country", "");
  return groupDestinationsAlphabetically(filtered);
}

export function isDefaultCountryListingView(state: {
  filter: CountryListingFilterId;
  search: string;
}): boolean {
  return state.filter === "Country" && state.search.trim() === "";
}

export function countryListingEmptyMessage(filter: CountryListingFilterId): {
  title: string;
  description: string;
} {
  if (filter === "Global") {
    return {
      title: "No global plans currently available",
      description:
        "Worldwide multi-country plans are not listed right now. Browse regional or country destinations instead.",
    };
  }
  if (filter === "Regional") {
    return {
      title: "No regional destinations found",
      description: "Try another filter or search by region name.",
    };
  }
  if (filter === "Popular") {
    return {
      title: "No popular destinations found",
      description: "Try searching for a country or switch to Country.",
    };
  }
  return {
    title: "No destinations found",
    description: "Try searching with another country or region.",
  };
}
