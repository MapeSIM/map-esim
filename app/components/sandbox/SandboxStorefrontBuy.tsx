"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SANDBOX_CATALOG } from "@/app/lib/sandbox/sandboxShared";
import {
  pickSandboxSku,
  readSandboxApiKey,
  refreshSandboxWalletCache,
  rememberSandboxOrder,
} from "@/app/lib/sandbox/sandboxPurchaseClient";
import type { SandboxStoredOrder } from "@/app/lib/sandbox/sandboxClientStorage";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";

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

export default function SandboxStorefrontBuy({
  offerId,
  country,
  planName,
  priceUsd,
}: Props) {
  const router = useRouter();
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneOrderId, setDoneOrderId] = useState<string | null>(null);

  const priceCents = useMemo(() => {
    if (typeof priceUsd === "number" && Number.isFinite(priceUsd) && priceUsd > 0) {
      return Math.round(priceUsd * 100);
    }
    return SANDBOX_CATALOG[0]!.priceCents;
  }, [priceUsd]);

  const sku = useMemo(() => pickSandboxSku(priceCents), [priceCents]);
  const catalogItem = SANDBOX_CATALOG.find((item) => item.id === sku);
  const chargeCents = catalogItem?.priceCents ?? priceCents;
  const displayName =
    planName.trim() || catalogItem?.name || "Sandbox eSIM plan";
  const destinationLabel = country.trim() || catalogItem?.region || "Destination";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const cents = await refreshSandboxWalletCache();
      if (!cancelled) setBalanceCents(cents);
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
        "Sandbox session API key missing. Sign in again from the sandbox admin invite or home gate."
      );
      return;
    }
    if (balanceCents != null && balanceCents < chargeCents) {
      setError("Insufficient sandbox wallet balance. Add funds on Wallet first.");
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
          region?: string;
        };
      };
      if (!res.ok || !data.order) {
        setError(data.message || "Purchase failed.");
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
      // Always re-sync Neon balance after debit — never invent a local credit/debit.
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
      <div className={partnerCardClass + " space-y-4"}>
        <h1 className="text-xl font-bold text-slate-50">Purchase complete</h1>
        <p className="text-sm text-slate-400">
          Your sandbox eSIM is ready. Open the order for QR, LPA, and share.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/sandbox/orders/${encodeURIComponent(doneOrderId)}`}
            className="inline-flex h-11 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950"
          >
            View order
          </Link>
          <Link
            href="/sandbox/orders"
            className="inline-flex h-11 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100"
          >
            My eSIMs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link
          href="/sandbox/catalog"
          className="text-sm font-semibold text-emerald-400 hover:text-emerald-300"
        >
          ← Back to catalog
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-50">Confirm purchase</h1>
        <p className="mt-1 text-sm text-slate-400">
          Charged to your sandbox wallet. This is demo data only.
        </p>
      </div>

      <div className={partnerCardClass + " space-y-3"}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            Destination
          </p>
          <p className="mt-1 text-base font-semibold text-slate-50">
            {destinationLabel}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            Plan
          </p>
          <p className="mt-1 text-base font-semibold text-slate-50">{displayName}</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-white/[0.06] pt-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Charge
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-300">
              {formatUsd(chargeCents)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Wallet
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-slate-200">
              {balanceCents == null ? "…" : formatUsd(balanceCents)}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void confirmPurchase()}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {busy ? "Processing…" : `Confirm · Pay ${formatUsd(chargeCents)}`}
      </button>
      <p className="text-center text-xs text-slate-500">
        Offer ref {offerId.slice(0, 12)}
        {offerId.length > 12 ? "…" : ""} · SKU {sku}
      </p>
    </div>
  );
}
