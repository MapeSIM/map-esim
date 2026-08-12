"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode, Smartphone } from "lucide-react";
import EsimInstallExperience from "@/app/components/install/EsimInstallExperience";
import { useAppleOneTapInstallState } from "@/app/components/install/AppleOneTapInstallButton";

/** Hash-only install intent from My eSIMs — never carries secrets. */
function hasInstallHashIntent(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hash.replace(/^#/, "").toLowerCase() === "install";
}

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
};

export default function CustomerEsimInstallPanel({
  orderId,
  installEligible,
  isRefunded,
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

  // My eSIMs "View QR Code & Details" lands on #install — auto-open once via the
  // same secure on-demand fetch. Normal detail visits (no hash) stay lazy.
  const autoOpenStarted = useRef(false);
  useEffect(() => {
    if (autoOpenStarted.current) return;
    if (isRefunded || !installEligible || data || loading) return;
    if (!hasInstallHashIntent()) return;
    autoOpenStarted.current = true;
    void loadInstall();
    const section = document.getElementById("install");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isRefunded, installEligible, data, loading, loadInstall]);

  if (isRefunded) {
    return (
      <section
        id="install"
        className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-5"
        role="status"
      >
        <h2 className="text-base font-bold text-[var(--heading)]">
          Order refunded
        </h2>
        <p className="mt-2 text-sm text-[var(--danger-text)]">
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
        className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-5"
        role="status"
      >
        <h2 className="text-base font-bold text-[var(--heading)]">
          Installation unavailable
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Installation options appear when this eSIM order is completed and
          ready. If you expected them here, contact support with your order
          reference.
        </p>
      </section>
    );
  }

  return (
    <section id="install" className="space-y-4">
      <div className="rounded-2xl border border-[var(--border-hover)] bg-[var(--surface-2)] p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
          <div>
            <h2 className="text-base font-bold text-[var(--heading)]">
              Install your MAP eSIM
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Install the eSIM only when you are ready to use it. Sensitive
              details load only after you open QR code and details below.
            </p>
          </div>
        </div>

        {!data ? (
          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => void loadInstall()}
              disabled={loading}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
            >
              <QrCode className="h-4 w-4" />
              {loading ? "Loading…" : "View QR Code & Details"}
            </button>
            {error ? (
              <p className="text-sm text-[var(--danger-text)]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-5">
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
