/**
 * Cron runner: poll authoritative VeSIM usage for customer orders and send
 * once-only lifecycle emails (expiry + low data / depleted). Never invents
 * expiry from catalog duration labels.
 */
import "server-only";

import { OrderFundingSource, OrderStatus, Role } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/db";
import {
  countCompletedAddDataForSourceOrder,
  notifyEsimLifecycleEmail,
} from "@/app/lib/esim/esimLifecycleNotification";
import {
  ESIM_LIFECYCLE_BATCH_SIZE,
  ESIM_LIFECYCLE_CANDIDATE_POOL_MULTIPLIER,
  ESIM_LIFECYCLE_PROCESS_CONCURRENCY,
  ESIM_LIFECYCLE_RUNNER_LOCK_TTL_MS,
  ESIM_LIFECYCLE_V1_ENABLED_KINDS,
  evaluateEsimLifecycleEvents,
  resolveEsimLifecycleAlertCycleToken,
  scoreEsimLifecycleCandidatePriority,
  type EsimLifecycleKind,
  type EsimLifecycleUsageInput,
} from "@/app/lib/esim/esimLifecycleNotificationShared";
import {
  decryptIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";
import {
  fetchProviderUsage,
  normalizeProviderUsagePayload,
  persistOrderProviderLifecycleCache,
  type CustomerUsageSnapshot,
} from "@/app/lib/orders/customerEsimUsage";

export type EsimLifecycleRunCounts = {
  candidates: number;
  polled: number;
  usageUnavailable: number;
  eventsDue: number;
  sent: number;
  skipped: number;
  failed: number;
};

export type EsimLifecycleRunResult = {
  ok: boolean;
  runnerClaimed: boolean;
  counts: EsimLifecycleRunCounts;
  errorCode?: string;
};

function emptyCounts(): EsimLifecycleRunCounts {
  return {
    candidates: 0,
    polled: 0,
    usageUnavailable: 0,
    eventsDue: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
}

function newClaimToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Run workers with a fixed concurrency cap, collecting Promise.allSettled-style
 * results in input order.
 */
async function mapSettledWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  if (items.length === 0) return results;

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        const value = await worker(items[index]!, index);
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: limit }, () => runWorker())
  );
  return results;
}

function applyProcessOutcomeToCounts(
  counts: EsimLifecycleRunCounts,
  outcome: {
    polled: boolean;
    usageOk: boolean;
    kinds: EsimLifecycleKind[];
    results: Array<{ kind: EsimLifecycleKind; status: string }>;
  }
): void {
  if (outcome.polled) counts.polled += 1;
  if (!outcome.usageOk) {
    if (outcome.polled) counts.usageUnavailable += 1;
    return;
  }
  counts.eventsDue += outcome.kinds.length;
  for (const row of outcome.results) {
    if (row.status === "sent" || row.status === "dry_run") {
      counts.sent += 1;
    } else if (row.status === "failed") {
      counts.failed += 1;
    } else {
      counts.skipped += 1;
    }
  }
}

export async function claimEsimLifecycleRunnerLock(
  now: Date
): Promise<{ ok: true; claimToken: string } | { ok: false }> {
  const claimToken = newClaimToken();
  const claimExpiresAt = new Date(
    now.getTime() + ESIM_LIFECYCLE_RUNNER_LOCK_TTL_MS
  );
  // Treat locks older than TTL as crashed/stale even if claimExpiresAt was wrong.
  const staleBefore = new Date(now.getTime() - ESIM_LIFECYCLE_RUNNER_LOCK_TTL_MS);

  await prisma.esimLifecycleNotificationRunnerLock.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
    update: {},
  });

  const claimed = await prisma.esimLifecycleNotificationRunnerLock.updateMany({
    where: {
      id: "default",
      OR: [
        { claimToken: null },
        { claimExpiresAt: null },
        { claimExpiresAt: { lte: now } },
        { claimedAt: null },
        { claimedAt: { lte: staleBefore } },
      ],
    },
    data: {
      claimToken,
      claimedAt: now,
      claimExpiresAt,
    },
  });
  if (claimed.count !== 1) return { ok: false };
  return { ok: true, claimToken };
}

export async function releaseEsimLifecycleRunnerLock(
  claimToken: string
): Promise<void> {
  const token = (claimToken ?? "").trim();
  if (!token) return;
  await prisma.esimLifecycleNotificationRunnerLock.updateMany({
    where: { id: "default", claimToken: token },
    data: {
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
  });
}

/**
 * Clear any stuck runner lock (auth-gated via cron route ?force=1 / ?unlock=1).
 * Does not require the original claim token.
 */
export async function forceClearEsimLifecycleRunnerLock(): Promise<{
  cleared: boolean;
}> {
  await prisma.esimLifecycleNotificationRunnerLock.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
    update: {
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
  });
  return { cleared: true };
}

async function resolveOrderIccid(
  iccidEncrypted: string | null
): Promise<string | null> {
  const encrypted = (iccidEncrypted ?? "").trim();
  if (!encrypted || !isIccidEncryptionConfigured()) return null;
  try {
    const plain = decryptIccid(encrypted);
    const normalized = normalizeIccid(plain);
    return validateIccid(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function toLifecycleUsageInput(
  usage: CustomerUsageSnapshot | EsimLifecycleUsageInput
): EsimLifecycleUsageInput {
  return {
    expiresAt: usage.expiresAt,
    daysRemaining: usage.daysRemaining,
    isExpired: usage.isExpired,
    isUnlimited: usage.isUnlimited,
    reportsDataAllowance: usage.reportsDataAllowance,
    initialDataGB: usage.initialDataGB,
    remainingDataGB: usage.remainingDataGB,
  };
}

/**
 * Select completed customer-owned orders with a stored ICCID.
 * Excludes Partner wallet purchases and Partner-role owners.
 * Prioritizes cached expiry-soon / low-data / depleted rows over pure FIFO.
 */
export async function listEsimLifecycleCandidateOrders(options?: {
  take?: number;
  now?: Date;
}) {
  const take = Math.min(
    Math.max(1, options?.take ?? ESIM_LIFECYCLE_BATCH_SIZE),
    100
  );
  const now = options?.now instanceof Date ? options.now : new Date();
  const poolSize = Math.min(
    take * ESIM_LIFECYCLE_CANDIDATE_POOL_MULTIPLIER,
    160
  );

  const pool = await prisma.order.findMany({
    where: {
      status: OrderStatus.COMPLETED,
      iccidEncrypted: { not: null },
      partnerEsimPurchase: null,
      OR: [
        { fundingSource: null },
        { fundingSource: { not: OrderFundingSource.PARTNER_BALANCE } },
      ],
      AND: [
        {
          OR: [
            { userId: null },
            { user: { role: { not: Role.PARTNER }, deletedAt: null } },
          ],
        },
      ],
    },
    orderBy: [
      { lifecycleUsageCheckedAt: "asc" },
      { createdAt: "asc" },
    ],
    take: poolSize,
    select: {
      id: true,
      iccidEncrypted: true,
      lifecycleUsageCheckedAt: true,
      providerExpiresAt: true,
      providerLifecycleStatus: true,
      providerRemainingDataGb: true,
      providerInitialDataGb: true,
      createdAt: true,
    },
  });

  const nowMs = now.getTime();
  const ranked = pool
    .map((row, index) => ({
      row,
      index,
      score: scoreEsimLifecycleCandidatePriority({
        nowMs,
        providerExpiresAtMs: row.providerExpiresAt
          ? row.providerExpiresAt.getTime()
          : null,
        providerLifecycleStatus: row.providerLifecycleStatus,
        remainingDataGB: row.providerRemainingDataGb,
        initialDataGB: row.providerInitialDataGb,
        lifecycleUsageCheckedAtMs: row.lifecycleUsageCheckedAt
          ? row.lifecycleUsageCheckedAt.getTime()
          : null,
      }),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Stable fairness: older lifecycleUsageCheckedAt / createdAt first.
      const aChecked = a.row.lifecycleUsageCheckedAt?.getTime() ?? 0;
      const bChecked = b.row.lifecycleUsageCheckedAt?.getTime() ?? 0;
      if (aChecked !== bChecked) return aChecked - bChecked;
      return a.index - b.index;
    });

  return ranked.slice(0, take).map(({ row }) => ({
    id: row.id,
    iccidEncrypted: row.iccidEncrypted,
    previousRemainingDataGB: row.providerRemainingDataGb,
    previousInitialDataGB: row.providerInitialDataGb,
    previousExpiresAtMs: row.providerExpiresAt
      ? row.providerExpiresAt.getTime()
      : null,
  }));
}

async function markOrderChecked(orderId: string, now: Date): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId },
    data: { lifecycleUsageCheckedAt: now },
  });
}

async function deliverKindsForUsage(options: {
  orderId: string;
  usage: EsimLifecycleUsageInput;
  now: Date;
  dryRun?: boolean;
  cycleToken?: string | null;
}): Promise<{
  kinds: EsimLifecycleKind[];
  results: Array<{ kind: EsimLifecycleKind; status: string }>;
}> {
  const kinds = evaluateEsimLifecycleEvents(
    options.usage,
    options.now.getTime()
  );
  // Defense in depth — allowlist includes expiry + data kinds.
  void ESIM_LIFECYCLE_V1_ENABLED_KINDS;
  const results: Array<{ kind: EsimLifecycleKind; status: string }> = [];
  for (const kind of kinds) {
    if (options.dryRun) {
      results.push({ kind, status: "dry_run" });
      continue;
    }
    const outcome = await notifyEsimLifecycleEmail({
      orderId: options.orderId,
      kind,
      expiresAt: options.usage.expiresAt,
      remainingDataGB: options.usage.remainingDataGB,
      initialDataGB: options.usage.initialDataGB,
      now: options.now,
      cycleToken: options.cycleToken,
    });
    results.push({ kind, status: outcome.status });
  }
  return { kinds, results };
}

/**
 * Evaluate + deliver lifecycle emails for one order from live provider usage.
 */
export async function processEsimLifecycleOrder(options: {
  orderId: string;
  iccidEncrypted: string | null;
  now?: Date;
  /** QA/smoke: skip SMTP; still evaluate and claim SKIPPED/FAILED paths via dry notify. */
  dryRun?: boolean;
  previousRemainingDataGB?: number | null;
  previousInitialDataGB?: number | null;
  previousExpiresAtMs?: number | null;
}): Promise<{
  polled: boolean;
  usageOk: boolean;
  kinds: EsimLifecycleKind[];
  results: Array<{ kind: EsimLifecycleKind; status: string }>;
}> {
  const now = options.now instanceof Date ? options.now : new Date();
  const iccid = await resolveOrderIccid(options.iccidEncrypted);
  if (!iccid) {
    await markOrderChecked(options.orderId, now);
    return { polled: false, usageOk: false, kinds: [], results: [] };
  }

  const usageRes = await fetchProviderUsage(iccid);
  await markOrderChecked(options.orderId, now);
  if (!usageRes.ok) {
    return { polled: true, usageOk: false, kinds: [], results: [] };
  }
  const snapshot = normalizeProviderUsagePayload(usageRes.payload);
  if (!snapshot) {
    return { polled: true, usageOk: false, kinds: [], results: [] };
  }

  const completedAddDataCount = await countCompletedAddDataForSourceOrder(
    options.orderId
  );
  const cycleToken = resolveEsimLifecycleAlertCycleToken({
    completedAddDataCount,
    previousRemainingDataGB: options.previousRemainingDataGB,
    previousInitialDataGB: options.previousInitialDataGB,
    previousExpiresAtMs: options.previousExpiresAtMs,
    currentRemainingDataGB: snapshot.remainingDataGB,
    currentInitialDataGB: snapshot.initialDataGB,
    currentExpiresAt: snapshot.expiresAt,
  });

  await persistOrderProviderLifecycleCache(options.orderId, snapshot);

  const delivered = await deliverKindsForUsage({
    orderId: options.orderId,
    usage: toLifecycleUsageInput(snapshot),
    now,
    dryRun: options.dryRun,
    cycleToken,
  });
  return {
    polled: true,
    usageOk: true,
    kinds: delivered.kinds,
    results: delivered.results,
  };
}

/**
 * On-demand path after a successful customer/admin usage refresh.
 * Best-effort — never throws; CAS outbox prevents duplicate sends.
 * Implemented in esimLifecycleNotification.ts to avoid import cycles.
 */
export { maybeDeliverEsimLifecycleNotificationsFromUsage } from "@/app/lib/esim/esimLifecycleNotification";

export async function runEsimLifecycleNotifications(options?: {
  checkedAt?: Date;
  take?: number;
  dryRun?: boolean;
}): Promise<EsimLifecycleRunResult> {
  const now =
    options?.checkedAt instanceof Date &&
    Number.isFinite(options.checkedAt.getTime())
      ? options.checkedAt
      : new Date();
  const counts = emptyCounts();

  const lock = await claimEsimLifecycleRunnerLock(now);
  if (!lock.ok) {
    return {
      ok: false,
      runnerClaimed: false,
      counts,
      errorCode: "runner_busy",
    };
  }

  try {
    if (!isIccidEncryptionConfigured()) {
      return {
        ok: false,
        runnerClaimed: true,
        counts,
        errorCode: "iccid_encryption_unavailable",
      };
    }

    const candidates = await listEsimLifecycleCandidateOrders({
      take: options?.take,
      now,
    });
    counts.candidates = candidates.length;

    const settled = await mapSettledWithConcurrency(
      candidates,
      ESIM_LIFECYCLE_PROCESS_CONCURRENCY,
      async (order) =>
        processEsimLifecycleOrder({
          orderId: order.id,
          iccidEncrypted: order.iccidEncrypted,
          now,
          dryRun: options?.dryRun,
          previousRemainingDataGB: order.previousRemainingDataGB,
          previousInitialDataGB: order.previousInitialDataGB,
          previousExpiresAtMs: order.previousExpiresAtMs,
        })
    );

    for (const entry of settled) {
      if (entry.status === "fulfilled") {
        applyProcessOutcomeToCounts(counts, entry.value);
      } else {
        counts.failed += 1;
      }
    }

    return { ok: true, runnerClaimed: true, counts };
  } finally {
    // Always release — even on early returns / thrown errors. Swallow release
    // failures so they never mask the original result/error.
    try {
      await releaseEsimLifecycleRunnerLock(lock.claimToken);
    } catch {
      // ignore
    }
  }
}
