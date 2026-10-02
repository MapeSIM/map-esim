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
import CountriesDefaultCountryGridHtml from "@/app/components/countries/CountriesDefaultCountryGridHtml";
import CountriesListingClient from "@/app/components/countries/CountriesListingClient";

export type CountriesListingProps = {
  initialDestinations: VesimDestination[];
  initialSource: DestinationCatalogSource;
};

/**
 * Destinations listing shell (Server Component).
 * Default Country A–Z grid is compact HTML (not 200× React card trees).
 * Search/filters stay in a client island with slim DestinationCard[].
 */
export default function CountriesListing({
  initialDestinations,
  initialSource,
}: CountriesListingProps) {
  const cards: DestinationCard[] = initialDestinations.map(toDestinationCard);
  const defaultFiltered = filterDestinationCards(cards, "Country", "");
  const defaultGroups = buildDefaultCountryLetterGroups(initialDestinations);

  const defaultGrid = (
    <CountriesDefaultCountryGridHtml
      alphabeticalGroups={defaultGroups}
      destinationsCount={cards.length}
      filteredCount={defaultFiltered.length}
    />
  );

  return (
    <CountriesListingClient
      initialCards={cards}
      initialSource={initialSource}
    >
      {defaultGrid}
    </CountriesListingClient>
  );
}
