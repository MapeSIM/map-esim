/**
 * Server-only durable alert notification state + delivery outbox CAS (Part B2).
 */
import "server-only";

import {
  AlertNotificationDeliveryStatus,
  AlertNotificationEventType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  ALERT_NOTIFICATION_CLAIM_TTL_MS,
  ALERT_NOTIFICATION_MAX_ATTEMPTS,
  ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS,
  ALERT_NOTIFICATION_RUNNER_LOCK_TTL_MS,
  buildDeliveryEventKey,
  cooldownElapsed,
  maskInternalReference,
  nextRetryAt,
  normalizeOpaqueErrorCode,
  parseAlertIdParts,
  reminderCooldownBucket,
  sanitizeSourceType,
  type AlertNotificationErrorCode,
} from "@/app/lib/admin/alertNotificationShared";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import type { MonitoringAlert } from "@/app/lib/admin/monitoringAlertShared";
import { newClaimToken } from "@/app/lib/admin/alertNotificationDelivery";

export async function claimAlertNotificationRunnerLock(
  now: Date
): Promise<{ ok: true; claimToken: string } | { ok: false }> {
  const claimToken = newClaimToken();
  const claimExpiresAt = new Date(
    now.getTime() + ALERT_NOTIFICATION_RUNNER_LOCK_TTL_MS
  );
  await prisma.alertNotificationRunnerLock.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
    update: {},
  });

  const claimed = await prisma.alertNotificationRunnerLock.updateMany({
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

export async function releaseAlertNotificationRunnerLock(
  claimToken: string
): Promise<void> {
  await prisma.alertNotificationRunnerLock.updateMany({
    where: { id: "default", claimToken },
    data: {
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
  });
}

function sourceMeta(alert: MonitoringAlert) {
  const parts = parseAlertIdParts(alert.id);
  return {
    sourceType: sanitizeSourceType(parts.sourceType),
    sourceRecordRef: maskInternalReference(parts.recordId),
  };
}

/**
 * Upsert active alerts into lifecycle state.
 * One findMany + Promise.all writes (no per-alert findUnique N+1).
 * Reactivation after resolve increments activationSequence (new cycle).
 */
export async function syncActiveAlertNotificationStates(input: {
  alerts: MonitoringAlert[];
  checkedAt: Date;
  /** Hard cap — keep ≤3 on the hot alert-run path. */
  maxAlerts?: number;
}): Promise<void> {
  const max =
    typeof input.maxAlerts === "number" && Number.isFinite(input.maxAlerts)
      ? Math.max(1, Math.floor(input.maxAlerts))
      : input.alerts.length;
  const alerts = input.alerts.slice(0, max);
  if (!alerts.length) return;

  const existingRows = await prisma.alertNotificationState.findMany({
    where: { alertId: { in: alerts.map((a) => a.id) } },
  });
  const existingById = new Map(existingRows.map((row) => [row.alertId, row]));

  await Promise.all(
    alerts.map(async (alert) => {
      const meta = sourceMeta(alert);
      const existing = existingById.get(alert.id);

      if (!existing) {
        await prisma.alertNotificationState.create({
          data: {
            alertId: alert.id,
            alertCode: alert.code,
            severity: alert.severity,
            category: alert.category,
            sourceType: meta.sourceType,
            sourceRecordRef: meta.sourceRecordRef,
            isActive: true,
            activationSequence: 1,
            firstSeenAt: input.checkedAt,
            lastSeenAt: input.checkedAt,
            activatedAt: input.checkedAt,
            resolvedAt: null,
            recoveryNotifiedAt: null,
          },
        });
        return;
      }

      if (!existing.isActive) {
        // Genuine reactivation → new activation cycle.
        await prisma.alertNotificationState.update({
          where: { alertId: alert.id },
          data: {
            alertCode: alert.code,
            severity: alert.severity,
            category: alert.category,
            sourceType: meta.sourceType,
            sourceRecordRef: meta.sourceRecordRef,
            isActive: true,
            activationSequence: existing.activationSequence + 1,
            lastSeenAt: input.checkedAt,
            activatedAt: input.checkedAt,
            resolvedAt: null,
            lastNotifiedAt: null,
            nextReminderAt: null,
            recoveryNotifiedAt: null,
          },
        });
        return;
      }

      await prisma.alertNotificationState.update({
        where: { alertId: alert.id },
        data: {
          alertCode: alert.code,
          severity: alert.severity,
          category: alert.category,
          sourceType: meta.sourceType,
          sourceRecordRef: meta.sourceRecordRef,
          lastSeenAt: input.checkedAt,
        },
      });
    })
  );
}

/**
 * Mark previously-active alerts resolved only when the snapshot is complete.
 * Single updateMany — no per-row N+1 updates.
 */
export async function resolveMissingAlertNotificationStates(input: {
  activeAlertIds: Set<string>;
  checkedAt: Date;
  snapshotComplete: boolean;
  /** Unused hard cap kept for call-site compatibility. */
  maxResolve?: number;
}): Promise<number> {
  if (!input.snapshotComplete) return 0;
  const activeIds = [...input.activeAlertIds];
  const result = await prisma.alertNotificationState.updateMany({
    where: {
      isActive: true,
      ...(activeIds.length ? { alertId: { notIn: activeIds } } : {}),
    },
    data: {
      isActive: false,
      resolvedAt: input.checkedAt,
      nextReminderAt: null,
    },
  });
  return result.count;
}

export async function ensureDeliveryEvent(input: {
  alertId: string;
  activationSequence: number;
  eventType: AlertNotificationEventType;
  reminderBucket?: number;
  checkedAt: Date;
}): Promise<{ created: boolean; eventKey: string }> {
  const eventKey = buildDeliveryEventKey(input);
  const existing = await prisma.alertNotificationDelivery.findUnique({
    where: { eventKey },
    select: { id: true },
  });
  if (existing) return { created: false, eventKey };
  try {
    await prisma.alertNotificationDelivery.create({
      data: {
        eventKey,
        alertId: input.alertId,
        activationSequence: input.activationSequence,
        eventType: input.eventType,
        status: AlertNotificationDeliveryStatus.PENDING,
        attemptCount: 0,
        nextAttemptAt: input.checkedAt,
      },
    });
    return { created: true, eventKey };
  } catch (error) {
    // Concurrent create race — unique eventKey still suppresses duplicates.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { created: false, eventKey };
    }
    throw error;
  }
}

export async function scheduleEligibleDeliveries(input: {
  eligibleAlertIds: Set<string>;
  checkedAt: Date;
  snapshotComplete: boolean;
  /** Hard cap — never scan the full AlertNotificationState table unbounded. */
  maxStates?: number;
}): Promise<{
  initialCreated: number;
  reminderCreated: number;
  recoveryCreated: number;
  cooldownSuppressed: number;
}> {
  let cooldownSuppressed = 0;

  const maxStates =
    typeof input.maxStates === "number" && Number.isFinite(input.maxStates)
      ? Math.max(1, Math.floor(input.maxStates))
      : 50;
  const eligibleIds = [...input.eligibleAlertIds].slice(0, maxStates);

  // Bound query: eligible actives + a small recovery candidate set. Never findMany().
  const whereOr: Prisma.AlertNotificationStateWhereInput[] = [];
  if (eligibleIds.length) {
    whereOr.push({ alertId: { in: eligibleIds } });
  }
  if (input.snapshotComplete) {
    whereOr.push({
      isActive: false,
      lastNotifiedAt: { not: null },
      recoveryNotifiedAt: null,
    });
  }
  if (!whereOr.length) {
    return {
      initialCreated: 0,
      reminderCreated: 0,
      recoveryCreated: 0,
      cooldownSuppressed: 0,
    };
  }

  const states = await prisma.alertNotificationState.findMany({
    where: { OR: whereOr },
    orderBy: { updatedAt: "desc" },
    take: maxStates,
  });

  type PlannedDelivery = {
    alertId: string;
    activationSequence: number;
    eventType: AlertNotificationEventType;
    reminderBucket?: number;
    eventKey: string;
  };
  const planned: PlannedDelivery[] = [];

  for (const state of states) {
    if (state.isActive && input.eligibleAlertIds.has(state.alertId)) {
      planned.push({
        alertId: state.alertId,
        activationSequence: state.activationSequence,
        eventType: AlertNotificationEventType.INITIAL,
        eventKey: buildDeliveryEventKey({
          alertId: state.alertId,
          activationSequence: state.activationSequence,
          eventType: AlertNotificationEventType.INITIAL,
        }),
      });

      if (state.lastNotifiedAt) {
        if (
          !cooldownElapsed({
            lastNotifiedAt: state.lastNotifiedAt,
            checkedAt: input.checkedAt,
          })
        ) {
          cooldownSuppressed += 1;
        } else {
          const bucket = reminderCooldownBucket(input.checkedAt.getTime());
          planned.push({
            alertId: state.alertId,
            activationSequence: state.activationSequence,
            eventType: AlertNotificationEventType.REMINDER,
            reminderBucket: bucket,
            eventKey: buildDeliveryEventKey({
              alertId: state.alertId,
              activationSequence: state.activationSequence,
              eventType: AlertNotificationEventType.REMINDER,
              reminderBucket: bucket,
            }),
          });
        }
      }
      continue;
    }

    // Recovery only with complete snapshot proof + prior notification + not yet recovered.
    if (
      input.snapshotComplete &&
      !state.isActive &&
      state.lastNotifiedAt &&
      !state.recoveryNotifiedAt
    ) {
      planned.push({
        alertId: state.alertId,
        activationSequence: state.activationSequence,
        eventType: AlertNotificationEventType.RECOVERY,
        eventKey: buildDeliveryEventKey({
          alertId: state.alertId,
          activationSequence: state.activationSequence,
          eventType: AlertNotificationEventType.RECOVERY,
        }),
      });
    }
  }

  // Cap creates to the current run's delivery budget (≤3) after one existence check.
  const capped = planned.slice(0, maxStates);
  const existing =
    capped.length === 0
      ? []
      : await prisma.alertNotificationDelivery.findMany({
          where: { eventKey: { in: capped.map((row) => row.eventKey) } },
          select: { eventKey: true },
        });
  const existingKeys = new Set(existing.map((row) => row.eventKey));
  const toCreate = capped.filter((row) => !existingKeys.has(row.eventKey));

  const createResults = await Promise.all(
    toCreate.map(async (row) => {
      try {
        await prisma.alertNotificationDelivery.create({
          data: {
            eventKey: row.eventKey,
            alertId: row.alertId,
            activationSequence: row.activationSequence,
            eventType: row.eventType,
            status: AlertNotificationDeliveryStatus.PENDING,
            attemptCount: 0,
            nextAttemptAt: input.checkedAt,
          },
        });
        return row.eventType;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return null;
        }
        throw error;
      }
    })
  );

  let initialCreated = 0;
  let reminderCreated = 0;
  let recoveryCreated = 0;
  for (const eventType of createResults) {
    if (eventType === AlertNotificationEventType.INITIAL) initialCreated += 1;
    else if (eventType === AlertNotificationEventType.REMINDER)
      reminderCreated += 1;
    else if (eventType === AlertNotificationEventType.RECOVERY)
      recoveryCreated += 1;
  }

  return {
    initialCreated,
    reminderCreated,
    recoveryCreated,
    cooldownSuppressed,
  };
}

export async function claimNextAlertNotificationDelivery(input: {
  now: Date;
}): Promise<{
  id: string;
  eventKey: string;
  alertId: string;
  activationSequence: number;
  eventType: AlertNotificationEventType;
  attemptCount: number;
  claimToken: string;
} | null> {
  const claimToken = newClaimToken();
  const claimExpiresAt = new Date(
    input.now.getTime() + ALERT_NOTIFICATION_CLAIM_TTL_MS
  );

  // Release expired claims back to PENDING/FAILED for retry.
  await prisma.alertNotificationDelivery.updateMany({
    where: {
      status: AlertNotificationDeliveryStatus.CLAIMED,
      claimExpiresAt: { lte: input.now },
    },
    data: {
      status: AlertNotificationDeliveryStatus.PENDING,
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
  });

  // CAS loop: concurrent runners may race the same candidate; retry others.
  for (let i = 0; i < 12; i++) {
    const candidate = await prisma.alertNotificationDelivery.findFirst({
      where: {
        OR: [
          {
            status: AlertNotificationDeliveryStatus.PENDING,
            OR: [
              { nextAttemptAt: null },
              { nextAttemptAt: { lte: input.now } },
            ],
          },
          {
            status: AlertNotificationDeliveryStatus.FAILED,
            attemptCount: { lt: ALERT_NOTIFICATION_MAX_ATTEMPTS },
            OR: [
              { nextAttemptAt: null },
              { nextAttemptAt: { lte: input.now } },
            ],
          },
        ],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    });
    if (!candidate) return null;

    const claimed = await prisma.alertNotificationDelivery.updateMany({
      where: {
        id: candidate.id,
        status: { in: ["PENDING", "FAILED"] },
        attemptCount: { lt: ALERT_NOTIFICATION_MAX_ATTEMPTS },
      },
      data: {
        status: AlertNotificationDeliveryStatus.CLAIMED,
        claimToken,
        claimedAt: input.now,
        claimExpiresAt,
        lastAttemptAt: input.now,
      },
    });
    if (claimed.count !== 1) continue;

    return {
      id: candidate.id,
      eventKey: candidate.eventKey,
      alertId: candidate.alertId,
      activationSequence: candidate.activationSequence,
      eventType: candidate.eventType,
      attemptCount: candidate.attemptCount,
      claimToken,
    };
  }
  return null;
}

/** Count due PENDING/FAILED outbox rows still eligible for another claim. */
export async function countDueAlertNotificationDeliveries(
  now: Date
): Promise<number> {
  return prisma.alertNotificationDelivery.count({
    where: {
      OR: [
        {
          status: AlertNotificationDeliveryStatus.PENDING,
          OR: [
            { nextAttemptAt: null },
            { nextAttemptAt: { lte: now } },
          ],
        },
        {
          status: AlertNotificationDeliveryStatus.FAILED,
          attemptCount: { lt: ALERT_NOTIFICATION_MAX_ATTEMPTS },
          OR: [
            { nextAttemptAt: null },
            { nextAttemptAt: { lte: now } },
          ],
        },
      ],
    },
  });
}

/** Release a claim without incrementing attempts (e.g. incomplete-snapshot recovery). */
export async function releaseAlertNotificationDeliveryClaim(input: {
  id: string;
  claimToken: string;
}): Promise<void> {
  await prisma.alertNotificationDelivery.updateMany({
    where: {
      id: input.id,
      claimToken: input.claimToken,
      status: AlertNotificationDeliveryStatus.CLAIMED,
    },
    data: {
      status: AlertNotificationDeliveryStatus.PENDING,
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
  });
}

export async function markAlertNotificationDeliverySent(input: {
  id: string;
  claimToken: string;
  messageId: string;
  sentAt: Date;
}): Promise<boolean> {
  const updated = await prisma.alertNotificationDelivery.updateMany({
    where: {
      id: input.id,
      claimToken: input.claimToken,
      status: AlertNotificationDeliveryStatus.CLAIMED,
    },
    data: {
      status: AlertNotificationDeliveryStatus.SENT,
      sentAt: input.sentAt,
      messageId: input.messageId,
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
      lastErrorCode: null,
      nextAttemptAt: null,
    },
  });
  return updated.count === 1;
}

export async function markAlertNotificationDeliveryFailed(input: {
  id: string;
  claimToken: string;
  attemptCountBefore: number;
  errorCode: AlertNotificationErrorCode;
  failedAt: Date;
}): Promise<void> {
  const attemptCount = input.attemptCountBefore + 1;
  const next = nextRetryAt(attemptCount, input.failedAt);
  await prisma.alertNotificationDelivery.updateMany({
    where: {
      id: input.id,
      claimToken: input.claimToken,
      status: AlertNotificationDeliveryStatus.CLAIMED,
    },
    data: {
      status: AlertNotificationDeliveryStatus.FAILED,
      attemptCount,
      lastErrorCode: normalizeOpaqueErrorCode(input.errorCode),
      nextAttemptAt: next,
      claimToken: null,
      claimedAt: null,
      claimExpiresAt: null,
      lastAttemptAt: input.failedAt,
    },
  });
}

export async function applySuccessfulDeliveryToState(input: {
  alertId: string;
  activationSequence: number;
  eventType: AlertNotificationEventType;
  sentAt: Date;
}): Promise<void> {
  const state = await prisma.alertNotificationState.findUnique({
    where: { alertId: input.alertId },
  });
  if (!state || state.activationSequence !== input.activationSequence) return;

  if (input.eventType === "RECOVERY") {
    await prisma.alertNotificationState.update({
      where: { alertId: input.alertId },
      data: {
        recoveryNotifiedAt: input.sentAt,
        nextReminderAt: null,
      },
    });
    return;
  }

  await prisma.alertNotificationState.update({
    where: { alertId: input.alertId },
    data: {
      lastNotifiedAt: input.sentAt,
      nextReminderAt: new Date(
        input.sentAt.getTime() + ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS
      ),
    },
  });
}

export async function loadNotificationViewsForAlerts(input: {
  alertIds: string[];
  checkedAt: Date;
}): Promise<
  Map<
    string,
    {
      lastNotifiedAt: Date | null;
      lastAttemptAt: Date | null;
      lastSuccessAt: Date | null;
      latestDeliveryStatus: AlertNotificationDeliveryStatus | null;
      activationSequence: number;
    }
  >
> {
  const map = new Map();
  if (!input.alertIds.length) return map;
  const states = await prisma.alertNotificationState.findMany({
    where: { alertId: { in: input.alertIds } },
    include: {
      deliveries: {
        orderBy: { updatedAt: "desc" },
        take: 5,
      },
    },
  });
  for (const s of states) {
    const latest = s.deliveries[0] ?? null;
    const lastSuccess =
      s.deliveries.find((d) => d.status === "SENT")?.sentAt ?? s.lastNotifiedAt;
    map.set(s.alertId, {
      lastNotifiedAt: s.lastNotifiedAt,
      lastAttemptAt: latest?.lastAttemptAt ?? null,
      lastSuccessAt: lastSuccess ?? null,
      latestDeliveryStatus: latest?.status ?? null,
      activationSequence: s.activationSequence,
    });
  }
  return map;
}

export async function loadRecentNotificationActivity(limit = 20): Promise<
  Array<{
    eventType: "INITIAL" | "REMINDER" | "RECOVERY";
    status: "SENT" | "FAILED";
    alertCode: string;
    severity: string;
    atLabel: string;
    sourceType: string | null;
    sourceRecordRef: string | null;
  }>
> {
  const rows = await prisma.alertNotificationDelivery.findMany({
    where: {
      status: {
        in: [
          AlertNotificationDeliveryStatus.SENT,
          AlertNotificationDeliveryStatus.FAILED,
        ],
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.min(20, Math.max(1, limit)),
    include: {
      state: {
        select: {
          alertCode: true,
          severity: true,
          sourceType: true,
          sourceRecordRef: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    eventType: r.eventType,
    status: r.status === "SENT" ? ("SENT" as const) : ("FAILED" as const),
    alertCode: r.state.alertCode,
    severity: r.state.severity,
    atLabel: formatUtcTimestamp(r.sentAt ?? r.lastAttemptAt ?? r.updatedAt),
    sourceType: r.state.sourceType,
    sourceRecordRef: r.state.sourceRecordRef,
  }));
}
