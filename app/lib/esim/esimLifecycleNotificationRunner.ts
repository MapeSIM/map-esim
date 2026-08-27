/**
 * Cron runner: poll authoritative VeSIM usage for customer orders and send
 * once-only lifecycle emails. Never invents expiry from catalog duration labels.
 */
import "server-only";

import { OrderFundingSource, OrderStatus, Role } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/db";
import { notifyEsimLifecycleEmail } from "@/app/lib/esim/esimLifecycleNotification";
import {
  ESIM_LIFECYCLE_BATCH_SIZE,
  ESIM_LIFECYCLE_RUNNER_LOCK_TTL_MS,
  ESIM_LIFECYCLE_V1_ENABLED_KINDS,
  evaluateEsimLifecycleEvents,
  type EsimLifecycleKind,
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

export async function claimEsimLifecycleRunnerLock(
  now: Date
): Promise<{ ok: true; claimToken: string } | { ok: false }> {
  const claimToken = newClaimToken();
  const claimExpiresAt = new Date(
    now.getTime() + ESIM_LIFECYCLE_RUNNER_LOCK_TTL_MS
  );
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
  await prisma.esimLifecycleNotificationRunnerLock.updateMany({
    where: { id: "default", claimToken },
    data: {
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
  });
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

/**
 * Select completed customer-owned orders with a stored ICCID.
 * Excludes Partner wallet purchases and Partner-role owners.
 */
export async function listEsimLifecycleCandidateOrders(options?: {
  take?: number;
}) {
  const take = Math.min(
    Math.max(1, options?.take ?? ESIM_LIFECYCLE_BATCH_SIZE),
    100
  );
  return prisma.order.findMany({
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
    take,
    select: {
      id: true,
      iccidEncrypted: true,
    },
  });
}

async function markOrderChecked(orderId: string, now: Date): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId },
    data: { lifecycleUsageCheckedAt: now },
  });
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
}): Promise<{
  polled: boolean;
  usageOk: boolean;
  kinds: EsimLifecycleKind[];
  results: Array<{ kind: EsimLifecycleKind; status: string }>;
}> {
  const now = options.now instanceof Date ? options.now : new Date();
  const results: Array<{ kind: EsimLifecycleKind; status: string }> = [];
  const iccid = await resolveOrderIccid(options.iccidEncrypted);
  if (!iccid) {
    await markOrderChecked(options.orderId, now);
    return { polled: false, usageOk: false, kinds: [], results };
  }

  const usageRes = await fetchProviderUsage(iccid);
  await markOrderChecked(options.orderId, now);
  if (!usageRes.ok) {
    return { polled: true, usageOk: false, kinds: [], results };
  }
  const snapshot = normalizeProviderUsagePayload(usageRes.payload);
  if (!snapshot) {
    return { polled: true, usageOk: false, kinds: [], results };
  }

  const kinds = evaluateEsimLifecycleEvents(snapshot, now.getTime());
  // Defense in depth: V1 allowlist (expiry only). Data helpers are not called here.
  void ESIM_LIFECYCLE_V1_ENABLED_KINDS;
  for (const kind of kinds) {
    if (options.dryRun) {
      results.push({ kind, status: "dry_run" });
      continue;
    }
    const outcome = await notifyEsimLifecycleEmail({
      orderId: options.orderId,
      kind,
      expiresAt: snapshot.expiresAt,
      remainingDataGB: snapshot.remainingDataGB,
      initialDataGB: snapshot.initialDataGB,
      now,
    });
    results.push({ kind, status: outcome.status });
  }
  return { polled: true, usageOk: true, kinds, results };
}

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
    });
    counts.candidates = candidates.length;

    for (const order of candidates) {
      try {
        const outcome = await processEsimLifecycleOrder({
          orderId: order.id,
          iccidEncrypted: order.iccidEncrypted,
          now,
          dryRun: options?.dryRun,
        });
        if (outcome.polled) counts.polled += 1;
        if (!outcome.usageOk) {
          if (outcome.polled) counts.usageUnavailable += 1;
          continue;
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
      } catch {
        counts.failed += 1;
      }
    }

    return { ok: true, runnerClaimed: true, counts };
  } finally {
    await releaseEsimLifecycleRunnerLock(lock.claimToken);
  }
}
