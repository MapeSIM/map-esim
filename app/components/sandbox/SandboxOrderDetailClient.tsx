"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CopyInstallField from "@/app/components/install/CopyInstallField";
import ManualInstallSheet from "@/app/components/install/ManualInstallSheet";
import SmartInstallEsimButton from "@/app/components/install/SmartInstallEsimButton";
import EsimOrderDetailCard from "@/app/components/orders/EsimOrderDetailCard";
import {
  findCachedSandboxOrder,
  sandboxAuthHeaders,
} from "@/app/lib/sandbox/sandboxPurchaseClient";
import {
  parseSandboxLpa,
  sandboxOrderToPartnerRow,
} from "@/app/lib/sandbox/sandboxOrderPresentation";
import type { SandboxStoredOrder } from "@/app/lib/sandbox/sandboxClientStorage";
import {
  partnerCardClass,
  partnerPrimaryCtaClass,
  partnerSecondaryCtaClass,
  partnerSectionLabelClass,
} from "@/app/components/partner/partnerPortalUi";
import { ONE_TAP_FALLBACK } from "@/app/lib/install/progressiveInstallCopy";

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
        const res = await fetch("/api/sandbox/v1/orders", {
          headers: sandboxAuthHeaders(),
          credentials: "same-origin",
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

  const row = useMemo(
    () => (order ? sandboxOrderToPartnerRow(order) : null),
    [order]
  );
  const lpaParts = useMemo(
    () => parseSandboxLpa(order?.activationCode ?? ""),
    [order]
  );

  if (!ready) {
    return (
      <div className={partnerCardClass}>
        <p className="text-sm text-slate-400">Loading order…</p>
      </div>
    );
  }

  if (!order || !row) {
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

  const shareHref = `/sandbox/share/preview?orderId=${encodeURIComponent(order.orderId)}`;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 [--heading:#f8fafc] [--surface:#0D1526] [--surface-2:#111827] [--text:#e2e8f0] [--text-muted:#94a3b8] [--text-soft:#64748b] [--border:rgba(255,255,255,0.08)] [--accent-strong:#84cc16] [--accent:#84cc16] [--accent-ink:#052e16]">
      <Link
        href="/sandbox/orders"
        className="inline-flex text-sm font-semibold text-emerald-400 hover:text-emerald-300"
      >
        ← My eSIMs
      </Link>

      <EsimOrderDetailCard
        orderId={row.orderId}
        dataPlan={row.planName}
        validityPeriod={row.validity}
        amountPaid={row.partnerDebitLabel}
        purchasedAt={row.purchasedAtLabel}
        dataAllowance={row.dataAllowance}
        orderStatusLabel="Completed"
        isRefunded={false}
        lifecycle={row.lifecycle}
        usagePath={null}
        usageEligible={false}
        viewQrHref={null}
        onViewQr={undefined}
        enableShare
        shareUrl={shareHref}
        shareTitle={row.planName}
        addDataHref={null}
        footer={
          <p className="border-t border-white/8 pt-3 text-xs text-white/45">
            {row.shortReference} · Simulated sandbox order
          </p>
        }
      />

      {order.activationCode ? (
        <>
          <section className={partnerCardClass}>
            <p className={partnerSectionLabelClass}>QR code</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Scan this code with another phone if you are not installing on
              this device.
            </p>
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-4">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="eSIM installation QR code"
                  width={200}
                  height={200}
                  className="mx-auto h-auto w-full max-w-[180px] sm:max-w-[200px]"
                />
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">
                  Generating QR…
                </p>
              )}
            </div>
          </section>

          <section className={partnerCardClass}>
            <p className={partnerSectionLabelClass}>Install</p>
            <h2 className="mt-2 text-base font-semibold tracking-tight text-[var(--heading)]">
              Start installation
            </h2>
            <div className="mt-4">
              <SmartInstallEsimButton
                activationLpa={lpaParts.lpa}
                qrViewHref={qrDataUrl}
                smdpAddress={lpaParts.smdpAddress}
                activationCode={lpaParts.matchingId}
                className={partnerPrimaryCtaClass}
              />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              {ONE_TAP_FALLBACK}
            </p>
            <ol className="mt-3 space-y-1.5 text-sm leading-relaxed text-[var(--text)]">
              <li>1. Tap Install eSIM on this phone.</li>
              <li>2. If nothing opens, scan the QR code with another device.</li>
              <li>3. Still stuck? Use Manual Install.</li>
            </ol>
          </section>

          {order.iccid ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
              <CopyInstallField label="ICCID" value={order.iccid} />
            </div>
          ) : null}

          <section className={partnerCardClass}>
            <p className={partnerSectionLabelClass}>Need another option?</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <ManualInstallSheet
                smdpAddress={lpaParts.smdpAddress}
                activationCode={lpaParts.matchingId}
                lpa={lpaParts.lpa}
                buttonClassName={partnerSecondaryCtaClass}
              />
              <Link href={shareHref} className={partnerSecondaryCtaClass}>
                White-label share page
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
