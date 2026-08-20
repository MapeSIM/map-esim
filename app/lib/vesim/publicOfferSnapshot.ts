import { createHash } from "node:crypto";
import { toPublicVesimOffer, type VesimOffer } from "@/app/lib/vesim/offers";

/** Confirmations required before a subset/incomparable set may replace last-good. */
export const PUBLIC_OFFER_PENDING_CONFIRMATIONS = 3;
/** Minimum wall time the same pending fingerprint must persist. */
export const PUBLIC_OFFER_PENDING_WINDOW_MS = 30 * 60 * 1000;
/** Public browse snapshot stale window (seconds / ms). */
export const PUBLIC_OFFER_SNAPSHOT_STALE_SECONDS = 300;
export const PUBLIC_OFFER_SNAPSHOT_STALE_MS =
  PUBLIC_OFFER_SNAPSHOT_STALE_SECONDS * 1000;
/** Refresh lease TTL — serializes writers; request path uses the GET timeout. */
export const PUBLIC_OFFER_SNAPSHOT_LEASE_MS = 30_000;
/** Hard bound for a public provider GET (below typical 10s function limit). */
export const PUBLIC_OFFER_REFRESH_TIMEOUT_MS = 4_000;
/** Flag-off / missing-table Data Cache TTL (origin/main bounded behavior). */
export const PUBLIC_OFFER_FLAG_OFF_REVALIDATE_SECONDS = 300;
/** Seeded destinations / advertised-with-offers destinations. */
export const PUBLIC_OFFER_SNAPSHOT_MIN_COVERAGE_RATIO = 0.9;
export const PUBLIC_OFFER_SNAPSHOT_REQUIRED_DESTINATIONS = [
  "PK",
  "region-asia",
  "FR",
  "JP",
  "AE",
] as const;
export const PUBLIC_OFFER_SNAPSHOT_SEED_PHRASE = "SEED PUBLIC OFFER SNAPSHOTS";
export const PUBLIC_OFFER_SNAPSHOT_ENABLE_PHRASE =
  "ENABLE PUBLIC OFFER SNAPSHOTS";
export const PUBLIC_OFFER_SNAPSHOT_DISABLE_PHRASE =
  "DISABLE PUBLIC OFFER SNAPSHOTS";
export const PUBLIC_OFFER_SNAPSHOT_ALLOWED_HOST_ENV =
  "PUBLIC_OFFER_SNAPSHOT_ALLOWED_HOST";
export const PUBLIC_OFFER_SNAPSHOT_ALLOWED_DATABASE_ENV =
  "PUBLIC_OFFER_SNAPSHOT_ALLOWED_DATABASE";

export class PublicOfferSnapshotError extends Error {
  readonly code: string;

  constructor(code: string, message = "Public offer snapshot is unavailable") {
    super(message);
    this.name = "PublicOfferSnapshotError";
    this.code = code;
  }
}

export function publicOfferIds(offers: VesimOffer[]): string[] {
  return [
    ...new Set(
      offers
        .map((offer) => (offer.offerId || offer.id || "").trim())
        .filter(Boolean)
    ),
  ].sort();
}

export function fingerprintOfferIds(ids: string[]): string {
  return createHash("sha256").update(ids.join("\n")).digest("hex");
}

export function fingerprintOfferPayload(offers: VesimOffer[]): string {
  const rows = [...offers]
    .map((offer) => {
      const id = (offer.offerId || offer.id || "").trim();
      const price =
        typeof offer.priceUSD === "number" && Number.isFinite(offer.priceUSD)
          ? offer.priceUSD
          : "";
      const duration =
        typeof offer.durationDays === "number" &&
        Number.isFinite(offer.durationDays)
          ? offer.durationDays
          : "";
      return `${id}:${price}:${duration}`;
    })
    .filter((row) => !row.startsWith(":"))
    .sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

/**
 * Dedupe by unique offer ID (first occurrence wins), strip supplier cost,
 * and compute fingerprints. Empty after normalize is invalid.
 */
export function normalizePublicSnapshotOffers(offers: VesimOffer[]): {
  offers: VesimOffer[];
  offerIds: string[];
  offerCount: number;
  idFingerprint: string;
  payloadFingerprint: string;
} | null {
  if (!Array.isArray(offers) || offers.length === 0) return null;

  const seen = new Set<string>();
  const deduped: VesimOffer[] = [];
  for (const offer of offers) {
    const id = (offer.offerId || offer.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(toPublicVesimOffer(offer));
  }

  const offerIds = [...seen].sort();
  if (offerIds.length === 0) return null;

  return {
    offers: deduped,
    offerIds,
    offerCount: offerIds.length,
    idFingerprint: fingerprintOfferIds(offerIds),
    payloadFingerprint: fingerprintOfferPayload(deduped),
  };
}

export function isValidPublicOfferSnapshot(
  offers: VesimOffer[] | null | undefined
): offers is VesimOffer[] {
  return normalizePublicSnapshotOffers(offers ?? []) != null;
}

export function storedSnapshotIntegrityMatches(options: {
  offers: VesimOffer[];
  offerIds: string[];
  offerCount: number;
  idFingerprint: string;
  payloadFingerprint: string;
}): boolean {
  const rawIds = options.offers
    .map((offer) => (offer.offerId || offer.id || "").trim())
    .filter(Boolean);
  if (rawIds.length !== new Set(rawIds).size) return false;
  if (new Set(options.offerIds).size !== options.offerIds.length) return false;

  const normalized = normalizePublicSnapshotOffers(options.offers);
  if (!normalized) return false;
  if (normalized.offerCount !== options.offerCount) return false;
  if (normalized.offerCount !== options.offerIds.length) return false;
  if (normalized.idFingerprint !== options.idFingerprint) return false;
  if (normalized.payloadFingerprint !== options.payloadFingerprint) return false;
  if (normalized.offerIds.join("\n") !== [...options.offerIds].sort().join("\n")) {
    return false;
  }
  return true;
}

export function isSubsetIdSet(inner: string[], outer: string[]): boolean {
  const outerSet = new Set(outer);
  for (const value of inner) {
    if (!outerSet.has(value)) return false;
  }
  return true;
}

export function idSetsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return isSubsetIdSet(left, right);
}

export type PublicOfferWriteDecision =
  | {
      action: "accept";
      reason: "insert" | "same_ids" | "superset" | "confirmed_pending";
      normalized: NonNullable<ReturnType<typeof normalizePublicSnapshotOffers>>;
      clearPending: boolean;
    }
  | {
      action: "pending";
      reason: "subset" | "incomparable";
      normalized: NonNullable<ReturnType<typeof normalizePublicSnapshotOffers>>;
      reset: boolean;
      nextConfirmCount: number;
    }
  | {
      action: "touch";
      reason: "empty" | "invalid";
    };

export type PublicOfferSnapshotRowView = {
  offerIds: string[];
  idFingerprint: string;
  pendingIdFingerprint: string | null;
  pendingConfirmCount: number;
  pendingFirstSeenAt: Date | null;
};

/**
 * ID-set algebra for durable public snapshots.
 * Never unions historical offers. Request path must not call this with
 * current=null (that is seed insert only).
 */
export function decidePublicOfferSnapshotWrite(options: {
  current: PublicOfferSnapshotRowView | null;
  candidate: VesimOffer[] | null;
  now?: Date;
}): PublicOfferWriteDecision {
  const normalized = normalizePublicSnapshotOffers(options.candidate ?? []);
  const candidateEmpty =
    Array.isArray(options.candidate) && options.candidate.length === 0;
  if (!normalized) {
    return { action: "touch", reason: candidateEmpty ? "empty" : "invalid" };
  }

  const current = options.current;
  if (!current || current.offerIds.length === 0) {
    return {
      action: "accept",
      reason: "insert",
      normalized,
      clearPending: true,
    };
  }

  const currentIds = current.offerIds;
  const candidateIds = normalized.offerIds;
  const now = options.now ?? new Date();

  if (idSetsEqual(currentIds, candidateIds)) {
    return {
      action: "accept",
      reason: "same_ids",
      normalized,
      clearPending: true,
    };
  }

  if (isSubsetIdSet(currentIds, candidateIds)) {
    return {
      action: "accept",
      reason: "superset",
      normalized,
      clearPending: true,
    };
  }

  const pendingReason: "subset" | "incomparable" = isSubsetIdSet(
    candidateIds,
    currentIds
  )
    ? "subset"
    : "incomparable";

  const samePending =
    current.pendingIdFingerprint != null &&
    current.pendingIdFingerprint === normalized.idFingerprint;
  const nextConfirmCount = samePending ? current.pendingConfirmCount + 1 : 1;
  const firstSeen = samePending
    ? current.pendingFirstSeenAt ?? now
    : now;
  const elapsed = now.getTime() - firstSeen.getTime();
  const confirmed =
    nextConfirmCount >= PUBLIC_OFFER_PENDING_CONFIRMATIONS &&
    elapsed >= PUBLIC_OFFER_PENDING_WINDOW_MS;

  if (confirmed) {
    return {
      action: "accept",
      reason: "confirmed_pending",
      normalized,
      clearPending: true,
    };
  }

  return {
    action: "pending",
    reason: pendingReason,
    normalized,
    reset: !samePending,
    nextConfirmCount,
  };
}

/**
 * Choose one high-water snapshot among subset-consistent fetches.
 * Incomparable sets (neither is a subset of the other) skip the destination.
 */
export function pickSubsetConsistentHighWater(
  snapshots: VesimOffer[][]
): { ok: true; offers: VesimOffer[] } | { ok: false; reason: "none" | "incomparable" } {
  const normalized = snapshots
    .map((offers) => normalizePublicSnapshotOffers(offers))
    .filter(
      (
        value
      ): value is NonNullable<ReturnType<typeof normalizePublicSnapshotOffers>> =>
        value != null
    );

  if (normalized.length === 0) {
    return { ok: false, reason: "none" };
  }

  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i].offerIds;
      const b = normalized[j].offerIds;
      if (idSetsEqual(a, b)) continue;
      if (!isSubsetIdSet(a, b) && !isSubsetIdSet(b, a)) {
        return { ok: false, reason: "incomparable" };
      }
    }
  }

  let best = normalized[0];
  for (const candidate of normalized.slice(1)) {
    if (candidate.offerCount > best.offerCount) {
      best = candidate;
    }
  }
  return { ok: true, offers: best.offers };
}
