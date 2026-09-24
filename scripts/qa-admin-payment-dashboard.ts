/**
 * Offline QA for Admin Payment Dashboard Phase 1 MVP.
 * Does not call gateways, mutate DB, fund purchases, or create VeSIM orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAdminPaymentsHref,
  formatAdminPaymentChargeLabel,
  isPaymentDashboardPendingAttemptStatus,
  parsePaymentDashboardProviderFilter,
  parsePaymentDashboardSearch,
  parsePaymentDashboardStatusFilter,
  parsePaymentDashboardWebhookFilter,
  paymentAttemptStatusesForFilter,
  paymentDashboardInquiryPlaceholder,
  paymentDashboardMethodPlaceholder,
} from "../app/lib/admin/paymentDashboardShared";
import {
  buildPaymentDetailTimeline,
  suggestPaymentDetailNextSafeAction,
} from "../app/lib/admin/paymentDetailWorkbenchShared";

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
  assert.match(nav, /ADMIN_UX_NAV\.payments|label: "Payments"/);
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
  assert.equal(formatAdminPaymentChargeLabel(300, "PKR"), "3.00 PKR");
  assert.equal(formatAdminPaymentChargeLabel(10000, "pkr"), "100.00 PKR");
  assert.equal(formatAdminPaymentChargeLabel(null, "PKR"), null);
  assert.equal(formatAdminPaymentChargeLabel(300, null), null);
  assert.match(shared, /formatAdminPaymentChargeLabel/);
  assert.match(service, /formatAdminPaymentChargeLabel/);
  assert.match(pendingLegacy, /formatAdminPaymentChargeLabel/);
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
  assert.match(detail, /Next safe action/);
  assert.match(detail, /Payment timeline/);
  assert.match(detail, /Advanced technical details/);
  assert.match(detail, /Related records/);
  assert.match(detail, /suggestPaymentDetailNextSafeAction/);
  assert.match(pendingLegacy, /PendingSimpaisaInvestigateForm|PendingPaymentVerifyForm/);

  assert.match(
    suggestPaymentDetailNextSafeAction({
      ownerKind: "customer",
      attemptStatus: "FAILED",
      purchaseStatus: "FAILED_REFUNDED",
      webhookPresent: false,
      investigationAvailable: false,
      isRecoveryCandidate: false,
      staleReleaseEligible: false,
      showStuckCaseLink: false,
      recoverySuggestedSafeAction: null,
    }),
    /retry|Do not mark paid/i
  );
  assert.equal(
    buildPaymentDetailTimeline([
      {
        id: "b",
        at: new Date("2026-01-02T00:00:00Z"),
        atLabel: "b",
        title: "Second",
      },
      {
        id: "a",
        at: new Date("2026-01-01T00:00:00Z"),
        atLabel: "a",
        title: "First",
      },
    ]).map((e) => e.id).join(","),
    "b,a"
  );
  console.log("PASS reuses_existing_investigation_forms");

  assert.doesNotMatch(service, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(hub, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(detail, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(service, /status:\s*WalletEsimPurchaseStatus\.FUNDED/);
  assert.doesNotMatch(hub, /Mark paid|mark paid|Mark Paid/i);
  assert.doesNotMatch(detail, /\bFund\b/);
  assert.match(read("app/lib/admin/adminUxCopy.ts"), /never marks a payment paid/i);
  assert.match(
    read("app/lib/admin/paymentDetailWorkbenchShared.ts"),
    /never fund or mark paid/i
  );
  assert.match(detail, /never fund or mark paid|PAYMENT_DETAIL_WORKBENCH_DESCRIPTION/i);
  assert.doesNotMatch(service, /allowProduction:\s*true/);
  assert.match(simpaisaConfig, /allowProduction:\s*true/);
  assert.doesNotMatch(simpaisaConfig, /allowProduction:\s*false/);
  console.log("PASS no_fund_mark_paid_and_simpaisa_production_allowed");

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
