"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SANDBOX_CATALOG } from "@/app/lib/sandbox/sandboxShared";
import {
  SANDBOX_DEFAULT_DISCOUNT_PERCENT,
  sandboxDiscountLabel,
  sandboxPartnerPriceCents,
} from "@/app/lib/sandbox/sandboxPricing";
import {
  readSandboxApiKey,
  refreshSandboxWalletCache,
  rememberSandboxOrder,
} from "@/app/lib/sandbox/sandboxPurchaseClient";
import type { SandboxStoredOrder } from "@/app/lib/sandbox/sandboxClientStorage";
import BrandPendingLabel from "@/app/components/loading/BrandPendingLabel";

type Props = {
  offerId: string;
  country: string;
  planName: string;
  priceUsd: number | null;
};

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/**
 * Partner-styled confirm purchase for mapesim.store.
 * Completes a simulated sandbox order only (POST /api/sandbox/v1/orders).
 */
export default function SandboxStorefrontBuy({
  offerId,
  country,
  planName,
  priceUsd,
}: Props) {
  const router = useRouter();
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [discountPercent, setDiscountPercent] = useState(
    SANDBOX_DEFAULT_DISCOUNT_PERCENT
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneOrderId, setDoneOrderId] = useState<string | null>(null);

  const retailCents = useMemo(() => {
    if (typeof priceUsd === "number" && Number.isFinite(priceUsd) && priceUsd > 0) {
      return Math.round(priceUsd * 100);
    }
    const fixture = SANDBOX_CATALOG.find((item) => item.id === offerId);
    return fixture?.priceCents ?? SANDBOX_CATALOG[0]!.priceCents;
  }, [priceUsd, offerId]);

  const chargeCents = useMemo(() => {
    return (
      sandboxPartnerPriceCents(retailCents, discountPercent) ??
      Math.round(retailCents * 0.97)
    );
  }, [retailCents, discountPercent]);

  const fixture = SANDBOX_CATALOG.find((item) => item.id === offerId);
  const displayName =
    planName.trim() || fixture?.name || "Partner eSIM plan";
  const destinationLabel = country.trim() || fixture?.region || "Destination";
  const dataLabel = fixture ? `${fixture.dataGb} GB` : "Plan data";
  const validityLabel = fixture ? `${fixture.days} days` : "Plan validity";
  const retailLabel = formatUsd(retailCents);
  const partnerLabel = formatUsd(chargeCents);
  const discountLabel = sandboxDiscountLabel(discountPercent);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/sandbox/session", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          discountPercent?: number;
          partner?: { discountPercent?: number; balanceCents?: number };
        };
        if (!cancelled && data.ok) {
          const pct =
            data.discountPercent ??
            data.partner?.discountPercent ??
            SANDBOX_DEFAULT_DISCOUNT_PERCENT;
          setDiscountPercent(pct);
          if (typeof data.partner?.balanceCents === "number") {
            setBalanceCents(data.partner.balanceCents);
          }
        }
      } catch {
        /* ignore */
      }
      const cents = await refreshSandboxWalletCache();
      if (!cancelled && cents != null) setBalanceCents(cents);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmPurchase() {
    setError(null);
    const key = readSandboxApiKey();
    if (!key) {
      setError(
        "Sandbox session API key missing. Open the sandbox portal from your provisioned session and try again."
      );
      return;
    }
    if (balanceCents != null && balanceCents < chargeCents) {
      setError("Insufficient Partner balance. Add funds on Wallet first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/sandbox/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerId,
          quantity: 1,
          retailPriceCents: retailCents,
          planName: displayName,
          region: destinationLabel,
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        order?: {
          orderId: string;
          planName: string;
          totalCents: number;
          iccid: string;
          activationCode: string;
          createdAt: string;
          region?: string;
        };
      };
      if (!res.ok || !data.order) {
        setError(data.message || "Unable to purchase.");
        return;
      }

      const order: SandboxStoredOrder = {
        orderId: data.order.orderId,
        planName: `${destinationLabel} · ${displayName}`,
        region: data.order.region || destinationLabel,
        totalCents: data.order.totalCents ?? chargeCents,
        iccid: data.order.iccid,
        activationCode: data.order.activationCode,
        createdAt: data.order.createdAt,
        status: "COMPLETED",
      };
      rememberSandboxOrder(order);
      const nextBal = await refreshSandboxWalletCache();
      if (nextBal != null) setBalanceCents(nextBal);
      setDoneOrderId(order.orderId);
      router.prefetch(`/sandbox/orders/${encodeURIComponent(order.orderId)}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (doneOrderId) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
          <p className="text-sm font-semibold text-[var(--heading)]">
            Purchase complete
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Your simulated Partner eSIM is ready — open the order for QR, LPA,
            and share. Charged {partnerLabel} ({discountLabel}).
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/sandbox/orders/${encodeURIComponent(doneOrderId)}`}
              className="inline-flex h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950"
            >
              View eSIM
            </Link>
            <Link
              href="/sandbox/orders"
              className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)]"
            >
              Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]">
        <p>
          Purchases are charged from your MAP eSIM Partner balance (
          <span className="font-semibold tabular-nums">
            {balanceCents == null ? "…" : formatUsd(balanceCents)} USD
          </span>
          ).
        </p>
        <p className="mt-1 text-[var(--text-muted)]">
          This is a sandbox simulation on mapesim.store — the flow matches
          partneresim.com, but no real supplier or production order is created.
        </p>
      </div>

      {error ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-[var(--heading)]">
            Unable to purchase
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{error}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/sandbox/wallet"
              className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)]"
            >
              Wallet
            </Link>
            <Link
              href="/sandbox/catalog"
              className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)]"
            >
              Browse catalog again
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <p className="text-base font-semibold text-[var(--heading)]">
          {displayName}
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {destinationLabel} · {dataLabel} · {validityLabel}
        </p>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Retail price</dt>
            <dd className="font-semibold tabular-nums text-[var(--heading)]">
              {retailLabel}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Partner discount</dt>
            <dd className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">
              {discountLabel}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2">
            <dt className="font-semibold text-[var(--heading)]">
              You pay (Partner price)
            </dt>
            <dd className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-300">
              {partnerLabel}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmPurchase()}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? (
              <BrandPendingLabel label="Issuing eSIM…" />
            ) : (
              `Issue eSIM · ${partnerLabel}`
            )}
          </button>
          <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
            Offer {offerId.slice(0, 16)}
            {offerId.length > 16 ? "…" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
