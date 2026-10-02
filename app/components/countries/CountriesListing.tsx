import type {
  DestinationCatalogSource,
  VesimDestination,
} from "@/app/lib/vesim/destinations";
import {
  buildDefaultCountryLetterGroups,
  filterDestinationCards,
  toDestinationCard,
  type DestinationCard,
} from "@/app/lib/vesim/countriesListingModel";
import CountriesDestinationGrid from "@/app/components/countries/CountriesDestinationGrid";
import CountriesListingClient from "@/app/components/countries/CountriesListingClient";

export type CountriesListingProps = {
  initialDestinations: VesimDestination[];
  initialSource: DestinationCatalogSource;
};

/**
 * Destinations listing shell (Server Component).
 * Default Country A–Z grid is RSC HTML; search/filters stay in a client island.
 * Client island receives slim DestinationCard[] only (not full catalog objects).
 */
export default function CountriesListing({
  initialDestinations,
  initialSource,
}: CountriesListingProps) {
  const cards: DestinationCard[] = initialDestinations.map(toDestinationCard);
  const defaultFiltered = filterDestinationCards(cards, "Country", "");
  const defaultGroups = buildDefaultCountryLetterGroups(initialDestinations);

  const defaultGrid = (
    <CountriesDestinationGrid
      filter="Country"
      search=""
      destinationsCount={cards.length}
      filteredCount={defaultFiltered.length}
      alphabeticalGroups={defaultGroups}
      gridItems={[]}
    />
  );

  return (
    <CountriesListingClient
      initialCards={cards}
      initialSource={initialSource}
      defaultGrid={defaultGrid}
    />
  );
}
