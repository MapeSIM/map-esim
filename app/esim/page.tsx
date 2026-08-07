"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";
import { buildCheckoutHref } from "@/app/lib/plans/plan-utils";
import type { VesimOffer } from "@/app/lib/vesim/offers";

export default function EsimPage() {
  const [offers, setOffers] = useState<VesimOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { formatPrice } = useCurrency();

  useEffect(() => {
    async function getOffers() {
      try {
        const response = await fetch("/api/vesim/offers?country=US", {
          cache: "no-store",
        });
        const data = await response.json();
        const list = Array.isArray(data.offers)
          ? data.offers
          : Array.isArray(data.data)
            ? data.data
            : [];
        setOffers(list);
      } catch {
        setError("Failed to load eSIM plans");
      } finally {
        setLoading(false);
      }
    }

    getOffers();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-xl text-[var(--heading)]">
        Loading eSIM Plans...
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
        <h1 className="text-2xl font-bold">{error}</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-6 py-16 text-[var(--heading)]">
      <h1 className="mb-12 text-center text-4xl font-bold">
        Choose Your eSIM Plan
      </h1>

      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
        {offers.map((offer) => (
          <div
            key={offer.id}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]"
          >
            <h2 className="text-xl font-bold">{offer.name}</h2>

            <p className="mt-4 text-[var(--text)]">
              Data: <b className="text-[var(--heading)]">{offer.dataFormatted}</b>
            </p>

            <p className="text-[var(--text)]">
              Validity:{" "}
              <b className="text-[var(--heading)]">{offer.durationDays} Days</b>
            </p>

            <p className="mt-5 text-3xl font-bold text-[var(--accent-soft)]">
              {formatPrice(offer.priceUSD)}
            </p>

            <Link
              href={buildCheckoutHref(offer, "US")}
              className="
                mt-6 block rounded-xl bg-[var(--accent)] py-3
                text-center font-bold text-[var(--accent-ink)]
              "
            >
              Buy with wallet →
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
