/**
 * Offline QA for Admin Operations & System Health — Part A1 (read-only dashboard).
 *
 * Manual smoke checklist (local/mock only; no provider mutation; no real email):
 * 1. Admin nav shows Operations → /admin/operations
 * 2. Dashboard loads for active ADMIN
 * 3. Application & database card shows sanitized status + latency
 * 4. Reconciliation counts appear and link to /admin/reconciliation
 * 5. Email card shows CONFIGURED/NOT_CONFIGURED only (no SMTP secrets)
 * 6. Provider card shows host class / mode (no tokens or full credential URLs)
 * 7. Payment integration still NOT_IMPLEMENTED; webhook verification is HEALTHY or NOT_CONFIGURED
 * 8. Security card shows yes/no only for secrets
 * 9. Warnings list with safe links
 * 10. Mobile layout stacks cards
 * 11. Generic unavailable state path exists
 * 12. No ICCID/QR/activation/token/DATABASE_URL visible
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOperationsWarnings,
  classifyAppEnvironment,
  classifyAuthUrlSecure,
  classifyCspMode,
  classifyHstsExpectation,
  mapDatabaseProbeToStatus,
  paymentGatewayCardDefaults,
  paymentWebhookVerificationStatus,
  pickDeploymentVersion,
  sanitizeDeploymentVersion,
  sanitizeHealthStatus,
  smtpReadinessStatus,
  HEALTH_STATUSES,
} from "../app/lib/admin/operationsHealthShared";
import {
  categoryMatchesFilter,
  classifyReconciliationCase,
} from "../app/lib/admin/reconciliationClassify";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const shared = read("app/lib/admin/operationsHealthShared.ts");
  const service = read("app/lib/admin/operationsHealth.ts");
  const page = read("app/admin/operations/page.tsx");
  const nav = read("app/components/admin/AdminNav.tsx");
  const layout = read("app/admin/layout.tsx");
  const headersSrc = read("app/lib/security/headers.ts");
  const pkg = read("package.json");

  // --- Auth / private / noindex ---
  assert.match(service, /requireActiveAdminForOperations/);
  assert.match(service, /requireRole\("ADMIN"\)/);
  assert.match(service, /deletedAt/);
  assert.match(service, /role !== Role\.ADMIN/);
  assert.match(page, /requireActiveAdminForOperations/);
  assert.match(layout, /requireRole\("ADMIN"\)/);
  assert.match(layout, /robots:\s*\{\s*index:\s*false/);
  assert.match(headersSrc, /"\/admin"/);
  assert.match(headersSrc, /"\/admin\/:path\*"/);
  assert.match(headersSrc, /PRIVATE_NO_STORE/);
  console.log("PASS auth_private_noindex");

  // --- Status model ---
  assert.deepEqual([...HEALTH_STATUSES], [
    "HEALTHY",
    "DEGRADED",
    "UNAVAILABLE",
    "NOT_CONFIGURED",
    "NOT_IMPLEMENTED",
    "UNKNOWN",
  ]);
  assert.equal(sanitizeHealthStatus("HEALTHY"), "HEALTHY");
  assert.equal(sanitizeHealthStatus("bogus-error"), "UNKNOWN");
  assert.equal(mapDatabaseProbeToStatus({ ok: true }), "HEALTHY");
  assert.equal(
    mapDatabaseProbeToStatus({ ok: false, timedOut: true }),
    "DEGRADED"
  );
  assert.equal(
    mapDatabaseProbeToStatus({ ok: false, errorCode: "P1001" }),
    "UNAVAILABLE"
  );
  assert.equal(smtpReadinessStatus(true), "HEALTHY");
  assert.equal(smtpReadinessStatus(false), "NOT_CONFIGURED");
  console.log("PASS status_model_and_db_mapping");

  // --- Reconciliation classification reuse ---
  assert.match(service, /classifyReconciliationCase/);
  assert.match(service, /categoryMatchesFilter/);
  const cat = classifyReconciliationCase({
    sourceType: "wallet_purchase",
    status: "RECONCILIATION_REQUIRED",
    providerOrderId: "PO1",
    providerResultKind: "uncertain",
    updatedAt: new Date(Date.now() - 60_000),
  });
  assert.equal(
    categoryMatchesFilter(cat, "provider_uncertain"),
    true
  );
  assert.match(service, /Never mutates|Read-only/i);
  assert.doesNotMatch(service, /walletAccount\.(update|create|delete)/);
  assert.doesNotMatch(service, /walletEsimPurchase\.(update|create|delete)/);
  assert.doesNotMatch(service, /order\.(update|create|delete)/);
  assert.doesNotMatch(service, /refundReservedFunds|executeCreditCheckout/);
  console.log("PASS reconciliation_counts_reuse_no_mutation");

  // --- Email / SMTP sanitized ---
  assert.match(service, /isEmailConfigured\("billing"\)/);
  assert.doesNotMatch(service, /SMTP_PASSWORD|SMTP_BILLING_PASSWORD/);
  assert.doesNotMatch(page, /SMTP_PASSWORD|smtp\.host|nodemailer/i);
  assert.doesNotMatch(service, /sendMail|sendOrderEmail|createTransport/);
  console.log("PASS email_smtp_sanitized_no_send");

  // --- VeSIM / provider ---
  assert.match(service, /isVesimEnvironmentConfigured|validateVesimEnvironmentConfig/);
  assert.match(service, /brokerHostClass|STAGING_APPROVED|LIVE_UNCONFIRMED/);
  assert.match(service, /balanceSupport:\s*"ON_DEMAND"/);
  assert.match(service, /DATABASE_DERIVED|CONFIGURATION_DERIVED/);
  assert.doesNotMatch(service, /executeCreditCheckout|\/api\/checkout\/credit/);
  assert.doesNotMatch(service, /method:\s*["']POST["']/);
  assert.doesNotMatch(page, /access_token|Authorization|VESIM_PASSWORD/);
  assert.match(page, /ProviderWalletPanel|Refresh provider wallet/);
  assert.match(page, /ON_DEMAND|ProviderWalletPanel/);
  console.log("PASS provider_readiness_no_live_mutation");

  // --- Payment: checkout still gated; webhook verification is implemented ---
  const pay = paymentGatewayCardDefaults();
  assert.equal(pay.integrationStatus, "NOT_IMPLEMENTED");
  assert.equal(pay.webhookVerification, "NOT_CONFIGURED");
  assert.equal(pay.paymentReconciliation, "NOT_IMPLEMENTED");
  assert.equal(pay.guestCheckout, "NOT_IMPLEMENTED / DISABLED");
  assert.equal(paymentWebhookVerificationStatus(false), "NOT_CONFIGURED");
  assert.equal(paymentWebhookVerificationStatus(true), "HEALTHY");
  assert.equal(
    paymentGatewayCardDefaults({ webhookSecretConfigured: true })
      .webhookVerification,
    "HEALTHY"
  );
  assert.match(page, /NOT_IMPLEMENTED/);
  assert.match(service, /isGuestVesimCheckoutEnabled/);
  assert.match(service, /SAFEPAY_WEBHOOK_SECRET/);
  assert.doesNotMatch(service, /return process\.env\.SAFEPAY_WEBHOOK_SECRET/);
  assert.doesNotMatch(shared, /webhookVerification:\s*"NOT_IMPLEMENTED"/);
  console.log("PASS payment_checkout_gated_webhook_verification_status");

  // --- Security booleans ---
  assert.match(service, /AUTH_SECRET/);
  assert.match(service, /isIccidEncryptionConfigured/);
  assert.match(service, /AUTH_GOOGLE_ID/);
  assert.match(service, /classifyHstsExpectation|shouldEnableHsts|classifyAuthUrlSecure/);
  assert.equal(classifyCspMode(), "report-only");
  assert.equal(
    classifyAuthUrlSecure({
      nodeEnv: "production",
      authUrl: "https://mapesim.example",
    }),
    "yes"
  );
  assert.equal(
    classifyHstsExpectation({
      nodeEnv: "production",
      authUrl: "https://mapesim.example",
    }),
    "expected"
  );
  assert.equal(
    classifyAppEnvironment({ nodeEnv: "production" }),
    "production"
  );
  assert.equal(sanitizeDeploymentVersion("v1.2.3"), "v1.2.3");
  assert.equal(sanitizeDeploymentVersion("password=secret"), null);
  assert.equal(
    pickDeploymentVersion({ APP_VERSION: "build-abc" }),
    "build-abc"
  );
  console.log("PASS security_and_version_helpers");

  // --- Warnings ---
  const warnings = buildOperationsWarnings({
    databaseStatus: "UNAVAILABLE",
    criticalPriorityCount: 1,
    highPriorityCount: 1,
    providerUncertainCount: 1,
    refundPendingCount: 1,
    failedEmailCount: 1,
    billingSmtpConfigured: false,
    vesimConfigValid: false,
    vesimMode: "production",
    vesimHostClass: "LIVE_UNCONFIRMED",
    guestCheckoutEnabled: false,
    deploymentVersion: null,
    authSecretConfigured: false,
    iccidKeyConfigured: false,
  });
  const codes = new Set(warnings.map((w) => w.code));
  assert.ok(codes.has("DATABASE_UNHEALTHY"));
  assert.ok(codes.has("CRITICAL_RECONCILIATION"));
  assert.ok(codes.has("PAYMENT_NOT_IMPLEMENTED"));
  assert.ok(codes.has("GUEST_CHECKOUT_DISABLED"));
  assert.ok(codes.has("VESIM_LIVE_UNCONFIRMED"));
  assert.ok(!JSON.stringify(warnings).includes("DATABASE_URL"));
  console.log("PASS warning_generation");

  // --- UI / nav wiring ---
  assert.match(nav, /\/admin\/operations/);
  assert.match(nav, /Operations/);
  assert.match(page, /Operations health data is temporarily unavailable/);
  assert.match(page, /Open reconciliation center/);
  assert.match(page, /Payment gateway readiness/);
  assert.match(page, /Security & production readiness/);
  assert.doesNotMatch(page, /"use client"/);
  assert.match(page, /dynamic = "force-dynamic"/);
  console.log("PASS ui_nav_wiring");

  // --- Sensitive leakage ---
  for (const [name, src] of [
    ["service", service],
    ["page", page],
    ["shared", shared],
  ] as const) {
    assert.doesNotMatch(src, /DATABASE_URL/);
    assert.doesNotMatch(src, /iccidEncrypted|qrValue|activationCode|smDp/i);
    assert.doesNotMatch(src, /SMTP_PASSWORD|AUTH_GOOGLE_SECRET\s*\+|process\.env\.AUTH_GOOGLE_SECRET/);
    // Must not render env secret values — reading presence of AUTH_SECRET name is OK
    assert.doesNotMatch(src, /process\.env\.AUTH_SECRET\s*[,}]/);
    void name;
  }
  // Presence checks only — value never returned
  assert.match(service, /Boolean\(\(process\.env\.AUTH_SECRET/);
  assert.doesNotMatch(service, /return process\.env\.AUTH_SECRET/);
  assert.doesNotMatch(service, /return process\.env\.DATABASE_URL/);
  assert.doesNotMatch(service, /return process\.env\.VESIM_PASSWORD/);
  assert.match(service, /orderEmailInboxStatusOr|emailDeliveryStatus:\s*"sending"/);
  assert.match(service, /isOrderEmailInboxMatch/);
  assert.match(service, /isInboxNotConfiguredOrderEmailDelivery/);
  assert.match(service, /isVisibleOrderEmailDelivery/);
  assert.doesNotMatch(service, /sendOrderEmail|deliverOrderEmailAfterCheckout/);
  console.log("PASS no_secret_or_sensitive_exposure");

  assert.match(pkg, /qa:admin-operations-health/);
  console.log("PASS package_script");

  console.log("ALL PASS qa-admin-operations-health");
}

main();
