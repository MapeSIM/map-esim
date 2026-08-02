"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Earth,
  Flag,
  Globe2,
  MapPinned,
  Search,
  Sparkles,
} from "lucide-react";
import { countries as staticCountries } from "../data/countries";
import {
  normalizeDestinations,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";

const filters = [
  { id: "Country", label: "Country", icon: Flag },
  { id: "Popular", label: "Popular", icon: Sparkles },
  { id: "Regional", label: "Regional", icon: MapPinned },
  { id: "Global", label: "Global", icon: Earth },
] as const;

type FilterId = (typeof filters)[number]["id"];

type DestinationCard = {
  id: string;
  name: string;
  code: string;
  flag?: string;
  plans: number;
  minPriceUsd: number | null;
  kind: VesimDestination["kind"];
  isPopular: boolean;
};

type LetterGroup = {
  letter: string;
  items: DestinationCard[];
};

function parseFilter(value: string | null): FilterId {
  if (value === "All" || value === "Country") return "Country";
  if (value === "Popular" || value === "Regional" || value === "Global") {
    return value;
  }
  return "Country";
}

function getFlagUrl(code?: string) {
  if (!code || code.length !== 2) return null;
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

function isEmojiFlag(flag?: string) {
  if (!flag) return false;
  return /\p{Regional_Indicator}/u.test(flag);
}

function parseUsdPrice(value?: string) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toCard(destination: VesimDestination): DestinationCard {
  return {
    id:
      destination.kind === "regional" || destination.kind === "global"
        ? destination.code.toLowerCase()
        : destination.slug,
    name: destination.name,
    code: destination.code,
    flag: destination.flag,
    plans: destination.offerCount || 0,
    minPriceUsd: destination.minPrice ?? null,
    kind: destination.kind,
    isPopular: destination.isPopular === true,
  };
}

function matchesFilter(item: DestinationCard, filter: FilterId) {
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

function sortByName(items: DestinationCard[]) {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    })
  );
}

function groupAlphabetically(items: DestinationCard[]): LetterGroup[] {
  const sorted = sortByName(items);
  const map = new Map<string, DestinationCard[]>();

  for (const item of sorted) {
    const first = item.name.trim().charAt(0);
    const letter = first
      ? first.toLocaleUpperCase()
      : "#";
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

function CompactDestinationCard({
  destination,
  formatPrice,
}: {
  destination: DestinationCard;
  formatPrice: (amountUsd: number | null | undefined) => string;
}) {
  const flagUrl =
    destination.kind === "country" ? getFlagUrl(destination.code) : null;
  const Icon =
    destination.kind === "global"
      ? Earth
      : destination.kind === "regional"
        ? MapPinned
        : Globe2;

  return (
    <Link
      href={`/countries/${destination.id}`}
      className="
        group flex h-full min-h-[84px] items-center justify-between gap-3
        rounded-2xl border border-[var(--border)] bg-[var(--surface)]
        px-4 py-3
        shadow-[0_6px_16px_rgba(15,23,42,0.06)]
        transition-all duration-200
        hover:-translate-y-[2px]
        hover:border-[var(--border-hover)]
        hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)]
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent-strong)]/55 focus-visible:ring-offset-2
        focus-visible:ring-offset-[var(--page-bg)]
      "
    >
      <div className="flex min-w-0 items-center gap-3">
        {flagUrl ? (
          <Image
            src={flagUrl}
            alt=""
            width={44}
            height={32}
            className="
              h-8 w-11 shrink-0 rounded-md
              border border-[var(--border-strong)] object-cover
            "
          />
        ) : destination.kind === "country" && isEmojiFlag(destination.flag) ? (
          <span
            className="
              flex h-8 w-11 shrink-0 items-center justify-center
              rounded-md border border-[var(--border-strong)]
              bg-[var(--surface-2)] text-xl leading-none
            "
            aria-hidden="true"
          >
            {destination.flag}
          </span>
        ) : (
          <span
            className="
              flex h-8 w-11 shrink-0 items-center justify-center
              rounded-md border border-[var(--border-strong)]
              bg-[var(--surface-2)] text-[var(--accent-soft)]
            "
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" />
          </span>
        )}

        <div className="min-w-0 text-left">
          <h3 className="truncate text-[15px] font-semibold text-[var(--heading)]">
            {destination.name}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {destination.plans} {destination.plans === 1 ? "plan" : "plans"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <div className="text-right">
          <p className="text-[11px] font-medium text-[var(--text-soft)]">From</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--accent-soft)]">
            {formatPrice(destination.minPriceUsd)}
          </p>
        </div>
        <ArrowRight
          className="
            h-4 w-4 text-[var(--text-soft)] transition-transform
            group-hover:translate-x-0.5 group-hover:text-[var(--heading)]
          "
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

function CountriesPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = parseFilter(searchParams.get("filter"));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { formatPrice } = useCurrency();
  const [destinations, setDestinations] = useState<DestinationCard[]>(() =>
    staticCountries.map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
      flag: item.flag,
      plans: item.plans,
      minPriceUsd: parseUsdPrice(item.startingPrice),
      kind: "country" as const,
      isPopular: item.region === "Popular",
    }))
  );

  function setFilter(next: FilterId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadDestinations() {
      try {
        const response = await fetch("/api/vesim/destinations", {
          cache: "no-store",
        });
        const data = await response.json();
        const list = normalizeDestinations(data);

        if (!cancelled && list.length > 0) {
          setDestinations(list.map(toCard));
        }
      } catch {
        // Keep static fallback destinations.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDestinations();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDestinations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return destinations.filter((item) => {
      const searchMatch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        (item.kind === "country" && item.code.toLowerCase().includes(query));

      return searchMatch && matchesFilter(item, filter);
    });
  }, [destinations, search, filter]);

  const alphabeticalGroups = useMemo(() => {
    if (filter !== "Country") return [];
    return groupAlphabetically(filteredDestinations);
  }, [filter, filteredDestinations]);

  const gridItems = useMemo(() => {
    if (filter === "Country") return [];
    return sortByName(filteredDestinations);
  }, [filter, filteredDestinations]);

  const emptyMessage =
    filter === "Global"
      ? {
          title: "No global plans currently available",
          description:
            "Worldwide multi-country plans are not listed right now. Browse regional or country destinations instead.",
        }
      : filter === "Regional"
        ? {
            title: "No regional destinations found",
            description: "Try another filter or search by region name.",
          }
        : filter === "Popular"
          ? {
              title: "No popular destinations found",
              description: "Try searching for a country or switch to Country.",
            }
          : {
              title: "No destinations found",
              description: "Try searching with another country or region.",
            };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      <section
        className="
          relative flex min-h-[300px] items-center justify-center
          border-b border-[var(--border)]
          theme-hero
          px-4 py-10 sm:min-h-[340px] sm:px-6 sm:py-12
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
              mx-auto mt-3 max-w-3xl
              text-[1.75rem] font-semibold leading-tight tracking-tight
              text-[var(--heading)]
              sm:text-4xl md:text-[2.5rem]
            "
          >
            Explore destinations worldwide
          </h1>

          <p
            className="
              mx-auto mt-3 max-w-xl
              text-sm leading-relaxed text-[var(--text-muted)]
              sm:text-base
            "
          >
            Browse country, popular, regional, and global eSIM destinations.
          </p>

          <div className="relative mx-auto mt-7 w-full max-w-[620px]">
            <label htmlFor="destination-search" className="sr-only">
              Search by country or region
            </label>
            <Search
              className="
                pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px]
                -translate-y-1/2 text-[var(--text-soft)]
              "
              aria-hidden="true"
            />
            <input
              id="destination-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by country or region"
              disabled={loading}
              className="
                w-full rounded-[16px]
                border border-[var(--border-strong)]
                bg-[var(--surface-2)]
                py-3.5 pl-11 pr-4
                text-sm text-[var(--heading)] placeholder:text-[var(--text-soft)]
                shadow-[0_8px_30px_rgba(0,0,0,0.25)]
                transition-all
                hover:border-[var(--border-hover)]
                focus:border-[var(--accent-strong)]/50 focus:outline-none
                focus:ring-2 focus:ring-[var(--accent-strong)]/25
                disabled:cursor-not-allowed disabled:opacity-60
                sm:text-[15px]
              "
            />
          </div>
        </div>
      </section>

      <div
        className="
          sticky top-[72px] z-40
          border-b border-[var(--border)]
          bg-[var(--page-bg)]/95 backdrop-blur-md
        "
      >
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div
            className="
              flex flex-wrap items-center justify-center gap-2.5
              py-4
            "
            role="group"
            aria-label="Destination filters"
          >
            {filters.map(({ id, label, icon: Icon }) => {
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  aria-pressed={active}
                  className={`
                    inline-flex h-10 items-center gap-2
                    rounded-full border px-4 text-sm font-medium
                    transition-all
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-[var(--accent-strong)]/55 focus-visible:ring-offset-2
                    focus-visible:ring-offset-[var(--page-bg)]
                    ${
                      active
                        ? "border-transparent bg-[var(--accent-strong)] text-[var(--accent-ink)] shadow-[0_4px_14px_rgba(124,255,0,0.2)]"
                        : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)] hover:text-[var(--heading)]"
                    }
                  `}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-8 sm:px-6 sm:pb-20">
        <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
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
          {!loading && (
            <p className="text-sm text-[var(--text-soft)]">
              {filteredDestinations.length}{" "}
              {filteredDestinations.length === 1
                ? "destination"
                : "destinations"}
            </p>
          )}
        </div>

        {loading ? (
          <div
            className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            aria-label="Loading destinations"
          >
            {Array.from({ length: 9 }).map((_, index) => (
              <DestinationCardSkeleton key={index} />
            ))}
          </div>
        ) : filteredDestinations.length === 0 ? (
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
              <section key={group.letter} aria-labelledby={`letter-${group.letter}`}>
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
                      key={`${destination.kind}-${destination.id}`}
                      destination={destination}
                      formatPrice={formatPrice}
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
                key={`${destination.kind}-${destination.id}`}
                destination={destination}
                formatPrice={formatPrice}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function CountriesPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
          Loading destinations...
        </main>
      }
    >
      <CountriesPageContent />
    </Suspense>
  );
}
