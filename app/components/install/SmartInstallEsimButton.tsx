"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import SmartInstallFallbackSheet from "@/app/components/install/SmartInstallFallbackSheet";
import {
  launchSmartEsimInstallPath,
  resolveSmartEsimInstallFromLpa,
  scheduleNativeHandoffFallback,
  SMART_INSTALL_BUTTON_LABEL,
} from "@/app/lib/install/smartEsimInstall";

export type SmartInstallPayload = {
  activationLpa?: string | null;
  iphoneOfficialHref?: string | null;
  androidOfficialHref?: string | null;
  qrViewHref?: string | null;
  smdpAddress?: string | null;
  activationCode?: string | null;
};

type Props = SmartInstallPayload & {
  iphoneGuideHref?: string;
  androidGuideHref?: string;
  className?: string;
  style?: CSSProperties;
  /** Load authorized install data before resolving the path. */
  ensureInstallData?: () => Promise<SmartInstallPayload | false | null>;
};

export default function SmartInstallEsimButton({
  activationLpa,
  iphoneOfficialHref,
  androidOfficialHref,
  qrViewHref,
  smdpAddress,
  activationCode,
  iphoneGuideHref = "/install/iphone",
  androidGuideHref = "/install/android",
  className = "inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] outline-none transition hover:bg-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60",
  style,
  ensureInstallData,
}: Props) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallbackVariant, setFallbackVariant] = useState<
    "unavailable" | "handoff"
  >("unavailable");
  const [fallbackPayload, setFallbackPayload] =
    useState<SmartInstallPayload | null>(null);
  const [pending, setPending] = useState(false);
  const cancelHandoffRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cancelHandoffRef.current?.();
    };
  }, []);

  function openFallback(
    payload: SmartInstallPayload,
    variant: "unavailable" | "handoff"
  ) {
    setFallbackPayload(payload);
    setFallbackVariant(variant);
    setFallbackOpen(true);
  }

  async function onInstall() {
    if (pending) return;
    cancelHandoffRef.current?.();
    setPending(true);
    try {
      let payload: SmartInstallPayload = {
        activationLpa,
        iphoneOfficialHref,
        androidOfficialHref,
        qrViewHref,
        smdpAddress,
        activationCode,
      };
      if (ensureInstallData) {
        const loaded = await ensureInstallData();
        if (!loaded) return;
        payload = { ...payload, ...loaded };
      }
      const path = resolveSmartEsimInstallFromLpa({
        userAgent:
          typeof navigator === "undefined" ? "" : navigator.userAgent,
        activationLpa: payload.activationLpa,
        iphoneOfficialHref: payload.iphoneOfficialHref,
        androidOfficialHref: payload.androidOfficialHref,
      });
      if (launchSmartEsimInstallPath(path) === "fallback") {
        openFallback(payload, "unavailable");
        return;
      }
      cancelHandoffRef.current = scheduleNativeHandoffFallback(() => {
        openFallback(payload, "handoff");
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onInstall()}
        disabled={pending}
        className={className}
        style={style}
      >
        {pending ? "Preparing…" : SMART_INSTALL_BUTTON_LABEL}
      </button>
      <SmartInstallFallbackSheet
        open={fallbackOpen}
        onClose={() => setFallbackOpen(false)}
        variant={fallbackVariant}
        qrViewHref={fallbackPayload?.qrViewHref ?? qrViewHref}
        smdpAddress={fallbackPayload?.smdpAddress ?? smdpAddress}
        activationCode={fallbackPayload?.activationCode ?? activationCode}
        lpa={fallbackPayload?.activationLpa ?? activationLpa}
        iphoneGuideHref={iphoneGuideHref}
        androidGuideHref={androidGuideHref}
      />
    </>
  );
}
