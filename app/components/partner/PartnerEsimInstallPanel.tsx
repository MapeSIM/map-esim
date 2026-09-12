"use client";

import { useCallback, useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import Link from "next/link";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import InstallEsimSheet from "@/app/components/install/InstallEsimSheet";
import ManualInstallSheet from "@/app/components/install/ManualInstallSheet";
import IccidRevealPanel from "@/app/components/orders/IccidRevealPanel";
import PartnerEsimShareControls from "@/app/components/partner/PartnerEsimShareControls";
import {
  partnerCardClass,
  partnerPrimaryCtaClass,
  partnerSecondaryCtaClass,
  partnerSectionLabelClass,
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
  iccidRevealable: boolean;
  hasActiveShareToken: boolean;
  destination: string | null;
  planName: string | null;
  dataAllowance: string | null;
  validity: string | null;
  addDataHref?: string | null;
  defaultExpanded?: boolean;
};

export default function PartnerEsimInstallPanel({
  orderId,
  installEligible,
  iccidMasked,
  iccidRevealable,
  hasActiveShareToken,
  destination,
  planName,
  dataAllowance,
  validity,
  addDataHref = null,
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [guideOpen, setGuideOpen] = useState(false);
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
    <div className="min-w-0 space-y-5">
      <h2 className="sr-only">Install your eSIM</h2>

      <section className={partnerCardClass}>
        <p className={partnerSectionLabelClass}>QR Installation</p>
        <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--heading)]">
          Install this eSIM
        </h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Use the green button on this device, or scan the QR code with another
          phone.
        </p>

        {loading && !data ? (
          <p className="mt-4 text-sm text-[var(--text-muted)]" role="status">
            Loading installation details…
          </p>
        ) : null}
        {error && !data ? (
          <p className="mt-4 text-sm text-[var(--danger-text)]" role="alert">
            {error}
          </p>
        ) : null}
        {data && !data.hasInstallDetails ? (
          <p className="mt-4 text-sm text-[var(--text-muted)]" role="status">
            {PARTNER_INSTALL_UNAVAILABLE_MESSAGE}
          </p>
        ) : null}

        <div
          className={
            showQr
              ? "mt-5 grid gap-5 lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)] lg:items-start"
              : "mt-5 space-y-4"
          }
        >
          {showQr ? (
            <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
              {/* authorized partner QR route */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data!.qrViewHref!}
                alt="eSIM installation QR code"
                width={180}
                height={180}
                className="mx-auto h-auto w-full max-w-[180px]"
              />
            </div>
          ) : null}

          <div className="min-w-0 space-y-3">
            {data ? (
              <InstallEsimSheet
                qrViewHref={data.qrViewHref}
                smdpAddress={data.smdpAddress}
                activationCode={data.activationCode}
                lpa={data.lpa}
                iphoneOfficialHref={data.iphoneInstallHref}
                androidOfficialHref={data.androidActivationUrl}
                iphoneGuideHref={data.iphoneGuideHref}
                androidGuideHref={data.androidGuideHref}
              />
            ) : null}
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              If automatic install does not open, use Manual Installation or the
              Installation Guide below.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {addDataHref ? (
            <Link href={addDataHref} className={partnerSecondaryCtaClass}>
              Add More Data
            </Link>
          ) : null}
          <PartnerEsimShareControls
            orderId={orderId}
            hasActiveToken={hasActiveShareToken}
            destination={destination}
            planName={planName}
            dataAllowance={dataAllowance}
            validity={validity}
            compact
          />
          <ManualInstallSheet
            label="Manual Installation"
            smdpAddress={data?.smdpAddress}
            activationCode={data?.activationCode}
            lpa={data?.lpa}
            buttonClassName={partnerSecondaryCtaClass}
          />
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className={partnerSecondaryCtaClass}
          >
            Installation Guide
          </button>
        </div>
        <EsimActionSheet
          open={guideOpen}
          title="Installation Guide"
          onClose={() => setGuideOpen(false)}
        >
          <div className="flex flex-col gap-2">
            <Link
              href={data?.iphoneGuideHref || "/install/iphone"}
              className={partnerSecondaryCtaClass}
            >
              iPhone Guide
            </Link>
            <Link
              href={data?.androidGuideHref || "/install/android"}
              className={partnerSecondaryCtaClass}
            >
              Android Guide
            </Link>
          </div>
        </EsimActionSheet>
      </section>

      <IccidRevealPanel
        orderId={orderId}
        maskedLabel={iccidMasked}
        revealable={iccidRevealable}
        revealPath={`/api/partner/orders/${encodeURIComponent(orderId)}/iccid`}
        compact
      />
    </div>
  );
}
