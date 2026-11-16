import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  HOME_POPULAR_DESTINATIONS,
  HOME_POPULAR_SECTION_EYEBROW,
  HOME_POPULAR_SECTION_INTRO,
  HOME_POPULAR_SECTION_TITLE,
} from "@/app/lib/home/homeConversionSections";
import { destinationFlagcdnUrl } from "@/app/lib/vesim/destinationPresentation";

const MOBILE_TOP_COUNT = 6;

function DestinationCard({
  destination,
}: {
  destination: (typeof HOME_POPULAR_DESTINATIONS)[number];
}) {
  const flagSrc = destinationFlagcdnUrl(destination.code);
  return (
    <Link
      href={`/countries/${destination.id}`}
      prefetch
      className="
        group flex h-full items-center gap-3 rounded-[20px] border
        border-[var(--border)] bg-[var(--surface)] p-3.5
        shadow-[0_12px_30px_rgba(0,0,0,0.2)] transition
        hover:-translate-y-0.5 hover:border-[var(--border-hover)]
        sm:rounded-[24px] sm:p-5
      "
    >
      <span className="relative flex h-[28px] w-[42px] shrink-0 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] sm:h-[30px] sm:w-[45px]">
        {flagSrc ? (
          <Image
            src={flagSrc}
            alt=""
            width={45}
            height={30}
            sizes="45px"
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-[var(--heading)]">
            {destination.code}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--heading)] sm:text-base">
          {destination.name}
        </span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-strong)] sm:mt-1 sm:text-sm">
          View plans
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}

export function HomePopularDestinations() {
  const mobileDestinations = HOME_POPULAR_DESTINATIONS.slice(0, MOBILE_TOP_COUNT);

  return (
    <section
      className="border-b border-[var(--border)]"
      aria-labelledby="home-popular-heading"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
          {HOME_POPULAR_SECTION_EYEBROW}
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:mt-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="max-w-2xl">
            <h2
              id="home-popular-heading"
              className="scroll-mt-24 text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl"
            >
              {HOME_POPULAR_SECTION_TITLE}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)] sm:mt-3 sm:text-base">
              {HOME_POPULAR_SECTION_INTRO}
            </p>
          </div>
          <Link
            href="/countries?filter=Popular"
            prefetch
            className="hidden items-center gap-1.5 text-sm font-semibold text-[var(--accent-strong)] transition hover:opacity-90 sm:inline-flex"
          >
            View all popular
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Mobile: top 6 in a 2-column grid */}
        <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:hidden">
          {mobileDestinations.map((destination) => (
            <li key={destination.id}>
              <DestinationCard destination={destination} />
            </li>
          ))}
        </ul>
        <div className="mt-4 sm:hidden">
          <Link
            href="/countries?filter=Popular"
            prefetch
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            View all destinations
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Tablet/desktop: full popular set */}
        <ul className="mt-8 hidden grid-cols-2 gap-4 sm:grid lg:grid-cols-4">
          {HOME_POPULAR_DESTINATIONS.map((destination) => (
            <li key={destination.id}>
              <DestinationCard destination={destination} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
