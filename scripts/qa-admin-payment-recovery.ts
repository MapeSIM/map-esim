/**
 * Offline QA for Admin Payment Recovery Queue MVP.
 * Does not call gateways, mutate DB, fund purchases, or create VeSIM orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAYMENT_RECOVERY_ATTEMPT_STATUSES,
  PAYMENT_RECOVERY_POLICY_BLURB,
  PAYMENT_RECOVERY_PROVIDERS,
  PAYMENT_RECOVERY_STALE_MS_DEFAULT,
  PAYMENT_RECOVERY_STALE_MS_MAX,
  PAYMENT_RECOVERY_STALE_MS_MIN,
  buildAdminPaymentRecoveryHref,
  formatPaymentRecoveryAge,
  isPaymentRecoveryCandidate,
  parsePaymentRecoveryStaleMs,
  paymentRecoveryDecisionLabel,
  suggestPaymentRecoverySafeAction,
} from "../app/lib/admin/paymentRecoveryShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(existsSync(join(root, "app/admin/payments/recovery/page.tsx")));
  assert.ok(existsSync(join(root, "app/lib/admin/paymentRecovery.ts")));
  assert.ok(existsSync(join(root, "app/lib/admin/paymentRecoveryShared.ts")));
  assert.ok(
    existsSync(join(root, "app/admin/payments/[attemptId]/page.tsx"))
  );

  const page = read("app/admin/payments/recovery/page.tsx");
  const detail = read("app/admin/payments/[attemptId]/page.tsx");
  const hub = read("app/admin/payments/page.tsx");
  const service = read("app/lib/admin/paymentRecovery.ts");
  const shared = read("app/lib/admin/paymentRecoveryShared.ts");
  const dashboard = read("app/lib/admin/paymentDashboard.ts");
  const receipts = read("app/lib/admin/paymentWebhookReceipts.ts");
  const nav = read("app/components/admin/AdminNav.tsx");
  const pkg = read("package.json");
  const simpaisaConfig = read("app/lib/payments/simpaisaConfig.ts");
  const investigateShared = read(
    "app/lib/admin/pendingSimpaisaPaymentInvestigateShared.ts"
  );

  assert.match(page, /requireRole\("ADMIN"\)/);
  assert.match(nav, /href: "\/admin\/payments\/recovery"/);
  assert.match(nav, /label: "Payment recovery"/);
  assert.match(nav, /!pathname\.startsWith\("\/admin\/payments\/recovery"\)/);
  assert.match(pkg, /"qa:admin-payment-recovery"/);
  console.log("PASS route_nav_and_qa_script");

  assert.deepEqual([...PAYMENT_RECOVERY_ATTEMPT_STATUSES], [
    "PAYMENT_PENDING",
    "RECONCILIATION_REQUIRED",
  ]);
  assert.deepEqual([...PAYMENT_RECOVERY_PROVIDERS], ["SIMPAISA", "SAFEPAY"]);
  assert.equal(PAYMENT_RECOVERY_STALE_MS_DEFAULT, 20 * 60 * 1000);
  assert.equal(PAYMENT_RECOVERY_STALE_MS_MIN, 15 * 60 * 1000);
  assert.equal(PAYMENT_RECOVERY_STALE_MS_MAX, 30 * 60 * 1000);
  assert.equal(parsePaymentRecoveryStaleMs("10"), PAYMENT_RECOVERY_STALE_MS_MIN);
  assert.equal(parsePaymentRecoveryStaleMs("45"), PAYMENT_RECOVERY_STALE_MS_MAX);
  assert.equal(parsePaymentRecoveryStaleMs("20"), PAYMENT_RECOVERY_STALE_MS_DEFAULT);
  assert.match(service, /PAYMENT_PENDING/);
  assert.match(service, /RECONCILIATION_REQUIRED/);
  assert.match(service, /SIMPAISA/);
  assert.match(service, /SAFEPAY/);
  assert.match(service, /webhookEventId:\s*null/);
  assert.match(service, /gatewayPaymentRef/);
  assert.match(service, /parsePaymentRecoveryStaleMs/);
  console.log("PASS candidate_filter_contract");

  const now = Date.UTC(2026, 8, 8, 12, 0, 0);
  const staleOk = new Date(now - 21 * 60 * 1000);
  const fresh = new Date(now - 5 * 60 * 1000);
  assert.equal(
    isPaymentRecoveryCandidate({
      status: "PAYMENT_PENDING",
      gatewayProvider: "SIMPAISA",
      gatewayPaymentRef: "txn-1",
      webhookEventId: null,
      updatedAt: staleOk,
      nowMs: now,
      staleMs: PAYMENT_RECOVERY_STALE_MS_DEFAULT,
    }),
    true
  );
  assert.equal(
    isPaymentRecoveryCandidate({
      status: "AWAITING_PAYMENT",
      gatewayProvider: "SIMPAISA",
      gatewayPaymentRef: "txn-1",
      webhookEventId: null,
      updatedAt: staleOk,
      nowMs: now,
      staleMs: PAYMENT_RECOVERY_STALE_MS_DEFAULT,
    }),
    false
  );
  assert.equal(
    isPaymentRecoveryCandidate({
      status: "PAYMENT_PENDING",
      gatewayProvider: "SIMPAISA",
      gatewayPaymentRef: "txn-1",
      webhookEventId: "evt-1",
      updatedAt: staleOk,
      nowMs: now,
      staleMs: PAYMENT_RECOVERY_STALE_MS_DEFAULT,
    }),
    false
  );
  assert.equal(
    isPaymentRecoveryCandidate({
      status: "PAYMENT_PENDING",
      gatewayProvider: "SIMPAISA",
      gatewayPaymentRef: "txn-1",
      webhookEventId: null,
      updatedAt: fresh,
      nowMs: now,
      staleMs: PAYMENT_RECOVERY_STALE_MS_DEFAULT,
    }),
    false
  );
  assert.match(formatPaymentRecoveryAge(staleOk, now), /21m/);
  console.log("PASS candidate_eligibility_helpers");

  assert.equal(paymentRecoveryDecisionLabel(null), "Never checked");
  assert.match(
    suggestPaymentRecoverySafeAction(null),
    /Check Status|Verify/i
  );
  assert.match(
    suggestPaymentRecoverySafeAction("CONFIRMED_SUCCESS_WEBHOOK_REQUIRED"),
    /do not mark paid/i
  );
  assert.match(
    suggestPaymentRecoverySafeAction("VERIFIED_FAILED"),
    /release if eligible/i
  );
  assert.equal(buildAdminPaymentRecoveryHref({}), "/admin/payments/recovery");
  assert.match(PAYMENT_RECOVERY_POLICY_BLURB, /never marks paid/i);
  console.log("PASS safe_action_and_labels");

  assert.match(page, /Attempt ID/);
  assert.match(page, /Customer/);
  assert.match(page, /Provider/);
  assert.match(page, /Amount/);
  assert.match(page, /Age/);
  assert.match(page, /Webhook status/);
  assert.match(page, /Last investigation decision/);
  assert.match(page, /Suggested safe action/);
  assert.match(page, /lastDecisionAtLabel/);
  console.log("PASS recovery_table_columns");

  assert.match(hub, /Recovery candidates/);
  assert.match(hub, /recoveryCandidateCount/);
  assert.match(hub, /\/admin\/payments\/recovery/);
  assert.match(dashboard, /recoveryCandidateCount/);
  assert.match(dashboard, /countPaymentRecoveryCandidates/);
  assert.match(dashboard, /webhookMissingAmongPendingCount/);
  console.log("PASS hub_kpi_and_link");

  assert.match(detail, /getAdminPaymentRecoveryDetailExtras/);
  assert.match(detail, /isRecoveryCandidate/);
  assert.match(detail, /PendingSimpaisaInvestigateForm/);
  assert.match(detail, /PendingPaymentVerifyForm/);
  assert.match(detail, /Webhook receipts for this attempt/);
  assert.match(detail, /lastDecisionAtLabel/);
  assert.doesNotMatch(
    detail,
    /from=recovery[\s\S]{0,80}isRecoveryCandidate|searchParams[\s\S]{0,120}recovery/
  );
  assert.match(service, /isPaymentRecoveryCandidate/);
  assert.match(receipts, /listPaymentWebhookReceiptsForAttempt/);
  console.log("PASS detail_banner_server_eligibility_and_receipts");

  assert.doesNotMatch(service, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(page, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(shared, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(service, /Mark paid|mark paid|Mark Paid/i);
  assert.doesNotMatch(page, /Mark paid|mark paid|Mark Paid/i);
  assert.doesNotMatch(service, /allowProduction:\s*true/);
  assert.doesNotMatch(shared, /allowProduction:\s*true/);
  assert.match(simpaisaConfig, /allowProduction:\s*false/);
  assert.doesNotMatch(service, /requestRefund\(/);
  assert.doesNotMatch(page, /requestRefund\(/);
  assert.doesNotMatch(service, /replayWebhook|webhookReplay|replay.*webhook.*Action/i);
  assert.doesNotMatch(receipts, /replayWebhook|webhookReplay|replay.*webhook.*Action/i);
  assert.doesNotMatch(receipts, /export async function replay/i);
  assert.match(service, /Never funds, never marks paid, never replays webhooks/);
  assert.match(
    investigateShared,
    /CONFIRMED_SUCCESS_WEBHOOK_REQUIRED[\s\S]*releaseEligible:\s*false/
  );
  assert.doesNotMatch(shared, /from ["']@prisma\/client["']|PrismaClient/);
  console.log("PASS no_fund_mark_paid_replay_or_production");

  console.log("ALL_ADMIN_PAYMENT_RECOVERY_CHECKS_PASSED");
}

main();
