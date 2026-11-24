"use client";

import { useCallback, useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import SmartInstallEsimButton from "@/app/components/install/SmartInstallEsimButton";
import IccidRevealPanel from "@/app/components/orders/IccidRevealPanel";
import PartnerEsimShareControls from "@/app/components/partner/PartnerEsimShareControls";
import {
  partnerCardClass,
  partnerPrimaryCtaClass,
} from "@/app/components/partner/partnerPortalUi";
import { PARTNER_INSTALL_UNAVAILABLE_MESSAGE } from "@/app/lib/partner/partnerOrderInstallClient";

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
  iccidMasked: string;
  iccid: string | null;
  hasActiveShareToken: boolean;
  partnerDisplayName?: string | null;
  destination: string | null;
  planName: string | null;
  dataAllowance: string | null;
  validity: string | null;
  /** @deprecated Kept for call-site compatibility; no longer rendered in this panel. */
  addDataHref?: string | null;
  defaultExpanded?: boolean;
};

export default function PartnerEsimInstallPanel({
  orderId,
  installEligible,
  iccidMasked,
  iccid,
  hasActiveShareToken,
  partnerDisplayName = null,
  destination,
  planName,
  dataAllowance,
  validity,
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstallPayload | null>(null);

  const loadInstall = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/partner/orders/${encodeURIComponent(orderId)}/install`,
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
        setError(json?.error || PARTNER_INSTALL_UNAVAILABLE_MESSAGE);
        return;
      }
      setData({
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
      });
    } catch {
      setData(null);
      setError("Installation details are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!defaultExpanded || !installEligible) return;
    void loadInstall();
  }, [defaultExpanded, installEligible, loadInstall]);

  async function expand() {
    setExpanded(true);
    if (!data && !loading) {
      await loadInstall();
    }
  }

  if (!installEligible) {
    return (
      <p className="text-sm text-[var(--text-muted)]" role="status">
        {PARTNER_INSTALL_UNAVAILABLE_MESSAGE}
      </p>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => void expand()}
        className={partnerPrimaryCtaClass}
      >
        <QrCode className="h-4 w-4" aria-hidden="true" />
        View QR Code & Install
      </button>
    );
  }

  const showQr = Boolean(data?.hasVerifiedLpa && data.qrViewHref);

  return (
    <div className="min-w-0 space-y-3">
      <h2 className="sr-only">Install your eSIM</h2>

      <section className={`${partnerCardClass} !p-4 sm:!p-5`}>
        {loading && !data ? (
          <p className="text-sm text-[var(--text-muted)]" role="status">
            Loading installation details…
          </p>
        ) : null}
        {error && !data ? (
          <p className="text-sm text-[var(--danger-text)]" role="alert">
            {error}
          </p>
        ) : null}
        {data && !data.hasInstallDetails ? (
          <p className="text-sm text-[var(--text-muted)]" role="status">
            {PARTNER_INSTALL_UNAVAILABLE_MESSAGE}
          </p>
        ) : null}

        <div
          className={
            showQr
              ? "grid gap-4 sm:grid-cols-[minmax(0,168px)_minmax(0,1fr)] sm:items-start"
              : "space-y-3"
          }
        >
          {showQr ? (
            <div className="rounded-2xl border border-[var(--border)] bg-white p-3">
              {/* authorized partner QR route */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data!.qrViewHref!}
                alt="eSIM installation QR code"
                width={160}
                height={160}
                className="mx-auto h-auto w-full max-w-[160px]"
              />
            </div>
          ) : null}

          <div className="min-w-0 space-y-2.5">
            {data ? (
              <SmartInstallEsimButton
                activationLpa={data.lpa}
                iphoneOfficialHref={data.iphoneInstallHref}
                androidOfficialHref={data.androidActivationUrl}
                qrViewHref={data.qrViewHref}
                smdpAddress={data.smdpAddress}
                activationCode={data.activationCode}
                iphoneGuideHref={data.iphoneGuideHref}
                androidGuideHref={data.androidGuideHref}
                className={partnerPrimaryCtaClass}
              />
            ) : null}
            <PartnerEsimShareControls
              orderId={orderId}
              hasActiveToken={hasActiveShareToken}
              partnerDisplayName={partnerDisplayName}
              destination={destination}
              planName={planName}
              dataAllowance={dataAllowance}
              validity={validity}
              compact
            />
          </div>
        </div>
      </section>

      <IccidRevealPanel
        orderId={orderId}
        iccid={iccid}
        unavailableLabel={iccidMasked}
        compact
        onRefreshFromProvider={async () => {
          const res = await fetch(
            `/api/partner/orders/${encodeURIComponent(orderId)}/iccid`,
            {
              method: "POST",
              cache: "no-store",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sync: true }),
            }
          );
          const json = (await res.json().catch(() => null)) as {
            success?: boolean;
            iccid?: string;
          } | null;
          if (!res.ok || !json?.success || !json.iccid) {
            return null;
          }
          return json.iccid;
        }}
      />
    </div>
  );
}
