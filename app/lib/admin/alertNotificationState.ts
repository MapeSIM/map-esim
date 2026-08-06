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
 * Reactivation after resolve increments activationSequence (new cycle).
 */
export async function syncActiveAlertNotificationStates(input: {
  alerts: MonitoringAlert[];
  checkedAt: Date;
}): Promise<void> {
  for (const alert of input.alerts) {
    const meta = sourceMeta(alert);
    const existing = await prisma.alertNotificationState.findUnique({
      where: { alertId: alert.id },
    });

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
      continue;
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
      continue;
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
  }
}

/**
 * Mark previously-active alerts resolved only when the snapshot is complete.
 */
export async function resolveMissingAlertNotificationStates(input: {
  activeAlertIds: Set<string>;
  checkedAt: Date;
  snapshotComplete: boolean;
}): Promise<number> {
  if (!input.snapshotComplete) return 0;
  const activeRows = await prisma.alertNotificationState.findMany({
    where: { isActive: true },
    select: { alertId: true },
  });
  let resolved = 0;
  for (const row of activeRows) {
    if (input.activeAlertIds.has(row.alertId)) continue;
    await prisma.alertNotificationState.update({
      where: { alertId: row.alertId },
      data: {
        isActive: false,
        resolvedAt: input.checkedAt,
        nextReminderAt: null,
      },
    });
    resolved += 1;
  }
  return resolved;
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
}): Promise<{
  initialCreated: number;
  reminderCreated: number;
  recoveryCreated: number;
  cooldownSuppressed: number;
}> {
  let initialCreated = 0;
  let reminderCreated = 0;
  let recoveryCreated = 0;
  let cooldownSuppressed = 0;

  const states = await prisma.alertNotificationState.findMany();
  for (const state of states) {
    if (state.isActive && input.eligibleAlertIds.has(state.alertId)) {
      const initial = await ensureDeliveryEvent({
        alertId: state.alertId,
        activationSequence: state.activationSequence,
        eventType: AlertNotificationEventType.INITIAL,
        checkedAt: input.checkedAt,
      });
      if (initial.created) initialCreated += 1;

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
          const reminder = await ensureDeliveryEvent({
            alertId: state.alertId,
            activationSequence: state.activationSequence,
            eventType: AlertNotificationEventType.REMINDER,
            reminderBucket: bucket,
            checkedAt: input.checkedAt,
          });
          if (reminder.created) reminderCreated += 1;
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
      const recovery = await ensureDeliveryEvent({
        alertId: state.alertId,
        activationSequence: state.activationSequence,
        eventType: AlertNotificationEventType.RECOVERY,
        checkedAt: input.checkedAt,
      });
      if (recovery.created) recoveryCreated += 1;
    }
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
