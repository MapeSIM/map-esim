"use client";

/**
 * Legacy destination buy grid — unused by current /sandbox/catalog/[slug]
 * (PlansListing + /sandbox/buy). Kept safe: never invents API keys or local
 * wallet credits/debits; refreshes Neon balance after POST orders only.
 */

import { useEffect, useState } from "react";
import { SANDBOX_DEFAULT_BALANCE_CENTS } from "@/app/lib/sandbox/sandboxShared";
import {
  SANDBOX_DEFAULT_DISCOUNT_PERCENT,
  sandboxDiscountLabel,
  sandboxPartnerPriceCents,
} from "@/app/lib/sandbox/sandboxPricing";
import {
  cacheSandboxApiKeyIfPresent,
  refreshSandboxWalletCache,
  rememberSandboxOrder,
  sandboxAuthHeaders,
} from "@/app/lib/sandbox/sandboxPurchaseClient";
import type { SandboxStoredOrder } from "@/app/lib/sandbox/sandboxClientStorage";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";

type OfferRow = {
  offerId: string;
  name: string;
  priceLabel: string;
  priceCents: number;
};

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function SandboxDestinationBuyClient({
  destinationName,
  region,
  offers,
}: {
  destinationName: string;
  region: string;
  offers: OfferRow[];
}) {
  const [balanceCents, setBalanceCents] = useState(SANDBOX_DEFAULT_BALANCE_CENTS);
  const [discountPercent, setDiscountPercent] = useState(
    SANDBOX_DEFAULT_DISCOUNT_PERCENT
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          apiKey?: string | null;
          discountPercent?: number;
          partner?: { discountPercent?: number };
        };
        if (!cancelled && data.ok) {
          cacheSandboxApiKeyIfPresent(data.apiKey);
          setDiscountPercent(
            data.discountPercent ??
              data.partner?.discountPercent ??
              SANDBOX_DEFAULT_DISCOUNT_PERCENT
          );
        }
      } catch {
        /* ignore */
      }
      const cents = await refreshSandboxWalletCache();
      if (!cancelled && typeof cents === "number") setBalanceCents(cents);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function buy(row: OfferRow) {
    setError(null);
    setMessage(null);
    const retailCents = row.priceCents > 0 ? row.priceCents : 519;
    const charge =
      sandboxPartnerPriceCents(retailCents, discountPercent) ??
      Math.round(retailCents * 0.97);
    if (balanceCents < charge) {
      setError("Insufficient wallet balance. Add funds on Wallet.");
      return;
    }
    setBusyId(row.offerId);
    try {
      const res = await fetch("/api/sandbox/v1/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          ...sandboxAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerId: row.offerId,
          quantity: 1,
          retailPriceCents: retailCents,
          planName: row.name,
          region,
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
        };
      };
      if (!res.ok || !data.order) {
        setError(
          data.message ||
            (res.status === 401
              ? "Sign in to the sandbox portal and try again."
              : "Purchase failed.")
        );
        return;
      }
      const order: SandboxStoredOrder = {
        orderId: data.order.orderId,
        planName: `${destinationName} · ${row.name}`,
        region,
        totalCents: data.order.totalCents ?? charge,
        iccid: data.order.iccid,
        activationCode: data.order.activationCode,
        createdAt: data.order.createdAt,
        status: "COMPLETED",
      };
      rememberSandboxOrder(order);
      const nextBal = await refreshSandboxWalletCache();
      if (typeof nextBal === "number") setBalanceCents(nextBal);
      setMessage(`Order ${order.orderId} completed · ICCID ${order.iccid}`);
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  const discountLabel = sandboxDiscountLabel(discountPercent);

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold tabular-nums text-emerald-300">
        Wallet {formatUsd(balanceCents)} · {discountLabel}
      </p>
      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {message}
        </p>
      ) : null}
      {offers.length === 0 ? (
        <div className={partnerCardClass}>
          <p className="text-sm text-slate-400">
            No plans available for this destination right now.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {offers.map((row) => {
            const retailCents = row.priceCents > 0 ? row.priceCents : 519;
            const partnerCents =
              sandboxPartnerPriceCents(retailCents, discountPercent) ??
              Math.round(retailCents * 0.97);
            return (
              <li key={row.offerId} className={partnerCardClass}>
                <p className="font-semibold text-slate-50">{row.name}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-emerald-300">
                  {formatUsd(partnerCents)}
                  <span className="ml-2 text-xs font-semibold text-emerald-400/80">
                    {discountLabel}
                  </span>
                </p>
                <p className="text-xs text-slate-500 line-through">
                  Retail {row.priceLabel || formatUsd(retailCents)}
                </p>
                <button
                  type="button"
                  disabled={busyId === row.offerId}
                  onClick={() => void buy(row)}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {busyId === row.offerId
                    ? "Processing…"
                    : `Buy · ${formatUsd(partnerCents)}`}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
