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

/**
 * UX-only: whether this user agent is an iPhone on iOS 17.5+.
 * Apple introduced the eSIM Universal Link in iOS/iPadOS 17.5.
 * Fail closed on unknown / malformed UAs. Not a security boundary.
 */
export function supportsAppleOneTapEsimInstall(
  userAgent: string | null | undefined
): boolean {
  if (typeof userAgent !== "string") return false;
  const ua = userAgent.trim();
  if (!ua) return false;
  if (!/\biPhone\b/i.test(ua)) return false;
  if (/\biPad\b/i.test(ua)) return false;
  if (/Android/i.test(ua)) return false;

  const match = ua.match(/iPhone OS (\d+)[._](\d+)/i);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  if (major > 17) return true;
  if (major === 17 && minor >= 5) return true;
  return false;
}
