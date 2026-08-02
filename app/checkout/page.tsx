"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";

type VerifiedOffer = {
  offerId: string;
  name: string;
  countryCode: string | null;
  countryName: string | null;
  dataFormatted: string;
  durationDays: number | null;
  priceUSD: number;
  currency: string;
};

type CheckoutResponse = {
  success?: boolean;
  orderId?: string;
  error?: string;
  message?: string;
  replayed?: boolean;
};

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { formatPrice } = useCurrency();

  const offerId =
    searchParams.get("offerId")?.trim() ||
    searchParams.get("offer")?.trim() ||
    "";
  const countryHint = searchParams.get("country")?.trim() || "";

  const [offer, setOffer] = useState<VerifiedOffer | null>(null);
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState("");
  const idempotencyKeyRef = useRef<string>("");
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOffer() {
      setLoading(true);
      setMessage("");
      setUnavailable(false);
      setOffer(null);

      if (!offerId) {
        if (!cancelled) {
          setUnavailable(true);
          setMessage("Offer ID is missing");
          setLoading(false);
        }
        return;
      }

      try {
        const params = new URLSearchParams({ offerId });
        if (countryHint) {
          params.set("country", countryHint);
        }

        const response = await fetch(`/api/vesim/offer?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok || !data?.success || !data?.offer) {
          if (!cancelled) {
            setUnavailable(true);
            setMessage(data?.error || "Plan unavailable");
          }
          return;
        }

        if (!cancelled) {
          setOffer(data.offer as VerifiedOffer);
        }
      } catch {
        if (!cancelled) {
          setUnavailable(true);
          setMessage("Unable to verify this plan");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOffer();
    return () => {
      cancelled = true;
    };
  }, [offerId, countryHint]);

  async function pay() {
    if (!offer || payLoading || submitLockRef.current) {
      return;
    }

    const cleanEmail = customerEmail.trim();

    if (!cleanEmail) {
      setMessage("Please enter your email address");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setMessage("Please enter a valid email address");
      return;
    }

    setMessage("");
    setPayLoading(true);
    submitLockRef.current = true;

    try {
      const response = await fetch("/api/vesim/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerId: offer.offerId,
          customerEmail: cleanEmail,
          country: offer.countryCode || countryHint || undefined,
          idempotencyKey: idempotencyKeyRef.current,
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
      // Allow retry with a fresh idempotency key after a failed attempt.
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } catch {
      setMessage("Unable to process the order");
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } finally {
      setPayLoading(false);
      submitLockRef.current = false;
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
        <p className="text-xl">Loading checkout...</p>
      </main>
    );
  }

  if (unavailable || !offer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--page-bg)] px-6 text-[var(--heading)]">
        <h1 className="text-4xl font-bold">Plan unavailable</h1>
        <p className="mt-3 max-w-md text-center text-[var(--text-muted)]">
          {message && message !== "Plan unavailable"
            ? message
            : "This eSIM plan could not be verified. Please choose another plan."}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-6 py-16 text-[var(--heading)]">
      <div className="mx-auto max-w-xl rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-8">
        <h1 className="text-center text-4xl font-bold">Checkout</h1>
        <p className="mt-3 text-center text-[var(--text-muted)]">
          Review your eSIM plan
        </p>

        <div className="mt-8 space-y-4 rounded-2xl bg-[var(--page-bg)] p-6">
          <h2 className="text-2xl font-bold">
            {offer.countryName || offer.name || "eSIM"}
          </h2>

          <p>
            Plan: <b>{offer.name}</b>
          </p>

          <p>
            Data: <b>{offer.dataFormatted}</b>
          </p>

          <p>
            Validity:{" "}
            <b>
              {offer.durationDays != null ? `${offer.durationDays} Days` : "—"}
            </b>
          </p>

          <p className="text-3xl font-bold text-[var(--accent-strong)]">
            {formatPrice(offer.priceUSD)}
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
            disabled={payLoading}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 py-4 text-[var(--heading)] outline-none focus:border-[var(--accent-strong)] disabled:opacity-60"
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
          aria-busy={payLoading}
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
