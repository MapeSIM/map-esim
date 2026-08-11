import "server-only";

import {
  PARTNERSHIP_DEDUP_WINDOW_MS,
  PARTNERSHIP_RATE_LIMIT_MAX,
  PARTNERSHIP_RATE_LIMIT_WINDOW_MS,
} from "@/app/lib/partnerships/partnershipLimits";

type Bucket = {
  count: number;
  resetAt: number;
};

const ipBuckets = new Map<string, Bucket>();
const dedupeBuckets = new Map<string, number>();

function pruneMaps(now: number): void {
  for (const [key, bucket] of ipBuckets) {
    if (bucket.resetAt <= now) ipBuckets.delete(key);
  }
  for (const [key, expiresAt] of dedupeBuckets) {
    if (expiresAt <= now) dedupeBuckets.delete(key);
  }
}

export function assertPartnershipRateLimit(ipKey: string): {
  ok: boolean;
  reason?: "rate_limited";
} {
  const now = Date.now();
  pruneMaps(now);

  const existing = ipBuckets.get(ipKey);
  if (!existing || existing.resetAt <= now) {
    ipBuckets.set(ipKey, {
      count: 1,
      resetAt: now + PARTNERSHIP_RATE_LIMIT_WINDOW_MS,
    });
    return { ok: true };
  }

  if (existing.count >= PARTNERSHIP_RATE_LIMIT_MAX) {
    return { ok: false, reason: "rate_limited" };
  }

  existing.count += 1;
  return { ok: true };
}

export function assertPartnershipNotDuplicate(contentKey: string): {
  ok: boolean;
  reason?: "duplicate";
} {
  const now = Date.now();
  pruneMaps(now);

  const expiresAt = dedupeBuckets.get(contentKey);
  if (expiresAt && expiresAt > now) {
    return { ok: false, reason: "duplicate" };
  }

  dedupeBuckets.set(contentKey, now + PARTNERSHIP_DEDUP_WINDOW_MS);
  return { ok: true };
}
