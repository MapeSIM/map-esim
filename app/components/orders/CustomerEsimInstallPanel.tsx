"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import EsimInstallExperience from "@/app/components/install/EsimInstallExperience";
import SmartInstallEsimButton, {
  type SmartInstallPayload,
} from "@/app/components/install/SmartInstallEsimButton";
import { CustomerEsimInstallHelpLinks } from "@/app/components/orders/CustomerEsimInstallHelpLinks";
import { SMART_INSTALL_BUTTON_LABEL } from "@/app/lib/install/smartEsimInstall";

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
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstallPayload | null>(null);

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

  // My eSIMs "Install eSIM" lands on #install — auto-open details once via the
  // same secure on-demand fetch. Does not auto-launch native install.
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
              details load only after you tap {SMART_INSTALL_BUTTON_LABEL}.
            </p>
            <CustomerEsimInstallHelpLinks className="mt-3 text-sm text-[var(--text-muted)]" />
          </div>
        </div>

        <div className="mt-5 space-y-3">
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
          />
          {loading && !data ? (
            <p className="text-sm text-[var(--text-muted)]" role="status">
              Loading installation details…
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-[var(--danger-text)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {data ? (
          <div className="mt-5">
            <EsimInstallExperience
              showPrimaryInstallButton={false}
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
        ) : null}
      </div>
    </section>
  );
}
