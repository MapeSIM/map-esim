"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";

type Offer = {
  id?: string;
  offerId?: string;
  code?: string;
  offer?: string;
  name?: string;
  countryName?: string;
  dataFormatted?: string;
  data?: string | number;
  durationDays?: number;
  priceUSD?: number;
  price?: number;
};

type CheckoutResponse = {
  success?: boolean;
  orderId?: string;
  error?: string;
  message?: string;
};

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { formatPrice } = useCurrency();

  const offerId =
    searchParams.get("offerId") || searchParams.get("offer") || "";
  const countryParam = searchParams.get("country")?.trim() || "";
  const countryCode =
    countryParam.length === 2 ? countryParam.toUpperCase() : countryParam;

  const [offer, setOffer] = useState<Offer | null>(null);
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [debug, setDebug] = useState("");

  useEffect(() => {
    async function loadOffer() {
      try {
        if (!offerId) {
          setMessage("Offer ID is missing");
          return;
        }

        // Never trust URL price params — always resolve the real offer by ID.
        const offersUrl = countryCode
          ? `/api/vesim/offers?country=${encodeURIComponent(countryCode)}`
          : "/api/vesim/offers";

        const response = await fetch(offersUrl, {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load eSIM plans");
        }

        let offers: Offer[] = [];

        if (Array.isArray(data.offers)) {
          offers = data.offers;
        } else if (Array.isArray(data.data)) {
          offers = data.data;
        } else if (Array.isArray(data)) {
          offers = data;
        }

        const normalizedOfferId = String(offerId).trim().toUpperCase();

        const foundOffer = offers.find((item) => {
          const possibleIds = [
            item.id,
            item.offerId,
            item.code,
            item.offer,
            item.name,
          ];

          return possibleIds.some(
            (value) =>
              value &&
              String(value).trim().toUpperCase() === normalizedOfferId
          );
        });

        if (foundOffer) {
          setOffer(foundOffer);
        } else {
          setDebug(
            JSON.stringify(
              {
                searching: offerId,
                available: offers.map(
                  (item) =>
                    item.id || item.offerId || item.code || item.name
                ),
              },
              null,
              2
            )
          );
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to load offer";

        setMessage(errorMessage);
      } finally {
        setLoading(false);
      }
    }

    loadOffer();
  }, [offerId, countryCode]);

  async function pay() {
    if (!offer || payLoading) {
      return;
    }

    const cleanEmail = customerEmail.trim();

    if (!cleanEmail) {
      setMessage("Please enter your email address");
      return;
    }

    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);

    if (!emailIsValid) {
      setMessage("Please enter a valid email address");
      return;
    }

    const selectedOfferId = offer.id || offer.offerId;

    if (!selectedOfferId) {
      setMessage("Offer ID is unavailable");
      return;
    }

    setMessage("");
    setPayLoading(true);

    try {
      const response = await fetch("/api/vesim/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerId: selectedOfferId,
          customerEmail: cleanEmail,
        }),
      });

      const data: CheckoutResponse = await response.json();

      if (response.ok && data.success && data.orderId) {
        router.push(
          `/success?orderId=${encodeURIComponent(data.orderId)}`
        );
        return;
      }

      setMessage(data.error || data.message || "eSIM purchase failed");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to process the order";

      setMessage(errorMessage);
    } finally {
      setPayLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
        <p className="text-xl">Loading checkout...</p>
      </main>
    );
  }

  if (!offer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--page-bg)] px-6 text-[var(--heading)]">
        <h1 className="text-4xl font-bold">Offer not found</h1>
        <p className="mt-3 text-[var(--text-muted)]">ID: {offerId || "Missing"}</p>
        {message && <p className="mt-5 text-[var(--danger-text)]">{message}</p>}
        {debug && (
          <pre className="mt-5 max-w-xl overflow-auto rounded-xl bg-[var(--surface-2)] p-5 text-xs">
            {debug}
          </pre>
        )}
      </main>
    );
  }

  const offerPriceUsd = offer.priceUSD ?? offer.price ?? null;

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-6 py-16 text-[var(--heading)]">
      <div className="mx-auto max-w-xl rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-8">
        <h1 className="text-center text-4xl font-bold">Checkout</h1>
        <p className="mt-3 text-center text-[var(--text-muted)]">Review your eSIM plan</p>

        <div className="mt-8 space-y-4 rounded-2xl bg-[var(--page-bg)] p-6">
          <h2 className="text-2xl font-bold">
            {offer.countryName || offer.name || "eSIM"}
          </h2>

          <p>
            Plan: <b>{offer.name || "eSIM Plan"}</b>
          </p>

          <p>
            Data: <b>{offer.dataFormatted || offer.data || "eSIM"}</b>
          </p>

          <p>
            Validity: <b>{offer.durationDays || "-"} Days</b>
          </p>

          <p className="text-3xl font-bold text-[var(--accent-strong)]">
            {formatPrice(offerPriceUsd)}
          </p>
        </div>

        <div className="mt-7">
          <label htmlFor="customerEmail" className="mb-2 block font-semibold">
            Customer email
          </label>

          <input
            id="customerEmail"
            type="email"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            placeholder="customer@example.com"
            autoComplete="email"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 py-4 text-[var(--heading)] outline-none focus:border-[var(--accent-strong)]"
          />

          <p className="mt-2 text-sm text-[var(--text-muted)]">
            eSIM order details will be associated with this email.
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--warning-text)]">
          Testing mode: clicking the button creates a real VeSIM staging order
          and deducts wallet credit.
        </div>

        <button
          type="button"
          onClick={pay}
          disabled={payLoading}
          className="mt-8 w-full rounded-xl bg-[var(--accent-strong)] py-4 font-bold text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:bg-[var(--accent)]"
        >
          {payLoading ? "Creating eSIM..." : "Purchase eSIM"}
        </button>

        {message && (
          <div className="mt-6 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-[var(--danger-text)]">
            {message}
          </div>
        )}
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
          Loading...
        </main>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
