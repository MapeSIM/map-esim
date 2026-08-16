"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode, Smartphone } from "lucide-react";
import EsimInstallExperience from "@/app/components/install/EsimInstallExperience";
import { useAppleOneTapInstallState } from "@/app/components/install/AppleOneTapInstallButton";
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
};

export default function PartnerEsimInstallPanel({
  orderId,
  installEligible,
}: Props) {
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

  const autoOpenStarted = useRef(false);
  useEffect(() => {
    if (autoOpenStarted.current) return;
    if (!installEligible || data || loading) return;
    autoOpenStarted.current = true;
    void loadInstall();
  }, [installEligible, data, loading, loadInstall]);

  if (!installEligible) {
    return (
      <section
        className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-5"
        role="status"
      >
        <h2 className="text-base font-bold text-[var(--heading)]">
          Install your eSIM
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {PARTNER_INSTALL_UNAVAILABLE_MESSAGE}
        </p>
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="rounded-2xl border border-[var(--border-hover)] bg-[var(--surface-2)] p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--heading)]">
              Install your eSIM
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Use the QR code or manual details below. An ICCID is not enough to
              install this eSIM.
            </p>
          </div>
        </div>

        {!data ? (
          <div className="mt-5 space-y-3">
            {loading ? (
              <p className="text-sm text-[var(--text-muted)]" role="status">
                Loading installation details…
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void loadInstall()}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                <QrCode className="h-4 w-4" />
                View QR Code & Details
              </button>
            )}
            {error ? (
              <p className="text-sm text-[var(--danger-text)]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 min-w-0">
            <EsimInstallExperience
              appleOneTapHref={appleOneTap.href}
              showSafariOneTapGuidance={appleOneTap.showSafariGuidance}
              hasOfficialIphoneActivationUrl={
                data.hasOfficialIphoneActivationUrl
              }
              iphoneInstallHref={data.iphoneInstallHref}
              iphoneGuideHref={data.iphoneGuideHref}
              androidGuideHref={data.androidGuideHref}
              androidActivationUrl={data.androidActivationUrl}
              hasVerifiedLpa={data.hasVerifiedLpa}
              qrViewHref={data.qrViewHref}
              qrDownloadHref={data.qrDownloadHref}
              smdpAddress={data.smdpAddress}
              activationCode={data.activationCode}
              lpa={data.lpa}
              manualInstallText={
                [data.smdpAddress, data.activationCode, data.lpa]
                  .filter(Boolean)
                  .length > 0
                  ? [
                      data.smdpAddress
                        ? `SM-DP+: ${data.smdpAddress}`
                        : null,
                      data.activationCode
                        ? `Activation code: ${data.activationCode}`
                        : null,
                      data.lpa ? `LPA: ${data.lpa}` : null,
                    ]
                      .filter(Boolean)
                      .join("\n")
                  : null
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}
