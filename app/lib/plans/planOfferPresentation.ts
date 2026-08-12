/**
 * Shared plan/offer presentation helpers (cards + details).
 * Display-only — never mutate offer IDs, retail prices, or checkout targets.
 */
import type { VesimOffer } from "@/app/lib/vesim/offers";

const FAIR_USE_OR_THROTTLE_RE =
  /fair\s*use|speed\s*reduc|throttl|\bkbps\b|\bmbps\b.*reduc|after\s+your\s+full[- ]speed/i;

const DATA_VALIDITY_DUP_RE =
  /^\s*[\d.]+(\.\d+)?\s*(MB|GB|TB)\s*[•·\-–]\s*\d+\s*Days?\b/i;

const VERBOSE_NETWORK_BLURB_RE =
  /data-only\s+esim|rechargeable\s+online|operates\s+on\s+the|apn\s*:/i;

/** Max length for a card/modal "operator" chip — longer strings belong in details prose. */
export const CONCISE_OPERATOR_MAX_LEN = 48;

export function looksLikeFairUseOrThrottleText(
  value: string | null | undefined
): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  return FAIR_USE_OR_THROTTLE_RE.test(v);
}

export function looksLikeDataValidityDuplicate(
  value: string | null | undefined,
  dataFormatted?: string | null
): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (DATA_VALIDITY_DUP_RE.test(v)) return true;
  const data = (dataFormatted ?? "").trim();
  if (data && v.toLowerCase() === data.toLowerCase()) return true;
  return false;
}

/**
 * True when a string is a short operator/network label suitable for a plan card.
 */
export function isConciseOperatorLabel(
  value: string | null | undefined
): boolean {
  const v = (value ?? "").trim();
  if (v.length < 2 || v.length > CONCISE_OPERATOR_MAX_LEN) return false;
  if (looksLikeFairUseOrThrottleText(v)) return false;
  if (looksLikeDataValidityDuplicate(v)) return false;
  if (VERBOSE_NETWORK_BLURB_RE.test(v)) return false;
  return true;
}

/**
 * Card-only operator line. Prefers dedicated concise network names.
 * Never returns Fair Use paragraphs or data/validity duplicates.
 */
export function planCardOperatorLabel(offer: VesimOffer): string | null {
  const fromNetworks = (offer.networks || []).find((item) =>
    isConciseOperatorLabel(item)
  );
  if (fromNetworks) return fromNetworks.trim();

  if (isConciseOperatorLabel(offer.network)) {
    return (offer.network || "").trim();
  }

  // packageInfo is often FUP / "N GB • N Days" — never use it on cards.
  return null;
}

/** Modal operator row — same concise preference as the card. */
export function planDetailOperatorLabel(offer: VesimOffer): string | null {
  return planCardOperatorLabel(offer);
}

/**
 * Network technology for details (e.g. 3G / 4G / 5G).
 * Prefers dataSpeeds; only uses packageInfo when it looks like short tech text.
 */
export function planDetailNetworkTechnology(
  offer: VesimOffer
): string | null {
  const speeds = (offer.dataSpeeds || [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (speeds.length > 0) return speeds.join(" · ");

  const packageInfo = (offer.packageInfo || "").trim();
  if (!packageInfo) return null;
  if (looksLikeFairUseOrThrottleText(packageInfo)) return null;
  if (looksLikeDataValidityDuplicate(packageInfo, offer.dataFormatted)) {
    return null;
  }
  if (packageInfo.length > CONCISE_OPERATOR_MAX_LEN) return null;
  if (!/^(.*\b)?(2G|3G|4G|5G|LTE|NR|Wi-?Fi)(\b.*)?$/i.test(packageInfo)) {
    return null;
  }
  return packageInfo;
}

/**
 * Fair Use / throttle / speed-reduction terms from provider text fields.
 */
export function planDetailFairUseOrTerms(offer: VesimOffer): string | null {
  const candidates = [
    offer.description,
    offer.packageInfo,
    offer.network,
    offer.notes,
  ];
  for (const candidate of candidates) {
    const v = (candidate || "").trim();
    if (v && looksLikeFairUseOrThrottleText(v)) return v;
  }
  return null;
}

/**
 * Extra plan description for details when it is not a duplicate or FUP clone.
 */
export function planDetailDescription(offer: VesimOffer): string | null {
  const description = (offer.description || "").trim();
  if (!description) return null;
  if (looksLikeDataValidityDuplicate(description, offer.dataFormatted)) {
    return null;
  }
  const fairUse = planDetailFairUseOrTerms(offer);
  if (fairUse && description === fairUse) return null;
  if (looksLikeFairUseOrThrottleText(description)) {
    // Shown under Fair Use instead.
    return null;
  }
  return description;
}

/**
 * Concise network brands for chips — drop APN blurbs and long sentences.
 */
export function planDetailNetworkNames(offer: VesimOffer): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of offer.networks || []) {
    if (!isConciseOperatorLabel(item)) continue;
    const key = item.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(item.trim());
    if (names.length >= 12) break;
  }
  return names;
}

/** Optional short plan note that is not APN-only or Fair Use prose. */
export function planDetailNotes(offer: VesimOffer): string | null {
  const notes = (offer.notes || "").trim();
  if (!notes) return null;
  if (/^apn\s*:/i.test(notes)) return null;
  if (looksLikeFairUseOrThrottleText(notes)) return null;
  if (looksLikeDataValidityDuplicate(notes, offer.dataFormatted)) return null;
  return notes;
}
