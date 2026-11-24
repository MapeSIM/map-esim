"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import CopyInstallField from "@/app/components/install/CopyInstallField";
import {
  loadCachedSandboxOrders,
  findCachedSandboxOrder,
  readSandboxApiKey,
} from "@/app/lib/sandbox/sandboxPurchaseClient";
import {
  readSandboxShareBranding,
  type SandboxShareBranding,
  SANDBOX_DEFAULT_BRANDING,
  type SandboxStoredOrder,
} from "@/app/lib/sandbox/sandboxClientStorage";

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

function SharePreviewInner() {
  const searchParams = useSearchParams();
  const orderIdParam = (searchParams.get("orderId") ?? "").trim();

  const [branding, setBranding] = useState<SandboxShareBranding>(
    SANDBOX_DEFAULT_BRANDING
  );
  const [order, setOrder] = useState<SandboxStoredOrder | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  useEffect(() => {
    setBranding(readSandboxShareBranding());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOrder() {
      let found: SandboxStoredOrder | null = orderIdParam
        ? findCachedSandboxOrder(orderIdParam)
        : null;

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
            const list = (data.orders ?? []).map(
              (o): SandboxStoredOrder => ({
                orderId: o.orderId,
                planName: o.planName,
                region: o.region,
                totalCents: o.totalCents,
                iccid: o.iccid ?? "",
                activationCode: o.activationCode ?? "",
                createdAt: o.createdAt,
                status: "COMPLETED",
              })
            );
            if (orderIdParam) {
              found = list.find((o) => o.orderId === orderIdParam) ?? found;
            } else if (list[0]) {
              found = list[0];
            }
          }
        }
      } catch {
        /* use cache */
      }

      if (!found && !orderIdParam) {
        const cached = loadCachedSandboxOrders();
        found = cached[0] ?? null;
      }

      if (!cancelled) {
        setOrder(found);
        setHydrated(true);
      }
    }
    void loadOrder();
    return () => {
      cancelled = true;
    };
  }, [orderIdParam]);

  const activationCode = order?.activationCode?.trim() || "";

  useEffect(() => {
    if (!activationCode) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    async function renderQr() {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(activationCode, {
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
  }, [activationCode]);

  const lpa = useMemo(
    () => parseLpaParts(activationCode),
    [activationCode]
  );

  const companyName =
    branding.companyName.trim() || SANDBOX_DEFAULT_BRANDING.companyName;
  const supportEmail =
    branding.supportEmail.trim() || SANDBOX_DEFAULT_BRANDING.supportEmail;
  const planName = order?.planName || "No order selected";
  const destination = order?.region || "Browse catalog to create an order";

  async function copyShareMessage() {
    if (!activationCode || !order) return;
    const text = [
      `${companyName} shared an eSIM for ${destination}.`,
      planName,
      "",
      `Install code: ${activationCode}`,
      order.iccid ? `ICCID: ${order.iccid}` : "",
      supportEmail ? `Support: ${supportEmail}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      setCopiedShare(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 [--heading:#f8fafc] [--surface:#0D1526] [--surface-2:#111827] [--text-soft:#64748b] [--border:rgba(255,255,255,0.08)] [--accent-strong:#84cc16]">
      <header className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          White-label share preview
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Live look with your branding
          {order ? " and order install details." : "."}
        </p>
      </header>

      <div
        className={`overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0D1526] shadow-xl shadow-black/40 ${
          hydrated ? "" : "opacity-70"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#070D19]">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt=""
                width={44}
                height={44}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <span className="text-sm font-black text-emerald-400">
                {(companyName[0] || "M").toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-50">
              {companyName}
            </p>
            <a
              href={`mailto:${supportEmail}`}
              className="truncate text-xs text-slate-400 hover:text-emerald-300"
            >
              {supportEmail}
            </a>
          </div>
        </div>

        <div className="space-y-4 px-5 py-6 text-center">
          <div>
            <p className="text-lg font-bold text-slate-50">{planName}</p>
            <p className="mt-0.5 text-sm text-slate-500">{destination}</p>
          </div>

          {order ? (
            <>
              <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                Ready to install
              </span>
              <div className="mx-auto h-40 w-40 overflow-hidden rounded-2xl border border-white/[0.08] bg-white p-2">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="eSIM install QR"
                    width={160}
                    height={160}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-slate-500">
                    Generating QR…
                  </div>
                )}
              </div>

              <div className="space-y-2 text-left">
                <CopyInstallField
                  label="LPA / activation code"
                  value={activationCode}
                />
                <CopyInstallField label="SM-DP+ address" value={lpa.smdp} />
                <CopyInstallField
                  label="Activation code"
                  value={lpa.matchingId}
                />
                {order.iccid ? (
                  <CopyInstallField label="ICCID" value={order.iccid} />
                ) : null}
              </div>

              <a
                href={`https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(activationCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold"
                style={{
                  backgroundColor: branding.buttonBackground,
                  color: branding.buttonTextColor,
                }}
              >
                Install eSIM
              </a>
              <button
                type="button"
                onClick={() => void copyShareMessage()}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/[0.12] text-sm font-semibold text-slate-100 hover:bg-white/[0.04]"
              >
                {copiedShare ? "Copied share message" : "Copy share message"}
              </button>
            </>
          ) : (
            <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#070D19]/60 px-4 py-5">
              <p className="text-sm text-slate-300">
                No sandbox order yet. Buy a plan, then open Share from the order
                to preview this page with real QR and LPA details.
              </p>
              <Link
                href="/sandbox/catalog"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950"
              >
                Browse catalog
              </Link>
            </div>
          )}

          <p className="text-[11px] text-slate-500">Powered by {companyName}</p>
        </div>
      </div>

      <p className="text-center text-sm text-slate-500">
        <Link
          href="/sandbox/account"
          className="font-semibold text-emerald-400 hover:text-emerald-300"
        >
          ← Edit branding on Account
        </Link>
        {order ? (
          <>
            {" · "}
            <Link
              href={`/sandbox/orders/${encodeURIComponent(order.orderId)}`}
              className="font-semibold text-emerald-400 hover:text-emerald-300"
            >
              View order
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

export default function SandboxSharePreviewClient() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md rounded-2xl border border-white/[0.08] p-6 text-sm text-slate-400">
          Loading share preview…
        </div>
      }
    >
      <SharePreviewInner />
    </Suspense>
  );
}
