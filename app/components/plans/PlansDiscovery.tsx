"use client";

import { useRouter } from "next/navigation";
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
  destinationPath,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";

export type PlansDiscoveryProps = {
  featured: VesimDestination[];
  selectorOptions: VesimDestination[];
};

function DestinationCard({
  destination,
  formatPrice,
}: {
  destination: VesimDestination;
  formatPrice: (amountUsd: number | null | undefined) => string;
}) {
  const href = destinationPath(destination);
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

export default function PlansDiscovery({
  featured,
  selectorOptions,
}: PlansDiscoveryProps) {
  const router = useRouter();
  const { formatPrice } = useCurrency();

  return (
    <main className="min-h-screen bg-[var(--page-bg)] text-[var(--heading)]">
      <section className="px-6 py-20 text-center">
        <h1 className="mb-4 text-5xl font-bold text-[var(--heading)]">
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

        <div className="mx-auto mb-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-center">
          <label htmlFor="plans-destination" className="sr-only">
            Choose a destination
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-soft)]"
              aria-hidden="true"
            />
            <select
              id="plans-destination"
              defaultValue=""
              disabled={selectorOptions.length === 0}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                router.push(value);
              }}
              className="
                w-full appearance-none rounded-xl border border-[var(--border-strong)]
                bg-[var(--surface)] py-3 pl-10 pr-4 text-sm text-[var(--heading)]
                focus:border-[var(--accent-strong)]/50 focus:outline-none
                focus:ring-2 focus:ring-[var(--accent-strong)]/25
                disabled:cursor-not-allowed disabled:opacity-60
              "
            >
              <option value="">
                {selectorOptions.length > 0
                  ? "Choose a destination…"
                  : "Destinations temporarily unavailable"}
              </option>
              {selectorOptions.map((destination) => (
                <option
                  key={`${destination.kind}-${destination.code}-${destination.slug}`}
                  value={destinationPath(destination)}
                >
                  {destination.name}
                  {destination.kind === "regional"
                    ? " (Regional)"
                    : destination.kind === "global"
                      ? " (Global)"
                      : ""}
                </option>
              ))}
            </select>
          </div>
          <Link
            href="/countries"
            className="
              inline-flex shrink-0 items-center justify-center rounded-xl
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

        {featured.length > 0 ? (
          <>
            <p className="mb-6 text-sm font-medium text-[var(--text-soft)]">
              Popular &amp; global destinations
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
        ) : (
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
        )}
      </section>
    </main>
  );
}
