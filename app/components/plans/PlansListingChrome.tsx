"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { VesimOffer } from "@/app/lib/vesim/offers";

type PlansListingChromeValue = {
  getOffer: (offerId: string) => VesimOffer | undefined;
  openDetails: (offerId: string) => void;
  resolveCheckoutHref: (offer: VesimOffer, destinationCode: string) => string;
  purchaseTrustLine?: string;
  detailsLabel: string;
};

const PlansListingChromeContext =
  createContext<PlansListingChromeValue | null>(null);

export function PlansListingChromeProvider({
  offers,
  detailsLabel,
  resolveCheckoutHref,
  purchaseTrustLine,
  onOpenDetails,
  children,
}: {
  offers: VesimOffer[];
  detailsLabel: string;
  resolveCheckoutHref: (offer: VesimOffer, destinationCode: string) => string;
  purchaseTrustLine?: string;
  onOpenDetails: (offer: VesimOffer) => void;
  children: ReactNode;
}) {
  const offerById = useMemo(() => {
    const map = new Map<string, VesimOffer>();
    for (const offer of offers) map.set(offer.id, offer);
    return map;
  }, [offers]);

  const getOffer = useCallback(
    (offerId: string) => offerById.get(offerId),
    [offerById]
  );

  const openDetails = useCallback(
    (offerId: string) => {
      const offer = offerById.get(offerId);
      if (offer) onOpenDetails(offer);
    },
    [offerById, onOpenDetails]
  );

  const value = useMemo(
    () => ({
      getOffer,
      openDetails,
      resolveCheckoutHref,
      purchaseTrustLine,
      detailsLabel,
    }),
    [
      getOffer,
      openDetails,
      resolveCheckoutHref,
      purchaseTrustLine,
      detailsLabel,
    ]
  );

  return (
    <PlansListingChromeContext.Provider value={value}>
      {children}
    </PlansListingChromeContext.Provider>
  );
}

function usePlansListingChrome(): PlansListingChromeValue {
  const ctx = useContext(PlansListingChromeContext);
  if (!ctx) {
    throw new Error(
      "Plans listing chrome hooks require PlansListingChromeProvider"
    );
  }
  return ctx;
}

/** Client Buy Now so partner/customer href can update after session sync. */
export function PlanBuyNowLink({
  offerId,
  destinationCode,
}: {
  offerId: string;
  destinationCode: string;
}) {
  const { getOffer, resolveCheckoutHref } = usePlansListingChrome();
  const offer = getOffer(offerId);
  const href = offer
    ? resolveCheckoutHref(offer, destinationCode)
    : `/account/esim/buy?offerId=${encodeURIComponent(offerId)}${
        destinationCode.trim()
          ? `&country=${encodeURIComponent(destinationCode.trim())}`
          : ""
      }`;

  return (
    <Link
      href={href}
      className="
        order-1 inline-flex min-h-11 items-center justify-center
        rounded-xl bg-[var(--accent-strong)] px-3 text-sm font-bold
        text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]
        min-[400px]:order-2
      "
    >
      Buy Now
    </Link>
  );
}

export function PlanDetailsTriggerButton({ offerId }: { offerId: string }) {
  const { openDetails, detailsLabel } = usePlansListingChrome();
  return (
    <button
      type="button"
      onClick={() => openDetails(offerId)}
      className="
        order-2 inline-flex min-h-11 items-center justify-center
        rounded-xl border border-[var(--border-strong)]
        bg-[var(--surface)] px-3 text-sm font-semibold
        text-[var(--heading)] transition
        hover:bg-[var(--surface-2)]
        min-[400px]:order-1
      "
    >
      {detailsLabel}
    </button>
  );
}

export function PlanCardTrustLine() {
  const { purchaseTrustLine } = usePlansListingChrome();
  if (!purchaseTrustLine) return null;
  return (
    <p className="text-center text-xs leading-snug text-[var(--text-muted)]">
      {purchaseTrustLine}
    </p>
  );
}
