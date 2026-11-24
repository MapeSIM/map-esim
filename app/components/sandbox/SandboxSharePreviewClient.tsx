"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import CopyInstallField from "@/app/components/install/CopyInstallField";
import ManualInstallSheet from "@/app/components/install/ManualInstallSheet";
import SmartInstallEsimButton from "@/app/components/install/SmartInstallEsimButton";
import {
  loadCachedSandboxOrders,
  findCachedSandboxOrder,
  readSandboxApiKey,
} from "@/app/lib/sandbox/sandboxPurchaseClient";
import { parseSandboxLpa } from "@/app/lib/sandbox/sandboxOrderPresentation";
import {
  readSandboxShareBranding,
  type SandboxShareBranding,
  SANDBOX_DEFAULT_BRANDING,
  type SandboxStoredOrder,
} from "@/app/lib/sandbox/sandboxClientStorage";
import {
  partnerCardClass,
  partnerPrimaryCtaClass,
  partnerSecondaryCtaClass,
  partnerSectionLabelClass,
} from "@/app/components/partner/partnerPortalUi";
import { ONE_TAP_FALLBACK } from "@/app/lib/install/progressiveInstallCopy";

function SharePreviewInner() {
  const searchParams = useSearchParams();
  const orderIdParam = (searchParams.get("orderId") ?? "").trim();

  const [branding, setBranding] = useState<SandboxShareBranding>(
    SANDBOX_DEFAULT_BRANDING
  );
  const [order, setOrder] = useState<SandboxStoredOrder | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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
        found = loadCachedSandboxOrders()[0] ?? null;
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
  const lpaParts = useMemo(
    () => parseSandboxLpa(activationCode),
    [activationCode]
  );

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

  const companyName =
    branding.companyName.trim() || SANDBOX_DEFAULT_BRANDING.companyName;
  const supportEmail =
    branding.supportEmail.trim() || SANDBOX_DEFAULT_BRANDING.supportEmail;
  const planName = order?.planName || "";
  const destination = order?.region || "";
  const ctaStyle = {
    backgroundColor: branding.buttonBackground,
    color: branding.buttonTextColor,
  };

  return (
    <div
      className={`mx-auto max-w-lg space-y-5 [--heading:#f8fafc] [--surface:#0D1526] [--surface-2:#111827] [--text:#e2e8f0] [--text-muted:#94a3b8] [--text-soft:#64748b] [--border:rgba(255,255,255,0.08)] [--accent-strong:#84cc16] [--accent:#84cc16] [--accent-ink:#052e16] ${
        hydrated ? "" : "opacity-70"
      }`}
    >
      <header className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0D1526] px-4 py-3.5">
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
      </header>

      {order ? (
        <>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-50">{planName}</p>
            <p className="mt-0.5 text-sm text-slate-500">{destination}</p>
            <span className="mt-3 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
              Ready to install
            </span>
          </div>

          <section className={partnerCardClass}>
            <p className={partnerSectionLabelClass}>QR code</p>
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
            <div className="mt-4">
              <SmartInstallEsimButton
                activationLpa={lpaParts.lpa}
                qrViewHref={qrDataUrl}
                smdpAddress={lpaParts.smdpAddress}
                activationCode={lpaParts.matchingId}
                className={partnerPrimaryCtaClass}
                style={ctaStyle}
              />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              {ONE_TAP_FALLBACK}
            </p>
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
              <Link
                href={`/sandbox/orders/${encodeURIComponent(order.orderId)}`}
                className={partnerSecondaryCtaClass}
              >
                Order details
              </Link>
            </div>
          </section>
        </>
      ) : (
        <div className={partnerCardClass + " space-y-3 text-center"}>
          <p className="text-sm text-slate-300">
            No sandbox order yet. Buy a plan on the catalog, then open Share from
            the order to preview this white-label page.
          </p>
          <Link
            href="/sandbox/catalog"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950"
          >
            Browse catalog
          </Link>
        </div>
      )}

      <p className="text-center text-[11px] text-slate-500">
        Powered by {companyName} ·{" "}
        <Link
          href="/sandbox/account"
          className="font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Edit branding
        </Link>
      </p>
    </div>
  );
}

export default function SandboxSharePreviewClient() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg rounded-2xl border border-white/[0.08] p-6 text-sm text-slate-400">
          Loading share preview…
        </div>
      }
    >
      <SharePreviewInner />
    </Suspense>
  );
}
