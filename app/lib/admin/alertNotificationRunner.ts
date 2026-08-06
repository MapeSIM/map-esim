/**
 * Server-only Monitoring Part B2 notification runner.
 * Separates: aggregation → eligibility → durable state/outbox → email delivery.
 * Never invoked from page-load aggregation paths.
 */
import "server-only";

import { collectMonitoringAlerts } from "@/app/lib/admin/monitoringAlerts";
import {
  buildDeterministicMessageId,
  emptyRunnerCounts,
  filterEligibleAlerts,
  isAlertEligibleForNotification,
  type SafeRunnerCounts,
} from "@/app/lib/admin/alertNotificationShared";
import {
  buildAlertNotificationEmail,
  loadAlertNotificationRecipientsFromEnv,
  sendAlertNotificationEmails,
} from "@/app/lib/admin/alertNotificationDelivery";
import {
  applySuccessfulDeliveryToState,
  claimAlertNotificationRunnerLock,
  claimNextAlertNotificationDelivery,
  markAlertNotificationDeliveryFailed,
  markAlertNotificationDeliverySent,
  releaseAlertNotificationDeliveryClaim,
  releaseAlertNotificationRunnerLock,
  resolveMissingAlertNotificationStates,
  scheduleEligibleDeliveries,
  syncActiveAlertNotificationStates,
} from "@/app/lib/admin/alertNotificationState";
import { loadOperationalControlPausedMapSoft } from "@/app/lib/admin/operationalControlsPolicy";
import { prisma } from "@/app/lib/db";

export type AlertNotificationRunResult = {
  ok: boolean;
  paused: boolean;
  runnerClaimed: boolean;
  snapshotComplete: boolean;
  counts: SafeRunnerCounts;
  errorCode?: string;
};

export async function evaluateAndDeliverAlertNotifications(options?: {
  checkedAt?: Date;
  /** Smoke/QA: skip SMTP and mark claimed deliveries failed with not_configured. */
  dryRun?: boolean;
}): Promise<AlertNotificationRunResult> {
  const checkedAt =
    options?.checkedAt instanceof Date &&
    Number.isFinite(options.checkedAt.getTime())
      ? options.checkedAt
      : new Date();
  const counts = emptyRunnerCounts();

  const controls = await loadOperationalControlPausedMapSoft();
  if (controls.map.ALERT_NOTIFICATIONS) {
    return {
      ok: true,
      paused: true,
      runnerClaimed: false,
      snapshotComplete: false,
      counts,
      errorCode: "paused",
    };
  }

  const lock = await claimAlertNotificationRunnerLock(checkedAt);
  if (!lock.ok) {
    return {
      ok: false,
      paused: false,
      runnerClaimed: false,
      snapshotComplete: false,
      counts,
      errorCode: "runner_busy",
    };
  }

  try {
    const recipients = loadAlertNotificationRecipientsFromEnv();
    if (!recipients.ok) {
      return {
        ok: false,
        paused: false,
        runnerClaimed: true,
        snapshotComplete: false,
        counts,
        errorCode: "invalid_recipients",
      };
    }

    const aggregation = await collectMonitoringAlerts({ checkedAt });
    const completeness = aggregation.completeness;
    const activeAlerts = aggregation.alerts.filter((a) => a.state === "ACTIVE");
    const eligible = filterEligibleAlerts(activeAlerts);
    counts.eligible = eligible.length;

    await syncActiveAlertNotificationStates({
      alerts: activeAlerts,
      checkedAt,
    });

    // Recovery/resolve only when the full snapshot completed successfully.
    await resolveMissingAlertNotificationStates({
      activeAlertIds: new Set(activeAlerts.map((a) => a.id)),
      checkedAt,
      snapshotComplete: completeness.complete,
    });

    const scheduled = await scheduleEligibleDeliveries({
      eligibleAlertIds: new Set(eligible.map((a) => a.id)),
      checkedAt,
      snapshotComplete: completeness.complete,
    });
    counts.cooldown = scheduled.cooldownSuppressed;
    counts.suppressed +=
      activeAlerts.length - eligible.length + scheduled.cooldownSuppressed;

    // Process outbox (bounded loop).
    for (let i = 0; i < 50; i++) {
      const claimed = await claimNextAlertNotificationDelivery({
        now: checkedAt,
      });
      if (!claimed) break;

      const alert =
        activeAlerts.find((a) => a.id === claimed.alertId) ??
        aggregation.alerts.find((a) => a.id === claimed.alertId);

      // Recovery events may reference resolved alerts — load state metadata.
      const state = await prisma.alertNotificationState.findUnique({
        where: { alertId: claimed.alertId },
      });
      if (!state) {
        await markAlertNotificationDeliveryFailed({
          id: claimed.id,
          claimToken: claimed.claimToken,
          attemptCountBefore: claimed.attemptCount,
          errorCode: "unknown",
          failedAt: checkedAt,
        });
        counts.failed += 1;
        continue;
      }

      // Suppress recovery when snapshot incomplete — do not burn retry budget.
      if (claimed.eventType === "RECOVERY" && !completeness.complete) {
        await releaseAlertNotificationDeliveryClaim({
          id: claimed.id,
          claimToken: claimed.claimToken,
        });
        counts.suppressed += 1;
        continue;
      }

      // Initial/reminder require eligible active alert evidence.
      if (
        (claimed.eventType === "INITIAL" ||
          claimed.eventType === "REMINDER") &&
        (!alert ||
          !isAlertEligibleForNotification(alert) ||
          !state.isActive ||
          state.activationSequence !== claimed.activationSequence)
      ) {
        await markAlertNotificationDeliveryFailed({
          id: claimed.id,
          claimToken: claimed.claimToken,
          attemptCountBefore: claimed.attemptCount,
          errorCode: "unknown",
          failedAt: checkedAt,
        });
        counts.suppressed += 1;
        continue;
      }

      const syntheticAlert =
        alert ??
        ({
          id: state.alertId,
          code: state.alertCode as never,
          severity: state.severity as never,
          state: "CLEARED" as const,
          title: state.alertCode,
          description: "Alert recovery notification.",
          category: state.category as never,
          detectedAtLabel: "",
          sourceTimestampLabel: "",
          ageLabel: "",
          ageMs: 0,
          freshness: "DATABASE_DERIVED" as const,
          recommendedAction: "Review Alerts dashboard.",
        } satisfies (typeof aggregation.alerts)[number]);

      if (options?.dryRun) {
        // QA/smoke: exercise durable claim + success path without SMTP.
        void buildAlertNotificationEmail({
          alert: syntheticAlert,
          eventType: claimed.eventType,
          checkedAt,
          sourceType: state.sourceType,
          sourceRecordRef: state.sourceRecordRef,
        });
        const marked = await markAlertNotificationDeliverySent({
          id: claimed.id,
          claimToken: claimed.claimToken,
          messageId: buildDeterministicMessageId(claimed.eventKey),
          sentAt: checkedAt,
        });
        if (marked) {
          await applySuccessfulDeliveryToState({
            alertId: claimed.alertId,
            activationSequence: claimed.activationSequence,
            eventType: claimed.eventType,
            sentAt: checkedAt,
          });
          counts.sent += 1;
          if (claimed.eventType === "RECOVERY") counts.recovery += 1;
        } else {
          counts.failed += 1;
        }
        continue;
      }

      const sent = await sendAlertNotificationEmails({
        alert: syntheticAlert,
        eventType: claimed.eventType,
        checkedAt,
        sourceType: state.sourceType,
        sourceRecordRef: state.sourceRecordRef,
        eventKey: claimed.eventKey,
        recipients: recipients.recipients,
      });

      if (!sent.ok) {
        await markAlertNotificationDeliveryFailed({
          id: claimed.id,
          claimToken: claimed.claimToken,
          attemptCountBefore: claimed.attemptCount,
          errorCode: sent.errorCode,
          failedAt: checkedAt,
        });
        counts.failed += 1;
        continue;
      }

      const marked = await markAlertNotificationDeliverySent({
        id: claimed.id,
        claimToken: claimed.claimToken,
        messageId: sent.messageId,
        sentAt: checkedAt,
      });
      if (!marked) {
        // Claim lost after SMTP accept — minimize window; do not resend via unique eventKey.
        counts.failed += 1;
        continue;
      }

      await applySuccessfulDeliveryToState({
        alertId: claimed.alertId,
        activationSequence: claimed.activationSequence,
        eventType: claimed.eventType,
        sentAt: checkedAt,
      });
      counts.sent += 1;
      if (claimed.eventType === "RECOVERY") counts.recovery += 1;
    }

    return {
      ok: true,
      paused: false,
      runnerClaimed: true,
      snapshotComplete: completeness.complete,
      counts,
    };
  } finally {
    await releaseAlertNotificationRunnerLock(lock.claimToken);
  }
}
