"use client";

import { useEffect, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Globe2, Clock3, Wifi, MapPinned } from "lucide-react";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import type { VesimDestination } from "@/app/lib/vesim/destinations";
import {
  buildCheckoutHref,
  formatValidityPhrase,
} from "@/app/lib/plans/plan-utils";
import {
  planDetailFairUseOrTerms,
  planDetailNetworkNames,
} from "@/app/lib/plans/planOfferPresentation";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";

type PlanDetailsModalProps = {
  offer: VesimOffer | null;
  destination: VesimDestination;
  countryNames?: Record<string, string>;
  onClose: () => void;
  /** Prefer coverage-first copy for regional/global destinations. */
  coverageFocused?: boolean;
  checkoutHref?: (offer: VesimOffer, destinationCode: string) => string;
};

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] py-3 last:border-b-0">
      <span className="text-sm text-[var(--text-soft)]">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium text-[var(--heading)]">
        {value}
      </span>
    </div>
  );
}

export default function PlanDetailsModal({
  offer,
  destination,
  onClose,
  checkoutHref = buildCheckoutHref,
}: PlanDetailsModalProps) {
  const { formatPrice } = useCurrency();

  useEffect(() => {
    if (!offer) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [offer, onClose]);

  if (!offer) return null;

  const networks = planDetailNetworkNames(offer);
  const fairUseOrTerms = planDetailFairUseOrTerms(offer);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-details-title"
        className="
          max-h-[92vh] w-full max-w-xl overflow-hidden rounded-3xl
          border border-[var(--border-strong)] bg-[var(--surface-2)]
          shadow-[0_24px_80px_rgba(0,0,0,0.55)]
        "
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--accent-soft)]">
                {destination.kind === "country" &&
                destination.code.length === 2 ? (
                  <Image
                    src={`https://flagcdn.com/w80/${destination.code.toLowerCase()}.png`}
                    alt=""
                    width={44}
                    height={32}
                    sizes="44px"
                    className="h-full w-full object-cover"
                  />
                ) : destination.kind === "regional" ? (
                  <MapPinned className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Globe2 className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]/90">
                  {destination.name}
                </p>
                <h2
                  id="plan-details-title"
                  className="truncate text-xl font-bold text-[var(--heading)] sm:text-2xl"
                >
                  {offer.name}
                </h2>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="
              rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-2
              text-[var(--text-muted)] transition hover:border-[var(--accent-strong)]/50
              hover:text-[var(--heading)]
            "
            aria-label="Close plan details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-180px)] overflow-y-auto px-5 py-2 sm:px-6">
          <div className="grid grid-cols-2 gap-3 py-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-xs uppercase tracking-wider text-[var(--text-soft)]">
                Data
              </p>
              <p className="mt-1 text-2xl font-bold text-[var(--heading)]">
                {offer.dataFormatted}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-xs uppercase tracking-wider text-[var(--text-soft)]">
                Price
              </p>
              <p className="mt-1 text-2xl font-bold text-[var(--accent-strong)]">
                {formatPrice(offer.priceUSD)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-3)] px-4">
            <DetailRow
              label="Validity"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-[var(--accent-strong)]" />
                  {formatValidityPhrase(offer.durationDays)}
                </span>
              }
            />
          </div>

          {fairUseOrTerms ? (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-3)] p-4">
              <p className="text-sm font-semibold text-[var(--heading)]">
                Fair use & speed terms
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                {fairUseOrTerms}
              </p>
            </div>
          ) : null}

          {networks.length > 0 && (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-3)] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--heading)]">
                <Wifi className="h-4 w-4 text-[var(--accent-strong)]" />
                Available networks
              </div>
              <div className="flex flex-wrap gap-2">
                {networks.map((network) => (
                  <span
                    key={network}
                    className="rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text)]"
                  >
                    {network}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4 sm:px-6">
          <Link
            href={checkoutHref(offer, destination.code)}
            className="
              flex w-full items-center justify-center rounded-2xl
              bg-[var(--accent-strong)] px-5 py-3.5 text-sm font-bold text-[var(--accent-ink)]
              transition hover:bg-[var(--accent-strong)]
            "
          >
            Buy Now
          </Link>
        </div>
      </div>
    </div>
  );
}
