/**
 * Offline + DB-backed QA for Admin Operations Part A2 — Safe Runtime Operational Controls.
 *
 * Covers authorization, control safety, purchase enforcement (static + policy),
 * enablement safety, dashboard sanitization, and no-side-effect mutation surface.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTROL_CONFIRM_PHRASES,
  OPERATIONAL_CONTROL_KEYS,
  OPERATIONAL_CONTROL_MISSING_DEFAULT_PAUSED,
  OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE,
  controlStateLabel,
  evaluateFlowControls,
  normalizeOperationalControlKey,
  overallTransactionsStatus,
  parseOperationalConfirmPhrase,
  parseOperationalControlReason,
  requiredControlsForFlow,
  truncateControlReason,
} from "../app/lib/admin/operationalControlsShared";
import {
  buildOperationsWarnings,
  paymentGatewayCardDefaults,
} from "../app/lib/admin/operationsHealthShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const shared = read("app/lib/admin/operationalControlsShared.ts");
  const policy = read("app/lib/admin/operationalControlsPolicy.ts");
  const mut = read("app/lib/admin/operationalControls.ts");
  const actions = read("app/lib/admin/operationalControlsActions.ts");
  const page = read("app/admin/operations/page.tsx");
  const panel = read("app/components/admin/OperationalControlsPanel.tsx");
  const health = read("app/lib/admin/operationsHealth.ts");
  const healthShared = read("app/lib/admin/operationsHealthShared.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const assignment = read("app/lib/esim/adminPackageAssignment.ts");
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260806230000_add_operational_controls/migration.sql"
  );
  const pkg = read("package.json");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");

  // --- Schema / migration ---
  assert.match(schema, /enum OperationalControlKey/);
  assert.match(schema, /model OperationalControl/);
  assert.match(schema, /TRANSACTION_MAINTENANCE/);
  assert.doesNotMatch(schema, /OperationalControl[\s\S]{0,400}Json/);
  assert.match(migration, /CREATE TABLE "OperationalControl"/);
  assert.match(migration, /paused=false|paused.*false/i);
  assert.match(migration, /ON CONFLICT \("key"\) DO NOTHING/);
  console.log("PASS schema_migration");

  // --- Allowlist + phrases ---
  assert.deepEqual([...OPERATIONAL_CONTROL_KEYS], [
    "TRANSACTION_MAINTENANCE",
    "CUSTOMER_WALLET_PURCHASES",
    "ADMIN_WALLET_PURCHASES",
    "COMPANY_ASSIGNMENTS",
    "PROVIDER_ORDER_CREATION",
  ]);
  assert.equal(
    CONTROL_CONFIRM_PHRASES.TRANSACTION_MAINTENANCE.pause,
    "PAUSE ALL TRANSACTIONS"
  );
  assert.equal(
    CONTROL_CONFIRM_PHRASES.TRANSACTION_MAINTENANCE.resume,
    "RESUME ALL TRANSACTIONS"
  );
  assert.equal(
    CONTROL_CONFIRM_PHRASES.CUSTOMER_WALLET_PURCHASES.pause,
    "PAUSE CUSTOMER PURCHASES"
  );
  assert.equal(
    CONTROL_CONFIRM_PHRASES.ADMIN_WALLET_PURCHASES.pause,
    "PAUSE ADMIN PURCHASES"
  );
  assert.equal(
    CONTROL_CONFIRM_PHRASES.COMPANY_ASSIGNMENTS.pause,
    "PAUSE COMPANY ASSIGNMENTS"
  );
  assert.equal(
    CONTROL_CONFIRM_PHRASES.PROVIDER_ORDER_CREATION.pause,
    "PAUSE PROVIDER ORDERS"
  );
  assert.equal(OPERATIONAL_CONTROL_MISSING_DEFAULT_PAUSED, false);
  assert.equal(normalizeOperationalControlKey("bogus"), null);
  assert.equal(
    normalizeOperationalControlKey("CUSTOMER_WALLET_PURCHASES"),
    "CUSTOMER_WALLET_PURCHASES"
  );
  assert.equal(parseOperationalControlReason("ab").ok, false);
  assert.equal(parseOperationalControlReason("incident response").ok, true);
  assert.equal(
    parseOperationalConfirmPhrase("WRONG", "PAUSE ALL TRANSACTIONS").ok,
    false
  );
  assert.equal(
    parseOperationalConfirmPhrase("PAUSE ALL TRANSACTIONS", "PAUSE ALL TRANSACTIONS")
      .ok,
    true
  );
  assert.equal(controlStateLabel(true), "PAUSED");
  assert.equal(controlStateLabel(false), "ACTIVE");
  assert.ok((truncateControlReason("x".repeat(200)) ?? "").endsWith("…"));
  console.log("PASS allowlist_phrases_defaults");

  // --- Effective-state logic ---
  assert.deepEqual(
    requiredControlsForFlow("customer_wallet_purchase"),
    ["TRANSACTION_MAINTENANCE", "CUSTOMER_WALLET_PURCHASES"]
  );
  assert.deepEqual(
    requiredControlsForFlow("customer_wallet_purchase", {
      includeProviderOrder: true,
    }),
    [
      "TRANSACTION_MAINTENANCE",
      "CUSTOMER_WALLET_PURCHASES",
      "PROVIDER_ORDER_CREATION",
    ]
  );
  assert.equal(
    evaluateFlowControls("customer_wallet_purchase", {}).blocked,
    false
  );
  assert.equal(
    evaluateFlowControls("customer_wallet_purchase", {
      CUSTOMER_WALLET_PURCHASES: true,
    }).blocked,
    true
  );
  assert.equal(
    evaluateFlowControls(
      "admin_wallet_purchase",
      { CUSTOMER_WALLET_PURCHASES: true },
      { includeProviderOrder: true }
    ).blocked,
    false
  );
  assert.equal(
    evaluateFlowControls("company_assignment", {
      COMPANY_ASSIGNMENTS: true,
    }).blocked,
    true
  );
  assert.equal(
    evaluateFlowControls(
      "customer_wallet_purchase",
      { PROVIDER_ORDER_CREATION: true },
      { includeProviderOrder: true }
    ).blocked,
    true
  );
  assert.equal(
    evaluateFlowControls(
      "customer_wallet_purchase",
      { PROVIDER_ORDER_CREATION: true },
      { includeProviderOrder: false }
    ).blocked,
    false
  );
  assert.equal(
    evaluateFlowControls("customer_wallet_purchase", {
      TRANSACTION_MAINTENANCE: true,
    }).blocked,
    true
  );
  assert.equal(overallTransactionsStatus({}), "ACTIVE");
  assert.equal(
    overallTransactionsStatus({ TRANSACTION_MAINTENANCE: true }),
    "PAUSED"
  );
  assert.equal(
    overallTransactionsStatus({ CUSTOMER_WALLET_PURCHASES: true }),
    "PARTIALLY_PAUSED"
  );
  console.log("PASS effective_state_logic");

  // --- Authorization / mutation surface ---
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(mut, /assertSameOriginAdminRequest/);
  assert.match(mut, /role !== Role\.ADMIN/);
  assert.match(mut, /deletedAt/);
  assert.match(mut, /consumeRateLimit/);
  assert.match(mut, /ops-control:admin:/);
  assert.match(mut, /ops-control:key:/);
  assert.match(mut, /updateMany/);
  assert.match(mut, /version: expectedVersion/);
  assert.match(mut, /idempotent:\s*true/);
  assert.match(mut, /operations\.control_paused/);
  assert.match(mut, /operations\.control_resumed/);
  assert.match(mut, /operations\.control_action_blocked/);
  assert.match(mut, /normalizeOperationalControlKey/);
  assert.doesNotMatch(mut, /walletAccount\.(update|create)/);
  assert.doesNotMatch(mut, /executeCreditCheckout/);
  assert.doesNotMatch(mut, /sendMail|deliverOrderEmail|nodemailer/i);
  assert.doesNotMatch(mut, /refundReservedFunds|REFUND/);
  assert.match(mut, /missing_control_record/);
  assert.doesNotMatch(mut, /operationalControl\.create/);
  console.log("PASS authorization_mutation_safety");

  // --- Policy fail-closed ---
  assert.match(policy, /OperationalControlUnavailableError/);
  assert.match(policy, /fail closed|Fail closed/i);
  assert.match(policy, /OPERATIONAL_CONTROL_MISSING_DEFAULT_PAUSED/);
  assert.match(policy, /loadOperationalControlPausedMapSoft/);
  assert.equal(
    OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE.includes("temporarily unavailable"),
    true
  );
  console.log("PASS policy_fail_closed");

  // --- Purchase / assignment integration ---
  assert.match(wallet, /assertNewRiskyTransactionAllowed/);
  assert.match(wallet, /customer_wallet_purchase|admin_wallet_purchase/);
  assert.match(wallet, /includeProviderOrder: false/);
  assert.match(wallet, /includeProviderOrder: true/);
  assert.match(wallet, /UNAVAILABLE/);
  assert.match(assignment, /assertNewRiskyTransactionAllowed/);
  assert.match(assignment, /company_assignment/);
  assert.match(assignment, /includeProviderOrder: true/);
  // Checks before durable mutation
  assert.match(wallet, /assertWalletPurchaseInitiationAllowed/);
  assert.match(assignment, /assertAssignmentInitiationAllowed/);
  console.log("PASS purchase_assignment_integration");

  // --- Enablement safety ---
  assert.match(guestGate, /ENABLE_GUEST_VESIM_CHECKOUT/);
  assert.doesNotMatch(mut, /ENABLE_GUEST|guest checkout.*enable/i);
  assert.doesNotMatch(panel, /enable guest|payment gateway.*enable/i);
  assert.match(panel, /cannot enable incomplete features/i);
  assert.match(page, /NOT_IMPLEMENTED \/ DISABLED/);
  assert.equal(
    paymentGatewayCardDefaults().guestCheckout,
    "NOT_IMPLEMENTED / DISABLED"
  );
  assert.match(health, /guestCheckout: "NOT_IMPLEMENTED \/ DISABLED"/);
  console.log("PASS enablement_safety");

  // --- Dashboard / UI ---
  assert.match(page, /OperationalControlsPanel/);
  assert.match(page, /Transaction controls status/);
  assert.match(panel, /Operational controls/);
  assert.match(panel, /new<\/strong> transaction initiation/i);
  assert.match(panel, /does not cancel|never cancel/i);
  assert.match(panel, /htmlFor=/);
  assert.match(panel, /confirmPhrase/);
  assert.match(panel, /reason/);
  assert.match(health, /operationalControls/);
  assert.match(health, /getOperationalControlsHealthSnapshot/);
  assert.match(healthShared, /OPERATIONAL_CONTROL_PAUSED/);
  assert.match(healthShared, /TRANSACTIONS_PAUSED/);
  assert.match(pkg, /qa:admin-operations-controls/);
  console.log("PASS dashboard_ui");

  // --- Warnings ---
  const warningsPaused = buildOperationsWarnings({
    databaseStatus: "HEALTHY",
    criticalPriorityCount: 0,
    highPriorityCount: 0,
    providerUncertainCount: 0,
    refundPendingCount: 0,
    failedEmailCount: 0,
    billingSmtpConfigured: true,
    vesimConfigValid: true,
    vesimMode: "staging",
    vesimHostClass: "STAGING_APPROVED",
    guestCheckoutEnabled: false,
    deploymentVersion: "v1",
    authSecretConfigured: true,
    iccidKeyConfigured: true,
    pausedOperationalControlCount: 2,
    transactionsMaintenancePaused: false,
  });
  assert.ok(
    warningsPaused.some((w) => w.code === "OPERATIONAL_CONTROL_PAUSED")
  );
  const warningsMaint = buildOperationsWarnings({
    databaseStatus: "HEALTHY",
    criticalPriorityCount: 0,
    highPriorityCount: 0,
    providerUncertainCount: 0,
    refundPendingCount: 0,
    failedEmailCount: 0,
    billingSmtpConfigured: true,
    vesimConfigValid: true,
    vesimMode: "staging",
    vesimHostClass: "STAGING_APPROVED",
    guestCheckoutEnabled: false,
    deploymentVersion: "v1",
    authSecretConfigured: true,
    iccidKeyConfigured: true,
    pausedOperationalControlCount: 1,
    transactionsMaintenancePaused: true,
  });
  assert.ok(warningsMaint.some((w) => w.code === "TRANSACTIONS_PAUSED"));
  assert.ok(
    warningsMaint.some((w) => w.code === "GUEST_CHECKOUT_DISABLED")
  );
  console.log("PASS warnings");

  // --- Audit sanitization (static) ---
  assert.doesNotMatch(mut, /DATABASE_URL|access_token|activationCode|iccidEncrypted/i);
  assert.match(mut, /truncateControlReason/);
  assert.match(shared, /no Prisma|offline-QA/i);
  console.log("PASS audit_sanitization_static");

  // --- Out of scope ---
  assert.doesNotMatch(panel, /cache delete|rotate secret|restart deploy/i);
  assert.doesNotMatch(actions, /migrate|prisma\.\$executeRaw/);
  console.log("PASS out_of_scope");

  console.log("\nAll Part A2 operational-controls QA checks passed.");
}

main();
