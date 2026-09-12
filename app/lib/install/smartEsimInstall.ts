/**
 * Progressive-enhancement install path resolver (client-safe, offline-QA safe).
 * Does not invent Android LPA/intents. Does not log activation secrets.
 */

import {
  buildAppleEsimInstallUrl,
  isAppleOneTapIosVersionSupported,
} from "@/app/lib/install/appleEsimInstall";

export const SMART_INSTALL_BUTTON_LABEL = "Install eSIM";

export const AUTOMATIC_INSTALL_UNAVAILABLE_TITLE =
  "Automatic eSIM installation isn't available on this device.";

export const AUTOMATIC_INSTALL_UNAVAILABLE_BODY =
  "You can still install your eSIM using QR code or manual setup.";

export const AUTOMATIC_INSTALL_HANDOFF_TITLE =
  "If automatic install did not open, use QR code or manual setup.";

export const AUTOMATIC_INSTALL_HANDOFF_BODY =
  "You can still install your eSIM using QR code or manual setup.";

export const DEVICE_COMPATIBILITY_HREF = "/device-compatibility";

export type SmartEsimInstallPath =
  | { kind: "apple_native"; href: string }
  | { kind: "iphone_official"; href: string }
  | { kind: "android_official"; href: string }
  | { kind: "fallback" };

export function isAndroidUserAgent(
  userAgent: string | null | undefined
): boolean {
  if (typeof userAgent !== "string") return false;
  const ua = userAgent.trim();
  if (!ua || !/Android/i.test(ua)) return false;
  if (/\biPhone\b/i.test(ua) || /\biPad\b/i.test(ua)) return false;
  return true;
}

/** iPhone iOS 17.4+ — any browser. UX-only, not a security boundary. */
export function canAttemptAppleNativeEsimInstall(
  userAgent: string | null | undefined
): boolean {
  return isAppleOneTapIosVersionSupported(userAgent);
}

export function resolveSmartEsimInstallPath(input: {
  userAgent: string | null | undefined;
  appleInstallUrl: string | null | undefined;
  iphoneOfficialHref: string | null | undefined;
  androidOfficialHref: string | null | undefined;
}): SmartEsimInstallPath {
  const appleUrl =
    typeof input.appleInstallUrl === "string" && input.appleInstallUrl.trim()
      ? input.appleInstallUrl.trim()
      : null;
  const iphoneOfficial =
    typeof input.iphoneOfficialHref === "string" &&
    input.iphoneOfficialHref.trim()
      ? input.iphoneOfficialHref.trim()
      : null;
  const androidOfficial =
    typeof input.androidOfficialHref === "string" &&
    input.androidOfficialHref.trim()
      ? input.androidOfficialHref.trim()
      : null;

  if (canAttemptAppleNativeEsimInstall(input.userAgent) && appleUrl) {
    return { kind: "apple_native", href: appleUrl };
  }
  if (canAttemptAppleNativeEsimInstall(input.userAgent) && iphoneOfficial) {
    return { kind: "iphone_official", href: iphoneOfficial };
  }
  if (isAndroidUserAgent(input.userAgent) && androidOfficial) {
    return { kind: "android_official", href: androidOfficial };
  }
  return { kind: "fallback" };
}

export function resolveSmartEsimInstallFromLpa(input: {
  userAgent: string | null | undefined;
  activationLpa: string | null | undefined;
  iphoneOfficialHref: string | null | undefined;
  androidOfficialHref: string | null | undefined;
}): SmartEsimInstallPath {
  return resolveSmartEsimInstallPath({
    userAgent: input.userAgent,
    appleInstallUrl: buildAppleEsimInstallUrl(input.activationLpa),
    iphoneOfficialHref: input.iphoneOfficialHref,
    androidOfficialHref: input.androidOfficialHref,
  });
}

/** Same-origin install proxies or already-validated https activation URLs. */
export function isSafeSmartInstallLaunchHref(
  href: string | null | undefined
): boolean {
  if (typeof href !== "string") return false;
  const trimmed = href.trim();
  if (!trimmed || trimmed.length > 4096) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function launchSmartEsimInstallPath(
  path: SmartEsimInstallPath
): "launched" | "fallback" {
  if (path.kind === "fallback") return "fallback";
  if (typeof window === "undefined") return "fallback";
  if (!isSafeSmartInstallLaunchHref(path.href)) return "fallback";
  window.location.assign(path.href);
  return "launched";
}

export const NATIVE_HANDOFF_FALLBACK_MS = 1800;

/** If the OS/browser never leaves the page, show QR/manual after a short wait. */
export function scheduleNativeHandoffFallback(
  onFallback: () => void,
  ms = NATIVE_HANDOFF_FALLBACK_MS
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const id = window.setTimeout(onFallback, ms);
  return () => window.clearTimeout(id);
}
