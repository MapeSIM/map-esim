"use client";

import { Smartphone } from "lucide-react";
import EsimInstallExperience from "@/app/components/install/EsimInstallExperience";
import { useAppleOneTapInstallHref } from "@/app/components/install/AppleOneTapInstallButton";

export type OrderInstallActionsProps = {
  hasInstallDetails?: boolean;
  hasVerifiedLpa?: boolean;
  hasOfficialIphoneActivationUrl?: boolean;
  iphoneInstallHref?: string;
  iphoneGuideHref?: string;
  qrDownloadHref?: string;
  qrViewHref?: string;
  androidGuideHref?: string;
  androidActivationUrl?: string;
  manualInstallText?: string;
  smdpAddress?: string;
  activationCode?: string;
  qrValue?: string;
  iccid?: string;
};

export default function OrderInstallActions({
  hasInstallDetails,
  hasVerifiedLpa,
  hasOfficialIphoneActivationUrl,
  iphoneInstallHref,
  iphoneGuideHref = "/install/iphone",
  qrDownloadHref,
  qrViewHref,
  androidGuideHref = "/install/android",
  androidActivationUrl,
  manualInstallText,
  smdpAddress,
  activationCode,
  qrValue,
  iccid,
}: OrderInstallActionsProps) {
  const appleOneTapHref = useAppleOneTapInstallHref(qrValue);

  if (!hasInstallDetails) {
    return null;
  }

  return (
    <section id="install" className="mt-6 space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
          <div>
            <h2 className="text-base font-bold text-[var(--heading)]">
              Install your MAP eSIM
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Install the eSIM only when you are ready to use it. Actions below
              use verified order data only.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <EsimInstallExperience
            appleOneTapHref={appleOneTapHref}
            hasOfficialIphoneActivationUrl={hasOfficialIphoneActivationUrl}
            iphoneInstallHref={iphoneInstallHref}
            iphoneGuideHref={iphoneGuideHref}
            androidGuideHref={androidGuideHref}
            androidActivationUrl={androidActivationUrl}
            hasVerifiedLpa={hasVerifiedLpa}
            qrViewHref={qrViewHref}
            qrDownloadHref={qrDownloadHref}
            smdpAddress={smdpAddress}
            activationCode={activationCode}
            lpa={qrValue}
            iccid={iccid}
            manualInstallText={manualInstallText}
          />
        </div>
      </div>
    </section>
  );
}
