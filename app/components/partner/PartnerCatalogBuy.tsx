"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Earth, MapPinned, Search } from "lucide-react";
import {
  buyPartnerEsimAction,
  loadPartnerCatalogOffersAction,
} from "@/app/lib/partner/partnerPurchaseActions";
import type {
  PartnerCatalogDestination,
  PartnerCatalogOffer,
} from "@/app/lib/partner/partnerCatalogRead";
import { initialPartnerPurchaseActionState } from "@/app/lib/partner/partnerPurchaseFormState";
import PartnerOfferPaymentForm from "@/app/components/partner/PartnerOfferPaymentForm";
import { filterPlansDiscoveryDestinations } from "@/app/lib/plans/plansDiscovery";
import {
  resolveDestinationFlagVisual,
  type DestinationPresentationInput,
} from "@/app/lib/vesim/destinationPresentation";
import type { VesimDestination } from "@/app/lib/vesim/destinations";

type KindFilter = "ALL" | "COUNTRY" | "REGIONAL" | "GLOBAL";

type Props = {
  destinations: PartnerCatalogDestination[];
  balanceLabel: string;
  balanceCents: number;
  /** e.g. "5%" — shown as checkout discount badge only. */
  discountPercentLabel?: string | null;
  initialCountry?: string | null;
  initialOfferId?: string | null;
  splitPaymentEnabled?: boolean;
  paymentGatewayConfigured?: boolean;
  enabledSimpaisaOperatorIds?: readonly string[];
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `pep_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function toSearchDestination(d: PartnerCatalogDestination): VesimDestination {
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

function DestinationFlagMark({
  destination,
}: {
  destination: DestinationPresentationInput;
}) {
  const visual = resolveDestinationFlagVisual(destination);
  const [imageFailed, setImageFailed] = useState(false);
  const kind = destination.kind ?? "country";

  if (kind === "global") {
    return <Earth className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
  }
  if (kind === "regional") {
    return (
      <MapPinned className="h-4 w-4 text-emerald-400" aria-hidden="true" />
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
        unoptimized
        className="h-4 w-[22px] rounded-[3px] object-contain"
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
      className="text-[10px] font-bold tracking-wide text-slate-100"
      aria-hidden="true"
    >
      {visual.type === "initials" ? visual.initials : destination.code}
    </span>
  );
}

const KIND_TABS: Array<{ id: KindFilter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "COUNTRY", label: "Country" },
  { id: "REGIONAL", label: "Regional" },
  { id: "GLOBAL", label: "Global" },
];

export default function PartnerCatalogBuy({
  destinations,
  balanceLabel,
  balanceCents,
  discountPercentLabel = null,
  initialCountry = null,
  initialOfferId = null,
  splitPaymentEnabled = false,
  paymentGatewayConfigured = false,
  enabledSimpaisaOperatorIds,
}: Props) {
  const searchFieldId = useId();
  const offersHeadingId = useId();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [selectedCode, setSelectedCode] = useState<string | null>(() => {
    const hint = (initialCountry ?? "").trim();
    if (!hint) return null;
    const match = destinations.find(
      (d) => d.code.trim().toUpperCase() === hint.toUpperCase()
    );
    return match?.code ?? null;
  });
  const [offers, setOffers] = useState<PartnerCatalogOffer[]>([]);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [offersLoading, startOffersLoad] = useTransition();
  const [buyState, buyAction, buyPending] = useActionState(
    buyPartnerEsimAction,
    initialPartnerPurchaseActionState
  );
  const [idempotencyByOffer, setIdempotencyByOffer] = useState<
    Record<string, string>
  >({});
  const buyWasPending = useRef(false);

  useEffect(() => {
    if (buyWasPending.current && !buyPending) {
      setIdempotencyByOffer((prev) => {
        const next: Record<string, string> = {};
        for (const offerId of Object.keys(prev)) {
          next[offerId] = newIdempotencyKey();
        }
        return next;
      });
    }
    buyWasPending.current = buyPending;
  }, [buyPending]);

  const searchDestinations = useMemo(
    () => destinations.map(toSearchDestination),
    [destinations]
  );

  const filtered = useMemo(
    () => filterPlansDiscoveryDestinations(searchDestinations, search),
    [searchDestinations, search]
  );

  const filteredCodes = useMemo(
    () => new Set(filtered.map((d) => d.code)),
    [filtered]
  );

  const visibleDestinations = useMemo(
    () =>
      destinations
        .filter((d) => filteredCodes.has(d.code))
        .filter((d) => {
          if (kindFilter === "ALL") return true;
          const kind = (d.kind ?? "country").toLowerCase();
          if (kindFilter === "COUNTRY") return kind === "country";
          if (kindFilter === "REGIONAL") return kind === "regional";
          return kind === "global";
        })
        .slice()
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        ),
    [destinations, filteredCodes, kindFilter]
  );

  const selectedDestination = useMemo(
    () => destinations.find((d) => d.code === selectedCode) ?? null,
    [destinations, selectedCode]
  );

  useEffect(() => {
    if (!selectedCode) {
      setOffers([]);
      setOffersError(null);
      return;
    }
    startOffersLoad(async () => {
      setOffersError(null);
      try {
        const rows = await loadPartnerCatalogOffersAction(selectedCode);
        setOffers(rows);
        setIdempotencyByOffer((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            if (!next[row.offerId]) next[row.offerId] = newIdempotencyKey();
          }
          return next;
        });
        if (initialOfferId) {
          const target = `partner-offer-${initialOfferId}`;
          setTimeout(() => {
            document.getElementById(target)?.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }, 0);
        }
      } catch {
        setOffers([]);
        setOffersError("Plans are temporarily unavailable. Please try again.");
      }
    });
  }, [selectedCode, initialOfferId]);

  const showResult =
    buyState.kind !== "idle" &&
    (buyState.ok === true
      ? buyState.kind === "success" || buyState.kind === "duplicate_success"
      : true);

  const discountBadge =
    (discountPercentLabel ?? "").trim() &&
    discountPercentLabel !== "0" &&
    discountPercentLabel !== "0%"
      ? discountPercentLabel
      : null;

  return (
    <div className="min-w-0 space-y-8">
      <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0D1526] px-3 py-3 text-sm text-slate-200 sm:px-4">
        <p className="break-words">
          Purchases are charged from your MAP eSIM Partner balance (
          <span className="font-semibold tabular-nums text-emerald-300">
            {balanceLabel} USD
          </span>
          ).
        </p>
        <p className="mt-1 text-slate-400">
          Cards show retail rates. Your partner discount
          {discountBadge ? (
            <>
              {" "}
              (
              <span className="font-semibold text-emerald-300">
                {discountBadge}
              </span>
              )
            </>
          ) : null}{" "}
          is applied at checkout.
        </p>
        {splitPaymentEnabled ? (
          <p className="mt-2 text-xs text-slate-500">
            Choose full Partner balance when it covers the plan. If balance is
            short, apply wallet funds and pay the remainder online, or pay
            online only.
          </p>
        ) : null}
      </div>

      {showResult ? (
        <div
          className={`rounded-2xl border px-4 py-4 sm:px-5 ${
            buyState.ok
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-rose-500/30 bg-rose-500/10"
          }`}
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-slate-50">
            {buyState.ok
              ? buyState.kind === "duplicate_success"
                ? "Already completed"
                : "Purchase complete"
              : buyState.kind === "insufficient_balance"
                ? "Insufficient balance"
                : buyState.kind === "pricing_changed"
                  ? "Pricing updated"
                  : buyState.kind === "purchases_paused"
                    ? "Temporarily unavailable"
                    : buyState.kind === "reconciliation_required"
                      ? "Under review"
                      : buyState.kind === "failed_refunded"
                        ? "Purchase failed"
                        : "Unable to purchase"}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {"message" in buyState ? buyState.message : null}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {buyState.ok ? (
              <Link
                href="/partner/orders"
                className="inline-flex h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                My eSIMs
              </Link>
            ) : (
              <p className="w-full text-xs text-slate-400">
                Failed attempts refund Partner balance automatically. Issue eSIM
                again below to create a brand-new provider order.
              </p>
            )}
            <Link
              href="/partner/catalog"
              className="inline-flex h-10 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100 outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Browse catalog again
            </Link>
            <Link
              href="/partner"
              className="inline-flex h-10 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100 outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <label
          htmlFor={searchFieldId}
          className="block text-sm font-semibold text-slate-100"
        >
          Find a destination
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            id={searchFieldId}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search countries or regions"
            disabled={buyPending}
            className="h-11 w-full rounded-xl border border-white/[0.1] bg-[#070D19] py-2 pl-10 pr-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:opacity-60"
          />
        </div>
        <div
          className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Destination type"
        >
          {KIND_TABS.map((tab) => {
            const active = kindFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={buyPending}
                onClick={() => setKindFilter(tab.id)}
                className={`inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition disabled:opacity-60 ${
                  active
                    ? "bg-emerald-500 text-slate-950"
                    : "border border-white/[0.08] text-slate-300 hover:bg-white/[0.04]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Destinations
        </p>
        {visibleDestinations.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.1] px-4 py-6 text-sm text-slate-400">
            No destinations match your search.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleDestinations.map((destination) => {
              const kind =
                destination.kind === "regional" ||
                destination.kind === "global" ||
                destination.kind === "country"
                  ? destination.kind
                  : "country";
              const active = selectedCode === destination.code;
              return (
                <li key={destination.code}>
                  <button
                    type="button"
                    disabled={buyPending}
                    aria-pressed={active}
                    onClick={() => setSelectedCode(destination.code)}
                    className={`flex min-h-[72px] w-full min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-60 ${
                      active
                        ? "border-emerald-500/50 bg-[#0D1526]"
                        : "border-white/[0.08] bg-[#0D1526]/70 hover:border-white/[0.16]"
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#070D19]">
                      <DestinationFlagMark
                        destination={{
                          code: destination.code,
                          name: destination.name,
                          flag: destination.flag,
                          kind,
                        }}
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
                      {destination.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div aria-labelledby={offersHeadingId}>
        <h2
          id={offersHeadingId}
          className="text-lg font-bold tracking-tight text-slate-50"
        >
          {selectedDestination
            ? `Plans for ${selectedDestination.name}`
            : "Plans"}
        </h2>
        {!selectedCode ? (
          <p className="mt-3 text-sm text-slate-400">
            Select a destination to view Partner plans.
          </p>
        ) : offersLoading ? (
          <ul
            className="mt-4 grid gap-3 sm:grid-cols-2"
            role="status"
            aria-busy="true"
            aria-label="Loading plans"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <li
                key={index}
                className="animate-pulse rounded-2xl border border-white/[0.08] bg-[#0D1526] p-5"
              >
                <div className="h-8 w-24 rounded bg-white/[0.06]" />
                <div className="mt-3 h-4 w-32 rounded bg-white/[0.04]" />
                <div className="mt-6 h-11 w-full rounded-xl bg-emerald-500/15" />
              </li>
            ))}
          </ul>
        ) : offersError ? (
          <p className="mt-3 text-sm text-amber-200" role="alert">
            {offersError}
          </p>
        ) : offers.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No plans are available for this destination right now.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {offers.map((offer) => {
              const payableCents =
                offer.partnerPriceCents > 0
                  ? offer.partnerPriceCents
                  : offer.fundingDisplay?.totalCents ?? 0;
              const highlight =
                Boolean(initialOfferId) && offer.offerId === initialOfferId;
              return (
                <li
                  key={offer.offerId}
                  id={`partner-offer-${offer.offerId}`}
                  className={`flex h-full min-w-0 flex-col rounded-[22px] border bg-[#0D1526] p-4 shadow-[0_10px_28px_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5 hover:border-white/[0.14] sm:p-5 ${
                    highlight
                      ? "border-emerald-500/50"
                      : "border-white/[0.08]"
                  }`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[1.65rem] font-bold leading-none tracking-tight text-slate-50 sm:text-3xl">
                        {offer.dataLabel}
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-300">
                        {offer.validityLabel}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {offer.name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-bold tabular-nums text-slate-100 sm:text-2xl">
                        {offer.retailPriceLabel}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
                        Retail
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                      {discountBadge
                        ? `${discountBadge} partner discount at checkout`
                        : "Partner discount applied at checkout"}
                    </span>
                    <span className="text-sm text-slate-400">
                      You pay{" "}
                      <span className="font-semibold tabular-nums text-emerald-300">
                        {offer.partnerPriceLabel}
                      </span>
                    </span>
                  </div>

                  <div className="mt-auto space-y-3 pt-5">
                    {selectedCode ? (
                      <PartnerOfferPaymentForm
                        compact
                        offerId={offer.offerId}
                        destinationCode={selectedCode}
                        idempotencyKey={
                          idempotencyByOffer[offer.offerId] ||
                          newIdempotencyKey()
                        }
                        payableCents={payableCents}
                        balanceCents={balanceCents}
                        splitPaymentEnabled={splitPaymentEnabled}
                        paymentGatewayConfigured={paymentGatewayConfigured}
                        enabledSimpaisaOperatorIds={enabledSimpaisaOperatorIds}
                        buyAction={buyAction}
                        buyPending={buyPending}
                        buyState={buyState}
                      />
                    ) : null}
                    <Link
                      href={`/partner/buy?offerId=${encodeURIComponent(offer.offerId)}&country=${encodeURIComponent(selectedCode ?? "")}`}
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/[0.12] text-sm font-semibold text-slate-200 transition hover:bg-white/[0.04]"
                    >
                      Select Plan
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
