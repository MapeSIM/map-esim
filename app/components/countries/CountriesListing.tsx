import type {
  DestinationCatalogSource,
  VesimDestination,
} from "@/app/lib/vesim/destinations";
import {
  buildDefaultCountryLetterGroups,
  filterDestinationCards,
  toDestinationCard,
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
 * Do not load the country grid with next/dynamic ssr:false.
 */
export default function CountriesListing({
  initialDestinations,
  initialSource,
}: CountriesListingProps) {
  const cards = initialDestinations.map(toDestinationCard);
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
      initialDestinations={initialDestinations}
      initialSource={initialSource}
      defaultGrid={defaultGrid}
    />
  );
}
