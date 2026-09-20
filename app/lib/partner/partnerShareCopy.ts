/**
 * Safe Partner share-control copy. Never includes ICCID, LPA, SM-DP+,
 * activation codes, wallet, discount, or payment data.
 */

import { BRAND_NAME } from "@/app/lib/brand";
import { displayShareCompanyName } from "@/app/lib/partner/partnerShareBrandingValidate";

export type PartnerSharePackageFields = {
  destination?: string | null;
  planName?: string | null;
  dataAllowance?: string | null;
  validity?: string | null;
};

export type PartnerShareCopyInput = PartnerSharePackageFields & {
  shareUrl: string;
  /** Partner share-settings company name (display-sanitized; falls back to MAP). */
  partnerDisplayName?: string | null;
};

const OMITTED_FIELD =
  /^(not available|n\/a|null|undefined|none|—|-|\.)$/i;

function sanitizeShareField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || OMITTED_FIELD.test(trimmed)) return null;
  if (trimmed.length > 80) return null;
  if (/https?:\/\//i.test(trimmed) || /\/share\//i.test(trimmed)) return null;
  const compact = trimmed.replace(/\s+/g, "");
  if (/^\d{15,22}$/.test(compact)) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("iccid") ||
    lower.includes("lpa:") ||
    lower.includes("smdp") ||
    lower.includes("activation code") ||
    lower.includes("wallet") ||
    lower.includes("discount") ||
    lower.includes("provider")
  ) {
    return null;
  }
  return trimmed;
}

/** Selected share-settings name, or MAP brand fallback. */
export function resolvePartnerShareDisplayName(
  value: string | null | undefined
): string {
  return displayShareCompanyName(value) || BRAND_NAME;
}

export function buildPartnerSharePackageLabel(
  input: PartnerSharePackageFields
): string | null {
  const destination = sanitizeShareField(input.destination);
  const planName = sanitizeShareField(input.planName);
  const dataAllowance = sanitizeShareField(input.dataAllowance);
  const validity = sanitizeShareField(input.validity);
  const title = [destination, planName].filter(Boolean).join(" ");
  const spec = [dataAllowance, validity].filter(Boolean).join(", ");
  if (title && spec) return `${title} (${spec})`;
  if (title) return title;
  if (spec) return `(${spec})`;
  return null;
}

export function buildAbsoluteShareUrl(sharePath: string, origin: string): string {
  const path = (sharePath ?? "").trim();
  if (!path.startsWith("/share/")) {
    throw new Error("not_a_share_path");
  }
  if (path.includes("?") || path.includes("#") || path.includes("iccid")) {
    throw new Error("unsafe_share_path");
  }
  const cleanOrigin = (origin ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(cleanOrigin)) {
    throw new Error("unsafe_origin");
  }
  return `${cleanOrigin}${path}`;
}

export function countShareUrlOccurrences(haystack: string, shareUrl: string): number {
  const url = (shareUrl ?? "").trim();
  if (!url) return 0;
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(url, from);
    if (at === -1) break;
    count += 1;
    from = at + url.length;
  }
  return count;
}

/**
 * Intro line: partner display name + destination + data + validity.
 * Plan name is optional enrichment when present and safe.
 */
export function buildPartnerShareIntroLine(
  input: PartnerSharePackageFields & {
    partnerDisplayName?: string | null;
  }
): string {
  const partner = resolvePartnerShareDisplayName(input.partnerDisplayName);
  const destination = sanitizeShareField(input.destination);
  const planName = sanitizeShareField(input.planName);
  const dataAllowance = sanitizeShareField(input.dataAllowance);
  const validity = sanitizeShareField(input.validity);
  const title = [destination, planName].filter(Boolean).join(" ");
  const spec = [dataAllowance, validity].filter(Boolean).join(", ");
  if (title && spec) {
    return `Here are the eSIM QR details from ${partner} for ${title} (${spec}):`;
  }
  if (title) {
    return `Here are the eSIM QR details from ${partner} for ${title}:`;
  }
  if (spec) {
    return `Here are the eSIM QR details from ${partner} (${spec}):`;
  }
  return `Here are the eSIM QR details from ${partner}:`;
}

/** Full share message (intro + activation URL) — Copy + WhatsApp. */
export function buildPartnerShareClipboardText(
  input: PartnerShareCopyInput
): string {
  const shareUrl = (input.shareUrl ?? "").trim();
  const text = `${buildPartnerShareIntroLine(input)}\n${shareUrl}`;
  if (countShareUrlOccurrences(text, shareUrl) !== 1) {
    throw new Error("share_payload_url_count");
  }
  assertSafeSharePayload(text);
  return text;
}

export function buildPartnerShareWhatsAppText(
  input: PartnerShareCopyInput
): string {
  return buildPartnerShareClipboardText(input);
}

export function buildPartnerWhatsAppShareHref(
  input: PartnerShareCopyInput
): string {
  return `https://wa.me/?text=${encodeURIComponent(
    buildPartnerShareWhatsAppText(input)
  )}`;
}

export function buildPartnerWebSharePayload(input: PartnerShareCopyInput): {
  title: string;
  text: string;
  url: string;
} {
  const shareUrl = (input.shareUrl ?? "").trim();
  const partner = resolvePartnerShareDisplayName(input.partnerDisplayName);
  const text = buildPartnerShareIntroLine(input);
  const payload = {
    title: `Your eSIM from ${partner}`,
    text,
    url: shareUrl,
  };
  if (countShareUrlOccurrences(`${payload.text}\n${payload.url}`, shareUrl) !== 1) {
    throw new Error("share_payload_url_count");
  }
  assertSafeSharePayload(payload.title);
  assertSafeSharePayload(payload.text);
  assertSafeSharePayload(payload.url);
  return payload;
}

export function assertSafeSharePayload(value: string): void {
  const lower = value.toLowerCase();
  if (
    lower.includes("iccid") ||
    lower.includes("lpa:") ||
    lower.includes("smdp") ||
    lower.includes("activation code") ||
    lower.includes("wallet") ||
    lower.includes("discount") ||
    lower.includes("provider")
  ) {
    throw new Error("share_payload_contains_sensitive_data");
  }
  if (/\bundefined\b|\bnull\b/i.test(value)) {
    throw new Error("share_payload_contains_placeholder");
  }
}
