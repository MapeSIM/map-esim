/**
 * Offline QA for Admin Payment Dashboard Phase 1 MVP.
 * Does not call gateways, mutate DB, fund purchases, or create VeSIM orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAdminPaymentsHref,
  isPaymentDashboardPendingAttemptStatus,
  parsePaymentDashboardProviderFilter,
  parsePaymentDashboardSearch,
  parsePaymentDashboardStatusFilter,
  parsePaymentDashboardWebhookFilter,
  paymentAttemptStatusesForFilter,
  paymentDashboardInquiryPlaceholder,
  paymentDashboardMethodPlaceholder,
} from "../app/lib/admin/paymentDashboardShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(existsSync(join(root, "app/admin/payments/page.tsx")));
  assert.ok(
    existsSync(join(root, "app/admin/payments/[attemptId]/page.tsx"))
  );
  assert.ok(existsSync(join(root, "app/lib/admin/paymentDashboard.ts")));
  assert.ok(
    existsSync(join(root, "app/lib/admin/paymentDashboardShared.ts"))
  );
  assert.ok(
    existsSync(
      join(root, "app/admin/payments/pending/[attemptId]/page.tsx")
    )
  );

  const hub = read("app/admin/payments/page.tsx");
  const detail = read("app/admin/payments/[attemptId]/page.tsx");
  const service = read("app/lib/admin/paymentDashboard.ts");
  const shared = read("app/lib/admin/paymentDashboardShared.ts");
  const nav = read("app/components/admin/AdminNav.tsx");
  const pendingLegacy = read(
    "app/admin/payments/pending/[attemptId]/page.tsx"
  );
  const webhooksLib = read("app/lib/admin/paymentWebhookReceipts.ts");
  const pkg = read("package.json");
  const simpaisaConfig = read("app/lib/payments/simpaisaConfig.ts");

  assert.match(hub, /requireRole\("ADMIN"\)/);
  assert.match(detail, /requireRole\("ADMIN"\)/);
  assert.match(nav, /href: "\/admin\/payments"/);
  assert.match(nav, /label: "Payments"/);
  console.log("PASS admin_only_payments_hub_and_nav");

  assert.match(hub, /Pending/);
  assert.match(hub, /Failed \/ cancelled \(24h\)|failedLast24hCount/);
  assert.match(hub, /Webhook missing/);
  assert.match(service, /getAdminPaymentDashboardKpis/);
  assert.match(service, /webhookMissingAmongPendingCount/);
  console.log("PASS kpi_strip_contracts");

  assert.equal(parsePaymentDashboardStatusFilter(undefined), "PENDING");
  assert.equal(parsePaymentDashboardStatusFilter("ALL"), "ALL");
  assert.equal(parsePaymentDashboardProviderFilter("simpaisa"), "SIMPAISA");
  assert.equal(parsePaymentDashboardWebhookFilter("missing"), "MISSING");
  assert.equal(parsePaymentDashboardSearch("  ab  cd  ").includes("ab cd"), true);
  assert.deepEqual(paymentAttemptStatusesForFilter("PENDING"), [
    "AWAITING_PAYMENT",
    "PAYMENT_PENDING",
    "RECONCILIATION_REQUIRED",
  ]);
  assert.equal(isPaymentDashboardPendingAttemptStatus("AWAITING_PAYMENT"), true);
  assert.equal(isPaymentDashboardPendingAttemptStatus("FAILED"), false);
  assert.equal(paymentDashboardMethodPlaceholder(), "—");
  assert.match(paymentDashboardInquiryPlaceholder(), /Check on detail/i);
  assert.equal(buildAdminPaymentsHref({}), "/admin/payments");
  assert.match(
    buildAdminPaymentsHref({ status: "FAILED", provider: "SIMPAISA" }),
    /status=FAILED/
  );
  console.log("PASS shared_filter_helpers");

  assert.match(detail, /PendingSimpaisaInvestigateForm/);
  assert.match(detail, /PendingPaymentVerifyForm/);
  assert.match(detail, /isSimpaisa/);
  assert.match(detail, /investigationAvailable/);
  assert.match(pendingLegacy, /PendingSimpaisaInvestigateForm|PendingPaymentVerifyForm/);
  console.log("PASS reuses_existing_investigation_forms");

  assert.doesNotMatch(service, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(hub, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(detail, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(service, /status:\s*WalletEsimPurchaseStatus\.FUNDED/);
  assert.doesNotMatch(hub, /Mark paid|mark paid|Mark Paid/i);
  assert.doesNotMatch(detail, /\bFund\b/);
  assert.match(hub, /never marks a payment paid/i);
  assert.match(detail, /never fund or mark\s+paid/i);
  assert.doesNotMatch(service, /allowProduction:\s*true/);
  assert.match(simpaisaConfig, /allowProduction:\s*false/);
  console.log("PASS no_fund_mark_paid_or_production_simpaisa");

  assert.match(
    webhooksLib,
    /attemptHref:[\s\S]*\/admin\/payments\/\$\{paymentAttemptId\}/
  );
  assert.match(hub, /Payments/);
  assert.match(pkg, /"qa:admin-payment-dashboard"/);
  assert.doesNotMatch(shared, /from ["']@prisma\/client["']|PrismaClient/);
  console.log("PASS cross_links_and_qa_script");

  console.log("ALL_ADMIN_PAYMENT_DASHBOARD_CHECKS_PASSED");
}

main();
