"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CopyInstallField from "@/app/components/install/CopyInstallField";
import {
  findCachedSandboxOrder,
  readSandboxApiKey,
} from "@/app/lib/sandbox/sandboxPurchaseClient";
import type { SandboxStoredOrder } from "@/app/lib/sandbox/sandboxClientStorage";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function parseLpaParts(activationCode: string): {
  smdp: string;
  matchingId: string;
} {
  const parts = activationCode.split("$");
  if (parts.length >= 3 && parts[0]?.startsWith("LPA:")) {
    return { smdp: parts[1] || "—", matchingId: parts[2] || "—" };
  }
  return { smdp: "—", matchingId: activationCode || "—" };
}

export default function SandboxOrderDetailClient({
  orderId,
}: {
  orderId: string;
}) {
  const [order, setOrder] = useState<SandboxStoredOrder | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let found = findCachedSandboxOrder(orderId);
      try {
        const key = readSandboxApiKey();
        if (key) {
          const res = await fetch("/api/sandbox/v1/orders", {
            headers: { Authorization: `Bearer ${key}` },
            cache: "no-store",
          });
          if (res.ok) {
            const data = (await res.json()) as {
              orders?: Array<{
                orderId: string;
                planName: string;
                region: string;
                totalCents: number;
                iccid?: string;
                activationCode?: string;
                createdAt: string;
              }>;
            };
            const match = (data.orders ?? []).find((o) => o.orderId === orderId);
            if (match) {
              found = {
                orderId: match.orderId,
                planName: match.planName,
                region: match.region,
                totalCents: match.totalCents,
                iccid: match.iccid ?? "",
                activationCode: match.activationCode ?? "",
                createdAt: match.createdAt,
                status: "COMPLETED",
              };
            }
          }
        }
      } catch {
        /* use cache */
      }
      if (!cancelled) {
        setOrder(found);
        setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    if (!order?.activationCode) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    async function renderQr() {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(order!.activationCode, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 280,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    }
    void renderQr();
    return () => {
      cancelled = true;
    };
  }, [order]);

  if (!ready) {
    return (
      <div className={partnerCardClass}>
        <p className="text-sm text-slate-400">Loading order…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className={partnerCardClass + " space-y-3"}>
        <p className="text-sm text-slate-300">Order not found.</p>
        <Link
          href="/sandbox/orders"
          className="inline-flex text-sm font-semibold text-emerald-400"
        >
          ← Back to My eSIMs
        </Link>
      </div>
    );
  }

  const lpa = parseLpaParts(order.activationCode);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/sandbox/orders"
          className="text-sm font-semibold text-emerald-400 hover:text-emerald-300"
        >
          ← My eSIMs
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-50">
          {order.region}
        </h1>
        <p className="mt-1 text-sm text-slate-400">{order.planName}</p>
      </div>

      <div className={partnerCardClass + " space-y-4"}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
            Completed
          </span>
          <span className="text-sm tabular-nums text-slate-400">
            {formatUsd(order.totalCents)} ·{" "}
            {new Date(order.createdAt).toLocaleString()}
          </span>
        </div>

        <div className="mx-auto h-48 w-48 overflow-hidden rounded-2xl border border-white/[0.08] bg-white p-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="eSIM install QR"
              width={192}
              height={192}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              QR unavailable
            </div>
          )}
        </div>

        <CopyInstallField label="LPA / activation code" value={order.activationCode} />
        <CopyInstallField label="SM-DP+ address" value={lpa.smdp} />
        <CopyInstallField label="Activation code" value={lpa.matchingId} />
        {order.iccid ? (
          <CopyInstallField label="ICCID" value={order.iccid} />
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
          <Link
            href={`/sandbox/share/preview?orderId=${encodeURIComponent(order.orderId)}`}
            className="inline-flex h-11 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950"
          >
            Share QR
          </Link>
          <a
            href={`https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(order.activationCode)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100"
          >
            Install eSIM
          </a>
        </div>
      </div>
    </div>
  );
}
