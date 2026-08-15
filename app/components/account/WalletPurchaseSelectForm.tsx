"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Earth, MapPinned, Search } from "lucide-react";
import type { AdminDestinationOption } from "@/app/lib/esim/adminPackageAssignmentRead";
import { filterPlansDiscoveryDestinations } from "@/app/lib/plans/plansDiscovery";
import {
  resolveDestinationFlagVisual,
  type DestinationPresentationInput,
} from "@/app/lib/vesim/destinationPresentation";
import {
  destinationPath,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";

type Props = {
  destinations: AdminDestinationOption[];
};

function toSearchDestination(d: AdminDestinationOption): VesimDestination {
  const kind =
    d.kind === "regional" || d.kind === "global" || d.kind === "country"
      ? d.kind
      : "country";
  return {
    code: d.code,
    name: d.name,
    flag: d.flag,
    isPopular: d.isPopular === true,
    slug: d.slug || d.code.toLowerCase(),
    searchAliases: d.searchAliases,
    kind,
  };
}

function toPathDestination(
  d: AdminDestinationOption
): Pick<VesimDestination, "code" | "name" | "slug" | "kind"> {
  const kind =
    d.kind === "regional" || d.kind === "global" || d.kind === "country"
      ? d.kind
      : "country";
  return {
    code: d.code,
    name: d.name,
    slug: d.slug || d.code.toLowerCase(),
    kind,
  };
}

function DestinationFlagMark({
  destination,
}: {
  destination: DestinationPresentationInput;
}) {
  const visual = resolveDestinationFlagVisual(destination);
  const [imageFailed, setImageFailed] = useState(false);
  const kind = destination.kind ?? "country";

  if (kind === "global") {
    return (
      <Earth className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
    );
  }
  if (kind === "regional") {
    return (
      <MapPinned
        className="h-4 w-4 text-[var(--accent-soft)]"
        aria-hidden="true"
      />
    );
  }

  if (visual.type === "image" && !imageFailed) {
    return (
      <Image
        src={visual.src}
        alt=""
        width={22}
        height={16}
        sizes="22px"
        onError={() => setImageFailed(true)}
        className="h-4 w-[22px] rounded-[3px] object-cover"
      />
    );
  }

  if (visual.type === "emoji") {
    return (
      <span className="text-base leading-none" aria-hidden="true">
        {visual.emoji}
      </span>
    );
  }

  return (
    <span
      className="text-[10px] font-bold tracking-wide text-[var(--heading)]"
      aria-hidden="true"
    >
      {visual.type === "initials" ? visual.initials : destination.code}
    </span>
  );
}

function DestinationNavCard({
  destination,
}: {
  destination: AdminDestinationOption;
}) {
  const kind =
    destination.kind === "regional" ||
    destination.kind === "global" ||
    destination.kind === "country"
      ? destination.kind
      : "country";
  const href = destinationPath(toPathDestination(destination));

  return (
    <Link
      href={href}
      aria-label={destination.name}
      className={`
        group flex min-h-[76px] w-full min-w-0 items-center gap-3
        rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]
        px-3 py-3 text-left transition
        hover:border-[var(--border-hover)] hover:bg-[var(--surface)]
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2
        focus-visible:ring-offset-[var(--page-bg)]
      `}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <DestinationFlagMark
          destination={{
            code: destination.code,
            name: destination.name,
            flag: destination.flag,
            kind,
          }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--heading)]">
          {destination.name}
        </span>
      </span>
    </Link>
  );
}

/**
 * Authenticated Buy eSIM destination launcher.
 * Navigates to existing public /countries/[slug] plan pages — no same-page checkout.
 */
export default function WalletPurchaseSelectForm({ destinations }: Props) {
  const searchFieldId = useId();
  const destinationsLabelId = useId();
  const [search, setSearch] = useState("");

  const searchDestinations = useMemo(
    () => destinations.map(toSearchDestination),
    [destinations]
  );

  const filtered = useMemo(() => {
    return filterPlansDiscoveryDestinations(searchDestinations, search);
  }, [searchDestinations, search]);

  const filteredCodes = useMemo(
    () => new Set(filtered.map((d) => d.code)),
    [filtered]
  );

  const visibleDestinations = useMemo(
    () => destinations.filter((d) => filteredCodes.has(d.code)),
    [destinations, filteredCodes]
  );

  const popularDestinations = useMemo(
    () =>
      visibleDestinations
        .filter((d) => d.isPopular === true)
        .slice()
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        ),
    [visibleDestinations]
  );

  const allDestinations = useMemo(
    () =>
      visibleDestinations
        .slice()
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        ),
    [visibleDestinations]
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <label htmlFor={searchFieldId} className="sr-only">
          Search destinations
        </label>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-soft)]"
          aria-hidden="true"
        />
        <input
          id={searchFieldId}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search destinations"
          autoComplete="off"
          className="
            w-full rounded-[14px] border border-[var(--border-strong)]
            bg-[var(--surface)] py-3 pl-10 pr-3 text-sm text-[var(--heading)]
            placeholder:text-[var(--text-soft)]
            focus:border-[var(--accent-strong)]/50 focus:outline-none
            focus:ring-2 focus:ring-[var(--accent-strong)]/25
          "
        />
      </div>

      {visibleDestinations.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          No destinations found.
        </p>
      ) : (
        <div className="space-y-6">
          {popularDestinations.length > 0 ? (
            <section aria-labelledby={`${destinationsLabelId}-popular`}>
              <h2
                id={`${destinationsLabelId}-popular`}
                className="text-sm font-semibold text-[var(--heading)]"
              >
                Popular Destinations
              </h2>
              <div
                className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4"
              >
                {popularDestinations.map((destination) => (
                  <DestinationNavCard
                    key={`popular-${destination.code}`}
                    destination={destination}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby={`${destinationsLabelId}-all`}>
            <h2
              id={`${destinationsLabelId}-all`}
              className="text-sm font-semibold text-[var(--heading)]"
            >
              All Destinations
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
              {allDestinations.map((destination) => (
                <DestinationNavCard
                  key={`all-${destination.code}`}
                  destination={destination}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
