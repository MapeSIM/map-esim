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

/** Speed / tech / allowance copy must never be shown as a carrier name. */
const SPEED_OR_DATA_AS_OPERATOR_RE =
  /\bup\s*to\b|\b4g\b|\b5g\b|\blte\b|\bspeed\b|\bdata\b/i;

/** Provider junk that has appeared as a fake "Network" label. */
const JUNK_OPERATOR_LABELS = new Set(["sheesh"]);

/** Max length for a card/modal "operator" chip — longer strings belong in details prose. */
export const CONCISE_OPERATOR_MAX_LEN = 48;

export function looksLikeSpeedOrDataOperatorLabel(
  value: string | null | undefined
): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  return SPEED_OR_DATA_AS_OPERATOR_RE.test(v);
}

export function looksLikeJunkOperatorLabel(
  value: string | null | undefined
): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return false;
  return JUNK_OPERATOR_LABELS.has(v);
}

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
  if (looksLikeSpeedOrDataOperatorLabel(v)) return false;
  if (looksLikeJunkOperatorLabel(v)) return false;
  return true;
}

/**
 * Card-only operator line. Prefers dedicated concise network names.
 * Never returns Fair Use paragraphs or data/validity duplicates.
 * Never falls back to packageInfo / description / notes.
 */
export function planCardOperatorLabel(offer: VesimOffer): string | null {
  const fromNetworks = (offer.networks || []).find((item) =>
    isConciseOperatorLabel(item)
  );
  if (fromNetworks) return fromNetworks.trim();

  if (isConciseOperatorLabel(offer.network)) {
    return (offer.network || "").trim();
  }

  // packageInfo / description / notes are often FUP or "N GB • N Days".
  return null;
}

export type PlanCardSecondaryLine =
  | { kind: "validity"; text: string }
  | { kind: "coverage"; text: string }
  | { kind: "operator"; text: string };

export function planCardLineLabel(kind: PlanCardSecondaryLine["kind"]): string {
  if (kind === "validity") return "Validity";
  if (kind === "coverage") return "Coverage";
  return "Network";
}

/**
 * Sole secondary-text contract for shared plan cards (below data + price).
 * Callers must not also render packageInfo, description, notes, or raw network.
 */
export function planCardSecondaryLines(
  offer: VesimOffer,
  options: {
    isRegionalOrGlobal: boolean;
    formatValidity: (days: number | null | undefined) => string;
  }
): PlanCardSecondaryLine[] {
  const lines: PlanCardSecondaryLine[] = [
    { kind: "validity", text: options.formatValidity(offer.durationDays) },
  ];

  if (
    options.isRegionalOrGlobal &&
    offer.coveredCountriesCount != null &&
    offer.coveredCountriesCount > 0
  ) {
    lines.push({
      kind: "coverage",
      text: `${offer.coveredCountriesCount} countries covered`,
    });
  }

  const operator = planCardOperatorLabel(offer);
  if (operator) {
    lines.push({ kind: "operator", text: operator });
  }

  return lines;
}

/** Flattened card secondary copy — used by QA against production FUP payloads. */
export function planCardSecondaryText(
  offer: VesimOffer,
  options: {
    isRegionalOrGlobal: boolean;
    formatValidity: (days: number | null | undefined) => string;
  }
): string {
  return planCardSecondaryLines(offer, options)
    .map((line) => line.text)
    .join("\n");
}

/** True when text must never appear on a plan card. */
export function isForbiddenPlanCardText(
  value: string | null | undefined
): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (looksLikeFairUseOrThrottleText(v)) return true;
  if (looksLikeDataValidityDuplicate(v)) return true;
  if (VERBOSE_NETWORK_BLURB_RE.test(v)) return true;
  if (looksLikeSpeedOrDataOperatorLabel(v)) return true;
  if (looksLikeJunkOperatorLabel(v)) return true;
  if (v.length > CONCISE_OPERATOR_MAX_LEN && /\s/.test(v)) return true;
  return false;
}

/** Modal operator row — same concise preference as the card. */
export function planDetailOperatorLabel(offer: VesimOffer): string | null {
  return planCardOperatorLabel(offer);
}

/**
 * Network technology for details (e.g. 3G / 4G / 5G).
 * Prefers dataSpeeds; falls back to short tech text in packageInfo / network.
 */
export function planDetailNetworkTechnology(
  offer: VesimOffer
): string | null {
  const speeds = (offer.dataSpeeds || [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (speeds.length > 0) return speeds.join(" · ");

  for (const raw of [offer.packageInfo, offer.network]) {
    const value = (raw || "").trim();
    if (!value) continue;
    if (looksLikeFairUseOrThrottleText(value)) continue;
    if (looksLikeDataValidityDuplicate(value, offer.dataFormatted)) continue;
    if (value.length > CONCISE_OPERATOR_MAX_LEN) continue;
    if (!/^(.*\b)?(2G|3G|4G|5G|LTE|NR|Wi-?Fi)(\b.*)?$/i.test(value)) continue;
    return value;
  }
  return null;
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
 * Includes roaming carrier names when present.
 */
export function planDetailNetworkNames(offer: VesimOffer): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const roamingNames = (offer.roaming || []).flatMap(
    (entry) => entry.networks || []
  );
  for (const item of [...(offer.networks || []), ...roamingNames]) {
    if (!isConciseOperatorLabel(item)) continue;
    const key = item.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(item.trim());
    if (names.length >= 12) break;
  }
  return names;
}

/** Coverage country codes/names from structured offer fields. */
export function planDetailCoverageCountries(offer: VesimOffer): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of [
    ...(offer.coveredCountries || []),
    ...(offer.roaming || []).map((entry) => entry.country),
  ]) {
    const value = (item || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values;
}

/**
 * Remaining packageInfo for details when it is not FUP, a data/validity
 * duplicate, or the same string already used as network technology.
 */
export function planDetailPackageInfo(offer: VesimOffer): string | null {
  const packageInfo = (offer.packageInfo || "").trim();
  if (!packageInfo) return null;
  if (looksLikeDataValidityDuplicate(packageInfo, offer.dataFormatted)) {
    return null;
  }
  const fairUse = planDetailFairUseOrTerms(offer);
  if (fairUse && packageInfo === fairUse) return null;
  if (looksLikeFairUseOrThrottleText(packageInfo)) return null;
  const technology = planDetailNetworkTechnology(offer);
  if (technology && packageInfo === technology) return null;
  return packageInfo;
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
