"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  parsePublicDestinations,
  shouldAcceptPublicDestinationCatalog,
  type DestinationCatalogSource,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import {
  filterDestinationCards,
  groupDestinationsAlphabetically,
  isDefaultCountryListingView,
  parseCountryListingFilter,
  sortDestinationsByName,
  sortPopularDestinations,
  toDestinationCard,
  type CountryListingFilterId,
  type DestinationCard,
} from "@/app/lib/vesim/countriesListingModel";
import CountriesDestinationGrid from "@/app/components/countries/CountriesDestinationGrid";
import CountriesListingControls, {
  CountriesListingHeroSearch,
} from "@/app/components/countries/CountriesListingControls";

export type CountriesListingClientProps = {
  initialDestinations: VesimDestination[];
  initialSource: DestinationCatalogSource;
  /** RSC default Country A–Z grid — shown until search/filter/catalog diverge. */
  defaultGrid: ReactNode;
};

function CountriesListingClientInner({
  initialDestinations,
  initialSource,
  defaultGrid,
}: CountriesListingClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = parseCountryListingFilter(searchParams.get("filter"));
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [source, setSource] = useState<DestinationCatalogSource>(initialSource);
  const [destinations, setDestinations] = useState<DestinationCard[]>(() =>
    initialDestinations.map(toDestinationCard)
  );
  // Soft refresh only — never clear SSR/catalog cards while updating.
  const [updating, setUpdating] = useState(false);
  const [catalogReplaced, setCatalogReplaced] = useState(false);
  const destinationsRef = useRef(destinations);
  const sourceRef = useRef(source);

  useEffect(() => {
    destinationsRef.current = destinations;
    sourceRef.current = source;
  }, [destinations, source]);

  // Restore search when returning from a plan page with ?q= (do not wipe local typing when q absent).
  useEffect(() => {
    if (!searchParams.has("q")) return;
    // Intentional: URL q → controlled search input when returning from plan pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from searchParams
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  function setFilter(next: CountryListingFilterId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    // SSR already seeded a trusted provider catalog — skip duplicate API work.
    if (initialSource === "catalog") return;

    let cancelled = false;

    async function refreshDestinations() {
      setUpdating(true);
      try {
        // Short browser/CDN cache is fine for the destination catalog.
        const response = await fetch("/api/vesim/destinations");
        if (!response.ok) {
          // Keep last good catalog (including SSR) on provider/API failure.
          return;
        }
        const data = await response.json();
        // Public API already returns MAP retail minPrice — do not re-normalize.
        const list = parsePublicDestinations(data);
        if (cancelled) return;

        const accept = shouldAcceptPublicDestinationCatalog({
          currentLength: destinationsRef.current.length,
          currentSource: sourceRef.current,
          nextLength: list.length,
          nextIsStaticFallback: false,
        });
        if (!accept) return;

        setDestinations(list.map(toDestinationCard));
        setSource("catalog");
        setCatalogReplaced(true);
      } catch {
        // Keep last good catalog — never regress to static fallback on refresh failure.
      } finally {
        if (!cancelled) setUpdating(false);
      }
    }

    void refreshDestinations();
    return () => {
      cancelled = true;
    };
  }, [initialSource]);

  const filteredDestinations = useMemo(
    () => filterDestinationCards(destinations, filter, search),
    [destinations, filter, search]
  );

  const alphabeticalGroups = useMemo(() => {
    if (filter !== "Country") return [];
    return groupDestinationsAlphabetically(filteredDestinations);
  }, [filter, filteredDestinations]);

  const gridItems = useMemo(() => {
    if (filter === "Country") return [];
    if (filter === "Popular") {
      return sortPopularDestinations(filteredDestinations);
    }
    return sortDestinationsByName(filteredDestinations);
  }, [filter, filteredDestinations]);

  const usingDefaultGrid =
    isDefaultCountryListingView({ filter, search }) && !catalogReplaced;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      <section
        className="
          relative flex items-center justify-center
          border-b border-[var(--border)]
          theme-hero
          px-4 py-5 sm:min-h-[340px] sm:px-6 sm:py-12
        "
      >
        <div
          className="destinations-grid pointer-events-none absolute inset-0 opacity-[0.35]"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto w-full max-w-[1200px] text-center">
          <p
            className="
              text-[11px] font-semibold tracking-[0.18em]
              text-[var(--accent-soft)] sm:text-xs
            "
          >
            GLOBAL eSIM COVERAGE
          </p>

          <h1
            className="
              mx-auto mt-2 max-w-3xl
              text-[1.5rem] font-semibold leading-tight tracking-tight
              text-[var(--heading)]
              sm:mt-3 sm:text-4xl md:text-[2.5rem]
            "
          >
            Explore destinations worldwide
          </h1>

          <p
            className="
              mx-auto mt-2 hidden max-w-xl
              text-sm leading-relaxed text-[var(--text-muted)]
              sm:mt-3 sm:block sm:text-base
            "
          >
            Browse country, popular, regional, and global eSIM destinations.
          </p>

          <CountriesListingHeroSearch
            search={search}
            onSearchChange={setSearch}
          />
        </div>
      </section>

      <CountriesListingControls
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
      />

      {usingDefaultGrid ? (
        defaultGrid
      ) : (
        <CountriesDestinationGrid
          filter={filter}
          search={search}
          destinationsCount={destinations.length}
          filteredCount={filteredDestinations.length}
          updating={updating}
          alphabeticalGroups={alphabeticalGroups}
          gridItems={gridItems}
        />
      )}
    </main>
  );
}

export default function CountriesListingClient(
  props: CountriesListingClientProps
) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
          Loading destinations...
        </main>
      }
    >
      <CountriesListingClientInner {...props} />
    </Suspense>
  );
}
