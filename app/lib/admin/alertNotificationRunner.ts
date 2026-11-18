/**
 * Server-only Monitoring Part B2 notification runner.
 * Separates: aggregation → eligibility → durable state/outbox → email delivery.
 * Never invoked from page-load aggregation paths.
 *
 * Aggregation (`collectMonitoringAlerts`) is local-DB + env config only —
 * no external provider HTTP (VeSIM / Safepay / Simpaisa) during evaluation.
 *
 * Hard budgets + transporter.close on SMTP timeout so Vercel never waits out
 * orphaned Promise.race work until maxDuration.
 */
import "server-only";

import {
  collectMonitoringAlerts,
  getActiveAlertCollector,
} from "@/app/lib/admin/monitoringAlerts";
import {
  ALERT_NOTIFICATION_AGGREGATION_TIMEOUT_MS,
  ALERT_NOTIFICATION_MAX_DELIVERIES_PER_RUN,
  ALERT_NOTIFICATION_MAX_STATE_OPS_PER_RUN,
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
import { closeChannelTransporter } from "@/app/lib/email/transport";
import { prisma } from "@/app/lib/db";

export type AlertNotificationRunResult = {
  ok: boolean;
  paused: boolean;
  runnerClaimed: boolean;
  snapshotComplete: boolean;
  counts: SafeRunnerCounts;
  /** Items claimed/handled in this bounded outbox pass (sent + failed + suppressed mid-loop). */
  processed: number;
  aggregationMs: number;
  sendMs: number;
  lastStep?: string;
  errorCode?: string;
  /** Opaque machine detail for UI mapping — never secrets or raw SMTP stacks. */
  errorDetail?: string;
};

/** Live progress bag shared with the API route so timeouts still report timings. */
export type AlertNotificationRunProgress = {
  aggregationMs: number;
  sendMs: number;
  processed: number;
  lastStep: string;
  activeCollector: string | null;
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

function checkpoint(step: string, extra?: Record<string, unknown>): void {
  console.info("[alert-run]", { step, ...(extra ?? {}) });
}

function touchProgress(
  progress: AlertNotificationRunProgress | undefined,
  patch: Partial<AlertNotificationRunProgress>
): void {
  if (!progress) return;
  Object.assign(progress, patch);
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

function emptyTimingResult(
  partial: Omit<
    AlertNotificationRunResult,
    "aggregationMs" | "sendMs" | "processed" | "counts"
  > & {
    counts?: SafeRunnerCounts;
    processed?: number;
    aggregationMs?: number;
    sendMs?: number;
  }
): AlertNotificationRunResult {
  return {
    ...partial,
    counts: partial.counts ?? emptyRunnerCounts(),
    processed: partial.processed ?? 0,
    aggregationMs: partial.aggregationMs ?? 0,
    sendMs: partial.sendMs ?? 0,
  };
}

export async function evaluateAndDeliverAlertNotifications(options?: {
  checkedAt?: Date;
  /** Smoke/QA: skip SMTP and mark claimed deliveries failed with not_configured. */
  dryRun?: boolean;
  /** Optional live progress bag (route reads this on ROUTE_RUN_TIMEOUT). */
  progress?: AlertNotificationRunProgress;
}): Promise<AlertNotificationRunResult> {
  const checkedAt =
    options?.checkedAt instanceof Date &&
    Number.isFinite(options.checkedAt.getTime())
      ? options.checkedAt
      : new Date();
  const counts = emptyRunnerCounts();
  let processed = 0;
  let aggregationMs = 0;
  let sendMs = 0;
  let lastStep = "start";
  const progress = options?.progress;

  checkpoint("start");
  touchProgress(progress, { lastStep: "start" });

  const controls = await loadOperationalControlPausedMapSoft();
  if (controls.map.ALERT_NOTIFICATIONS) {
    checkpoint("paused");
    return emptyTimingResult({
      ok: true,
      paused: true,
      runnerClaimed: false,
      snapshotComplete: false,
      counts,
      lastStep: "paused",
      errorCode: "paused",
    });
  }

  lastStep = "lock";
  const lock = await claimAlertNotificationRunnerLock(checkedAt);
  if (!lock.ok) {
    checkpoint("runner_busy");
    return emptyTimingResult({
      ok: false,
      paused: false,
      runnerClaimed: false,
      snapshotComplete: false,
      counts,
      lastStep: "runner_busy",
      errorCode: "runner_busy",
    });
  }

  const runStartedAt = Date.now();
  const budgetMs = ALERT_NOTIFICATION_RUN_TIME_BUDGET_MS;

  try {
    const recipients = loadAlertNotificationRecipientsFromEnv();
    if (!recipients.ok) {
      checkpoint("invalid_recipients");
      return emptyTimingResult({
        ok: false,
        paused: false,
        runnerClaimed: true,
        snapshotComplete: false,
        counts,
        lastStep: "invalid_recipients",
        errorCode: "invalid_recipients",
      });
    }

    if (!options?.dryRun) {
      const supportConfig = getEmailConfig("support");
      if (!supportConfig.configured) {
        checkpoint("smtp_not_configured");
        return emptyTimingResult({
          ok: false,
          paused: false,
          runnerClaimed: true,
          snapshotComplete: false,
          counts,
          lastStep: "smtp_not_configured",
          errorCode: "not_configured",
          errorDetail: supportConfig.reason || "not_configured",
        });
      }
    }

    let aggregation: Awaited<ReturnType<typeof collectMonitoringAlerts>>;
    const aggregationStartedAt = Date.now();
    lastStep = "aggregate";
    checkpoint("aggregate");
    touchProgress(progress, { lastStep: "aggregate", activeCollector: null });
    const aggregationTick = setInterval(() => {
      aggregationMs = Date.now() - aggregationStartedAt;
      touchProgress(progress, {
        aggregationMs,
        lastStep: "aggregate",
        activeCollector: getActiveAlertCollector(),
      });
    }, 250);
    try {
      // Local Prisma/env only — never provider HTTP during alert evaluation.
      aggregation = await withTimeout(
        collectMonitoringAlerts({ checkedAt }),
        ALERT_NOTIFICATION_AGGREGATION_TIMEOUT_MS,
        "AGGREGATION_TIMEOUT"
      );
    } catch (error) {
      aggregationMs = Date.now() - aggregationStartedAt;
      const activeCollector = getActiveAlertCollector();
      touchProgress(progress, {
        aggregationMs,
        lastStep: "aggregate_timeout",
        activeCollector,
      });
      if (error instanceof Error && error.message === "AGGREGATION_TIMEOUT") {
        console.error("alert_notification_runner", "AGGREGATION_TIMEOUT", {
          aggregationMs,
          activeCollector,
        });
        checkpoint("aggregate_timeout", { aggregationMs, activeCollector });
        return emptyTimingResult({
          ok: false,
          paused: false,
          runnerClaimed: true,
          snapshotComplete: false,
          counts,
          aggregationMs,
          lastStep: "aggregate_timeout",
          errorCode: "aggregation_timeout",
          errorDetail: activeCollector
            ? `collector_${activeCollector}`
            : undefined,
        });
      }
      throw error;
    } finally {
      clearInterval(aggregationTick);
    }
    aggregationMs = Date.now() - aggregationStartedAt;
    touchProgress(progress, {
      aggregationMs,
      lastStep: "aggregate_done",
      activeCollector: null,
    });
    checkpoint("aggregate_done", { aggregationMs });

    const completeness = aggregation.completeness;
    const activeAlerts = aggregation.alerts.filter((a) => a.state === "ACTIVE");
    const eligible = filterEligibleAlerts(activeAlerts).slice(
      0,
      ALERT_NOTIFICATION_MAX_STATE_OPS_PER_RUN
    );
    counts.eligible = eligible.length;

    lastStep = "sync_states";
    checkpoint("sync_states", { eligible: eligible.length });
    // Sync only notification-eligible alerts (not every ACTIVE low-severity row).
    await withTimeout(
      syncActiveAlertNotificationStates({
        alerts: eligible,
        checkedAt,
        maxAlerts: ALERT_NOTIFICATION_MAX_STATE_OPS_PER_RUN,
      }),
      ALERT_NOTIFICATION_AGGREGATION_TIMEOUT_MS,
      "SYNC_TIMEOUT"
    ).catch((error) => {
      if (!(error instanceof Error && error.message === "SYNC_TIMEOUT")) {
        throw error;
      }
      console.error("alert_notification_runner", "SYNC_TIMEOUT");
    });

    lastStep = "resolve_missing";
    await withTimeout(
      resolveMissingAlertNotificationStates({
        activeAlertIds: new Set(eligible.map((a) => a.id)),
        checkedAt,
        snapshotComplete: completeness.complete,
        maxResolve: ALERT_NOTIFICATION_MAX_STATE_OPS_PER_RUN,
      }),
      ALERT_NOTIFICATION_AGGREGATION_TIMEOUT_MS,
      "RESOLVE_TIMEOUT"
    ).catch((error) => {
      if (!(error instanceof Error && error.message === "RESOLVE_TIMEOUT")) {
        throw error;
      }
      console.error("alert_notification_runner", "RESOLVE_TIMEOUT");
    });

    lastStep = "schedule";
    checkpoint("schedule");
    const scheduled = await withTimeout(
      scheduleEligibleDeliveries({
        eligibleAlertIds: new Set(eligible.map((a) => a.id)),
        checkedAt,
        snapshotComplete: completeness.complete,
        maxStates: ALERT_NOTIFICATION_MAX_STATE_OPS_PER_RUN,
      }),
      ALERT_NOTIFICATION_AGGREGATION_TIMEOUT_MS,
      "SCHEDULE_TIMEOUT"
    ).catch((error) => {
      if (error instanceof Error && error.message === "SCHEDULE_TIMEOUT") {
        console.error("alert_notification_runner", "SCHEDULE_TIMEOUT");
        return {
          initialCreated: 0,
          reminderCreated: 0,
          recoveryCreated: 0,
          cooldownSuppressed: 0,
        };
      }
      throw error;
    });
    counts.cooldown = scheduled.cooldownSuppressed;
    counts.suppressed +=
      activeAlerts.length - eligible.length + scheduled.cooldownSuppressed;

    let hardSmtpFailure:
      | { errorCode: string; errorDetail?: string }
      | null = null;

    const sendStartedAt = Date.now();
    lastStep = "send_start";
    touchProgress(progress, { lastStep: "send_start", processed });
    checkpoint("send_start", {
      max: ALERT_NOTIFICATION_MAX_DELIVERIES_PER_RUN,
    });

    for (let i = 0; i < ALERT_NOTIFICATION_MAX_DELIVERIES_PER_RUN; i++) {
      if (Date.now() - runStartedAt >= budgetMs) {
        checkpoint("budget_exhausted", { processed });
        break;
      }
      touchProgress(progress, {
        lastStep: "send",
        processed,
        sendMs: Date.now() - sendStartedAt,
      });

      const claimed = await claimNextAlertNotificationDelivery({
        now: checkedAt,
      });
      if (!claimed) break;

      processed += 1;

      const alert =
        eligible.find((a) => a.id === claimed.alertId) ??
        activeAlerts.find((a) => a.id === claimed.alertId) ??
        aggregation.alerts.find((a) => a.id === claimed.alertId);

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

      if (claimed.eventType === "RECOVERY" && !completeness.complete) {
        await releaseAlertNotificationDeliveryClaim({
          id: claimed.id,
          claimToken: claimed.claimToken,
        });
        counts.suppressed += 1;
        continue;
      }

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

    sendMs = Date.now() - sendStartedAt;
    lastStep = "send_done";
    checkpoint("send_done", { processed, sendMs, sent: counts.sent });

    counts.remaining = await countDueAlertNotificationDeliveries(checkedAt);

    if (hardSmtpFailure) {
      return {
        ok: false,
        paused: false,
        runnerClaimed: true,
        snapshotComplete: completeness.complete,
        counts,
        processed,
        aggregationMs,
        sendMs,
        lastStep,
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
      aggregationMs,
      sendMs,
      lastStep,
    };
  } finally {
    closeChannelTransporter("support");
    await releaseAlertNotificationRunnerLock(lock.claimToken).catch(() => undefined);
    checkpoint("release_lock");
  }
}
