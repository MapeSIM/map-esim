"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useState } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  Share2,
  Smartphone,
} from "lucide-react";
import SmartInstallEsimButton, {
  type SmartInstallPayload,
} from "@/app/components/install/SmartInstallEsimButton";
import { CustomerEsimInstallHelpLinks } from "@/app/components/orders/CustomerEsimInstallHelpLinks";
import IccidRevealPanel from "@/app/components/orders/IccidRevealPanel";

type InstallPayload = {
  hasInstallDetails: boolean;
  hasVerifiedLpa: boolean;
  hasOfficialIphoneActivationUrl: boolean;
  hasOfficialAndroidActivationUrl: boolean;
  iphoneInstallHref: string | null;
  iphoneGuideHref: string;
  qrDownloadHref: string | null;
  qrViewHref: string | null;
  androidGuideHref: string;
  androidActivationUrl: string | null;
  smdpAddress: string | null;
  activationCode: string | null;
  lpa: string | null;
};

type Props = {
  orderId: string;
  installEligible: boolean;
  isRefunded: boolean;
  /** Full ICCID when already authorized for this order surface. */
  iccid?: string | null;
  shareUrl?: string | null;
  shareTitle?: string | null;
};

function toSmartPayload(data: InstallPayload): SmartInstallPayload {
  return {
    activationLpa: data.lpa,
    iphoneOfficialHref: data.iphoneInstallHref,
    androidOfficialHref: data.androidActivationUrl,
    qrViewHref: data.qrViewHref,
    smdpAddress: data.smdpAddress,
    activationCode: data.activationCode,
  };
}

export default function CustomerEsimInstallPanel({
  orderId,
  installEligible,
  isRefunded,
  iccid = null,
  shareUrl = null,
  shareTitle = null,
}: Props) {
  const manualId = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstallPayload | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [iccidOpen, setIccidOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const loadInstall = useCallback(async (): Promise<InstallPayload | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/orders/${encodeURIComponent(orderId)}/install`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }
      );
      const json = (await res.json().catch(() => null)) as
        | (InstallPayload & { success?: boolean; error?: string })
        | null;
      if (!res.ok || !json?.success) {
        setData(null);
        setError(
          json?.error ||
            "Installation details are not available for this order."
        );
        return null;
      }
      const mapped: InstallPayload = {
        hasInstallDetails: Boolean(json.hasInstallDetails),
        hasVerifiedLpa: Boolean(json.hasVerifiedLpa),
        hasOfficialIphoneActivationUrl: Boolean(
          json.hasOfficialIphoneActivationUrl
        ),
        hasOfficialAndroidActivationUrl: Boolean(
          json.hasOfficialAndroidActivationUrl
        ),
        iphoneInstallHref: json.iphoneInstallHref,
        iphoneGuideHref: json.iphoneGuideHref || "/install/iphone",
        qrDownloadHref: json.qrDownloadHref,
        qrViewHref: json.qrViewHref,
        androidGuideHref: json.androidGuideHref || "/install/android",
        androidActivationUrl: json.androidActivationUrl,
        smdpAddress: json.smdpAddress,
        activationCode: json.activationCode,
        lpa: json.lpa,
      };
      setData(mapped);
      return mapped;
    } catch {
      setData(null);
      setError("Installation details are temporarily unavailable.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const ensureInstallData = useCallback(async () => {
    const payload = data ?? (await loadInstall());
    if (!payload) return false;
    return toSmartPayload(payload);
  }, [data, loadInstall]);

  // Permanently surface QR/install once eligible (no secondary "View QR" gate).
  useEffect(() => {
    if (isRefunded || !installEligible || data || loading) return;
    void loadInstall();
  }, [isRefunded, installEligible, data, loading, loadInstall]);

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setCopiedKey(null);
    }
  }

  async function onShare() {
    if (typeof window === "undefined") return;
    const raw = (shareUrl ?? "").trim();
    const url = raw
      ? raw.startsWith("http://") || raw.startsWith("https://")
        ? raw
        : new URL(raw, window.location.origin).href
      : window.location.href;
    const titleText = (shareTitle ?? "MAP eSIM").trim();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: titleText, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 2000);
      } catch {
        setShareCopied(false);
      }
    }
  }

  if (isRefunded) {
    return (
      <section
        id="install"
        className="rounded-2xl border border-red-500/35 bg-[#061A33] p-5"
        role="status"
      >
        <h2 className="text-base font-bold text-white">Order refunded</h2>
        <p className="mt-2 text-sm text-red-200/90">
          Installation is no longer available for this order. QR codes and
          activation actions are disabled.
        </p>
      </section>
    );
  }

  if (!installEligible) {
    return (
      <section
        id="install"
        className="rounded-2xl border border-dashed border-[#1E3A5F] bg-[#061A33] p-5"
        role="status"
      >
        <h2 className="text-base font-bold text-white">
          Installation unavailable
        </h2>
        <p className="mt-2 text-sm text-white/65">
          Installation options appear when this eSIM order is completed and
          ready.
        </p>
      </section>
    );
  }

  const showQr = Boolean(data?.hasVerifiedLpa && data.qrViewHref);
  const hasManual = Boolean(
    data?.smdpAddress || data?.activationCode || data?.lpa || iccid
  );

  return (
    <section id="install" className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-[#1E3A5F] bg-[#061A33] p-5 shadow-[0_16px_40px_rgba(6,26,51,0.45)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#00F05A]/15 text-[#00F05A]">
            <Smartphone className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-[family-name:var(--font-heading,Poppins,Inter,system-ui,sans-serif)] text-lg font-bold tracking-tight text-white">
              Install Your eSIM
            </h2>
            <p className="mt-1 text-sm text-white/65">
              Scan this QR code from another device, or tap &quot;Install
              eSIM&quot; on this phone.
            </p>
          </div>
        </div>

        {loading && !data ? (
          <p className="mt-6 text-center text-sm text-white/60" role="status">
            Loading installation details…
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        {showQr ? (
          <div className="mx-auto mt-6 flex max-w-[280px] items-center justify-center rounded-2xl bg-white p-4 shadow-xl">
            <Image
              src={data!.qrViewHref!}
              alt="MAP eSIM installation QR code"
              width={248}
              height={248}
              unoptimized
              className="h-auto w-full"
              priority
            />
          </div>
        ) : data && !loading ? (
          <div className="mx-auto mt-6 flex max-w-[280px] items-center justify-center rounded-2xl border border-[#1E3A5F] bg-white/5 px-4 py-10 text-center text-sm text-white/55">
            QR code is not available for this order yet.
          </div>
        ) : null}

        <div className="mx-auto mt-5 max-w-sm space-y-3">
          <SmartInstallEsimButton
            activationLpa={data?.lpa}
            iphoneOfficialHref={data?.iphoneInstallHref}
            androidOfficialHref={data?.androidActivationUrl}
            qrViewHref={data?.qrViewHref}
            smdpAddress={data?.smdpAddress}
            activationCode={data?.activationCode}
            iphoneGuideHref={data?.iphoneGuideHref}
            androidGuideHref={data?.androidGuideHref}
            ensureInstallData={ensureInstallData}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#00F05A] px-4 text-sm font-bold text-[#061A33] shadow-[0_10px_28px_rgba(0,240,90,0.28)] outline-none transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[#00B8E6] disabled:opacity-60"
          />

          <div className="flex items-center justify-center gap-2">
            {data?.qrDownloadHref ? (
              <a
                href={data.qrDownloadHref}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#1E3A5F] bg-white/5 px-3 text-xs font-semibold text-white/85 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B8E6]"
                aria-label="Download QR code"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void onShare()}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#1E3A5F] bg-white/5 px-3 text-xs font-semibold text-white/85 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B8E6]"
              aria-label="Share order link"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              {shareCopied ? "Copied" : "Share"}
            </button>
          </div>
        </div>

        {hasManual ? (
          <div className="mt-5 rounded-2xl border border-[#1E3A5F] bg-[#0A2340]">
            <button
              type="button"
              aria-expanded={manualOpen}
              aria-controls={manualId}
              onClick={() => setManualOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold text-white">
                Manual activation details
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#00B8E6] transition ${
                  manualOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>
            {manualOpen ? (
              <div id={manualId} className="space-y-3 border-t border-[#1E3A5F] px-4 py-4">
                {data?.smdpAddress ? (
                  <ManualCopyRow
                    label="SM-DP+ Address"
                    value={data.smdpAddress}
                    copied={copiedKey === "smdp"}
                    onCopy={() => void copyText("smdp", data.smdpAddress!)}
                  />
                ) : null}
                {data?.activationCode ? (
                  <ManualCopyRow
                    label="Activation Code"
                    value={data.activationCode}
                    copied={copiedKey === "activation"}
                    onCopy={() =>
                      void copyText("activation", data.activationCode!)
                    }
                  />
                ) : null}
                <div className="rounded-xl border border-[#1E3A5F] bg-[#061A33]/70">
                  <button
                    type="button"
                    onClick={() => setIccidOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-white/55"
                  >
                    ICCID (carrier verification)
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-[#00B8E6] transition ${
                        iccidOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {iccidOpen ? (
                    <div className="border-t border-[#1E3A5F] px-3 py-3">
                      <IccidRevealPanel
                        orderId={orderId}
                        iccid={iccid}
                        compact
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <CustomerEsimInstallHelpLinks className="mt-4 text-center text-xs text-white/45" />
      </div>
    </section>
  );
}

function ManualCopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#1E3A5F] bg-[#061A33]/70 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">
          {label}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#00B8E6] transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B8E6]"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 break-all text-sm font-medium text-white">{value}</p>
    </div>
  );
}
