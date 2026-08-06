/**
 * Offline QA for Monitoring & Alerts Part B2 — durable notification lifecycle.
 * No Prisma, no network, no real email, no .env mutation of secrets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALERT_NOTIFICATION_CONFIRM_PHRASE,
  ALERT_NOTIFICATION_ERROR_CODES,
  ALERT_NOTIFICATION_HIGH_ALLOWLIST,
  ALERT_NOTIFICATION_MAX_ATTEMPTS,
  ALERT_NOTIFICATION_MAX_RECIPIENTS,
  ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS,
  ALERT_NOTIFICATION_RETRY_DELAYS_MS,
  buildAggregationCompleteness,
  buildDeliveryEventKey,
  buildDeterministicMessageId,
  buildSafeAdminAlertUrl,
  cooldownElapsed,
  deriveDisplayStatus,
  evidenceSafeAlertSummary,
  isAlertEligibleForNotification,
  isCooldownActive,
  isHighAllowlistedForNotification,
  maskInternalReference,
  nextRetryAt,
  normalizeOpaqueErrorCode,
  parseAlertNotificationRecipients,
  reminderCooldownBucket,
  sanitizeSourceType,
} from "../app/lib/admin/alertNotificationShared";
import { makeAlert, type MonitoringAlertCode } from "../app/lib/admin/monitoringAlertShared";
import {
  OPERATIONAL_CONTROL_KEYS,
  requiredControlsForFlow,
} from "../app/lib/admin/operationalControlsShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const CRITICAL_CODES: MonitoringAlertCode[] = [
  "DATABASE_UNAVAILABLE",
  "RECON_CRITICAL_PRIORITY",
  "SECURITY_AUTH_SECRET_MISSING",
  "SECURITY_ICCID_KEY_MISSING",
];

const DENIED_HIGH: MonitoringAlertCode[] = [
  "CONTROL_TRANSACTIONS_PAUSED",
  "WALLET_PURCHASE_PENDING_STALE",
  "RECON_PROVIDER_UNCERTAIN",
  "PROVIDER_LIVE_HOST_UNCONFIRMED",
];

function main() {
  const shared = read("app/lib/admin/alertNotificationShared.ts");
  const stateSrc = read("app/lib/admin/alertNotificationState.ts");
  const runner = read("app/lib/admin/alertNotificationRunner.ts");
  const delivery = read("app/lib/admin/alertNotificationDelivery.ts");
  const actions = read("app/lib/admin/alertNotificationActions.ts");
  const panel = read("app/components/admin/RunAlertNotificationsPanel.tsx");
  const alertsPage = read("app/admin/alerts/page.tsx");
  const opsPage = read("app/admin/operations/page.tsx");
  const monitoring = read("app/lib/admin/monitoringAlerts.ts");
  const opsShared = read("app/lib/admin/operationalControlsShared.ts");
  const schema = read("prisma/schema.prisma");
  const migEnum = read(
    "prisma/migrations/20260807010000_add_alert_notifications_control_enum/migration.sql"
  );
  const migTables = read(
    "prisma/migrations/20260807010100_add_alert_notification_delivery/migration.sql"
  );
  const envExample = read(".env.example");
  const pkg = read("package.json");

  // --- Schema / migration ---
  assert.match(schema, /model AlertNotificationState/);
  assert.match(schema, /model AlertNotificationDelivery/);
  assert.match(schema, /model AlertNotificationRunnerLock/);
  assert.match(schema, /ALERT_NOTIFICATIONS/);
  assert.match(schema, /activationSequence/);
  assert.match(schema, /eventKey/);
  assert.match(migEnum, /ALERT_NOTIFICATIONS/);
  assert.match(migTables, /AlertNotificationState/);
  assert.match(migTables, /AlertNotificationDelivery/);
  assert.match(migTables, /UNIQUE INDEX "AlertNotificationDelivery_eventKey_key"/);
  assert.match(envExample, /ALERT_NOTIFICATION_RECIPIENTS=/);
  assert.doesNotMatch(envExample, /ALERT_NOTIFICATION_RECIPIENTS=.+@/);
  assert.match(pkg, /qa:admin-alert-notifications/);
  assert.match(pkg, /smoke:admin-alert-notifications/);
  console.log("PASS schema_migration_env");

  // --- Eligibility ---
  for (const code of CRITICAL_CODES) {
    assert.equal(
      isAlertEligibleForNotification({ severity: "CRITICAL", code }),
      true,
      code
    );
  }
  for (const code of ALERT_NOTIFICATION_HIGH_ALLOWLIST) {
    assert.equal(
      isAlertEligibleForNotification({ severity: "HIGH", code }),
      true,
      code
    );
  }
  assert.equal(
    isHighAllowlistedForNotification("CONTROL_TRANSACTIONS_PAUSED"),
    false
  );
  for (const code of DENIED_HIGH) {
    assert.equal(
      isAlertEligibleForNotification({ severity: "HIGH", code }),
      false,
      code
    );
  }
  assert.equal(
    isAlertEligibleForNotification({
      severity: "WARNING",
      code: "CONTROL_ALERT_NOTIFICATIONS_PAUSED",
    }),
    false
  );
  assert.equal(
    isAlertEligibleForNotification({
      severity: "INFO",
      code: "PAYMENT_GATEWAY_NOT_IMPLEMENTED",
    }),
    false
  );
  assert.equal(
    isAlertEligibleForNotification({
      severity: "WARNING",
      code: "EMAIL_ORDER_FAILED",
    }),
    false
  );
  // Intentional control pause alert is never emailed (WARNING + not CRITICAL).
  assert.match(monitoring, /CONTROL_ALERT_NOTIFICATIONS_PAUSED/);
  assert.match(monitoring, /never email-eligible|never emailed/i);
  // Deny-list evidence: CONTROL_TRANSACTIONS_PAUSED is mentioned only as excluded.
  assert.match(shared, /CONTROL_TRANSACTIONS_PAUSED intentionally excluded/);
  assert.equal(
    ALERT_NOTIFICATION_HIGH_ALLOWLIST.includes(
      "CONTROL_TRANSACTIONS_PAUSED" as never
    ),
    false
  );
  // Allowlist is compile-time checked via satisfies MonitoringAlertCode[].
  assert.match(shared, /satisfies readonly MonitoringAlertCode/);
  console.log("PASS eligibility_allowlist");

  // --- Event keys / reactivation cycles ---
  const alertId = "alert:DATABASE:DATABASE_UNAVAILABLE:config:none";
  assert.equal(
    buildDeliveryEventKey({
      alertId,
      activationSequence: 1,
      eventType: "INITIAL",
    }),
    `${alertId}:1:initial`
  );
  assert.equal(
    buildDeliveryEventKey({
      alertId,
      activationSequence: 2,
      eventType: "INITIAL",
    }),
    `${alertId}:2:initial`
  );
  const bucket = reminderCooldownBucket(1_700_000_000_000);
  assert.equal(
    buildDeliveryEventKey({
      alertId,
      activationSequence: 1,
      eventType: "REMINDER",
      reminderBucket: bucket,
    }),
    `${alertId}:1:reminder:${bucket}`
  );
  assert.equal(
    buildDeliveryEventKey({
      alertId,
      activationSequence: 1,
      eventType: "RECOVERY",
    }),
    `${alertId}:1:recovery`
  );
  // Prior recovery key for cycle 1 does not collide with cycle 2 initial.
  assert.notEqual(
    buildDeliveryEventKey({
      alertId,
      activationSequence: 1,
      eventType: "RECOVERY",
    }),
    buildDeliveryEventKey({
      alertId,
      activationSequence: 2,
      eventType: "INITIAL",
    })
  );
  assert.match(stateSrc, /activationSequence:\s*existing\.activationSequence \+ 1/);
  assert.match(stateSrc, /Genuine reactivation/);
  console.log("PASS event_keys_reactivation");

  // --- Cooldown boundaries (6h) ---
  const cooldown = ALERT_NOTIFICATION_REMINDER_COOLDOWN_MS;
  assert.equal(cooldown, 6 * 60 * 60 * 1000);
  const last = new Date("2026-08-07T00:00:00.000Z");
  const justBelow = new Date(last.getTime() + cooldown - 1);
  const exact = new Date(last.getTime() + cooldown);
  const justAbove = new Date(last.getTime() + cooldown + 1);
  assert.equal(isCooldownActive({ lastNotifiedAt: last, checkedAt: justBelow }), true);
  assert.equal(cooldownElapsed({ lastNotifiedAt: last, checkedAt: justBelow }), false);
  assert.equal(isCooldownActive({ lastNotifiedAt: last, checkedAt: exact }), false);
  assert.equal(cooldownElapsed({ lastNotifiedAt: last, checkedAt: exact }), true);
  assert.equal(isCooldownActive({ lastNotifiedAt: last, checkedAt: justAbove }), false);
  assert.equal(cooldownElapsed({ lastNotifiedAt: last, checkedAt: justAbove }), true);
  const t0 = Date.parse("2026-08-07T00:00:00.000Z");
  assert.equal(
    reminderCooldownBucket(t0),
    Math.floor(t0 / cooldown)
  );
  console.log("PASS cooldown_boundaries_bucket");

  // --- Aggregation completeness / recovery proof ---
  assert.equal(
    buildAggregationCompleteness({
      sectionErrors: [],
      databaseOk: true,
      recordsEvaluated: true,
    }).complete,
    true
  );
  assert.equal(
    buildAggregationCompleteness({
      sectionErrors: ["RECORDS"],
      databaseOk: true,
      recordsEvaluated: false,
    }).complete,
    false
  );
  assert.equal(
    buildAggregationCompleteness({
      sectionErrors: ["DATABASE"],
      databaseOk: false,
      recordsEvaluated: false,
    }).complete,
    false
  );
  assert.match(runner, /snapshotComplete:\s*completeness\.complete/);
  assert.match(stateSrc, /if \(!input\.snapshotComplete\) return 0/);
  assert.match(stateSrc, /Recovery only with complete snapshot/);
  assert.match(runner, /releaseAlertNotificationDeliveryClaim/);
  console.log("PASS aggregation_completeness_recovery");

  // --- Retry timings ---
  assert.deepEqual([...ALERT_NOTIFICATION_RETRY_DELAYS_MS], [
    5 * 60 * 1000,
    30 * 60 * 1000,
    2 * 60 * 60 * 1000,
    6 * 60 * 60 * 1000,
  ]);
  const from = new Date("2026-08-07T00:00:00.000Z");
  assert.equal(nextRetryAt(1, from)?.getTime(), from.getTime() + 5 * 60 * 1000);
  assert.equal(nextRetryAt(2, from)?.getTime(), from.getTime() + 30 * 60 * 1000);
  assert.equal(nextRetryAt(3, from)?.getTime(), from.getTime() + 2 * 60 * 60 * 1000);
  assert.equal(nextRetryAt(4, from)?.getTime(), from.getTime() + 6 * 60 * 60 * 1000);
  assert.equal(nextRetryAt(5, from), null);
  assert.equal(ALERT_NOTIFICATION_MAX_ATTEMPTS, 5);
  console.log("PASS bounded_retry_timings");

  // --- Recipients ---
  assert.equal(parseAlertNotificationRecipients("").ok, false);
  assert.equal(parseAlertNotificationRecipients(null).ok, false);
  assert.equal(parseAlertNotificationRecipients("not-an-email").ok, false);
  assert.equal(
    parseAlertNotificationRecipients("a@example.com, bad").ok,
    false
  );
  const trimmed = parseAlertNotificationRecipients(
    "  Ops@Example.com , ops@example.com, other@example.com "
  );
  assert.equal(trimmed.ok, true);
  if (trimmed.ok) {
    assert.deepEqual(trimmed.recipients, [
      "ops@example.com",
      "other@example.com",
    ]);
  }
  const eleven = Array.from(
    { length: ALERT_NOTIFICATION_MAX_RECIPIENTS + 1 },
    (_, i) => `u${i}@example.com`
  ).join(",");
  assert.equal(parseAlertNotificationRecipients(eleven).ok, false);
  const ten = Array.from(
    { length: ALERT_NOTIFICATION_MAX_RECIPIENTS },
    (_, i) => `u${i}@example.com`
  ).join(",");
  assert.equal(parseAlertNotificationRecipients(ten).ok, true);
  console.log("PASS recipients_parse_trim_dedup_cap");

  // --- Privacy / masking / opaque errors ---
  assert.equal(maskInternalReference("customer@example.com"), "••••");
  assert.equal(maskInternalReference("abc"), "••••");
  const masked = maskInternalReference("cuid_abcdef1234567890");
  assert.equal(masked, "cuid…7890");
  assert.ok(masked && !masked.includes("abcdef123456"));
  assert.equal(sanitizeSourceType("Wallet Purchase!!"), "wallet_purchase__");
  assert.equal(buildSafeAdminAlertUrl("http://localhost:3000"), null);
  assert.equal(buildSafeAdminAlertUrl("https://evil.example"), null);
  assert.equal(
    buildSafeAdminAlertUrl("https://mapesim.com"),
    "https://mapesim.com/admin/alerts"
  );
  const alert = makeAlert({
    category: "EMAIL",
    code: "EMAIL_ORDER_FAILED",
    severity: "WARNING",
    title: "Failed <script>",
    description: "customer@secret.com ICCID 89014103211118510720",
    sourceType: "order_email",
    recordId: "e1",
    sourceAt: new Date(),
    now: new Date(),
    freshness: "DATABASE_DERIVED",
    recommendedAction: "Review",
  });
  const summary = evidenceSafeAlertSummary(alert);
  assert.doesNotMatch(summary, /</);
  assert.match(delivery, /channel:\s*"support"/);
  assert.match(delivery, /never logs recipients|Never logs recipients/i);
  assert.match(delivery, /SMTP cannot guarantee perfect exactly-once/);
  assert.match(delivery, /getPublicAppBaseUrl/);
  for (const bad of [
    "ICCID",
    "access_token",
    "DATABASE_URL",
    "SMTP_SUPPORT_PASSWORD",
    "provider raw",
  ]) {
    assert.doesNotMatch(
      delivery,
      new RegExp(`${bad}\\s*[:=]\\s*[^\\n]+`, "i")
    );
  }
  assert.equal(normalizeOpaqueErrorCode("ECONNRESET boom smtp"), "unknown");
  assert.equal(normalizeOpaqueErrorCode("send_failed"), "send_failed");
  assert.ok(ALERT_NOTIFICATION_ERROR_CODES.includes("send_failed"));
  assert.match(stateSrc, /normalizeOpaqueErrorCode/);
  assert.match(schema, /opaque code only|never raw SMTP/i);
  console.log("PASS privacy_masking_opaque_errors");

  // --- Display status derived (no NOT_ELIGIBLE/COOLDOWN rows) ---
  const now = new Date("2026-08-07T12:00:00.000Z");
  assert.equal(
    deriveDisplayStatus({
      eligible: false,
      latestDeliveryStatus: null,
      lastNotifiedAt: null,
      checkedAt: now,
    }),
    "not_eligible"
  );
  assert.equal(
    deriveDisplayStatus({
      eligible: true,
      latestDeliveryStatus: "PENDING",
      lastNotifiedAt: null,
      checkedAt: now,
    }),
    "pending"
  );
  assert.equal(
    deriveDisplayStatus({
      eligible: true,
      latestDeliveryStatus: "FAILED",
      lastNotifiedAt: null,
      checkedAt: now,
    }),
    "failed"
  );
  assert.equal(
    deriveDisplayStatus({
      eligible: true,
      latestDeliveryStatus: "SENT",
      lastNotifiedAt: new Date(now.getTime() - 1000),
      checkedAt: now,
    }),
    "cooldown"
  );
  assert.equal(
    deriveDisplayStatus({
      eligible: true,
      latestDeliveryStatus: "SENT",
      lastNotifiedAt: new Date(now.getTime() - cooldown - 1000),
      checkedAt: now,
    }),
    "notified"
  );
  assert.doesNotMatch(schema, /NOT_ELIGIBLE|COOLDOWN/);
  console.log("PASS derived_display_status");

  // --- Concurrency / CAS / message id ---
  assert.match(stateSrc, /updateMany/);
  assert.match(stateSrc, /claimToken/);
  assert.match(stateSrc, /claimExpiresAt/);
  assert.match(stateSrc, /P2002/);
  assert.match(runner, /claimAlertNotificationRunnerLock/);
  const mid = buildDeterministicMessageId(`${alertId}:1:initial`);
  assert.match(mid, /^<alert-notify\./);
  assert.match(delivery, /messageId/);
  console.log("PASS concurrency_cas_message_id");

  // --- Operational control ---
  assert.ok(OPERATIONAL_CONTROL_KEYS.includes("ALERT_NOTIFICATIONS"));
  assert.equal(
    requiredControlsForFlow("customer_wallet_purchase").includes(
      "ALERT_NOTIFICATIONS"
    ),
    false
  );
  assert.equal(
    requiredControlsForFlow("admin_wallet_purchase", {
      includeProviderOrder: true,
    }).includes("ALERT_NOTIFICATIONS"),
    false
  );
  assert.equal(
    requiredControlsForFlow("company_assignment", {
      includeProviderOrder: true,
    }).includes("ALERT_NOTIFICATIONS"),
    false
  );
  assert.match(opsShared, /Alert-notification pause must not affect/);
  assert.match(runner, /controls\.map\.ALERT_NOTIFICATIONS/);
  assert.match(actions, /ALERT_NOTIFICATIONS/);
  console.log("PASS alert_notifications_control");

  // --- Manual admin action ---
  assert.equal(ALERT_NOTIFICATION_CONFIRM_PHRASE, "RUN ALERT NOTIFICATIONS");
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /assertSameOriginAdminRequest/);
  assert.match(actions, /consumeRateLimit/);
  assert.match(actions, /ALERT_NOTIFICATION_CONFIRM_PHRASE/);
  assert.match(actions, /counts:\s*result\.counts/);
  assert.doesNotMatch(actions, /recipients\.join|SMTP_/);
  assert.match(opsPage, /RunAlertNotificationsPanel/);
  assert.match(panel, /ALERT_NOTIFICATION_CONFIRM_PHRASE|RUN ALERT NOTIFICATIONS/);
  assert.match(panel, /eligible|sent|suppressed|cooldown|failed|recovery/);
  assert.doesNotMatch(panel, /useEffect[\s\S]{0,200}runAlertNotifications/);
  console.log("PASS manual_admin_action");

  // --- No page-load send ---
  assert.doesNotMatch(alertsPage, /evaluateAndDeliverAlertNotifications/);
  assert.doesNotMatch(opsPage, /evaluateAndDeliverAlertNotifications/);
  assert.match(alertsPage, /never triggers sends|Read-only notification status/i);
  assert.match(alertsPage, /loadNotificationViewsForAlerts/);
  assert.match(alertsPage, /loadRecentNotificationActivity/);
  assert.match(alertsPage, /Recent notification activity/);
  assert.doesNotMatch(alertsPage, /runAlertNotificationsAction|evaluateAndDeliver/);
  assert.doesNotMatch(
    alertsPage,
    /onClick=\{[^}]*resend|name="acknowledge"|Mute alert|Delete alert/i
  );
  assert.doesNotMatch(monitoring, /evaluateAndDeliverAlertNotifications/);
  assert.match(runner, /Never invoked from page-load|never invoked from page-load/i);
  console.log("PASS no_page_load_send_admin_visibility");

  // --- Dry-run / no real email path in smoke ---
  assert.match(runner, /dryRun/);
  assert.match(pkg, /smoke:admin-alert-notifications/);
  console.log("PASS dry_run_smoke_hooks");

  console.log("\nAll Part B2 alert-notifications QA checks passed.");
}

main();
