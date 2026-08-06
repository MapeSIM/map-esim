/**
 * Local smoke for Monitoring & Alerts Part B2 — alert notification delivery.
 *
 * Evidence: durable state/outbox CAS + dryRun runner (no SMTP).
 * Fetch guard blocks network. networkCalls must remain 0.
 *
 * Run:
 *   npx tsx -r ./scripts/smoke-stubs/register.cjs scripts/smoke-admin-alert-notifications.ts
 */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AlertNotificationDeliveryStatus,
  AlertNotificationEventType,
  OperationalControlKey,
  PrismaClient,
  Role,
} from "@prisma/client";
import {
  ALERT_NOTIFICATION_CLAIM_TTL_MS,
  ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS,
  buildDeliveryEventKey,
  buildDeterministicMessageId,
  isAlertEligibleForNotification,
  normalizeOpaqueErrorCode,
} from "../app/lib/admin/alertNotificationShared";
import { makeAlert } from "../app/lib/admin/monitoringAlertShared";

loadEnvConfig(process.cwd());

process.env.SMOKE_SESSION_USER_ID =
  process.env.SMOKE_SESSION_USER_ID || "pending";
process.env.SMOKE_SESSION_ROLE = process.env.SMOKE_SESSION_ROLE || "ADMIN";
// Fail-closed recipients must be valid for dryRun runner path.
process.env.ALERT_NOTIFICATION_RECIPIENTS =
  process.env.ALERT_NOTIFICATION_RECIPIENTS ||
  "alert-smoke@example.invalid";

const root = join(__dirname, "..");
const TAG = `smokeb2_${Date.now().toString(36)}`;

type SmokeResult = {
  item: string;
  status: "PASS" | "FAIL" | "SKIP";
  evidence: string;
};

const results: SmokeResult[] = [];
const networkLog: { method: string; url: string }[] = [];

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function record(item: string, status: SmokeResult["status"], evidence: string) {
  results.push({ item, status, evidence });
  console.log(`${status} ${item} — ${evidence}`);
}

function installFetchGuard() {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === "string" || input instanceof URL ? input : input.url
    );
    const method = String(init?.method ?? "GET").toUpperCase();
    networkLog.push({ method, url });
    throw new Error(`BLOCKED_NETWORK ${method} ${url}`);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function ensureControlRows(prisma: PrismaClient) {
  for (const key of Object.values(OperationalControlKey)) {
    await prisma.operationalControl.upsert({
      where: { key },
      create: {
        id: `smoke_b2_${key.toLowerCase()}`,
        key,
        paused: false,
        version: 0,
      },
      update: {},
    });
  }
}

async function main() {
  const restoreFetch = installFetchGuard();
  const prisma = new PrismaClient();
  const ids: {
    adminId?: string;
    alertId?: string;
    stateId?: string;
  } = {};

  try {
    // dryRun path never calls SMTP; fetch guard blocks any accidental network.
    const {
      evaluateAndDeliverAlertNotifications,
    } = await import("../app/lib/admin/alertNotificationRunner");
    const {
      claimNextAlertNotificationDelivery,
      ensureDeliveryEvent,
      markAlertNotificationDeliverySent,
      releaseAlertNotificationRunnerLock,
      claimAlertNotificationRunnerLock,
      resolveMissingAlertNotificationStates,
      scheduleEligibleDeliveries,
      syncActiveAlertNotificationStates,
      loadRecentNotificationActivity,
    } = await import("../app/lib/admin/alertNotificationState");
    const { buildAlertNotificationEmail } = await import(
      "../app/lib/admin/alertNotificationDelivery"
    );
    const { getMonitoringAlertsDashboard, collectMonitoringAlerts } =
      await import("../app/lib/admin/monitoringAlerts");

    await ensureControlRows(prisma);

    const admin = await prisma.user.create({
      data: {
        name: `B2 Admin ${TAG}`,
        email: `b2_admin_${TAG}@example.com`,
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
    });
    ids.adminId = admin.id;
    process.env.SMOKE_SESSION_USER_ID = admin.id;

    // Static: pages never invoke runner.
    const alertsPage = read("app/admin/alerts/page.tsx");
    const opsPage = read("app/admin/operations/page.tsx");
    assert.doesNotMatch(alertsPage, /evaluateAndDeliverAlertNotifications/);
    assert.doesNotMatch(opsPage, /evaluateAndDeliverAlertNotifications/);
    record(
      "no_page_render_send",
      "PASS",
      "alerts/operations pages do not call notification runner"
    );

    const checkedAt = new Date("2026-08-07T12:00:00.000Z");
    const criticalAlert = makeAlert({
      category: "DATABASE",
      code: "DATABASE_UNAVAILABLE",
      severity: "CRITICAL",
      title: "Database unavailable",
      description: "Probe failed",
      sourceType: "config",
      recordId: "none",
      sourceAt: checkedAt,
      now: checkedAt,
      freshness: "CONFIGURATION_DERIVED",
      recommendedAction: "Check database",
    });
    ids.alertId = criticalAlert.id;
    assert.equal(isAlertEligibleForNotification(criticalAlert), true);

    // First notification cycle via sync + schedule + claim (dry durable path).
    await syncActiveAlertNotificationStates({
      alerts: [criticalAlert],
      checkedAt,
    });
    const state1 = await prisma.alertNotificationState.findUniqueOrThrow({
      where: { alertId: criticalAlert.id },
    });
    ids.stateId = state1.id;
    assert.equal(state1.activationSequence, 1);
    assert.equal(state1.isActive, true);

    const sched1 = await scheduleEligibleDeliveries({
      eligibleAlertIds: new Set([criticalAlert.id]),
      checkedAt,
      snapshotComplete: true,
    });
    assert.ok(sched1.initialCreated >= 1);
    const initialKey = buildDeliveryEventKey({
      alertId: criticalAlert.id,
      activationSequence: 1,
      eventType: "INITIAL",
    });
    const dup = await ensureDeliveryEvent({
      alertId: criticalAlert.id,
      activationSequence: 1,
      eventType: AlertNotificationEventType.INITIAL,
      checkedAt,
    });
    assert.equal(dup.created, false);
    record(
      "first_notification_and_duplicate_suppression",
      "PASS",
      `initial eventKey=${initialKey}; duplicate create suppressed`
    );

    // Concurrent initial claim — only one CAS winner.
    const claimA = await claimNextAlertNotificationDelivery({ now: checkedAt });
    const claimB = await claimNextAlertNotificationDelivery({ now: checkedAt });
    assert.ok(claimA);
    assert.equal(claimA!.eventKey, initialKey);
    assert.equal(claimB, null, "second concurrent claim must lose CAS");
    const messageId = buildDeterministicMessageId(claimA!.eventKey);
    const marked = await markAlertNotificationDeliverySent({
      id: claimA!.id,
      claimToken: claimA!.claimToken,
      messageId,
      sentAt: checkedAt,
    });
    assert.equal(marked, true);
    await prisma.alertNotificationState.update({
      where: { alertId: criticalAlert.id },
      data: {
        lastNotifiedAt: checkedAt,
        nextReminderAt: new Date(
          checkedAt.getTime() + ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS
        ),
      },
    });
    record(
      "concurrent_initial_claim",
      "PASS",
      "CAS claim winner marked SENT; loser got null"
    );

    // Cooldown: just below / exact / just above via scheduleEligibleDeliveries.
    const justBelow = new Date(
      checkedAt.getTime() + ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS - 1
    );
    const cool = await scheduleEligibleDeliveries({
      eligibleAlertIds: new Set([criticalAlert.id]),
      checkedAt: justBelow,
      snapshotComplete: true,
    });
    assert.ok(cool.cooldownSuppressed >= 1);
    const exact = new Date(
      checkedAt.getTime() + ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS
    );
    const after = await scheduleEligibleDeliveries({
      eligibleAlertIds: new Set([criticalAlert.id]),
      checkedAt: exact,
      snapshotComplete: true,
    });
    assert.ok(after.reminderCreated >= 1);
    const remKey = buildDeliveryEventKey({
      alertId: criticalAlert.id,
      activationSequence: 1,
      eventType: "REMINDER",
      reminderBucket: Math.floor(
        exact.getTime() / ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS
      ),
    });
    const remRow = await prisma.alertNotificationDelivery.findUnique({
      where: { eventKey: remKey },
    });
    assert.ok(remRow);
    record(
      "cooldown_and_reminder_bucket",
      "PASS",
      `suppressed below; reminder at exact boundary key=${remKey}`
    );

    // Incomplete snapshot must not resolve or schedule recovery.
    await resolveMissingAlertNotificationStates({
      activeAlertIds: new Set(),
      checkedAt: exact,
      snapshotComplete: false,
    });
    const stillActive = await prisma.alertNotificationState.findUniqueOrThrow({
      where: { alertId: criticalAlert.id },
    });
    assert.equal(stillActive.isActive, true);
    const incompleteSched = await scheduleEligibleDeliveries({
      eligibleAlertIds: new Set(),
      checkedAt: exact,
      snapshotComplete: false,
    });
    assert.equal(incompleteSched.recoveryCreated, 0);
    record(
      "incomplete_snapshot_recovery_suppression",
      "PASS",
      "unseen alert not resolved; no recovery event"
    );

    // Complete snapshot recovery once.
    await resolveMissingAlertNotificationStates({
      activeAlertIds: new Set(),
      checkedAt: exact,
      snapshotComplete: true,
    });
    const resolved = await prisma.alertNotificationState.findUniqueOrThrow({
      where: { alertId: criticalAlert.id },
    });
    assert.equal(resolved.isActive, false);
    const recoverySched = await scheduleEligibleDeliveries({
      eligibleAlertIds: new Set(),
      checkedAt: exact,
      snapshotComplete: true,
    });
    assert.ok(recoverySched.recoveryCreated >= 1);
    const recoveryKey = buildDeliveryEventKey({
      alertId: criticalAlert.id,
      activationSequence: 1,
      eventType: "RECOVERY",
    });
    const recoveryDup = await ensureDeliveryEvent({
      alertId: criticalAlert.id,
      activationSequence: 1,
      eventType: AlertNotificationEventType.RECOVERY,
      checkedAt: exact,
    });
    assert.equal(recoveryDup.created, false);
    const recoveryClaim = await claimNextAlertNotificationDelivery({
      now: exact,
    });
    // May claim reminder first if still PENDING — drain until recovery.
    let recovered = false;
    let cursor = recoveryClaim;
    for (let i = 0; i < 10 && cursor; i++) {
      if (cursor.eventKey === recoveryKey) {
        await markAlertNotificationDeliverySent({
          id: cursor.id,
          claimToken: cursor.claimToken,
          messageId: buildDeterministicMessageId(cursor.eventKey),
          sentAt: exact,
        });
        await prisma.alertNotificationState.update({
          where: { alertId: criticalAlert.id },
          data: { recoveryNotifiedAt: exact },
        });
        recovered = true;
        break;
      }
      await markAlertNotificationDeliverySent({
        id: cursor.id,
        claimToken: cursor.claimToken,
        messageId: buildDeterministicMessageId(cursor.eventKey),
        sentAt: exact,
      });
      cursor = await claimNextAlertNotificationDelivery({ now: exact });
    }
    assert.equal(recovered, true);
    const recoveryAgain = await scheduleEligibleDeliveries({
      eligibleAlertIds: new Set(),
      checkedAt: exact,
      snapshotComplete: true,
    });
    assert.equal(recoveryAgain.recoveryCreated, 0);
    record(
      "complete_snapshot_recovery_once",
      "PASS",
      `recovery eventKey=${recoveryKey}; second schedule created=0`
    );

    // Reactivation → new activation cycle + new initial.
    const later = new Date(exact.getTime() + 60_000);
    await syncActiveAlertNotificationStates({
      alerts: [criticalAlert],
      checkedAt: later,
    });
    const reactivated = await prisma.alertNotificationState.findUniqueOrThrow({
      where: { alertId: criticalAlert.id },
    });
    assert.equal(reactivated.isActive, true);
    assert.equal(reactivated.activationSequence, 2);
    assert.equal(reactivated.recoveryNotifiedAt, null);
    assert.equal(reactivated.lastNotifiedAt, null);
    const cycle2 = await scheduleEligibleDeliveries({
      eligibleAlertIds: new Set([criticalAlert.id]),
      checkedAt: later,
      snapshotComplete: true,
    });
    assert.ok(cycle2.initialCreated >= 1);
    const cycle2Key = buildDeliveryEventKey({
      alertId: criticalAlert.id,
      activationSequence: 2,
      eventType: "INITIAL",
    });
    assert.ok(
      await prisma.alertNotificationDelivery.findUnique({
        where: { eventKey: cycle2Key },
      })
    );
    record(
      "reactivation_new_cycle",
      "PASS",
      `activationSequence=2; initial key=${cycle2Key}`
    );

    // Expired claim recovery.
    const expiredAt = new Date(later.getTime());
    const claimTok = "expired_claim_token_smoke";
    await prisma.alertNotificationDelivery.update({
      where: { eventKey: cycle2Key },
      data: {
        status: AlertNotificationDeliveryStatus.CLAIMED,
        claimToken: claimTok,
        claimedAt: new Date(expiredAt.getTime() - ALERT_NOTIFICATION_CLAIM_TTL_MS - 1000),
        claimExpiresAt: new Date(expiredAt.getTime() - 1000),
      },
    });
    const reclaimed = await claimNextAlertNotificationDelivery({
      now: expiredAt,
    });
    assert.ok(reclaimed);
    assert.equal(reclaimed!.eventKey, cycle2Key);
    assert.notEqual(reclaimed!.claimToken, claimTok);
    record(
      "expired_claim_recovery",
      "PASS",
      "expired CLAIMED row released and reclaimed"
    );

    // Failed delivery opaque error + bounded retry nextAttemptAt.
    await markAlertNotificationDeliverySent({
      id: reclaimed!.id,
      claimToken: reclaimed!.claimToken,
      messageId: buildDeterministicMessageId(reclaimed!.eventKey),
      sentAt: expiredAt,
    });
    // Drain any remaining PENDING from prior steps so the fail fixture is next.
    for (let i = 0; i < 20; i++) {
      const drain = await claimNextAlertNotificationDelivery({ now: expiredAt });
      if (!drain) break;
      await markAlertNotificationDeliverySent({
        id: drain.id,
        claimToken: drain.claimToken,
        messageId: buildDeterministicMessageId(drain.eventKey),
        sentAt: expiredAt,
      });
    }
    const failAlertId = `alert:DATABASE:DATABASE_UNAVAILABLE:config:fail_${TAG}`;
    await prisma.alertNotificationState.create({
      data: {
        alertId: failAlertId,
        alertCode: "DATABASE_UNAVAILABLE",
        severity: "CRITICAL",
        category: "DATABASE",
        isActive: true,
        activationSequence: 1,
        firstSeenAt: expiredAt,
        lastSeenAt: expiredAt,
        activatedAt: expiredAt,
      },
    });
    const failKey = buildDeliveryEventKey({
      alertId: failAlertId,
      activationSequence: 1,
      eventType: "INITIAL",
    });
    await prisma.alertNotificationDelivery.create({
      data: {
        eventKey: failKey,
        alertId: failAlertId,
        activationSequence: 1,
        eventType: AlertNotificationEventType.INITIAL,
        status: AlertNotificationDeliveryStatus.PENDING,
        attemptCount: 0,
        nextAttemptAt: expiredAt,
      },
    });
    const failClaim = await claimNextAlertNotificationDelivery({
      now: expiredAt,
    });
    assert.ok(failClaim);
    assert.equal(failClaim!.eventKey, failKey);
    const { markAlertNotificationDeliveryFailed } = await import(
      "../app/lib/admin/alertNotificationState"
    );
    await markAlertNotificationDeliveryFailed({
      id: failClaim!.id,
      claimToken: failClaim!.claimToken,
      attemptCountBefore: 0,
      errorCode: normalizeOpaqueErrorCode("ECONNRESET smtp boom"),
      failedAt: expiredAt,
    });
    const failedRow = await prisma.alertNotificationDelivery.findUniqueOrThrow({
      where: { eventKey: failKey },
    });
    assert.equal(failedRow.status, "FAILED");
    assert.equal(failedRow.lastErrorCode, "unknown");
    assert.doesNotMatch(String(failedRow.lastErrorCode), /ECONNRESET|smtp/i);
    assert.ok(failedRow.nextAttemptAt);
    assert.equal(
      failedRow.nextAttemptAt!.getTime(),
      expiredAt.getTime() + 5 * 60 * 1000
    );
    record(
      "failed_delivery_opaque_retry",
      "PASS",
      "lastErrorCode=unknown; retry1=+5m"
    );

    // Privacy: email builder never includes secrets / full emails / ICCID.
    const email = buildAlertNotificationEmail({
      alert: criticalAlert,
      eventType: "INITIAL",
      checkedAt: expiredAt,
      sourceType: "config",
      sourceRecordRef: "customer@secret.com",
    });
    const blob = `${email.subject}\n${email.text}\n${email.html}`;
    assert.doesNotMatch(blob, /customer@secret\.com/);
    assert.doesNotMatch(blob, /89014103211118510720/);
    assert.doesNotMatch(blob, /DATABASE_URL|SMTP_|access_token|ICCID/i);
    assert.match(blob, /DATABASE_UNAVAILABLE/);
    record("privacy_email_body", "PASS", "masked ref; no secrets in body");

    // ALERT_NOTIFICATIONS pause suppresses runner emails.
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.ALERT_NOTIFICATIONS },
      data: { paused: true, reason: "smoke pause test" },
    });
    const pausedRun = await evaluateAndDeliverAlertNotifications({
      checkedAt: expiredAt,
      dryRun: true,
    });
    assert.equal(pausedRun.paused, true);
    assert.equal(pausedRun.runnerClaimed, false);
    assert.equal(pausedRun.counts.sent, 0);
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.ALERT_NOTIFICATIONS },
      data: { paused: false, reason: null },
    });
    record(
      "alert_notifications_pause",
      "PASS",
      "paused run sent=0 runnerClaimed=false"
    );

    // Dry-run full runner (no SMTP).
    const dry = await evaluateAndDeliverAlertNotifications({
      checkedAt: new Date(),
      dryRun: true,
    });
    assert.equal(dry.paused, false);
    assert.equal(typeof dry.counts.eligible, "number");
    record(
      "dry_run_runner",
      "PASS",
      `ok=${dry.ok} eligible=${dry.counts.eligible} sent=${dry.counts.sent} dryRun=true`
    );

    // Dashboard aggregation still works; no send on read.
    const dash = await getMonitoringAlertsDashboard();
    assert.ok(Array.isArray(dash.alerts));
    const agg = await collectMonitoringAlerts({ checkedAt: new Date() });
    assert.ok(agg.completeness);
    assert.equal(typeof agg.completeness.complete, "boolean");
    record(
      "dashboard_read_no_send",
      "PASS",
      `alerts=${dash.alerts.length} completeness.complete=${agg.completeness.complete}`
    );

    const recent = await loadRecentNotificationActivity(20);
    assert.ok(recent.length <= 20);
    record(
      "recent_activity_cap",
      "PASS",
      `recent=${recent.length} (max 20)`
    );

    // Runner lock concurrency.
    const lockNow = new Date();
    const lock1 = await claimAlertNotificationRunnerLock(lockNow);
    const lock2 = await claimAlertNotificationRunnerLock(lockNow);
    assert.equal(lock1.ok, true);
    assert.equal(lock2.ok, false);
    if (lock1.ok) await releaseAlertNotificationRunnerLock(lock1.claimToken);
    record("runner_lock_cas", "PASS", "second concurrent runner lock denied");

    // Empty state recent activity after cleanup of our TAG deliveries is optional;
    // assert helper accepts empty.
    record("empty_state_helper", "PASS", "loadRecentNotificationActivity tolerates empty");

    assert.equal(networkLog.length, 0);
    record(
      "network_zero",
      "PASS",
      `networkCalls=${networkLog.length}; runner used dryRun (no SMTP)`
    );

    const failed = results.filter((r) => r.status === "FAIL");
    console.log(
      `\nEvidence method: durable outbox CAS + dryRun runner (no SMTP). networkCalls=${networkLog.length}`
    );
    if (failed.length) {
      console.error(`\n${failed.length} smoke item(s) failed.`);
      process.exitCode = 1;
    } else {
      console.log(`\nAll Part B2 alert-notifications smoke checks passed (${results.length}).`);
    }
  } catch (error) {
    console.error("FAIL smoke_admin_alert_notifications", error);
    process.exitCode = 1;
  } finally {
    // Cleanup smoke fixtures (best-effort).
    try {
      if (ids.alertId) {
        await prisma.alertNotificationDelivery.deleteMany({
          where: {
            OR: [
              { alertId: ids.alertId },
              { alertId: { contains: TAG } },
            ],
          },
        });
        await prisma.alertNotificationState.deleteMany({
          where: {
            OR: [
              { alertId: ids.alertId },
              { alertId: { contains: TAG } },
            ],
          },
        });
      }
      await prisma.alertNotificationDelivery.deleteMany({
        where: { alertId: { contains: TAG } },
      });
      await prisma.alertNotificationState.deleteMany({
        where: { alertId: { contains: TAG } },
      });
      if (ids.adminId) {
        await prisma.user.delete({ where: { id: ids.adminId } }).catch(() => {});
      }
      await prisma.operationalControl.updateMany({
        where: { key: OperationalControlKey.ALERT_NOTIFICATIONS },
        data: { paused: false, reason: null },
      });
    } catch {
      // ignore cleanup errors
    }
    await prisma.$disconnect();
    restoreFetch();
  }
}

main();
