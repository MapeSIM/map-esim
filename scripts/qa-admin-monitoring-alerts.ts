/**
 * Offline QA for Monitoring & Alerts Part B1 — read-only internal alert center.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALERT_CATEGORIES,
  ALERT_SEVERITIES,
  MONITORING_THRESHOLDS,
  ageMeetsThreshold,
  buildAlertId,
  dedupeMonitoringAlerts,
  filterMonitoringAlerts,
  isSafeAdminHref,
  makeAlert,
  parseAlertCategoryFilter,
  parseAlertSeverityFilter,
  sortMonitoringAlerts,
  summarizeMonitoringAlerts,
  type MonitoringAlert,
} from "../app/lib/admin/monitoringAlertShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function sampleAlerts(): MonitoringAlert[] {
  const now = new Date("2026-08-06T12:00:00.000Z");
  return [
    makeAlert({
      category: "RECONCILIATION",
      code: "RECON_CRITICAL_PRIORITY",
      severity: "CRITICAL",
      title: "CRITICAL reconciliation case",
      description: "Critical case",
      sourceType: "wallet_purchase",
      recordId: "p1",
      sourceAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      now,
      freshness: "DATABASE_DERIVED",
      href: "/admin/reconciliation/wallet_purchase/p1",
      recommendedAction: "Open case",
    }),
    makeAlert({
      category: "WALLET_PURCHASE",
      code: "WALLET_PURCHASE_STUCK_BEFORE_PROVIDER",
      severity: "HIGH",
      title: "Stuck purchase",
      description: "Funds reserved stale",
      sourceType: "wallet_purchase",
      recordId: "p2",
      sourceAt: new Date(now.getTime() - 40 * 60 * 1000),
      now,
      freshness: "DATABASE_DERIVED",
      href: "/admin/reconciliation/wallet_purchase/p2",
      recommendedAction: "Review",
    }),
    makeAlert({
      category: "EMAIL",
      code: "EMAIL_ORDER_FAILED",
      severity: "WARNING",
      title: "Failed order email",
      description: "Email failed",
      sourceType: "order_email",
      recordId: "e1",
      sourceAt: new Date(now.getTime() - 10 * 60 * 1000),
      now,
      freshness: "DATABASE_DERIVED",
      href: "/admin/reconciliation/order_email/e1",
      recommendedAction: "Resend from recon",
    }),
    makeAlert({
      category: "PAYMENT",
      code: "PAYMENT_GATEWAY_NOT_IMPLEMENTED",
      severity: "INFO",
      title: "Payment not implemented",
      description: "Informational",
      sourceAt: now,
      now,
      freshness: "CONFIGURATION_DERIVED",
      href: "/admin/operations",
      recommendedAction: "Track readiness",
    }),
  ];
}

function main() {
  const shared = read("app/lib/admin/monitoringAlertShared.ts");
  const service = read("app/lib/admin/monitoringAlerts.ts");
  const page = read("app/admin/alerts/page.tsx");
  const opsPage = read("app/admin/operations/page.tsx");
  const nav = read("app/components/admin/AdminNav.tsx");
  const layout = read("app/admin/layout.tsx");
  const headersSrc = read("app/lib/security/headers.ts");
  const pkg = read("package.json");
  const schema = read("prisma/schema.prisma");

  // AUTHORIZATION
  assert.match(service, /requireActiveAdminForAlerts/);
  assert.match(service, /requireRole\("ADMIN"\)/);
  assert.match(service, /deletedAt/);
  assert.match(service, /role !== Role\.ADMIN/);
  assert.match(page, /requireActiveAdminForAlerts/);
  assert.match(layout, /requireRole\("ADMIN"\)/);
  assert.match(layout, /robots:\s*\{\s*index:\s*false/);
  assert.match(headersSrc, /"\/admin"/);
  assert.match(headersSrc, /"\/admin\/:path\*"/);
  assert.match(headersSrc, /PRIVATE_NO_STORE/);
  console.log("PASS authorization");

  // No new alert persistence model required
  assert.doesNotMatch(schema, /model\s+MonitoringAlert|model\s+Alert\b/);
  assert.match(shared, /operational defaults, not provider guarantees/i);
  assert.equal(MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS, 15 * 60 * 1000);
  assert.equal(MONITORING_THRESHOLDS.STALE_ASSIGNMENT_AGE_MS, 15 * 60 * 1000);
  assert.equal(
    MONITORING_THRESHOLDS.UNRESOLVED_RECONCILIATION_AGE_MS,
    24 * 60 * 60 * 1000
  );
  assert.equal(MONITORING_THRESHOLDS.LOCKED_CASE_AGE_MS, 4 * 60 * 60 * 1000);
  assert.equal(MONITORING_THRESHOLDS.PROVIDER_REFRESH_STUCK_AGE_MS, 90_000);
  assert.equal(
    MONITORING_THRESHOLDS.UNRESOLVED_EMAIL_FAILURE_AGE_MS,
    2 * 60 * 60 * 1000
  );
  assert.equal(MONITORING_THRESHOLDS.DATABASE_DEGRADED_LATENCY_MS, 500);
  console.log("PASS thresholds_no_persistence");

  // Alert rules / ordering / filtering
  assert.deepEqual([...ALERT_SEVERITIES], ["CRITICAL", "HIGH", "WARNING", "INFO"]);
  assert.ok(ALERT_CATEGORIES.includes("RECONCILIATION"));
  assert.ok(ALERT_CATEGORIES.includes("OPERATIONAL_CONTROL"));
  const alerts = sampleAlerts();
  const sorted = sortMonitoringAlerts(alerts);
  assert.equal(sorted[0].severity, "CRITICAL");
  assert.equal(sorted[1].severity, "HIGH");
  assert.equal(parseAlertSeverityFilter("critical"), "CRITICAL");
  assert.equal(parseAlertSeverityFilter("nope"), "ALL");
  assert.equal(parseAlertCategoryFilter("email"), "EMAIL");
  const onlyHigh = filterMonitoringAlerts(alerts, { severity: "HIGH" });
  assert.equal(onlyHigh.length, 1);
  assert.equal(onlyHigh[0].code, "WALLET_PURCHASE_STUCK_BEFORE_PROVIDER");
  const onlyPay = filterMonitoringAlerts(alerts, { category: "PAYMENT" });
  assert.equal(onlyPay.length, 1);
  const summary = summarizeMonitoringAlerts(alerts);
  assert.equal(summary.totalActive, 4);
  assert.equal(summary.criticalCount, 1);
  assert.equal(summary.highCount, 1);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.infoCount, 1);
  console.log("PASS alert_rules_filter_sort");

  // Deterministic ids
  const id1 = buildAlertId({
    category: "WALLET_PURCHASE",
    code: "WALLET_PURCHASE_PENDING_STALE",
    sourceType: "wallet_purchase",
    recordId: "abc123",
  });
  const id2 = buildAlertId({
    category: "WALLET_PURCHASE",
    code: "WALLET_PURCHASE_PENDING_STALE",
    sourceType: "wallet_purchase",
    recordId: "abc123",
  });
  assert.equal(id1, id2);
  assert.match(id1, /^alert:WALLET_PURCHASE:WALLET_PURCHASE_PENDING_STALE:/);
  assert.equal(isSafeAdminHref("/admin/reconciliation"), true);
  assert.equal(isSafeAdminHref("https://evil.example"), false);
  assert.equal(isSafeAdminHref("/account"), false);
  console.log("PASS deterministic_ids_safe_hrefs");

  // Service content coverage
  const requiredCodes = [
    "DATABASE_UNAVAILABLE",
    "DATABASE_DEGRADED",
    "RECON_CRITICAL_PRIORITY",
    "RECON_HIGH_PRIORITY",
    "RECON_PROVIDER_UNCERTAIN",
    "RECON_REFUND_PENDING",
    "RECON_FINALIZATION_FAILED",
    "RECON_ICCID_PENDING",
    "RECON_ICCID_CONFLICT",
    "RECON_EMAIL_FAILED",
    "RECON_LOCKED_STALE",
    "RECON_UNRESOLVED_STALE",
    "RECON_REFRESH_STUCK",
    "WALLET_PURCHASE_STUCK_BEFORE_PROVIDER",
    "WALLET_PURCHASE_PROVIDER_UNCERTAIN",
    "WALLET_PURCHASE_RECONCILIATION_REQUIRED",
    "WALLET_PURCHASE_REFUND_INCOMPLETE",
    "WALLET_PURCHASE_FINALIZATION_FAILED",
    "WALLET_PURCHASE_PENDING_STALE",
    "ASSIGNMENT_PROVIDER_PENDING_STALE",
    "ASSIGNMENT_RECONCILIATION_REQUIRED",
    "ASSIGNMENT_FINALIZATION_FAILED",
    "ASSIGNMENT_MISSING_ORDER",
    "ASSIGNMENT_STALE",
    "EMAIL_ORDER_FAILED",
    "EMAIL_WALLET_FAILED",
    "EMAIL_SMTP_NOT_CONFIGURED",
    "EMAIL_REPEATED_UNRESOLVED",
    "EMAIL_OLDEST_UNRESOLVED_STALE",
    "PROVIDER_CONFIG_INVALID",
    "PROVIDER_LIVE_HOST_UNCONFIRMED",
    "PROVIDER_UNCERTAIN_CASES",
    "PROVIDER_REFRESH_STUCK",
    "PROVIDER_RECENT_UNCERTAINTY",
    "CONTROL_TRANSACTIONS_PAUSED",
    "CONTROL_CUSTOMER_PURCHASES_PAUSED",
    "CONTROL_ADMIN_PURCHASES_PAUSED",
    "CONTROL_COMPANY_ASSIGNMENTS_PAUSED",
    "CONTROL_PROVIDER_ORDERS_PAUSED",
    "CONTROL_ALERT_NOTIFICATIONS_PAUSED",
    "CONTROL_STATE_UNAVAILABLE",
    "PAYMENT_GATEWAY_NOT_IMPLEMENTED",
    "PAYMENT_WEBHOOK_NOT_IMPLEMENTED",
    "GUEST_CHECKOUT_NOT_IMPLEMENTED",
    "SECURITY_AUTH_SECRET_MISSING",
    "SECURITY_ICCID_KEY_MISSING",
    "SECURITY_AUTH_URL_INSECURE",
    "SECURITY_BILLING_SMTP_MISSING",
    "SECURITY_GOOGLE_OAUTH_INCOMPLETE",
    "SECURITY_DEPLOYMENT_VERSION_UNAVAILABLE",
    "SECURITY_CSP_REPORT_ONLY",
    "SECURITY_BACKUP_STATUS_UNAVAILABLE",
    "SECURITY_ERROR_MONITORING_NOT_CONFIGURED",
  ];
  for (const code of requiredCodes) {
    assert.match(shared, new RegExp(code));
  }
  assert.match(service, /classifyReconciliationCase/);
  assert.match(service, /Never mutates|Derived \/ read-only/i);
  assert.doesNotMatch(service, /walletAccount\.(update|create|delete)/);
  assert.doesNotMatch(service, /walletEsimPurchase\.(update|create|delete)/);
  assert.doesNotMatch(service, /adminPackageAssignment\.(update|create|delete)/);
  assert.doesNotMatch(service, /order\.(update|create|delete)/);
  assert.doesNotMatch(service, /operationalControl\.(update|create|delete)/);
  assert.doesNotMatch(service, /executeCreditCheckout|sendMail|refundReservedFunds/);
  assert.doesNotMatch(service, /method:\s*["']POST["']/);
  assert.match(service, /orderEmailInboxStatusOr|isOrderEmailInboxMatch/);
  assert.match(service, /isNotConfiguredOrderEmailDelivery/);
  assert.match(service, /ORDER_EMAIL_NOT_CONFIGURED_LABEL/);
  assert.match(service, /Installation email was not sent/);
  assert.match(service, /Configure the Orders email channel before resending/);
  assert.match(service, /Uncertain order email delivery/);
  assert.match(service, /Clear stuck send/);
  assert.match(service, /isFailedWalletNotification/);
  assert.match(
    service,
    /emailNotificationStatus:\s*\{\s*in:\s*\["failed",\s*"not_configured"\]/
  );
  assert.match(service, /assignment:\$\{row\.id\}/);
  console.log("PASS codes_and_readonly_service");

  // Sanitization static
  for (const blob of [service, page, shared]) {
    assert.doesNotMatch(blob, /DATABASE_URL/);
    assert.doesNotMatch(blob, /SMTP_BILLING_PASSWORD/);
    assert.doesNotMatch(blob, /AUTH_GOOGLE_SECRET\s*[:=]\s*["'][^"']+["']/);
    assert.doesNotMatch(blob, /access_token/);
    assert.doesNotMatch(blob, /VESIM_PASSWORD/);
    assert.doesNotMatch(blob, /AUTH_SECRET\s*[:=]\s*["'][^"']+["']/);
    assert.doesNotMatch(blob, /ICCID_ENCRYPTION_KEY\s*[:=]\s*["'][^"']+["']/);
    assert.doesNotMatch(blob, /SM-DP\+|activation code|LPA:/i);
  }
  console.log("PASS sanitization_static");

  // Dashboard / nav
  assert.match(nav, /href: "\/admin\/alerts"/);
  assert.match(nav, /label: "Alerts"/);
  assert.match(page, /Active alert summary|Alert severity filters/);
  assert.match(page, /No active alerts match/);
  assert.match(page, /Recommended next step/);
  assert.match(opsPage, /getMonitoringAlertSummary/);
  assert.match(opsPage, /Open alert center/);
  assert.match(opsPage, /Active alerts summary/);
  assert.match(pkg, /qa:admin-monitoring-alerts/);
  console.log("PASS dashboard_nav");

  // Threshold boundaries: below / exactly at / above for each age rule
  const now = new Date("2026-08-06T12:00:00.000Z");
  const thresholdCases: Array<[string, number]> = [
    ["STALE_PURCHASE_AGE_MS", MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS],
    ["STALE_ASSIGNMENT_AGE_MS", MONITORING_THRESHOLDS.STALE_ASSIGNMENT_AGE_MS],
    [
      "UNRESOLVED_RECONCILIATION_AGE_MS",
      MONITORING_THRESHOLDS.UNRESOLVED_RECONCILIATION_AGE_MS,
    ],
    ["LOCKED_CASE_AGE_MS", MONITORING_THRESHOLDS.LOCKED_CASE_AGE_MS],
    [
      "PROVIDER_REFRESH_STUCK_AGE_MS",
      MONITORING_THRESHOLDS.PROVIDER_REFRESH_STUCK_AGE_MS,
    ],
    [
      "UNRESOLVED_EMAIL_FAILURE_AGE_MS",
      MONITORING_THRESHOLDS.UNRESOLVED_EMAIL_FAILURE_AGE_MS,
    ],
  ];
  for (const [name, thresholdMs] of thresholdCases) {
    const below = new Date(now.getTime() - thresholdMs + 1);
    const exact = new Date(now.getTime() - thresholdMs);
    const above = new Date(now.getTime() - thresholdMs - 1);
    assert.equal(
      ageMeetsThreshold(below, now, thresholdMs),
      false,
      `${name} below`
    );
    assert.equal(
      ageMeetsThreshold(exact, now, thresholdMs),
      true,
      `${name} exact`
    );
    assert.equal(
      ageMeetsThreshold(above, now, thresholdMs),
      true,
      `${name} above`
    );
  }
  const justUnder = makeAlert({
    category: "WALLET_PURCHASE",
    code: "WALLET_PURCHASE_PENDING_STALE",
    severity: "WARNING",
    title: "t",
    description: "d",
    sourceAt: new Date(
      now.getTime() - MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS + 1
    ),
    now,
    freshness: "DATABASE_DERIVED",
    recommendedAction: "x",
  });
  const justOver = makeAlert({
    category: "WALLET_PURCHASE",
    code: "WALLET_PURCHASE_PENDING_STALE",
    severity: "WARNING",
    title: "t",
    description: "d",
    sourceAt: new Date(
      now.getTime() - MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS
    ),
    now,
    freshness: "DATABASE_DERIVED",
    recommendedAction: "x",
  });
  assert.ok(justUnder.ageMs < MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS);
  assert.ok(justOver.ageMs >= MONITORING_THRESHOLDS.STALE_PURCHASE_AGE_MS);
  console.log("PASS threshold_boundaries");

  // Deterministic sort tie-breaker + dedupe + repeated-run consistency
  const twinA = makeAlert({
    category: "SECURITY",
    code: "SECURITY_CSP_REPORT_ONLY",
    severity: "INFO",
    title: "a",
    description: "d",
    sourceType: "config",
    recordId: "aaa",
    sourceAt: now,
    now,
    freshness: "CONFIGURATION_DERIVED",
    recommendedAction: "x",
  });
  const twinB = makeAlert({
    category: "SECURITY",
    code: "SECURITY_BACKUP_STATUS_UNAVAILABLE",
    severity: "INFO",
    title: "b",
    description: "d",
    sourceType: "config",
    recordId: "bbb",
    sourceAt: now,
    now,
    freshness: "CONFIGURATION_DERIVED",
    recommendedAction: "x",
  });
  assert.equal(twinA.ageMs, twinB.ageMs);
  const sorted1 = sortMonitoringAlerts([twinB, twinA, twinA]);
  const sorted2 = sortMonitoringAlerts([twinA, twinB, twinA]);
  const deduped1 = sortMonitoringAlerts(
    dedupeMonitoringAlerts([twinB, twinA, twinA])
  );
  const deduped2 = sortMonitoringAlerts(
    dedupeMonitoringAlerts([twinA, twinB, twinA])
  );
  assert.deepEqual(
    sorted1.map((a) => a.id),
    sorted2.map((a) => a.id)
  );
  assert.deepEqual(
    deduped1.map((a) => a.id),
    deduped2.map((a) => a.id)
  );
  assert.equal(deduped1.length, 2);

  // Repeated unchanged aggregation signature (fixed checkedAt) — 20 runs
  const runSignatures: string[] = [];
  for (let i = 0; i < 20; i++) {
    const batch = sortMonitoringAlerts(
      dedupeMonitoringAlerts([...sampleAlerts(), twinA, twinB, twinA])
    );
    const summary = summarizeMonitoringAlerts(batch, now);
    runSignatures.push(
      [
        batch.map((a) => a.id).join("|"),
        summary.totalActive,
        summary.criticalCount,
        summary.highCount,
        summary.warningCount,
        summary.infoCount,
      ].join("::")
    );
  }
  assert.equal(runSignatures.length, 20);
  assert.equal(new Set(runSignatures).size, 1, "20 repeated runs must match");
  assert.deepEqual(
    runSignatures[0].split("::")[0].split("|"),
    sortMonitoringAlerts(
      dedupeMonitoringAlerts([...sampleAlerts(), twinA, twinB, twinA])
    ).map((a) => a.id)
  );
  console.log("PASS repeated_run_consistency_ordering_dedupe");

  // Known flicker defect: DATABASE_DEGRADED must not be gated on wall-clock latency.
  // Unstable ID was: alert:DATABASE:DATABASE_DEGRADED:config:none
  assert.doesNotMatch(
    service,
    /latencyMs\s*>=\s*MONITORING_THRESHOLDS\.DATABASE_DEGRADED_LATENCY_MS/
  );
  assert.match(service, /mapDatabaseProbeToStatus\(\{\s*ok:\s*true\s*\}\)/);
  assert.match(
    service,
    /One immutable checkedAt is used for every age\/threshold rule/
  );
  assert.match(service, /checkedAt\?: Date/);
  // Production entrypoints share collectMonitoringAlerts (single checkedAt per run).
  assert.match(
    service,
    /export async function getMonitoringAlertsDashboard[\s\S]*collectMonitoringAlerts\(\)/
  );
  assert.match(
    service,
    /export async function getMonitoringAlertSummary[\s\S]*collectMonitoringAlerts\(\)/
  );
  assert.match(service, /orderBy:\s*\[\s*\{\s*updatedAt:\s*"asc"\s*\}\s*,\s*\{\s*id:\s*"asc"\s*\}\s*\]/);
  assert.match(service, /dedupeMonitoringAlerts/);
  assert.match(shared, /a\.id < b\.id/);
  assert.match(pkg, /smoke:admin-monitoring-alerts/);
  assert.match(service, /buildAggregationCompleteness\(/);
  assert.match(service, /completeness,/);
  assert.match(service, /CONTROL_ALERT_NOTIFICATIONS_PAUSED/);
  console.log("PASS probe_and_determinism_guards");

  // Empty state helpers
  const emptySummary = summarizeMonitoringAlerts([]);
  assert.equal(emptySummary.totalActive, 0);
  assert.equal(emptySummary.oldestActiveAgeLabel, "—");
  console.log("PASS empty_state");

  console.log("\nAll Part B1 monitoring-alerts QA checks passed.");
}

main();
