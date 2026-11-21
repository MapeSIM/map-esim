"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { ArrowLeft, Earth, MapPinned, Search, X } from "lucide-react";
import BrandPendingLabel from "@/app/components/loading/BrandPendingLabel";
import { loadPartnerCatalogOffersAction } from "@/app/lib/partner/partnerPurchaseActions";
import type {
  PartnerCatalogDestination,
  PartnerCatalogOffer,
} from "@/app/lib/partner/partnerCatalogRead";
import { filterPlansDiscoveryDestinations } from "@/app/lib/plans/plansDiscovery";
import type { SortOption } from "@/app/lib/plans/plan-utils";
import {
  resolveDestinationFlagVisual,
  type DestinationPresentationInput,
} from "@/app/lib/vesim/destinationPresentation";
import type { VesimDestination } from "@/app/lib/vesim/destinations";

type KindFilter = "ALL" | "COUNTRY" | "REGIONAL" | "GLOBAL";
type PackageFilter = "standard" | "unlimited";

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

type DurationGroup = {
  days: number;
  label: string;
  plans: PartnerCatalogOffer[];
};

const KIND_TABS: Array<{ id: KindFilter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "COUNTRY", label: "Country" },
  { id: "REGIONAL", label: "Regional" },
  { id: "GLOBAL", label: "Global" },
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "data-asc", label: "Data: Low to High" },
  { value: "data-desc", label: "Data: High to Low" },
  { value: "validity-asc", label: "Validity: Shortest" },
  { value: "validity-desc", label: "Validity: Longest" },
];

function parseDataMb(label: string): number {
  const text = (label || "").trim().toLowerCase();
  if (!text || /unlimited/.test(text)) return Number.POSITIVE_INFINITY;
  const gb = text.match(/([\d.]+)\s*gb/);
  if (gb) return Math.round(parseFloat(gb[1]) * 1024);
  const mb = text.match(/([\d.]+)\s*mb/);
  if (mb) return Math.round(parseFloat(mb[1]));
  return 0;
}

function validityLabel(days: number): string {
  return days === 1 ? "1 Day" : `${days} Days`;
}

function compareOffers(
  a: PartnerCatalogOffer,
  b: PartnerCatalogOffer,
  sort: SortOption
): number {
  const daysA = a.durationDays ?? 0;
  const daysB = b.durationDays ?? 0;
  const priceA = a.retailPriceUsd;
  const priceB = b.retailPriceUsd;
  const dataA = parseDataMb(a.dataLabel);
  const dataB = parseDataMb(b.dataLabel);
  let result = 0;
  switch (sort) {
    case "price-desc":
      result = priceB - priceA;
      break;
    case "data-asc":
      result = dataA - dataB;
      break;
    case "data-desc":
      result = dataB - dataA;
      break;
    case "validity-asc":
      result = daysA - daysB;
      break;
    case "validity-desc":
      result = daysB - daysA;
      break;
    case "price-asc":
    default:
      result = priceA - priceB;
      break;
  }
  if (result !== 0) return result;
  return a.offerId.localeCompare(b.offerId);
}

function groupOffersByDuration(
  offers: PartnerCatalogOffer[],
  sort: SortOption
): DurationGroup[] {
  const map = new Map<number, PartnerCatalogOffer[]>();
  for (const offer of offers) {
    const days = offer.durationDays != null && offer.durationDays > 0
      ? offer.durationDays
      : 0;
    const list = map.get(days) || [];
    list.push(offer);
    map.set(days, list);
  }
  const groups = Array.from(map.entries()).map(([days, plans]) => ({
    days,
    label: days > 0 ? validityLabel(days) : "Other",
    plans: [...plans].sort((a, b) => compareOffers(a, b, sort)),
  }));
  groups.sort((a, b) => {
    if (sort === "validity-desc") return b.days - a.days;
    return a.days - b.days;
  });
  return groups;
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
    return <Earth className="h-5 w-5 text-emerald-400" aria-hidden="true" />;
  }
  if (kind === "regional") {
    return (
      <MapPinned className="h-5 w-5 text-emerald-400" aria-hidden="true" />
    );
  }

  if (visual.type === "image" && !imageFailed) {
    return (
      <Image
        src={visual.src}
        alt=""
        width={45}
        height={30}
        sizes="45px"
        onError={() => setImageFailed(true)}
        unoptimized
        className="h-[30px] w-[45px] rounded-[3px] object-contain"
      />
    );
  }

  if (visual.type === "emoji") {
    return (
      <span className="text-xl leading-none" aria-hidden="true">
        {visual.emoji}
      </span>
    );
  }

  return (
    <span
      className="text-xs font-bold tracking-wide text-slate-100"
      aria-hidden="true"
    >
      {visual.type === "initials" ? visual.initials : destination.code}
    </span>
  );
}

function PillButton({
  active,
  onClick,
  children,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-45 sm:px-4 sm:text-sm ${
        active
          ? "border-emerald-500 bg-emerald-500 text-slate-950 shadow-[0_0_0_1px_rgba(124,255,0,0.25)]"
          : "border-white/[0.12] bg-[#0D1526] text-slate-100 hover:border-white/[0.2] hover:bg-white/[0.04]"
      }`}
    >
      {children}
    </button>
  );
}

function PlanDetailsModal({
  offer,
  discountBadge,
  onClose,
}: {
  offer: PartnerCatalogOffer;
  discountBadge: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-plan-details-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0D1526] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="partner-plan-details-title"
              className="text-xl font-bold text-slate-50"
            >
              {offer.dataLabel}
            </h3>
            <p className="mt-1 truncate text-sm text-slate-400">{offer.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.1] text-slate-300 hover:bg-white/[0.04]"
            aria-label="Close plan details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Retail price</dt>
            <dd className="font-semibold tabular-nums text-slate-100">
              {offer.retailPriceLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Partner price</dt>
            <dd className="font-semibold tabular-nums text-emerald-300">
              {offer.partnerPriceLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Validity</dt>
            <dd className="font-medium text-slate-100">{offer.validityLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Network</dt>
            <dd className="max-w-[60%] truncate text-right font-medium text-slate-100">
              {offer.networkLabel || "Local networks"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Destination</dt>
            <dd className="max-w-[60%] truncate text-right font-medium text-slate-100">
              {offer.destinationLabel}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-slate-500">
          Cards show retail rates. Your{" "}
          {discountBadge ? (
            <>
              <span className="font-semibold text-emerald-300">
                {discountBadge}
              </span>{" "}
              partner discount at checkout
            </>
          ) : (
            "partner discount applied at checkout"
          )}
          . Final charge:{" "}
          <span className="font-semibold text-emerald-300">
            {offer.partnerPriceLabel}
          </span>
          .
        </p>
      </div>
    </div>
  );
}

export default function PartnerCatalogBuy({
  destinations,
  balanceLabel,
  discountPercentLabel = null,
  initialCountry = null,
  initialOfferId = null,
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
  const [packageFilter, setPackageFilter] = useState<PackageFilter>("standard");
  const [sort, setSort] = useState<SortOption>("price-asc");
  const [detailsOfferId, setDetailsOfferId] = useState<string | null>(null);
  const [buyNavigatingId, setBuyNavigatingId] = useState<string | null>(null);

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

  useEffect(() => {
    if (offers.length === 0) return;
    const hasStandard = offers.some((o) => !o.isUnlimited);
    const hasUnlimited = offers.some((o) => o.isUnlimited);
    if (packageFilter === "standard" && !hasStandard && hasUnlimited) {
      setPackageFilter("unlimited");
    } else if (packageFilter === "unlimited" && !hasUnlimited && hasStandard) {
      setPackageFilter("standard");
    }
  }, [offers, packageFilter]);

  const categorySummary = useMemo(
    () => ({
      standard: offers.filter((o) => !o.isUnlimited).length,
      unlimited: offers.filter((o) => o.isUnlimited).length,
    }),
    [offers]
  );

  const categoryOffers = useMemo(
    () =>
      offers.filter((o) =>
        packageFilter === "unlimited" ? o.isUnlimited : !o.isUnlimited
      ),
    [offers, packageFilter]
  );

  const groups = useMemo(
    () => groupOffersByDuration(categoryOffers, sort),
    [categoryOffers, sort]
  );

  const detailsOffer =
    detailsOfferId != null
      ? offers.find((o) => o.offerId === detailsOfferId) ?? null
      : null;

  const discountBadge =
    (discountPercentLabel ?? "").trim() &&
    discountPercentLabel !== "0" &&
    discountPercentLabel !== "0%"
      ? discountPercentLabel
      : null;

  const showPackageTabs =
    categorySummary.standard > 0 || categorySummary.unlimited > 0;

  if (selectedDestination && selectedCode) {
    return (
      <div className="min-w-0 space-y-6">
        <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0D1526] px-3 py-3 text-sm text-slate-200 sm:px-4">
          <p className="break-words">
            Purchases are charged from your MAP eSIM Partner balance (
            <span className="font-semibold tabular-nums text-emerald-300">
              {balanceLabel} USD
            </span>
            ).
          </p>
          <p className="mt-1 text-slate-400">
            Cards show retail rates. Your{" "}
            {discountBadge ? (
              <>
                <span className="font-semibold text-emerald-300">
                  {discountBadge}
                </span>{" "}
                partner discount at checkout
              </>
            ) : (
              "partner discount applied at checkout"
            )}
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedCode(null);
              setOffers([]);
              setOffersError(null);
              setDetailsOfferId(null);
              setBuyNavigatingId(null);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.1] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.04]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All destinations
          </button>
          <Link
            href="/partner/catalog"
            className="inline-flex h-10 items-center rounded-xl border border-white/[0.1] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.04]"
          >
            Browse catalog again
          </Link>
        </div>

        <header className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-[#070D19]">
              <DestinationFlagMark
                destination={{
                  code: selectedDestination.code,
                  name: selectedDestination.name,
                  flag: selectedDestination.flag,
                  kind:
                    selectedDestination.kind === "regional" ||
                    selectedDestination.kind === "global" ||
                    selectedDestination.kind === "country"
                      ? selectedDestination.kind
                      : "country",
                }}
              />
            </span>
            <div className="min-w-0">
              <h2
                id={offersHeadingId}
                className="text-2xl font-bold tracking-tight text-slate-50"
              >
                {selectedDestination.name}
              </h2>
              <p className="text-sm text-slate-400">
                {offersLoading
                  ? "Loading plans…"
                  : `${categoryOffers.length} plan${
                      categoryOffers.length === 1 ? "" : "s"
                    } available`}
              </p>
            </div>
          </div>
        </header>

        <div className="rounded-3xl border border-white/[0.08] bg-[#0D1526] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.22)] sm:p-5">
          <div className="flex flex-col gap-3 sm:gap-4">
            {showPackageTabs ? (
              <div className="space-y-1.5 sm:space-y-2">
                <p className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 sm:block">
                  Package type
                </p>
                <div className="flex w-full flex-row flex-wrap gap-2">
                  <PillButton
                    active={packageFilter === "standard"}
                    onClick={() => setPackageFilter("standard")}
                    disabled={categorySummary.standard === 0}
                  >
                    {`Standard · ${categorySummary.standard} plan${
                      categorySummary.standard === 1 ? "" : "s"
                    }`}
                  </PillButton>
                  <PillButton
                    active={packageFilter === "unlimited"}
                    onClick={() => setPackageFilter("unlimited")}
                    disabled={categorySummary.unlimited === 0}
                  >
                    {`Unlimited · ${categorySummary.unlimited} plan${
                      categorySummary.unlimited === 1 ? "" : "s"
                    }`}
                  </PillButton>
                </div>
              </div>
            ) : null}

            <div className="flex w-full flex-row items-center justify-end gap-2">
              <label className="sr-only" htmlFor="partner-catalog-sort">
                Sort plans
              </label>
              <select
                id="partner-catalog-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortOption)}
                className="h-11 min-w-[12rem] rounded-xl border border-white/[0.12] bg-[#070D19] px-3 text-sm font-semibold text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {offersLoading ? (
          <ul
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            role="status"
            aria-busy="true"
            aria-label="Loading plans"
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <li
                key={index}
                className="animate-pulse rounded-[22px] border border-white/[0.08] bg-[#0D1526] p-5"
              >
                <div className="h-8 w-24 rounded bg-white/[0.06]" />
                <div className="mt-3 h-4 w-32 rounded bg-white/[0.04]" />
                <div className="mt-6 h-11 w-full rounded-xl bg-emerald-500/15" />
              </li>
            ))}
          </ul>
        ) : offersError ? (
          <p className="text-sm text-amber-200" role="alert">
            {offersError}
          </p>
        ) : categoryOffers.length === 0 ? (
          <div className="rounded-3xl border border-white/[0.08] bg-[#0D1526] p-8 text-center">
            <h3 className="text-lg font-semibold text-slate-50">
              No matching plans
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              No {packageFilter} plans are available for this destination right
              now.
            </p>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-10" aria-labelledby={offersHeadingId}>
            {groups.map((group) => (
              <section key={group.label}>
                <div className="mb-3 flex items-end justify-between gap-3 border-b border-white/[0.08] pb-2 sm:mb-4 sm:pb-3">
                  <h3 className="text-lg font-bold text-slate-50 sm:text-2xl">
                    {group.label}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {`${group.plans.length} plan${
                      group.plans.length === 1 ? "" : "s"
                    }`}
                  </p>
                </div>

                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.plans.map((offer) => {
                    const highlight =
                      Boolean(initialOfferId) &&
                      offer.offerId === initialOfferId;
                    const buyHref = `/partner/buy?offerId=${encodeURIComponent(offer.offerId)}&country=${encodeURIComponent(selectedCode)}`;
                    const navigating = buyNavigatingId === offer.offerId;
                    return (
                      <li key={offer.offerId}>
                        <article
                          id={`partner-offer-${offer.offerId}`}
                          className={`group flex h-full min-w-0 flex-col rounded-[22px] border bg-[#0D1526] p-4 shadow-[0_10px_28px_rgba(0,0,0,0.2)] transition duration-200 hover:-translate-y-1 hover:border-white/[0.14] hover:shadow-[0_18px_40px_rgba(0,0,0,0.32)] sm:p-5 md:min-h-[220px] ${
                            highlight
                              ? "border-emerald-500/50"
                              : "border-white/[0.08]"
                          }`}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <h4 className="min-w-0 break-words text-[1.65rem] font-bold leading-none tracking-tight text-slate-50 sm:text-3xl">
                              <span className="sr-only">Data </span>
                              {offer.dataLabel}
                            </h4>
                            <p className="shrink-0 text-right text-xl font-bold leading-none text-emerald-400 sm:text-2xl">
                              <span className="sr-only">Price </span>
                              {offer.retailPriceLabel.replace(/ USD$/i, "")}
                            </p>
                          </div>

                          <div className="mt-4 flex flex-col gap-1.5 text-sm md:flex-1">
                            <p className="text-slate-100">
                              <span className="font-semibold">Validity</span>
                              <span className="text-slate-500"> · </span>
                              <span className="font-medium">
                                {offer.validityLabel
                                  .replace(/ Days$/i, " days")
                                  .replace(/^1 Day$/i, "1 day")}
                              </span>
                            </p>
                            <p className="truncate text-slate-300">
                              <span className="font-medium text-slate-400">
                                Network
                              </span>
                              <span className="text-slate-500"> · </span>
                              <span>
                                {offer.networkLabel || "Local networks"}
                              </span>
                            </p>
                          </div>

                          <div className="mt-auto space-y-2.5 pt-3 md:pt-5">
                            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                              <Link
                                href={buyHref}
                                prefetch
                                aria-disabled={navigating || undefined}
                                onClick={(event) => {
                                  if (navigating) {
                                    event.preventDefault();
                                    return;
                                  }
                                  setBuyNavigatingId(offer.offerId);
                                }}
                                className={`order-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 min-[400px]:order-2 ${
                                  navigating
                                    ? "pointer-events-none opacity-80"
                                    : ""
                                }`}
                              >
                                {navigating ? (
                                  <BrandPendingLabel label="Preparing Checkout..." />
                                ) : (
                                  "Buy Now"
                                )}
                              </Link>
                              <button
                                type="button"
                                onClick={() => setDetailsOfferId(offer.offerId)}
                                className="order-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.12] bg-[#070D19] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.04] min-[400px]:order-1"
                              >
                                Plan Details
                              </button>
                            </div>
                            <p className="text-center text-xs leading-snug text-slate-500">
                              Partner price{" "}
                              <span className="font-semibold text-emerald-300">
                                {offer.partnerPriceLabel}
                              </span>{" "}
                              at checkout
                              {discountBadge ? ` (${discountBadge} off)` : ""}.
                            </p>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {detailsOffer ? (
          <PlanDetailsModal
            offer={detailsOffer}
            discountBadge={discountBadge}
            onClose={() => setDetailsOfferId(null)}
          />
        ) : null}
      </div>
    );
  }

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
          Cards show retail rates. Your{" "}
          {discountBadge ? (
            <>
              <span className="font-semibold text-emerald-300">
                {discountBadge}
              </span>{" "}
              partner discount at checkout
            </>
          ) : (
            "partner discount applied at checkout"
          )}
          .
        </p>
      </div>

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
            className="h-11 w-full rounded-xl border border-white/[0.1] bg-[#070D19] py-2 pl-10 pr-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
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
                onClick={() => setKindFilter(tab.id)}
                className={`inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition ${
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
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleDestinations.map((destination) => {
              const kind =
                destination.kind === "regional" ||
                destination.kind === "global" ||
                destination.kind === "country"
                  ? destination.kind
                  : "country";
              const plans = destination.planCount ?? 0;
              const fromLabel =
                destination.minRetailPriceLabel ||
                (destination.minRetailPriceUsd != null
                  ? `$${destination.minRetailPriceUsd.toFixed(2)}`
                  : "—");
              return (
                <li key={destination.code}>
                  <button
                    type="button"
                    onClick={() => setSelectedCode(destination.code)}
                    className="map-dest-card w-full text-left"
                  >
                    <div className="map-dest-card__main">
                      <span className="flex h-10 w-12 shrink-0 items-center justify-center">
                        <DestinationFlagMark
                          destination={{
                            code: destination.code,
                            name: destination.name,
                            flag: destination.flag,
                            kind,
                          }}
                        />
                      </span>
                      <div className="map-dest-card__text">
                        <h3 className="map-dest-card__name">
                          {destination.name}
                        </h3>
                        <p className="map-dest-card__meta">
                          {plans} {plans === 1 ? "plan" : "plans"}
                        </p>
                      </div>
                    </div>
                    <div className="map-dest-card__price-wrap">
                      <div className="map-dest-card__price">
                        <p className="map-dest-card__from">From</p>
                        <p className="map-dest-card__amount">{fromLabel}</p>
                      </div>
                      <span className="map-dest-card__arrow" aria-hidden="true">
                        →
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
