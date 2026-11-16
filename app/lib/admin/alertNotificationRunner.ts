/**
 * Server-only Monitoring Part B2 notification runner.
 * Separates: aggregation → eligibility → durable state/outbox → email delivery.
 * Never invoked from page-load aggregation paths.
 */
import "server-only";

import { collectMonitoringAlerts } from "@/app/lib/admin/monitoringAlerts";
import {
  ALERT_NOTIFICATION_MAX_DELIVERIES_PER_RUN,
  ALERT_NOTIFICATION_RUN_TIME_BUDGET_MS,
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
  countDueAlertNotificationDeliveries,
  markAlertNotificationDeliveryFailed,
  markAlertNotificationDeliverySent,
  releaseAlertNotificationDeliveryClaim,
  releaseAlertNotificationRunnerLock,
  resolveMissingAlertNotificationStates,
  scheduleEligibleDeliveries,
  syncActiveAlertNotificationStates,
} from "@/app/lib/admin/alertNotificationState";
import { loadOperationalControlPausedMapSoft } from "@/app/lib/admin/operationalControlsPolicy";
import { getEmailConfig } from "@/app/lib/email/config";
import { prisma } from "@/app/lib/db";

/** Bound monitoring aggregation so a slow DB probe cannot eat the whole run budget. */
const AGGREGATION_TIMEOUT_MS = 4_000;

export type AlertNotificationRunResult = {
  ok: boolean;
  paused: boolean;
  runnerClaimed: boolean;
  snapshotComplete: boolean;
  counts: SafeRunnerCounts;
  /** Items claimed/handled in this bounded outbox pass (sent + failed + suppressed mid-loop). */
  processed: number;
  errorCode?: string;
  /** Opaque machine detail for UI mapping — never secrets or raw SMTP stacks. */
  errorDetail?: string;
};

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  code: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isHardSmtpFailure(errorCode: string, detail?: string): boolean {
  if (errorCode === "not_configured") return true;
  const d = String(detail ?? "").toLowerCase();
  return (
    d === "smtp_connection_timeout" ||
    d === "smtp_connection_failed" ||
    d === "smtp_auth_failed" ||
    d === "smtp_timeout"
  );
}

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
  let processed = 0;

  const controls = await loadOperationalControlPausedMapSoft();
  if (controls.map.ALERT_NOTIFICATIONS) {
    return {
      ok: true,
      paused: true,
      runnerClaimed: false,
      snapshotComplete: false,
      counts,
      processed: 0,
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
      processed: 0,
      errorCode: "runner_busy",
    };
  }

  const runStartedAt = Date.now();
  const budgetMs = ALERT_NOTIFICATION_RUN_TIME_BUDGET_MS;

  try {
    const recipients = loadAlertNotificationRecipientsFromEnv();
    if (!recipients.ok) {
      return {
        ok: false,
        paused: false,
        runnerClaimed: true,
        snapshotComplete: false,
        counts,
        processed: 0,
        errorCode: "invalid_recipients",
      };
    }

    if (!options?.dryRun) {
      const supportConfig = getEmailConfig("support");
      if (!supportConfig.configured) {
        return {
          ok: false,
          paused: false,
          runnerClaimed: true,
          snapshotComplete: false,
          counts,
          processed: 0,
          errorCode: "not_configured",
          errorDetail: supportConfig.reason || "not_configured",
        };
      }
    }

    let aggregation: Awaited<ReturnType<typeof collectMonitoringAlerts>>;
    try {
      aggregation = await withTimeout(
        collectMonitoringAlerts({ checkedAt }),
        AGGREGATION_TIMEOUT_MS,
        "AGGREGATION_TIMEOUT"
      );
    } catch (error) {
      if (error instanceof Error && error.message === "AGGREGATION_TIMEOUT") {
        console.error("alert_notification_runner", "AGGREGATION_TIMEOUT");
        return {
          ok: false,
          paused: false,
          runnerClaimed: true,
          snapshotComplete: false,
          counts,
          processed: 0,
          errorCode: "aggregation_timeout",
        };
      }
      throw error;
    }
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

    let hardSmtpFailure:
      | { errorCode: string; errorDetail?: string }
      | null = null;

    // Process outbox (bounded by batch size + remaining time budget).
    for (let i = 0; i < ALERT_NOTIFICATION_MAX_DELIVERIES_PER_RUN; i++) {
      if (Date.now() - runStartedAt >= budgetMs) {
        break;
      }

      const claimed = await claimNextAlertNotificationDelivery({
        now: checkedAt,
      });
      if (!claimed) break;

      processed += 1;

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
        if (isHardSmtpFailure(sent.errorCode, sent.detail)) {
          hardSmtpFailure = {
            errorCode: sent.errorCode,
            errorDetail: sent.detail,
          };
          break;
        }
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

    counts.remaining = await countDueAlertNotificationDeliveries(checkedAt);

    if (hardSmtpFailure) {
      return {
        ok: false,
        paused: false,
        runnerClaimed: true,
        snapshotComplete: completeness.complete,
        counts,
        processed,
        errorCode: hardSmtpFailure.errorCode,
        errorDetail: hardSmtpFailure.errorDetail,
      };
    }

    return {
      ok: true,
      paused: false,
      runnerClaimed: true,
      snapshotComplete: completeness.complete,
      counts,
      processed,
    };
  } finally {
    await releaseAlertNotificationRunnerLock(lock.claimToken);
  }
}
