"use client";

import { useEffect, useState } from "react";
import {
  generateSandboxTestKey,
  SANDBOX_CATALOG,
  SANDBOX_DEFAULT_BALANCE_CENTS,
} from "@/app/lib/sandbox/sandboxShared";
import {
  SANDBOX_API_KEY_KEY,
  SANDBOX_ORDERS_KEY,
  SANDBOX_TX_KEY,
  SANDBOX_WALLET_KEY,
  type SandboxStoredOrder,
  type SandboxWalletTx,
} from "@/app/lib/sandbox/sandboxClientStorage";
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

/** Map a listed retail plan onto the closest sandbox catalog SKU for issuance. */
function pickSandboxSku(priceCents: number): string {
  const sorted = [...SANDBOX_CATALOG].sort(
    (a, b) =>
      Math.abs(a.priceCents - priceCents) - Math.abs(b.priceCents - priceCents)
  );
  return sorted[0]?.id ?? SANDBOX_CATALOG[0]!.id;
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
  const [apiKey, setApiKey] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const bal = localStorage.getItem(SANDBOX_WALLET_KEY);
      setBalanceCents(
        bal != null && Number.isFinite(Number(bal))
          ? Number(bal)
          : SANDBOX_DEFAULT_BALANCE_CENTS
      );
      let key = localStorage.getItem(SANDBOX_API_KEY_KEY);
      if (!key?.startsWith("sb_test_")) {
        key = generateSandboxTestKey();
        localStorage.setItem(SANDBOX_API_KEY_KEY, key);
      }
      setApiKey(key);
    } catch {
      setApiKey(generateSandboxTestKey());
    }
  }, []);

  async function buy(row: OfferRow) {
    setError(null);
    setMessage(null);
    const charge =
      row.priceCents > 0 ? row.priceCents : SANDBOX_CATALOG[0]!.priceCents;
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
          Authorization: `Bearer ${apiKey}`,
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
      const total = charge;
      const nextBal = balanceCents - total;
      const order: SandboxStoredOrder = {
        orderId: data.order.orderId,
        planName: `${destinationName} · ${row.name}`,
        region,
        totalCents: total,
        iccid: data.order.iccid,
        activationCode: data.order.activationCode,
        createdAt: data.order.createdAt,
        status: "COMPLETED",
      };
      const tx: SandboxWalletTx = {
        id: `tx_${order.orderId}`,
        label: `Purchase · ${order.planName}`,
        amountCents: -total,
        createdAt: order.createdAt,
        kind: "debit",
      };
      setBalanceCents(nextBal);
      try {
        localStorage.setItem(SANDBOX_WALLET_KEY, String(nextBal));
        const prev = JSON.parse(
          localStorage.getItem(SANDBOX_ORDERS_KEY) || "[]"
        ) as SandboxStoredOrder[];
        localStorage.setItem(
          SANDBOX_ORDERS_KEY,
          JSON.stringify([order, ...(Array.isArray(prev) ? prev : [])].slice(0, 40))
        );
        const txs = JSON.parse(
          localStorage.getItem(SANDBOX_TX_KEY) || "[]"
        ) as SandboxWalletTx[];
        localStorage.setItem(
          SANDBOX_TX_KEY,
          JSON.stringify([tx, ...(Array.isArray(txs) ? txs : [])].slice(0, 50))
        );
      } catch {
        /* ignore */
      }
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
