import { Earth, Search } from "lucide-react";
import CompactDestinationCard from "@/app/components/countries/CompactDestinationCard";
import {
  countryListingEmptyMessage,
  destinationReactKey,
  type CountryListingFilterId,
  type DestinationCard,
  type LetterGroup,
} from "@/app/lib/vesim/countriesListingModel";
import { buildDestinationPlansHref } from "@/app/lib/vesim/countriesListingReturn";

function DestinationCardSkeleton() {
  return (
    <div
      className="
        h-[84px] animate-pulse rounded-2xl
        border border-[var(--border)] bg-[var(--surface)]
        px-4 py-3
      "
      aria-hidden="true"
    >
      <div className="flex h-full items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-9 w-12 rounded-md bg-[var(--surface-3)]" />
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-[var(--surface-3)]" />
            <div className="h-3 w-16 rounded bg-[var(--surface-3)]" />
          </div>
        </div>
        <div className="space-y-2 text-right">
          <div className="ml-auto h-3 w-10 rounded bg-[var(--surface-3)]" />
          <div className="ml-auto h-5 w-16 rounded bg-[var(--surface-3)]" />
        </div>
      </div>
    </div>
  );
}

type CountriesDestinationGridProps = {
  filter: CountryListingFilterId;
  search: string;
  destinationsCount: number;
  filteredCount: number;
  updating?: boolean;
  alphabeticalGroups: LetterGroup[];
  gridItems: DestinationCard[];
};

/**
 * Destination results grid — no "use client" on this module.
 * Do not load with next/dynamic ssr:false (SEO HTML must stay).
 */
export default function CountriesDestinationGrid({
  filter,
  search,
  destinationsCount,
  filteredCount,
  updating = false,
  alphabeticalGroups,
  gridItems,
}: CountriesDestinationGridProps) {
  const emptyMessage = countryListingEmptyMessage(filter);

  function destinationHref(destinationId: string) {
    return buildDestinationPlansHref(destinationId, {
      filter,
      q: search,
    });
  }

  return (
    <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-8">
      <div className="mb-4 flex flex-col gap-2 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--heading)] sm:text-[1.75rem]">
            {filter === "Country"
              ? "All countries"
              : filter === "Popular"
                ? "Popular destinations"
                : filter === "Regional"
                  ? "Regional destinations"
                  : "Global destinations"}
          </h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)] sm:text-[15px]">
            {filter === "Country" || filter === "Popular"
              ? "Browse destinations in alphabetical order."
              : "Compare multi-country coverage options."}
          </p>
        </div>
        <p className="text-sm text-[var(--text-soft)]">
          {filteredCount} {filteredCount === 1 ? "destination" : "destinations"}
          {updating ? " · updating…" : ""}
        </p>
      </div>

      {destinationsCount === 0 ? (
        <div
          className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
          aria-busy={updating}
          aria-label="Loading destinations"
        >
          {Array.from({ length: 9 }).map((_, index) => (
            <DestinationCardSkeleton key={index} />
          ))}
        </div>
      ) : filteredCount === 0 ? (
        <div
          className="
            flex flex-col items-center justify-center
            rounded-[18px] border border-[var(--border)]
            bg-[var(--surface-2)] px-6 py-16 text-center
          "
        >
          <div
            className="
              mb-4 flex h-12 w-12 items-center justify-center
              rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)]
              text-[var(--accent-soft)]
            "
          >
            {filter === "Global" ? (
              <Earth className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Search className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-[var(--heading)]">
            {emptyMessage.title}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
            {emptyMessage.description}
          </p>
        </div>
      ) : filter === "Country" ? (
        <div className="space-y-8">
          {alphabeticalGroups.map((group) => (
            <section
              key={group.letter}
              aria-labelledby={`letter-${group.letter}`}
            >
              <div className="mb-3 flex items-center gap-3 border-b border-[var(--border)] pb-2">
                <h3
                  id={`letter-${group.letter}`}
                  className="
                    flex h-9 w-9 items-center justify-center
                    rounded-xl bg-[var(--accent-strong)]/15
                    text-sm font-bold text-[var(--accent-strong)]
                  "
                >
                  {group.letter}
                </h3>
                <p className="text-xs font-medium text-[var(--text-soft)]">
                  {group.items.length}{" "}
                  {group.items.length === 1 ? "destination" : "destinations"}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((destination) => (
                  <CompactDestinationCard
                    key={destinationReactKey(destination)}
                    destination={destination}
                    href={destinationHref(destination.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {gridItems.map((destination) => (
            <CompactDestinationCard
              key={destinationReactKey(destination)}
              destination={destination}
              href={destinationHref(destination.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
