"use client";

import Image from "next/image";
import { useActionState, useId, useMemo, useState, useTransition } from "react";
import { Earth, Globe2, MapPinned, Search } from "lucide-react";
import {
  loadCustomerWalletPurchaseOffersAction,
  prepareWalletEsimPurchaseAction,
} from "@/app/lib/esim/walletPurchaseActions";
import {
  initialWalletPurchaseState,
  type WalletPurchaseActionState,
} from "@/app/lib/esim/walletPurchaseFormState";
import type {
  AdminDestinationOption,
  AdminOfferOption,
} from "@/app/lib/esim/adminPackageAssignmentRead";
import { filterPlansDiscoveryDestinations } from "@/app/lib/plans/plansDiscovery";
import {
  resolveDestinationFlagVisual,
  type DestinationPresentationInput,
} from "@/app/lib/vesim/destinationPresentation";
import type { VesimDestination } from "@/app/lib/vesim/destinations";

type Props = {
  destinations: AdminDestinationOption[];
  balanceLabel: string;
  accountRestricted?: boolean;
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `walletbuy${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

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

function DestinationCardButton({
  destination,
  selected,
  disabled,
  onSelect,
}: {
  destination: AdminDestinationOption;
  selected: boolean;
  disabled: boolean;
  onSelect: (code: string) => void;
}) {
  const kind =
    destination.kind === "regional" ||
    destination.kind === "global" ||
    destination.kind === "country"
      ? destination.kind
      : "country";

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={destination.name}
      disabled={disabled}
      onClick={() => onSelect(destination.code)}
      className={`
        group flex min-h-[76px] w-full min-w-0 items-center gap-3
        rounded-2xl border px-3 py-3 text-left transition
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2
        focus-visible:ring-offset-[var(--page-bg)]
        disabled:opacity-60
        ${
          selected
            ? "border-[var(--accent-strong)] bg-[var(--surface)] shadow-[0_0_0_1px_var(--accent-strong)]"
            : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-hover)] hover:bg-[var(--surface)]"
        }
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
      {!selected && kind === "country" ? (
        <Globe2
          className="hidden h-3.5 w-3.5 shrink-0 text-[var(--text-soft)] sm:block"
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}

export default function WalletPurchaseSelectForm({
  destinations,
  balanceLabel,
  accountRestricted = false,
}: Props) {
  const searchFieldId = useId();
  const destinationsLabelId = useId();
  const [state, formAction, pending] = useActionState(
    prepareWalletEsimPurchaseAction,
    initialWalletPurchaseState
  );
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [search, setSearch] = useState("");
  const [destinationCode, setDestinationCode] = useState("");
  /** When false with a selection, discovery grid is collapsed so plans stay visible. */
  const [destinationPickerOpen, setDestinationPickerOpen] = useState(true);
  const [offers, setOffers] = useState<AdminOfferOption[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [offersError, setOffersError] = useState<string | null>(null);
  const [loadingOffers, startOffersTransition] = useTransition();
  const errorState = state as WalletPurchaseActionState;

  const selectedDestination = useMemo(
    () => destinations.find((d) => d.code === destinationCode) ?? null,
    [destinations, destinationCode]
  );

  const showDestinationPicker =
    destinationPickerOpen || !selectedDestination;

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

  function onDestinationSelect(code: string) {
    setDestinationCode(code);
    setDestinationPickerOpen(false);
    setSelectedOfferId("");
    setOffers([]);
    setOffersError(null);
    if (!code) return;

    startOffersTransition(async () => {
      try {
        const next = await loadCustomerWalletPurchaseOffersAction(code);
        setOffers(next);
        if (next.length === 0) {
          setOffersError(
            "No plans are currently available for this destination."
          );
        }
      } catch {
        setOffers([]);
        setOffersError("Unable to load packages right now. Please try again.");
      }
    });
  }

  function onChangeDestination() {
    setDestinationPickerOpen(true);
  }

  const canContinue =
    !accountRestricted &&
    !pending &&
    Boolean(selectedOfferId) &&
    Boolean(destinationCode);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="destinationCode" value={destinationCode} />
      <input type="hidden" name="offerId" value={selectedOfferId} />

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
          Wallet
        </p>
        <p className="mt-2 font-semibold text-[var(--heading)]">
          Available balance {balanceLabel} USD
        </p>
        <p className="mt-1 text-[var(--text-muted)]">
          Wallet funding is optional at checkout.
        </p>
      </div>

      {errorState.ok === false && errorState.error ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="alert"
        >
          {errorState.error}
        </div>
      ) : null}

      {showDestinationPicker ? (
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
                    role="group"
                    aria-label="Popular destinations"
                    className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4"
                  >
                    {popularDestinations.map((destination) => (
                      <DestinationCardButton
                        key={`popular-${destination.code}`}
                        destination={destination}
                        selected={destinationCode === destination.code}
                        disabled={pending || loadingOffers}
                        onSelect={onDestinationSelect}
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
                <div
                  role="group"
                  aria-label="All destinations"
                  className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4"
                >
                  {allDestinations.map((destination) => (
                    <DestinationCardButton
                      key={`all-${destination.code}`}
                      destination={destination}
                      selected={destinationCode === destination.code}
                      disabled={pending || loadingOffers}
                      onSelect={onDestinationSelect}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      ) : selectedDestination ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--heading)]">
            Selected destination
          </h2>
          <div
            className="
              flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--accent-strong)]
              bg-[var(--surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between
            "
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
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
              <p className="min-w-0 truncate text-sm font-semibold text-[var(--heading)]">
                {selectedDestination.name}
              </p>
            </div>
            <button
              type="button"
              onClick={onChangeDestination}
              className="
                inline-flex h-10 w-full shrink-0 items-center justify-center rounded-[12px]
                border border-[var(--border-strong)] bg-[var(--surface-2)] px-4
                text-sm font-semibold text-[var(--heading)] transition
                hover:bg-[var(--surface)]
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[var(--accent-strong)]
                sm:w-auto
              "
            >
              Change destination
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--heading)]">
          Available plans
        </h2>
        {loadingOffers ? (
          <p className="text-sm text-[var(--text-muted)]" role="status">
            Loading packages…
          </p>
        ) : offersError ? (
          <p className="text-sm text-[var(--text-muted)]" role="status">
            {offersError}
          </p>
        ) : offers.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Select a destination to view available packages.
          </p>
        ) : (
          <ul className="space-y-2" role="list">
            {offers.map((offer) => {
              const selected = selectedOfferId === offer.offerId;
              return (
                <li key={offer.offerId}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedOfferId(offer.offerId)}
                    disabled={pending || accountRestricted}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] ${
                      selected
                        ? "border-[var(--accent-strong)] bg-[var(--surface)]"
                        : "border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface)]"
                    }`}
                  >
                    <p className="font-semibold text-[var(--heading)]">
                      {offer.name}
                    </p>
                    <p className="mt-1 text-[var(--text-muted)]">
                      {offer.dataLabel} · {offer.validityLabel}
                    </p>
                    <p className="mt-1 font-semibold text-[var(--accent-soft)]">
                      {offer.costLabel}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {accountRestricted ? (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          Checkout is unavailable while your account is restricted.
        </p>
      ) : (
        <button
          type="submit"
          disabled={!canContinue}
          className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
        >
          {pending ? "Preparing checkout…" : "Continue to checkout"}
        </button>
      )}
    </form>
  );
}
