"use client";

import { useActionState, useId, useState, useTransition } from "react";
import {
  loadAdminAssignmentOffersAction,
  prepareAdminPackageAssignmentAction,
} from "@/app/lib/esim/adminPackageAssignmentActions";
import {
  initialAdminPackageAssignmentState,
  type AdminPackageAssignmentActionState,
} from "@/app/lib/esim/adminPackageAssignmentFormState";
import type {
  AdminDestinationOption,
  AdminOfferOption,
} from "@/app/lib/esim/adminPackageAssignmentRead";

type Props = {
  customerUserId: string;
  customerName: string;
  customerEmailMasked: string;
  destinations: AdminDestinationOption[];
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `adminassign${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export default function AdminPackageAssignSelectForm({
  customerUserId,
  customerName,
  customerEmailMasked,
  destinations,
}: Props) {
  const [state, formAction, pending] = useActionState(
    prepareAdminPackageAssignmentAction,
    initialAdminPackageAssignmentState
  );
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [destinationCode, setDestinationCode] = useState("");
  const [offers, setOffers] = useState<AdminOfferOption[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [offersError, setOffersError] = useState<string | null>(null);
  const [loadingOffers, startOffersTransition] = useTransition();
  const reasonId = useId();

  const errorState = state as AdminPackageAssignmentActionState;

  function onDestinationChange(code: string) {
    setDestinationCode(code);
    setSelectedOfferId("");
    setOffers([]);
    setOffersError(null);
    if (!code) return;

    startOffersTransition(async () => {
      try {
        const next = await loadAdminAssignmentOffersAction(code);
        setOffers(next);
        if (next.length === 0) {
          setOffersError("No available packages for this destination.");
        }
      } catch {
        setOffers([]);
        setOffersError("Unable to load packages right now. Please try again.");
      }
    });
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="customerUserId" value={customerUserId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="destinationCode" value={destinationCode} />
      <input type="hidden" name="offerId" value={selectedOfferId} />

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
          Customer
        </p>
        <dl className="mt-3 space-y-2">
          <div>
            <dt className="text-[var(--text-soft)]">Name</dt>
            <dd className="font-semibold text-[var(--heading)] break-words">
              {customerName}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-soft)]">Email</dt>
            <dd className="font-semibold text-[var(--heading)] break-words">
              {customerEmailMasked}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-soft)]">Funding mode</dt>
            <dd className="font-semibold text-[var(--heading)]">
              Company-funded
            </dd>
          </div>
        </dl>
      </div>

      {errorState.ok === false && errorState.error ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="alert"
        >
          {errorState.error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label
          htmlFor="destination"
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Destination
        </label>
        <select
          id="destination"
          value={destinationCode}
          onChange={(e) => onDestinationChange(e.target.value)}
          disabled={pending || loadingOffers}
          className="w-full rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--heading)]"
        >
          <option value="">Select destination</option>
          {destinations.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>
        {errorState.ok === false && errorState.fieldErrors?.destination ? (
          <p className="text-xs text-[var(--text-muted)]">
            {errorState.fieldErrors.destination}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-[var(--heading)]">Package</p>
        {loadingOffers ? (
          <p className="text-sm text-[var(--text-muted)]">Loading packages…</p>
        ) : offersError ? (
          <p className="text-sm text-[var(--text-muted)]">{offersError}</p>
        ) : offers.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Select a destination to view available packages.
          </p>
        ) : (
          <ul className="space-y-2">
            {offers.map((offer) => {
              const selected = selectedOfferId === offer.offerId;
              return (
                <li key={offer.offerId}>
                  <button
                    type="button"
                    onClick={() => setSelectedOfferId(offer.offerId)}
                    disabled={pending}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
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
                    <p className="mt-1 text-[var(--text-muted)]">
                      {offer.destinationLabel} · Provider cost{" "}
                      {offer.providerCostLabel}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-soft)] break-all">
                      Offer ID {offer.offerId}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {errorState.ok === false && errorState.fieldErrors?.offerId ? (
          <p className="text-xs text-[var(--text-muted)]">
            {errorState.fieldErrors.offerId}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor={reasonId}
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Internal reason
        </label>
        <textarea
          id={reasonId}
          name="reason"
          required
          rows={3}
          maxLength={200}
          placeholder="Why this company-funded package is being assigned"
          disabled={pending}
          className="w-full rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--heading)]"
        />
        {errorState.ok === false && errorState.fieldErrors?.reason ? (
          <p className="text-xs text-[var(--text-muted)]">
            {errorState.fieldErrors.reason}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="internalReference"
          className="block text-sm font-semibold text-[var(--heading)]"
        >
          Internal reference (optional)
        </label>
        <input
          id="internalReference"
          name="internalReference"
          type="text"
          maxLength={100}
          disabled={pending}
          className="w-full rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--heading)]"
        />
      </div>

      <button
        type="submit"
        disabled={pending || !selectedOfferId || !destinationCode}
        className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Preparing review…" : "Continue to review"}
      </button>
    </form>
  );
}
