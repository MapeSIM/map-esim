"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
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
import { filterPlansDiscoveryDestinations } from "@/app/lib/plans/plansDiscovery";
import {
  resolveDestinationFlagVisual,
  type DestinationPresentationInput,
} from "@/app/lib/vesim/destinationPresentation";
import type { VesimDestination } from "@/app/lib/vesim/destinations";

type Props = {
  destinations: PartnerCatalogDestination[];
  balanceLabel: string;
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

export default function PartnerCatalogBuy({
  destinations,
  balanceLabel,
}: Props) {
  const searchFieldId = useId();
  const offersHeadingId = useId();
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
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
        .slice()
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        ),
    [destinations, filteredCodes]
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
      } catch {
        setOffers([]);
        setOffersError("Plans are temporarily unavailable. Please try again.");
      }
    });
  }, [selectedCode]);

  const showResult =
    buyState.kind !== "idle" &&
    (buyState.ok === true
      ? buyState.kind === "success" || buyState.kind === "duplicate_success"
      : true);

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]">
        <p>
          Purchases are charged from your MAP eSIM Partner balance (
          <span className="font-semibold tabular-nums">{balanceLabel} USD</span>
          ).
        </p>
        <p className="mt-1 text-[var(--text-muted)]">
          Catalog prices match MAP eSIM retail. Your Partner rate is applied
          automatically at purchase.
        </p>
      </div>

      {showResult ? (
        <div
          className={`rounded-2xl border px-4 py-4 sm:px-5 ${
            buyState.ok
              ? "border-[var(--border)] bg-[var(--surface-2)]"
              : "border-[var(--border-strong)] bg-[var(--surface-2)]"
          }`}
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-[var(--heading)]">
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
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {"message" in buyState ? buyState.message : null}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/partner"
              className="inline-flex h-10 items-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              Back to dashboard
            </Link>
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              onClick={() => {
                window.location.href = "/partner/catalog";
              }}
            >
              Browse catalog again
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <label
          htmlFor={searchFieldId}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Find a destination
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-soft)]"
            aria-hidden="true"
          />
          <input
            id={searchFieldId}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search countries or regions"
            disabled={buyPending}
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 pl-10 pr-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          Destinations
        </p>
        {visibleDestinations.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--text-muted)]">
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
                    className={`flex min-h-[72px] w-full min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60 ${
                      active
                        ? "border-[var(--accent-strong)] bg-[var(--surface)]"
                        : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-hover)]"
                    }`}
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
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--heading)]">
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
          className="text-lg font-bold tracking-tight text-[var(--heading)]"
        >
          {selectedDestination
            ? `Plans for ${selectedDestination.name}`
            : "Plans"}
        </h2>
        {!selectedCode ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Select a destination to view MAP retail plans.
          </p>
        ) : offersLoading ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]" role="status">
            Loading plans…
          </p>
        ) : offersError ? (
          <p className="mt-3 text-sm text-[var(--heading)]" role="alert">
            {offersError}
          </p>
        ) : offers.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            No plans are available for this destination right now.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {offers.map((offer) => (
              <li
                key={offer.offerId}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-semibold text-[var(--heading)]">
                      {offer.name}
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {offer.dataLabel}
                      <span className="mx-1.5 text-[var(--text-soft)]">·</span>
                      {offer.validityLabel}
                    </p>
                    <p className="text-lg font-bold tabular-nums text-[var(--heading)]">
                      {offer.retailPriceLabel}
                    </p>
                  </div>
                  <form action={buyAction} className="shrink-0">
                    <input type="hidden" name="offerId" value={offer.offerId} />
                    <input
                      type="hidden"
                      name="destinationCode"
                      value={selectedCode}
                    />
                    <input
                      type="hidden"
                      name="idempotencyKey"
                      value={
                        idempotencyByOffer[offer.offerId] || newIdempotencyKey()
                      }
                    />
                    <button
                      type="submit"
                      disabled={buyPending}
                      className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-[var(--accent-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {buyPending ? "Purchasing…" : "Buy"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
