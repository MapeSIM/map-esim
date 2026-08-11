"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Clock3,
  Database,
  Globe2,
  MapPinned,
  Search,
} from "lucide-react";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";
import {
  filterPlansDiscoveryDestinations,
  plansDestinationHref,
} from "@/app/lib/plans/plansDiscovery";
import type { VesimDestination } from "@/app/lib/vesim/destinations";

export type PlansDiscoveryProps = {
  featured: VesimDestination[];
  selectorOptions: VesimDestination[];
  priorityDestinations: VesimDestination[];
};

function getFlagUrl(code?: string) {
  if (!code || code.length !== 2) return null;
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

function isEmojiFlag(flag?: string) {
  if (!flag) return false;
  return /\p{Regional_Indicator}/u.test(flag);
}

function DestinationCard({
  destination,
  formatPrice,
}: {
  destination: VesimDestination;
  formatPrice: (amountUsd: number | null | undefined) => string;
}) {
  const href = plansDestinationHref(destination);
  const kindLabel =
    destination.kind === "global"
      ? "Global"
      : destination.kind === "regional"
        ? "Regional"
        : "Country";
  const Icon =
    destination.kind === "global"
      ? Globe2
      : destination.kind === "regional"
        ? MapPinned
        : Database;

  return (
    <div
      className="
        rounded-3xl border border-[var(--border)] bg-[var(--surface)]
        p-8 shadow-[var(--shadow)]
      "
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
        {kindLabel}
      </p>
      <h2 className="mt-2 text-2xl font-bold text-[var(--heading)]">
        {destination.name}
      </h2>

      <p className="mt-5 text-4xl font-bold text-[var(--accent)]">
        {formatPrice(destination.minPrice ?? null)}
      </p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Starting from</p>

      <div className="mt-6 space-y-3 text-[var(--text)]">
        <p className="flex items-center justify-center gap-2">
          <Icon className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
          {destination.offerCount && destination.offerCount > 0
            ? `${destination.offerCount} ${destination.offerCount === 1 ? "plan" : "plans"}`
            : "View available plans"}
        </p>
        <p className="flex items-center justify-center gap-2">
          <Clock3 className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
          Validities vary by plan
        </p>
        <p className="flex items-center justify-center gap-2">
          <Globe2 className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
          Coverage details on the destination page
        </p>
      </div>

      <Link
        href={href}
        className="
          mt-8 block rounded-xl bg-[var(--accent)] py-4
          font-bold text-[var(--accent-ink)] hover:opacity-90
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-[var(--accent-strong)]/60
        "
      >
        View plans
      </Link>
    </div>
  );
}

function PriorityChip({ destination }: { destination: VesimDestination }) {
  const href = plansDestinationHref(destination);
  const flagUrl =
    destination.kind === "country" ? getFlagUrl(destination.code) : null;

  return (
    <Link
      href={href}
      className="
        inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full
        border border-[var(--border-strong)] bg-[var(--surface)]
        px-3.5 py-2 text-sm font-semibold text-[var(--heading)]
        shadow-[0_4px_12px_rgba(15,23,42,0.06)]
        transition-colors
        hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent-strong)]/60
      "
    >
      {flagUrl ? (
        <Image
          src={flagUrl}
          alt=""
          width={22}
          height={16}
          sizes="22px"
          className="h-4 w-[22px] rounded-[3px] object-cover"
        />
      ) : destination.kind === "country" && isEmojiFlag(destination.flag) ? (
        <span className="text-base leading-none" aria-hidden="true">
          {destination.flag}
        </span>
      ) : (
        <Globe2 className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
      )}
      <span>{destination.name}</span>
    </Link>
  );
}

function DestinationSearchCombobox({
  options,
}: {
  options: VesimDestination[];
}) {
  const router = useRouter();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = filterPlansDiscoveryDestinations(options, query);
  const showList = open && options.length > 0;

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function navigateTo(destination: VesimDestination) {
    setOpen(false);
    setQuery(destination.name);
    router.push(plansDestinationHref(destination));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showList) {
      if (event.key === "ArrowDown" && options.length > 0) {
        setOpen(true);
        event.preventDefault();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((index) => (index + 1) % filtered.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = filtered[activeIndex];
      if (selected) navigateTo(selected);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 text-left">
      <label htmlFor="plans-destination-search" className="sr-only">
        Search destination
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-[var(--text-soft)]"
        aria-hidden="true"
      />
      <input
        id="plans-destination-search"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={
          showList && filtered[activeIndex]
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        autoComplete="off"
        spellCheck={false}
        placeholder="Search destination…"
        value={query}
        disabled={options.length === 0}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="
          w-full rounded-xl border border-[var(--border-strong)]
          bg-[var(--surface)] py-3 pl-10 pr-4 text-sm text-[var(--heading)]
          placeholder:text-[var(--text-soft)]
          focus:border-[var(--accent-strong)]/50 focus:outline-none
          focus:ring-2 focus:ring-[var(--accent-strong)]/25
          disabled:cursor-not-allowed disabled:opacity-60
        "
      />

      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          className="
            absolute left-0 right-0 top-[calc(100%+6px)] z-30
            max-h-60 overflow-y-auto overscroll-contain
            rounded-xl border border-[var(--border-strong)]
            bg-[var(--surface)] py-1 shadow-[0_16px_40px_rgba(15,23,42,0.16)]
          "
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[var(--text-muted)]">
              No destination found
            </li>
          ) : (
            filtered.map((destination, index) => {
              const active = index === activeIndex;
              const kindSuffix =
                destination.kind === "regional"
                  ? " · Regional"
                  : destination.kind === "global"
                    ? " · Global"
                    : "";
              return (
                <li
                  key={`${destination.kind}-${destination.code}-${destination.slug}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={active}
                >
                  <button
                    type="button"
                    className={`
                      flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm
                      ${
                        active
                          ? "bg-[var(--accent-strong)]/15 text-[var(--heading)]"
                          : "text-[var(--heading)] hover:bg-[var(--surface-2)]"
                      }
                    `}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => navigateTo(destination)}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {destination.name}
                      <span className="font-normal text-[var(--text-soft)]">
                        {kindSuffix}
                      </span>
                    </span>
                    {destination.kind === "country" ? (
                      <span className="shrink-0 text-xs uppercase text-[var(--text-soft)]">
                        {destination.code}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default function PlansDiscovery({
  featured,
  selectorOptions,
  priorityDestinations,
}: PlansDiscoveryProps) {
  const { formatPrice } = useCurrency();

  return (
    <main className="min-h-screen bg-[var(--page-bg)] text-[var(--heading)]">
      <section className="px-4 py-16 text-center sm:px-6 sm:py-20">
        <h1 className="mb-4 text-4xl font-bold text-[var(--heading)] sm:text-5xl">
          Choose Your eSIM Plan
        </h1>

        <p className="mb-4 text-[var(--text-muted)]">
          Affordable plans for worldwide travel — pick a destination to see plans
        </p>
        <p className="mb-8 text-sm text-[var(--text-muted)]">
          Not sure your phone supports eSIM?{" "}
          <Link
            href="/device-compatibility"
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            Check device compatibility
          </Link>
          .
        </p>

        <div className="mx-auto mb-8 flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-start">
          <DestinationSearchCombobox options={selectorOptions} />
          <Link
            href="/countries"
            className="
              inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl
              border border-[var(--border-strong)] bg-[var(--surface)]
              px-4 py-3 text-sm font-semibold text-[var(--heading)]
              hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[var(--accent-strong)]/60
            "
          >
            Browse destinations
          </Link>
        </div>

        {priorityDestinations.length > 0 ? (
          <div className="mx-auto mb-10 w-full max-w-6xl text-left">
            <p className="mb-3 text-center text-sm font-medium text-[var(--text-soft)]">
              Popular destinations
            </p>
            <div
              className="
                -mx-1 flex gap-2 overflow-x-auto px-1 pb-1
                [scrollbar-width:thin]
                sm:flex-wrap sm:justify-center sm:overflow-visible
              "
              role="list"
              aria-label="Popular destinations"
            >
              {priorityDestinations.map((destination) => (
                <div
                  key={`priority-${destination.code}-${destination.slug}`}
                  role="listitem"
                >
                  <PriorityChip destination={destination} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {featured.length > 0 ? (
          <>
            <p className="mb-6 text-sm font-medium text-[var(--text-soft)]">
              More popular &amp; global destinations
            </p>
            <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
              {featured.map((destination) => (
                <DestinationCard
                  key={`${destination.kind}-${destination.code}-${destination.slug}`}
                  destination={destination}
                  formatPrice={formatPrice}
                />
              ))}
            </div>
          </>
        ) : priorityDestinations.length === 0 ? (
          <div
            className="
              mx-auto max-w-lg rounded-3xl border border-[var(--border)]
              bg-[var(--surface)] px-6 py-12
            "
          >
            <h2 className="text-xl font-semibold text-[var(--heading)]">
              Choose a destination to view plans
            </h2>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Plans are listed by country or region. Browse destinations to find
              the right eSIM for your trip.
            </p>
            <Link
              href="/countries"
              className="
                mt-8 inline-flex rounded-xl bg-[var(--accent)] px-6 py-3
                font-bold text-[var(--accent-ink)] hover:opacity-90
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[var(--accent-strong)]/60
              "
            >
              Browse all destinations
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
