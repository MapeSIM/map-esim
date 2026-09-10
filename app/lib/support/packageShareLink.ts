/**
 * Support/admin WhatsApp Direct Package Link helpers (v1).
 * Offline-QA safe — no Prisma, network, or secrets.
 *
 * Builds absolute customer buy links from catalog offerId + country only.
 * Never includes purchaseId, providerOrderId, fromOrder, wallet, or payment refs.
 */
import { BRAND_NAME, BRAND_SITE_URL } from "@/app/lib/brand";
import { buildCheckoutHref } from "@/app/lib/plans/plan-utils";
import type { VesimOffer } from "@/app/lib/vesim/offers";

const OMITTED_FIELD =
  /^(not available|n\/a|null|undefined|none|—|-|\.)$/i;

const FORBIDDEN_MESSAGE =
  /\b(purchaseid|providerorderid|provider\s*order|wallet|payment\s*ref|debit|idempotency|iccid|lpa:|smdp)\b/i;

export type PackageShareLabelFields = {
  destination?: string | null;
  planName?: string | null;
  dataAllowance?: string | null;
  validity?: string | null;
};

export type PackageShareLinkInput = PackageShareLabelFields & {
  offerId: string;
  country: string;
};

function sanitizeLabelField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || OMITTED_FIELD.test(trimmed)) return null;
  if (trimmed.length > 80) return null;
  if (/https?:\/\//i.test(trimmed)) return null;
  if (FORBIDDEN_MESSAGE.test(trimmed)) return null;
  const compact = trimmed.replace(/\s+/g, "");
  if (/^\d{15,22}$/.test(compact)) return null;
  return trimmed;
}

/** Normalize catalog offer id for public buy links. */
export function normalizePackageShareOfferId(
  value: unknown
): string | null {
  if (typeof value !== "string") return null;
  const offerId = value.trim();
  if (!offerId || offerId.length > 120) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(offerId)) return null;
  if (/purchase|provider|wallet|payment/i.test(offerId)) return null;
  return offerId;
}

/** ISO-2 or region-* / global country hint (same rules as buy deep links). */
export function normalizePackageShareCountry(
  value: unknown
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^(region-[a-z0-9-]+|global)$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

/**
 * Relative authenticated buy path. Reuses buildCheckoutHref — never passes
 * fromOrder (that is purchase resume / add-data, not a public package share).
 */
export function buildPackageCheckoutPath(input: {
  offerId: string;
  country: string;
}): string | null {
  const offerId = normalizePackageShareOfferId(input.offerId);
  const country = normalizePackageShareCountry(input.country);
  if (!offerId || !country) return null;

  const path = buildCheckoutHref(
    {
      id: offerId,
      name: "",
      dataFormatted: "",
      priceFormatted: "",
    },
    country
  );

  if (!path.startsWith("/account/esim/buy?")) return null;
  if (!path.includes("offerId=")) return null;
  if (!path.includes("country=")) return null;
  if (
    /fromOrder=|purchaseId=|providerOrderId=|purchase=/i.test(path)
  ) {
    return null;
  }
  return path;
}

/** Absolute public buy URL on the MAP site origin. */
export function buildAbsolutePackageCheckoutUrl(input: {
  offerId: string;
  country: string;
}): string | null {
  const path = buildPackageCheckoutPath(input);
  if (!path) return null;
  const origin = BRAND_SITE_URL.replace(/\/+$/, "");
  return `${origin}${path}`;
}

export function buildAbsolutePackageCheckoutUrlFromOffer(
  offer: Pick<VesimOffer, "id">,
  destinationCode: string
): string | null {
  return buildAbsolutePackageCheckoutUrl({
    offerId: offer.id,
    country: destinationCode,
  });
}

/** Human package label: destination + plan/data/validity (no money fields). */
export function buildPackageShareLabel(
  input: PackageShareLabelFields
): string | null {
  const destination = sanitizeLabelField(input.destination);
  const planName = sanitizeLabelField(input.planName);
  const dataAllowance = sanitizeLabelField(input.dataAllowance);
  const validity = sanitizeLabelField(input.validity);
  const title = [destination, planName].filter(Boolean).join(" — ");
  const spec = [dataAllowance, validity].filter(Boolean).join(", ");
  if (title && spec) return `${title} (${spec})`;
  if (title) return title;
  if (spec) return spec;
  return null;
}

function assertSafePackageSharePayload(value: string): void {
  if (FORBIDDEN_MESSAGE.test(value)) {
    throw new Error("package_share_payload_contains_sensitive_data");
  }
  if (/\bundefined\b|\bnull\b/i.test(value)) {
    throw new Error("package_share_payload_contains_placeholder");
  }
  if (/fromOrder=|purchaseId=|providerOrderId=/i.test(value)) {
    throw new Error("package_share_payload_contains_forbidden_ids");
  }
}

/**
 * WhatsApp message: destination + package label + absolute buy link.
 */
export function buildPackageShareWhatsAppText(
  input: PackageShareLinkInput
): string | null {
  const checkoutUrl = buildAbsolutePackageCheckoutUrl({
    offerId: input.offerId,
    country: input.country,
  });
  if (!checkoutUrl) return null;

  const label = buildPackageShareLabel(input);
  const intro = label
    ? `Here is the ${BRAND_NAME} eSIM package for ${label}:`
    : `Here is the ${BRAND_NAME} eSIM package:`;
  const text = `${intro}\n${checkoutUrl}`;
  assertSafePackageSharePayload(text);
  return text;
}

/** Open WhatsApp share sheet with prefilled package message (no fixed phone). */
export function buildPackageShareWhatsAppHref(
  input: PackageShareLinkInput
): string | null {
  const text = buildPackageShareWhatsAppText(input);
  if (!text) return null;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
