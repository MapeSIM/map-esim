/**
 * Pure Partner share-branding validators. No Prisma. No secrets.
 * Empty input normalizes to null (MAP eSIM fallback).
 */

import { BRAND_NAME } from "@/app/lib/brand";
import { isPublicPartnerLogoBlobUrl } from "@/app/lib/partner/partnerShareLogoBlob";

export const SHARE_COMPANY_NAME_MAX = 30;
export const SHARE_COMPANY_NAME_TOO_LONG =
  "Company name must be 30 characters or fewer.";
export const SHARE_EMAIL_MAX = 254;
export const SHARE_URL_MAX = 2048;
export const SHARE_HEX_RE = /^#[0-9a-f]{6}$/;
export const SHARE_MIN_CONTRAST = 4.5;

export type PartnerShareBrandingFields = {
  companyName: string | null;
  supportEmail: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  buttonBackground: string | null;
  buttonTextColor: string | null;
};

export type PartnerShareBrandingInput = {
  companyName?: string | null;
  supportEmail?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  buttonBackground?: string | null;
  buttonTextColor?: string | null;
};

export class PartnerShareBrandingError extends Error {
  readonly code:
    | "INVALID_NAME"
    | "INVALID_EMAIL"
    | "INVALID_WEBSITE"
    | "INVALID_LOGO"
    | "INVALID_COLOR"
    | "LOW_CONTRAST";

  constructor(code: PartnerShareBrandingError["code"], message: string) {
    super(message);
    this.name = "PartnerShareBrandingError";
    this.code = code;
  }
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function stripUnsafeText(value: string): string {
  return value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeShareHexColor(value: string | null | undefined): string | null {
  const raw = blankToNull(value);
  if (!raw) return null;
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  const canonical = hex.toLowerCase();
  if (!SHARE_HEX_RE.test(canonical)) return null;
  return canonical;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const l1 =
    0.2126 * channelLuminance(r1) +
    0.7152 * channelLuminance(g1) +
    0.0722 * channelLuminance(b1);
  const l2 =
    0.2126 * channelLuminance(r2) +
    0.7152 * channelLuminance(g2) +
    0.0722 * channelLuminance(b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function hasUsableButtonContrast(
  background: string,
  text: string
): boolean {
  return contrastRatio(background, text) >= SHARE_MIN_CONTRAST;
}

function isSafeHttpsUrl(value: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    return null;
  }
  if (!parsed.hostname.includes(".")) return null;
  if (parsed.hash) return null;
  return parsed;
}

export function normalizeShareWebsiteUrl(
  value: string | null | undefined
): string | null {
  const raw = blankToNull(value);
  if (!raw) return null;
  if (raw.length > SHARE_URL_MAX) return null;
  const parsed = isSafeHttpsUrl(raw);
  if (!parsed) return null;
  if (parsed.pathname.toLowerCase().includes("/share/")) return null;
  return parsed.toString();
}

export function normalizeShareLogoUrl(
  value: string | null | undefined
): string | null {
  const raw = blankToNull(value);
  if (!raw) return null;
  if (raw.length > SHARE_URL_MAX) return null;
  if (/^(javascript|data|blob|file|vbscript):/i.test(raw)) return null;
  const parsed = isSafeHttpsUrl(raw);
  if (!parsed) return null;
  if (parsed.pathname.toLowerCase().includes("/share/")) return null;
  const path = parsed.pathname.toLowerCase();
  const looksLikeImage =
    /\.(png|jpe?g|webp|gif|svg)$/i.test(path) ||
    path.includes("/brand/") ||
    path.includes("/logo");
  if (!looksLikeImage) return null;
  return parsed.toString();
}

export function isSameOriginLogoUrl(logoUrl: string | null): boolean {
  return Boolean(publicSameOriginLogoPath(logoUrl));
}

/** MAP-hosted logos only, as a same-origin path (no remote fetch / IP leak). */
export function publicSameOriginLogoPath(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  try {
    const parsed = new URL(logoUrl);
    if (parsed.hostname !== "mapesim.com" && parsed.hostname !== "www.mapesim.com") {
      return null;
    }
    if (parsed.username || parsed.password || parsed.hash) return null;
    if (!parsed.pathname.startsWith("/")) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

/**
 * Public share/img src: MAP same-origin path or an owned Vercel Blob Partner logo.
 * Arbitrary remote URLs stay off the public share page.
 */
export function publicShareLogoSrc(
  logoUrl: string | null | undefined
): string | null {
  const sameOrigin = publicSameOriginLogoPath(logoUrl ?? null);
  if (sameOrigin) return sameOrigin;
  if (isPublicPartnerLogoBlobUrl(logoUrl)) return (logoUrl ?? "").trim();
  return null;
}

export function normalizeShareSupportEmail(
  value: string | null | undefined
): string | null {
  const raw = blankToNull(value);
  if (!raw) return null;
  if (raw.length > SHARE_EMAIL_MAX) return null;
  const email = raw.toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return null;
  return email;
}

/** Display sanitizer — does not drop legacy names that exceed the new limit. */
export function displayShareCompanyName(
  value: string | null | undefined
): string | null {
  const raw = blankToNull(value);
  if (!raw) return null;
  const cleaned = stripUnsafeText(raw);
  if (!cleaned || /https?:\/\//i.test(cleaned)) return null;
  return cleaned;
}

export function normalizeShareCompanyName(
  value: string | null | undefined
): string | null {
  const cleaned = displayShareCompanyName(value);
  if (!cleaned || cleaned.length > SHARE_COMPANY_NAME_MAX) return null;
  return cleaned;
}

/** Public share footer. Sanitized company name only — never Partner IDs. */
export function sharePoweredByLabel(
  companyName: string | null | undefined
): string {
  const name = displayShareCompanyName(companyName);
  return name ? `Powered by ${name}` : `Powered by ${BRAND_NAME}`;
}

export function parsePartnerShareBrandingInput(
  input: PartnerShareBrandingInput
): PartnerShareBrandingFields {
  const rawName = blankToNull(input.companyName);
  const displayedName = displayShareCompanyName(input.companyName);
  if (rawName && !displayedName) {
    throw new PartnerShareBrandingError(
      "INVALID_NAME",
      "Enter a valid company name, or leave it blank."
    );
  }
  if (displayedName && displayedName.length > SHARE_COMPANY_NAME_MAX) {
    throw new PartnerShareBrandingError(
      "INVALID_NAME",
      SHARE_COMPANY_NAME_TOO_LONG
    );
  }
  const companyName = displayedName;

  const supportEmail = normalizeShareSupportEmail(input.supportEmail);
  if (blankToNull(input.supportEmail) && !supportEmail) {
    throw new PartnerShareBrandingError(
      "INVALID_EMAIL",
      "Enter a valid support email, or leave it blank."
    );
  }

  const websiteUrl = normalizeShareWebsiteUrl(input.websiteUrl);
  if (blankToNull(input.websiteUrl) && !websiteUrl) {
    throw new PartnerShareBrandingError(
      "INVALID_WEBSITE",
      "Website must be a valid HTTPS URL, or left blank."
    );
  }

  const logoUrl = normalizeShareLogoUrl(input.logoUrl);
  if (blankToNull(input.logoUrl) && !logoUrl) {
    throw new PartnerShareBrandingError(
      "INVALID_LOGO",
      "Logo must be a valid HTTPS image URL, or left blank."
    );
  }

  const buttonBackground = normalizeShareHexColor(input.buttonBackground);
  if (blankToNull(input.buttonBackground) && !buttonBackground) {
    throw new PartnerShareBrandingError(
      "INVALID_COLOR",
      "Button background must be a hex color like #84ff00, or left blank."
    );
  }

  const buttonTextColor = normalizeShareHexColor(input.buttonTextColor);
  if (blankToNull(input.buttonTextColor) && !buttonTextColor) {
    throw new PartnerShareBrandingError(
      "INVALID_COLOR",
      "Button text color must be a hex color like #102018, or left blank."
    );
  }

  if (buttonBackground && buttonTextColor) {
    if (!hasUsableButtonContrast(buttonBackground, buttonTextColor)) {
      throw new PartnerShareBrandingError(
        "LOW_CONTRAST",
        "Button colors do not have enough contrast. Choose a darker or lighter pair."
      );
    }
  } else if (buttonBackground || buttonTextColor) {
    throw new PartnerShareBrandingError(
      "INVALID_COLOR",
      "Set both button colors, or leave both blank for MAP eSIM defaults."
    );
  }

  return {
    companyName,
    supportEmail,
    websiteUrl,
    logoUrl,
    buttonBackground,
    buttonTextColor,
  };
}

export function publicShareBrandingDto(
  fields: PartnerShareBrandingFields
): PartnerShareBrandingFields {
  return {
    companyName: fields.companyName,
    supportEmail: fields.supportEmail,
    websiteUrl: fields.websiteUrl,
    logoUrl: publicShareLogoSrc(fields.logoUrl),
    buttonBackground:
      fields.buttonBackground &&
      fields.buttonTextColor &&
      hasUsableButtonContrast(fields.buttonBackground, fields.buttonTextColor)
        ? fields.buttonBackground
        : null,
    buttonTextColor:
      fields.buttonBackground &&
      fields.buttonTextColor &&
      hasUsableButtonContrast(fields.buttonBackground, fields.buttonTextColor)
        ? fields.buttonTextColor
        : null,
  };
}
