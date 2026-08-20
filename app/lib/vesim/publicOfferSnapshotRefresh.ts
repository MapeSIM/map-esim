/**
 * Public browse load + leased refresh against durable Postgres snapshots.
 * Checkout/admin never call this module.
 *
 * Deployment order (do not skip):
 * 1. verified Production backup
 * 2. apply unpublished migration while old app remains live
 * 3. confirm old app still works
 * 4. push/deploy with publicReadsOn=false
 * 5. guarded seed dry-run, then approved --apply
 * 6. verify coverage and PK/Asia/FR/JP/AE counts
 * 7. guarded CAS enable
 * 8. Production reload/count smoke
 * 9. rollback anytime through guarded disable
 */
import type { PrismaClient } from "@prisma/client";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import { logPublicOfferSnapshotFailure } from "@/app/lib/vesim/publicOfferSnapshotGuard";
import {
  PUBLIC_OFFER_REFRESH_TIMEOUT_MS,
  PUBLIC_OFFER_SNAPSHOT_STALE_MS,
  PublicOfferSnapshotError,
  isValidPublicOfferSnapshot,
} from "@/app/lib/vesim/publicOfferSnapshot";
import {
  applyPublicOfferSnapshotCandidate,
  claimPublicOfferSnapshotLease,
  isPublicOfferSnapshotStale,
  parseStoredPublicOffers,
  readPublicDestinationOfferSnapshot,
  readPublicOfferSnapshotControl,
  releasePublicOfferSnapshotLease,
  touchPublicOfferSnapshotCheck,
} from "@/app/lib/vesim/publicOfferSnapshotStore";

export type PublicOfferLiveFetcher = (
  country: string,
  options?: { signal?: AbortSignal }
) => Promise<VesimOffer[]>;

export async function withPublicOfferRefreshTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs = PUBLIC_OFFER_REFRESH_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;
  const workPromise = work(signal);
  const timeout = new Promise<never>((_, reject) => {
    const abort = () => reject(new PublicOfferSnapshotError("timeout"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([workPromise, timeout]);
  } catch (error) {
    void workPromise.catch(() => undefined);
    if (error instanceof PublicOfferSnapshotError && error.code === "timeout") {
      throw error;
    }
    if (
      signal.aborted ||
      (error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError"))
    ) {
      throw new PublicOfferSnapshotError("timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function createBoundedPublicOfferTtlCache(options: {
  fetchLive: PublicOfferLiveFetcher;
  ttlMs: number;
  now?: () => number;
}): {
  load: PublicOfferLiveFetcher;
  generations: Map<string, number>;
} {
  const generations = new Map<string, number>();
  const entries = new Map<string, { offers: VesimOffer[]; expiresAt: number }>();
  const now = options.now ?? Date.now;
  return {
    generations,
    async load(country: string) {
      const key = country.trim();
      const current = now();
      const hit = entries.get(key);
      if (hit && hit.expiresAt > current) {
        return hit.offers;
      }
      generations.set(key, (generations.get(key) ?? 0) + 1);
      const offers = await options.fetchLive(key);
      entries.set(key, { offers, expiresAt: current + options.ttlMs });
      return offers;
    },
  };
}

async function fetchLiveBounded(
  fetchLive: PublicOfferLiveFetcher,
  country: string,
  timeoutMs: number
): Promise<VesimOffer[]> {
  return withPublicOfferRefreshTimeout(
    (signal) => fetchLive(country, { signal }),
    timeoutMs
  );
}

type LeaseCleanup = (
  destinationCode: string,
  claimToken: string
) => Promise<void>;

async function bestEffortLeaseCleanup(
  destinationCode: string,
  claimToken: string,
  now: Date,
  client: PrismaClient,
  releaseLease: LeaseCleanup
): Promise<void> {
  try {
    await touchPublicOfferSnapshotCheck(client, {
      destinationCode,
      now,
      claimToken,
    });
  } catch (error) {
    logPublicOfferSnapshotFailure("refresh_backoff", "touch_failed");
    void error;
  }
  try {
    await releaseLease(destinationCode, claimToken);
  } catch (error) {
    logPublicOfferSnapshotFailure("lease_release", "failed");
    void error;
  }
}

async function refreshLeasedPublicOfferSnapshot(options: {
  client: PrismaClient;
  destinationCode: string;
  fetchLive: PublicOfferLiveFetcher;
  now: Date;
  claimToken: string;
  timeoutMs?: number;
  releaseLease?: LeaseCleanup;
}): Promise<{ payloadReplaced: boolean; offers: VesimOffer[] | null }> {
  const {
    client,
    destinationCode,
    fetchLive,
    now,
    claimToken,
    timeoutMs = PUBLIC_OFFER_REFRESH_TIMEOUT_MS,
  } = options;
  const releaseLease =
    options.releaseLease ??
    ((code: string, token: string) =>
      releasePublicOfferSnapshotLease(client, code, token));

  try {
    let candidate: VesimOffer[] | null = null;
    let failed = false;
    try {
      const live = await fetchLiveBounded(fetchLive, destinationCode, timeoutMs);
      candidate = isValidPublicOfferSnapshot(live) ? live : [];
    } catch (error) {
      failed = true;
      if (
        error instanceof PublicOfferSnapshotError &&
        error.code === "timeout"
      ) {
        logPublicOfferSnapshotFailure("refresh", "timeout");
      } else {
        logPublicOfferSnapshotFailure("refresh", "provider");
      }
    }

    const applied = await applyPublicOfferSnapshotCandidate(client, {
      destinationCode,
      candidate,
      now,
      claimToken,
      error: failed,
      allowInsert: false,
    });
    try {
      await releaseLease(destinationCode, claimToken);
    } catch {
      logPublicOfferSnapshotFailure("lease_release", "failed");
    }
    return {
      payloadReplaced: applied.payloadReplaced,
      offers: applied.offers,
    };
  } catch {
    await bestEffortLeaseCleanup(
      destinationCode,
      claimToken,
      now,
      client,
      releaseLease
    );
    return { payloadReplaced: false, offers: null };
  }
}

/**
 * Flag-off / missing-table: bounded cached strict fetch (no process Map).
 * Flag-on: PostgreSQL snapshot only. Missing/malformed → throw (API 503).
 * Timeout/provider/CAS/lease-release failures return the last-good snapshot.
 * Never cold-inserts from the request path when publicReadsOn=true.
 */
export async function loadPublicOffersForCountry(options: {
  client: PrismaClient;
  country: string;
  fetchLive: PublicOfferLiveFetcher;
  loadFlagOffCached: PublicOfferLiveFetcher;
  now?: Date;
  timeoutMs?: number;
  releaseLease?: LeaseCleanup;
}): Promise<VesimOffer[]> {
  const country = options.country.trim();
  if (!country) {
    throw new PublicOfferSnapshotError("invalid_country");
  }

  const now = options.now ?? new Date();
  const control = await readPublicOfferSnapshotControl(options.client);

  if (!control.ok || !control.publicReadsOn) {
    const cached = await options.loadFlagOffCached(country);
    if (!isValidPublicOfferSnapshot(cached)) {
      throw new PublicOfferSnapshotError("empty");
    }
    return cached;
  }

  let row;
  try {
    row = await readPublicDestinationOfferSnapshot(options.client, country);
  } catch (error) {
    logPublicOfferSnapshotFailure("snapshot_read", "failed");
    void error;
    throw new PublicOfferSnapshotError("unavailable");
  }

  const stored = parseStoredPublicOffers(row);
  if (!row || !stored) {
    throw new PublicOfferSnapshotError(row ? "malformed" : "missing");
  }

  if (!isPublicOfferSnapshotStale(row, now, PUBLIC_OFFER_SNAPSHOT_STALE_MS)) {
    return stored;
  }

  let lease: { ok: true; claimToken: string } | { ok: false };
  try {
    lease = await claimPublicOfferSnapshotLease(
      options.client,
      country,
      now
    );
  } catch (error) {
    logPublicOfferSnapshotFailure("lease_claim", "failed");
    void error;
    return stored;
  }
  if (!lease.ok) {
    return stored;
  }

  try {
    const refreshed = await refreshLeasedPublicOfferSnapshot({
      client: options.client,
      destinationCode: country,
      fetchLive: options.fetchLive,
      now,
      claimToken: lease.claimToken,
      timeoutMs: options.timeoutMs,
      releaseLease: options.releaseLease,
    });
    if (refreshed.payloadReplaced && refreshed.offers) {
      return refreshed.offers;
    }
    return stored;
  } catch {
    logPublicOfferSnapshotFailure("refresh", "uncaught");
    return stored;
  }
}
