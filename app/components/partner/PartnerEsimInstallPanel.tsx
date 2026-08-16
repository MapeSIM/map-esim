"use client";

import { useCallback, useState } from "react";
import { QrCode } from "lucide-react";
import Link from "next/link";
import AppleOneTapInstallButton, {
  AppleOneTapSafariGuidance,
  useAppleOneTapInstallState,
} from "@/app/components/install/AppleOneTapInstallButton";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import InstallEsimSheet from "@/app/components/install/InstallEsimSheet";
import ManualInstallSheet from "@/app/components/install/ManualInstallSheet";
import IccidRevealPanel from "@/app/components/orders/IccidRevealPanel";
import PartnerEsimShareControls from "@/app/components/partner/PartnerEsimShareControls";
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
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstallPayload | null>(null);
  const appleOneTap = useAppleOneTapInstallState(data?.lpa);

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
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] outline-none transition hover:bg-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        <QrCode className="h-4 w-4" aria-hidden="true" />
        View QR Code & Install
      </button>
    );
  }

  const showQr = Boolean(data?.hasVerifiedLpa && data.qrViewHref);
  const eligibleIphone = Boolean(appleOneTap.href);

  return (
    <div className="min-w-0 space-y-3">
      <h2 className="sr-only">Install your eSIM</h2>
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
            ? "min-w-0 space-y-3 sm:grid sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)] sm:items-start sm:gap-4 sm:space-y-0"
            : "min-w-0 space-y-3"
        }
      >
        {showQr ? (
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
            {/* authorized partner QR route */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data!.qrViewHref!}
              alt="eSIM installation QR code"
              width={240}
              height={240}
              className="mx-auto h-auto w-full max-w-[220px] sm:max-w-[240px]"
            />
          </div>
        ) : null}

        <div className="min-w-0 space-y-3">
          {eligibleIphone ? (
            <AppleOneTapInstallButton
              href={appleOneTap.href!}
              label="One-Tap Install eSIM"
            />
          ) : null}

          {appleOneTap.showSafariGuidance && !eligibleIphone ? (
            <AppleOneTapSafariGuidance />
          ) : null}

          {data ? (
            <InstallEsimSheet
              appleOneTapHref={appleOneTap.href}
              showSafariOneTapGuidance={appleOneTap.showSafariGuidance}
              qrViewHref={data.qrViewHref}
              smdpAddress={data.smdpAddress}
              activationCode={data.activationCode}
              lpa={data.lpa}
              iphoneGuideHref={data.iphoneGuideHref}
              androidGuideHref={data.androidGuideHref}
            />
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

          <IccidRevealPanel
            orderId={orderId}
            maskedLabel={iccidMasked}
            revealable={iccidRevealable}
            revealPath={`/api/partner/orders/${encodeURIComponent(orderId)}/iccid`}
            compact
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <ManualInstallSheet
              label="Manual installation details"
              smdpAddress={data?.smdpAddress}
              activationCode={data?.activationCode}
              lpa={data?.lpa}
            />
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
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
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                iPhone Guide
              </Link>
              <Link
                href={data?.androidGuideHref || "/install/android"}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                Android Guide
              </Link>
            </div>
          </EsimActionSheet>
        </div>
      </div>
    </div>
  );
}
