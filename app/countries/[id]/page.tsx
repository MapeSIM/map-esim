"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import PlansListing from "@/app/components/plans/PlansListing";
import { countries as staticCountries } from "@/app/data/countries";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import { parsePublicVesimOffers } from "@/app/lib/vesim/offers";
import type { VesimDestination } from "@/app/lib/vesim/destinations";
import {
  findDestinationBySlug,
  findRelatedRegionalDestination,
  parsePublicDestinations,
  slugifyDestination,
} from "@/app/lib/vesim/destinations";

function staticToDestination(id: string): VesimDestination | undefined {
  const match = staticCountries.find(
    (item) =>
      item.id.toLowerCase() === id.toLowerCase() ||
      item.code.toLowerCase() === id.toLowerCase() ||
      slugifyDestination(item.name) === slugifyDestination(id)
  );

  if (!match) return undefined;

  return {
    code: match.code,
    name: match.name,
    flag: match.flag,
    regions: match.region ? [match.region] : [],
    offerCount: match.plans,
    minPriceFormatted: match.startingPrice,
    isPopular: match.region === "Popular",
    isRegional: false,
    isGlobal: false,
    searchAliases: [match.id, match.code, match.name],
    slug: match.id,
    kind: "country",
  };
}

export default function CountryDetail() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";

  const fallbackDestination = useMemo(
    () => (id ? staticToDestination(id) : undefined),
    [id]
  );

  const [destination, setDestination] = useState<VesimDestination | null>(
    () => (id ? staticToDestination(id) ?? null : null)
  );
  const [relatedRegional, setRelatedRegional] =
    useState<VesimDestination | null>(null);
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});
  const [offers, setOffers] = useState<VesimOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setNotFound(false);

      // Paint static country shell immediately when available.
      if (fallbackDestination) {
        setDestination(fallbackDestination);
      }

      try {
        const earlyCode = fallbackDestination?.code?.trim();
        const destinationsPromise = fetch("/api/vesim/destinations");
        // Start offers in parallel when static catalog already knows the country code.
        const earlyOffersPromise = earlyCode
          ? fetch(
              `/api/vesim/offers?country=${encodeURIComponent(earlyCode)}`,
              { cache: "no-store" }
            )
          : null;

        const destinationsRes = await destinationsPromise;
        const destinationsData = await destinationsRes.json();
        // Public API already returns MAP retail minPrice — do not re-normalize.
        const destinations = parsePublicDestinations(destinationsData);

        const names: Record<string, string> = {};
        for (const item of destinations) {
          if (item.kind === "country") {
            names[item.code.toUpperCase()] = item.name;
          }
        }

        const matched =
          findDestinationBySlug(destinations, id) || fallbackDestination;

        if (!matched) {
          if (!cancelled) {
            setNotFound(true);
            setDestination(null);
            setRelatedRegional(null);
            setOffers([]);
          }
          return;
        }

        const related =
          matched.kind === "country"
            ? findRelatedRegionalDestination(matched, destinations) || null
            : null;

        if (!cancelled) {
          setDestination(matched);
          setRelatedRegional(related);
          setCountryNames(names);
        }

        const matchedCode = matched.code.trim();
        const offersRes =
          earlyOffersPromise &&
          earlyCode &&
          matchedCode.toUpperCase() === earlyCode.toUpperCase()
            ? await earlyOffersPromise
            : await fetch(
                `/api/vesim/offers?country=${encodeURIComponent(matchedCode)}`,
                { cache: "no-store" }
              );
        const offersData = await offersRes.json();

        if (!offersRes.ok || offersData.success === false) {
          throw new Error(
            offersData.error ||
              offersData.message ||
              "Failed to load eSIM plans"
          );
        }

        // Public API already returns MAP retail — do not re-normalize/markup.
        const list = parsePublicVesimOffers(offersData);

        if (!cancelled) {
          setOffers(list);
          const lowestPrice =
            list
              .map((offer) => offer.priceUSD)
              .filter((price): price is number => price != null)
              .sort((a, b) => a - b)[0] ?? null;

          setDestination((current) =>
            current
              ? {
                  ...current,
                  offerCount: list.length,
                  // Authoritative "starting from" = lowest MAP retail among offers.
                  minPrice: lowestPrice ?? current.minPrice,
                }
              : current
          );
        }
      } catch (err: unknown) {
        if (!cancelled) {
          if (fallbackDestination) {
            setDestination(fallbackDestination);
          }
          setOffers([]);
          setError(
            err instanceof Error ? err.message : "Failed to load eSIM plans"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id, fallbackDestination]);

  if (!id || (!loading && (notFound || !destination))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Destination not found</h1>
          <p className="mt-3 text-[var(--text-muted)]">
            We couldn&apos;t find plans for this destination.
          </p>
        </div>
      </main>
    );
  }

  if (!destination) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
        <p className="text-lg text-[var(--text)]">Loading destination...</p>
      </main>
    );
  }

  return (
    <PlansListing
      destination={destination}
      offers={offers}
      loading={loading}
      error={error}
      countryNames={countryNames}
      relatedRegional={relatedRegional}
    />
  );
}
