import type { DurationGroup } from "@/app/lib/plans/plan-utils";
import type { VesimDestination } from "@/app/lib/vesim/destinations";
import CurrencyPrice from "@/app/components/plans/CurrencyPrice";
import PlanOfferCard from "@/app/components/plans/PlanOfferCard";
import {
  PlanBuyNowLink,
  PlanCardTrustLine,
  PlanDetailsTriggerButton,
} from "@/app/components/plans/PlansListingChrome";

type PlansOfferGroupsProps = {
  groups: DurationGroup[];
  destination: VesimDestination;
  isRegionalOrGlobal: boolean;
  filteredCount: number;
  categoryOffersCount: number;
  activeCategoryLabel: "unlimited" | "standard";
  totalOffersCount: number;
  showPackageTabs: boolean;
  emptyHint?: string;
};

/**
 * Plan card grid — no "use client" on this module.
 * Do not load with next/dynamic ssr:false (SEO HTML must stay).
 * Buy / details / price are small client islands via chrome context.
 */
export default function PlansOfferGroups({
  groups,
  destination,
  isRegionalOrGlobal,
  filteredCount,
  categoryOffersCount,
  activeCategoryLabel,
  totalOffersCount,
  showPackageTabs,
  emptyHint = "Try clearing one or more filters to see more results.",
}: PlansOfferGroupsProps) {
  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-3 sm:mt-8">
        <p className="text-sm font-medium text-[var(--text-muted)]">
          Showing {filteredCount} of {categoryOffersCount} {activeCategoryLabel}{" "}
          plans
          {showPackageTabs && categoryOffersCount !== totalOffersCount
            ? ` (${totalOffersCount} total)`
            : ""}
        </p>
      </div>

      {filteredCount === 0 ? (
        <div className="mt-4 rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center sm:mt-6">
          <h3 className="text-lg font-semibold">No matching plans</h3>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{emptyHint}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-6 sm:mt-6 sm:space-y-10">
          {groups.map((group) => (
            <section key={group.label}>
              <div className="mb-3 flex items-end justify-between gap-3 border-b border-[var(--border)] pb-2 sm:mb-4 sm:pb-3">
                <h2 className="text-lg font-bold text-[var(--heading)] sm:text-2xl">
                  {group.label}
                </h2>
                <p className="text-sm text-[var(--text-soft)]">
                  {`${group.plans.length} plan${group.plans.length === 1 ? "" : "s"}`}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.plans.map((offer) => (
                  <PlanOfferCard
                    key={offer.id}
                    offer={offer}
                    isRegionalOrGlobal={isRegionalOrGlobal}
                    price={<CurrencyPrice amountUsd={offer.priceUSD} />}
                    buyControl={
                      <PlanBuyNowLink
                        offerId={offer.id}
                        destinationCode={destination.code}
                      />
                    }
                    detailsControl={
                      <PlanDetailsTriggerButton offerId={offer.id} />
                    }
                    trustControl={<PlanCardTrustLine />}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
