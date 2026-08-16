/**
 * Safe Partner share-control copy. Never includes ICCID, QR, LPA, wallet,
 * discount, or payment data.
 */

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

export function buildPartnerShareWhatsAppText(input: {
  shareUrl: string;
  companyName?: string | null;
}): string {
  const shareUrl = (input.shareUrl ?? "").trim();
  const company = (input.companyName ?? "").trim();
  if (company) {
    return `${company} has shared your eSIM details securely via MAP eSIM.\n${shareUrl}`;
  }
  return `Your MAP eSIM is ready.\nOpen your secure eSIM details:\n${shareUrl}`;
}

export function buildPartnerWhatsAppShareHref(input: {
  shareUrl: string;
  companyName?: string | null;
}): string {
  return `https://wa.me/?text=${encodeURIComponent(
    buildPartnerShareWhatsAppText(input)
  )}`;
}

export function buildPartnerWebSharePayload(input: {
  shareUrl: string;
  companyName?: string | null;
}): { title: string; text: string; url: string } {
  const company = (input.companyName ?? "").trim();
  return {
    title: company ? `${company} eSIM details` : "Your MAP eSIM is ready",
    text: buildPartnerShareWhatsAppText(input),
    url: input.shareUrl,
  };
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
}
