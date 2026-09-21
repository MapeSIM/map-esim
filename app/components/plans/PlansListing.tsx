import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import {
  destinationPath,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";
import { destinationDisplayName } from "@/app/lib/vesim/destinationPresentation";
import CurrencyPrice from "@/app/components/plans/CurrencyPrice";
import PlansListingBackLink from "@/app/components/plans/PlansListingBackLink";
import PlansListingClient from "@/app/components/plans/PlansListingClient";
import PlansListingFlag from "@/app/components/plans/PlansListingFlag";
import PlansOfferGroups from "@/app/components/plans/PlansOfferGroups";
import { buildDefaultPlansListingModel } from "@/app/lib/plans/planListingModel";

export type PlansListingProps = {
  destination: VesimDestination;
  offers: VesimOffer[];
  loading?: boolean;
  error?: string;
  countryNames?: Record<string, string>;
  relatedRegional?: VesimDestination | null;
  children?: ReactNode;
};

/**
 * Destination plans shell (Server Component).
 * Default plan cards render as RSC HTML; filters/sort/modal stay in client islands.
 * Do not load the main plan grid with next/dynamic ssr:false.
 */
export default function PlansListing({
  destination,
  offers,
  loading = false,
  error = "",
  countryNames = {},
  relatedRegional = null,
  children,
}: PlansListingProps) {
  const defaultModel = buildDefaultPlansListingModel(offers, destination);
  const displayName = destinationDisplayName(destination);
  const heading = `${displayName} eSIM Plans`;
  const planCountLabel = `${offers.length} plan${
    offers.length === 1 ? "" : "s"
  } available`;
  const hasHeroFromPrice =
    !loading &&
    destination.minPrice != null &&
    Number.isFinite(destination.minPrice);

  const relatedRegionalHref = relatedRegional
    ? destinationPath(relatedRegional)
    : null;
  const relatedRegionalName = relatedRegional
    ? destinationDisplayName(relatedRegional)
    : null;
  const relatedRegionalHasPrice =
    relatedRegional?.minPrice != null &&
    Number.isFinite(relatedRegional.minPrice);
  const relatedRegionalPlanCount =
    relatedRegional?.offerCount != null && relatedRegional.offerCount > 0
      ? `${relatedRegional.offerCount} plan${
          relatedRegional.offerCount === 1 ? "" : "s"
        } available`
      : null;

  const defaultGrid =
    !loading && !error && offers.length > 0 ? (
      <PlansOfferGroups
        groups={defaultModel.groups}
        destination={destination}
        isRegionalOrGlobal={defaultModel.isRegionalOrGlobal}
        filteredCount={defaultModel.filtered.length}
        categoryOffersCount={defaultModel.categoryOffers.length}
        activeCategoryLabel={defaultModel.activeCategory}
        totalOffersCount={offers.length}
        showPackageTabs={defaultModel.showPackageTabs}
      />
    ) : null;

  return (
    <main className="min-h-screen overflow-x-clip bg-[var(--page-bg)] text-[var(--heading)]">
      <section className="theme-hero border-b border-[var(--border)]">
        {/* Extra mobile top padding keeps hero clear of the sticky navbar. */}
        <div className="mx-auto max-w-[1200px] px-4 pb-3 pt-6 sm:px-6 sm:py-8">
          <PlansListingBackLink />

          <div className="flex items-start gap-3 sm:gap-4">
            <div
              className="
                flex h-11 w-11 shrink-0 items-center justify-center
                rounded-2xl border border-[var(--border-strong)]
                bg-[var(--surface)] shadow-[0_10px_30px_rgba(0,0,0,0.25)]
                sm:h-16 sm:w-16
              "
            >
              <PlansListingFlag destination={destination} size="hero" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
                {destination.kind === "country"
                  ? "Country plans"
                  : destination.kind === "regional"
                    ? "Regional plans"
                    : "Global plans"}
              </p>
              <h1 className="mt-1 break-words text-[1.5rem] font-bold leading-tight tracking-tight text-[var(--heading)] sm:text-4xl sm:leading-none">
                {heading}
              </h1>
              <p className="mt-1 text-sm text-[var(--text-muted)] sm:mt-1.5 sm:text-base">
                {loading ? (
                  "Loading available plans..."
                ) : hasHeroFromPrice ? (
                  <>
                    From <CurrencyPrice amountUsd={destination.minPrice} /> ·{" "}
                    {planCountLabel}
                  </>
                ) : (
                  planCountLabel
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      <PlansListingClient
        destination={destination}
        offers={offers}
        loading={loading}
        error={error}
        countryNames={countryNames}
        defaultGrid={defaultGrid}
      />

      {relatedRegional && relatedRegionalHref && relatedRegionalName ? (
        <section
          className="mx-auto max-w-[1200px] px-4 pb-8 sm:px-6 sm:pb-10"
          aria-labelledby="related-regional-heading"
        >
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
            <h2
              id="related-regional-heading"
              className="text-lg font-bold tracking-tight text-[var(--heading)] sm:text-xl"
            >
              Related regional plans
            </h2>
            <Link
              href={relatedRegionalHref}
              className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[var(--heading)]">
                  {relatedRegionalName}
                </p>
                {(relatedRegionalHasPrice || relatedRegionalPlanCount) && (
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {relatedRegionalHasPrice ? (
                      <>
                        From{" "}
                        <CurrencyPrice amountUsd={relatedRegional.minPrice} />
                        {relatedRegionalPlanCount ? " · " : ""}
                      </>
                    ) : null}
                    {relatedRegionalPlanCount}
                  </p>
                )}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--accent-strong)]">
                View plans
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          </div>
        </section>
      ) : null}

      {children}
    </main>
  );
}
