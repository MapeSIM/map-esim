"use client";

/**
 * Legacy destination buy grid — unused by current /sandbox/catalog/[slug]
 * (PlansListing + /sandbox/buy). Kept safe: never invents API keys or local
 * wallet credits/debits; refreshes Neon balance after POST orders only.
 */

import { useEffect, useState } from "react";
import { SANDBOX_DEFAULT_BALANCE_CENTS } from "@/app/lib/sandbox/sandboxShared";
import {
  pickSandboxSku,
  readSandboxApiKey,
  refreshSandboxWalletCache,
  rememberSandboxOrder,
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
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
    const key = readSandboxApiKey();
    if (!key) {
      setError("Sandbox session API key missing.");
      return;
    }
    const charge = row.priceCents > 0 ? row.priceCents : 450;
    if (balanceCents < charge) {
      setError("Insufficient wallet balance. Add funds on Wallet.");
      return;
    }
    setBusyId(row.offerId);
    try {
      const sku = pickSandboxSku(charge);
      const res = await fetch("/api/sandbox/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ offerId: sku, quantity: 1 }),
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
        setError(data.message || "Purchase failed.");
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

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold tabular-nums text-emerald-300">
        Wallet {formatUsd(balanceCents)}
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
          {offers.map((row) => (
            <li key={row.offerId} className={partnerCardClass}>
              <p className="font-semibold text-slate-50">{row.name}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-emerald-300">
                {row.priceLabel}
              </p>
              <button
                type="button"
                disabled={busyId === row.offerId}
                onClick={() => void buy(row)}
                className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {busyId === row.offerId ? "Processing…" : "Buy with wallet"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
