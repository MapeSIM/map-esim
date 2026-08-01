"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Smartphone } from "lucide-react";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";

type OrderDetails = {
  orderId?: string;
  offerId?: string;
  offerName?: string;
  name?: string;
  countryName?: string;
  dataFormatted?: string;
  data?: string | number;
  durationDays?: number;
  priceUSD?: number;
  price?: number;
  amount?: number;
  status?: string;
};

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId")?.trim() || "";
  const { formatPrice } = useCurrency();

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOrder() {
      if (!orderId) {
        setError("Order ID is missing");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/vesim/order-details?orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" }
        );
        const data = await response.json();

        if (!response.ok || data.success === false) {
          throw new Error(data.error || data.message || "Failed to load order");
        }

        const payload =
          (data.order as Record<string, unknown> | undefined) ||
          (data.data as Record<string, unknown> | undefined) ||
          (data as Record<string, unknown>);

        setOrder({
          orderId:
            (typeof payload.orderId === "string" && payload.orderId) ||
            (typeof payload.id === "string" && payload.id) ||
            orderId,
          offerId:
            typeof payload.offerId === "string" ? payload.offerId : undefined,
          offerName:
            typeof payload.offerName === "string"
              ? payload.offerName
              : typeof payload.name === "string"
                ? payload.name
                : undefined,
          name: typeof payload.name === "string" ? payload.name : undefined,
          countryName:
            typeof payload.countryName === "string"
              ? payload.countryName
              : undefined,
          dataFormatted:
            typeof payload.dataFormatted === "string"
              ? payload.dataFormatted
              : undefined,
          data:
            typeof payload.data === "string" || typeof payload.data === "number"
              ? payload.data
              : undefined,
          durationDays:
            firstNumber(payload.durationDays, payload.validity) ?? undefined,
          priceUSD:
            firstNumber(
              payload.priceUSD,
              payload.price,
              payload.amount,
              payload.total
            ) ?? undefined,
          status: typeof payload.status === "string" ? payload.status : undefined,
        });
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load order details"
        );
      } finally {
        setLoading(false);
      }
    }

    loadOrder();
  }, [orderId]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
        <p className="text-xl">Loading order...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-16 text-[var(--heading)] sm:px-6">
      <div className="mx-auto max-w-xl rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10">
          <CheckCircle2 className="h-8 w-8 text-[var(--accent-strong)]" />
        </div>

        <h1 className="mt-5 text-center text-3xl font-bold">
          {error ? "Order received" : "Purchase successful"}
        </h1>
        <p className="mt-3 text-center text-sm text-[var(--text-muted)]">
          {error
            ? "Your order was created. Full details could not be loaded right now."
            : "Your eSIM order has been created successfully."}
        </p>

        <div className="mt-8 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 text-sm">
          <p>
            Order ID:{" "}
            <b className="text-[var(--accent-strong)]">{order?.orderId || orderId || "—"}</b>
          </p>
          {(order?.offerName || order?.name) && (
            <p>
              Plan: <b>{order.offerName || order.name}</b>
            </p>
          )}
          {order?.countryName && (
            <p>
              Destination: <b>{order.countryName}</b>
            </p>
          )}
          {(order?.dataFormatted || order?.data) && (
            <p>
              Data: <b>{order.dataFormatted || order.data}</b>
            </p>
          )}
          {order?.durationDays != null && (
            <p>
              Validity: <b>{order.durationDays} Days</b>
            </p>
          )}
          {order?.priceUSD != null && (
            <p className="text-2xl font-bold text-[var(--accent-strong)]">
              {formatPrice(order.priceUSD)}
            </p>
          )}
          {order?.status && (
            <p>
              Status: <b>{order.status}</b>
            </p>
          )}
          {error && <p className="text-amber-200">{error}</p>}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text)]">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
          <p>
            Install your eSIM from the QR code or activation details associated
            with this order.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            href="/dashboard"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40"
          >
            View dashboard
          </Link>
          <Link
            href="/countries"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-strong)] text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
          >
            Browse more plans
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
          Loading...
        </main>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
