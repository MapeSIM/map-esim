/**
 * Bounded, resumable public-offer snapshot seed helpers.
 * Never flips publicReadsOn. CLI is dry-run unless --apply.
 */
import type { PrismaClient } from "@prisma/client";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import {
  normalizePublicSnapshotOffers,
  pickSubsetConsistentHighWater,
  publicOfferIds,
} from "@/app/lib/vesim/publicOfferSnapshot";
import { applyPublicOfferSnapshotCandidate } from "@/app/lib/vesim/publicOfferSnapshotStore";

export const PUBLIC_OFFER_SEED_FETCHES = 3;
export const PUBLIC_OFFER_SEED_DELAY_MS = 750;

export type SeedFetchLive = (country: string) => Promise<VesimOffer[]>;

export type SeedDestinationResult = {
  destination: string;
  status: "applied" | "pending" | "skipped" | "dry_run";
  reason: string;
  offerCount: number | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function collectSeedSnapshots(options: {
  destination: string;
  fetchLive: SeedFetchLive;
  fetches?: number;
  delayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<VesimOffer[][]> {
  const fetches = options.fetches ?? PUBLIC_OFFER_SEED_FETCHES;
  const delayMs = options.delayMs ?? PUBLIC_OFFER_SEED_DELAY_MS;
  const sleepFn = options.sleepFn ?? sleep;
  const snapshots: VesimOffer[][] = [];
  for (let index = 0; index < fetches; index++) {
    if (index > 0 && delayMs > 0) {
      await sleepFn(delayMs);
    }
    try {
      const offers = await options.fetchLive(options.destination);
      if (Array.isArray(offers) && offers.length > 0) {
        snapshots.push(offers);
      }
    } catch {
      // Invalid/incomplete fetch is omitted from the high-water family.
    }
  }
  return snapshots;
}

export async function seedPublicOfferDestination(options: {
  client: PrismaClient;
  destination: string;
  fetchLive: SeedFetchLive;
  apply: boolean;
  fetches?: number;
  delayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<SeedDestinationResult> {
  const destination = options.destination.trim();
  const snapshots = await collectSeedSnapshots({
    destination,
    fetchLive: options.fetchLive,
    fetches: options.fetches,
    delayMs: options.delayMs,
    sleepFn: options.sleepFn,
  });
  const picked = pickSubsetConsistentHighWater(snapshots);
  if (!picked.ok) {
    return {
      destination,
      status: "skipped",
      reason: picked.reason,
      offerCount: null,
    };
  }

  const offerCount = publicOfferIds(picked.offers).length;
  if (!options.apply) {
    return {
      destination,
      status: "dry_run",
      reason: "high_water",
      offerCount,
    };
  }

  const applied = await applyPublicOfferSnapshotCandidate(options.client, {
    destinationCode: destination,
    candidate: picked.offers,
    allowInsert: true,
  });

  if (applied.outcome === "inserted" || applied.outcome === "accepted") {
    const normalized = normalizePublicSnapshotOffers(applied.offers ?? picked.offers);
    return {
      destination,
      status: "applied",
      reason: applied.reason,
      offerCount: normalized?.offerCount ?? offerCount,
    };
  }

  if (applied.outcome === "pending") {
    return {
      destination,
      status: "pending",
      reason: applied.reason,
      offerCount: applied.offers ? publicOfferIds(applied.offers).length : offerCount,
    };
  }

  return {
    destination,
    status: "skipped",
    reason: applied.reason,
    offerCount: applied.offers ? publicOfferIds(applied.offers).length : offerCount,
  };
}
