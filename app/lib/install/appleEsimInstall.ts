/**
 * Pure Apple one-tap eSIM install helpers (client-safe).
 * Never log activation codes, LPA values, or generated install URLs.
 */

const APPLE_ESIM_SETUP_ORIGIN = "https://esimsetup.apple.com";
const APPLE_ESIM_SETUP_PATH = "/esim_qrcode_provisioning";
const MAX_LPA_LEN = 2048;

/**
 * Build Apple's official eSIM provisioning URL from a complete GSMA LPA string.
 * Returns null when the value is missing or not a valid-looking LPA:1$… string.
 * Does not decode/rewrite internal $ components — only trims surrounding whitespace.
 */
export function buildAppleEsimInstallUrl(
  activationCode: string | null | undefined
): string | null {
  if (typeof activationCode !== "string") return null;
  const trimmed = activationCode.trim();
  if (!trimmed || trimmed.length > MAX_LPA_LEN) return null;
  if (!/^LPA:1\$/i.test(trimmed)) return null;

  const parts = trimmed.split("$");
  if (parts.length < 3) return null;
  if (!parts[1]?.trim() || !parts[2]?.trim()) return null;

  const url = new URL(APPLE_ESIM_SETUP_PATH, APPLE_ESIM_SETUP_ORIGIN);
  url.searchParams.set("carddata", trimmed);
  return url.toString();
}

function isIphoneUserAgent(ua: string): boolean {
  if (!/\biPhone\b/i.test(ua)) return false;
  if (/\biPad\b/i.test(ua)) return false;
  if (/Android/i.test(ua)) return false;
  return true;
}

/** iOS 17.4+ on iPhone. Fail closed. UX-only — not a security boundary. */
export function isAppleOneTapIosVersionSupported(
  userAgent: string | null | undefined
): boolean {
  if (typeof userAgent !== "string") return false;
  const ua = userAgent.trim();
  if (!ua || !isIphoneUserAgent(ua)) return false;

  const match = ua.match(/iPhone OS (\d+)[._](\d+)/i);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  if (major > 17) return true;
  if (major === 17 && minor >= 4) return true;
  return false;
}

/**
 * Conservative Mobile Safari detection on iPhone.
 * Rejects known non-Safari iOS browsers (Chrome/Firefox/Edge/Opera/etc.).
 * Fail closed when identity is unclear. UX-only.
 */
export function isIphoneSafariBrowser(
  userAgent: string | null | undefined
): boolean {
  if (typeof userAgent !== "string") return false;
  const ua = userAgent.trim();
  if (!ua || !isIphoneUserAgent(ua)) return false;

  // Non-Safari iOS browsers inject identifiable tokens.
  if (
    /CriOS|FxiOS|EdgiOS|EdgA|OPiOS|OPT\/|DuckDuckGo|Brave|GSA\//i.test(ua)
  ) {
    return false;
  }

  // Mobile Safari typically includes both Version/ and Safari/.
  if (!/Safari\//i.test(ua)) return false;
  if (!/Version\/\d+/i.test(ua)) return false;
  return true;
}

/**
 * Direct Apple one-tap is only safe on supported iPhone Safari.
 * Fail closed otherwise. UX-only — not a security boundary.
 */
export function supportsAppleOneTapEsimInstall(
  userAgent: string | null | undefined
): boolean {
  return (
    isAppleOneTapIosVersionSupported(userAgent) &&
    isIphoneSafariBrowser(userAgent)
  );
}

/**
 * Supported iPhone OS, but not Safari — show “open in Safari” instead of
 * launching the Apple URL (Chrome iOS WebView fails).
 */
export function shouldShowAppleOneTapSafariGuidance(
  userAgent: string | null | undefined
): boolean {
  return (
    isAppleOneTapIosVersionSupported(userAgent) &&
    !isIphoneSafariBrowser(userAgent)
  );
}
