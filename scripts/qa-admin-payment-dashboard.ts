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
  normalizePaymentDashboardDateRange,
  parsePaymentDashboardDateBound,
  parsePaymentDashboardOwnerFilter,
  parsePaymentDashboardProviderFilter,
  parsePaymentDashboardSearch,
  parsePaymentDashboardStatusFilter,
  parsePaymentDashboardWebhookFilter,
  paymentAttemptStatusesForFilter,
  paymentDashboardAttemptHref,
  paymentDashboardInquiryPlaceholder,
  paymentDashboardMethodPlaceholder,
  paymentDashboardOwnerLabel,
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

  assert.match(hub, /Total payments/);
  assert.match(hub, /Pending/);
  assert.match(hub, /Failed/);
  assert.match(hub, /Completed/);
  assert.match(hub, /Webhook missing/);
  assert.match(hub, /Stale unpaid holds/);
  assert.match(hub, /totalCount/);
  assert.match(hub, /failedCount/);
  assert.match(hub, /completedCount/);
  assert.match(service, /getAdminPaymentDashboardKpis/);
  assert.match(service, /countPaymentRecoveryCandidates\(\)\.catch/);
  assert.match(service, /webhookMissingAmongPendingCount/);
  assert.match(service, /partnerEsimPurchasePaymentAttempt/);
  assert.match(service, /PAYMENT_CONFIRMED/);
  console.log("PASS kpi_strip_contracts");

  assert.equal(parsePaymentDashboardStatusFilter(undefined), "PENDING");
  assert.equal(parsePaymentDashboardStatusFilter("ALL"), "ALL");
  assert.equal(parsePaymentDashboardProviderFilter("simpaisa"), "SIMPAISA");
  assert.equal(parsePaymentDashboardWebhookFilter("missing"), "MISSING");
  assert.equal(parsePaymentDashboardOwnerFilter(undefined), "ALL");
  assert.equal(parsePaymentDashboardOwnerFilter("partner"), "PARTNER");
  assert.equal(parsePaymentDashboardOwnerFilter("CUSTOMER"), "CUSTOMER");
  assert.equal(parsePaymentDashboardSearch("  ab  cd  ").includes("ab cd"), true);
  assert.deepEqual(paymentAttemptStatusesForFilter("PENDING"), [
    "AWAITING_PAYMENT",
    "PAYMENT_PENDING",
    "RECONCILIATION_REQUIRED",
  ]);
  assert.deepEqual(paymentAttemptStatusesForFilter("CONFIRMED"), [
    "PAYMENT_CONFIRMED",
  ]);
  assert.equal(isPaymentDashboardPendingAttemptStatus("AWAITING_PAYMENT"), true);
  assert.equal(isPaymentDashboardPendingAttemptStatus("FAILED"), false);
  assert.equal(paymentDashboardMethodPlaceholder(), "—");
  assert.equal(paymentDashboardOwnerLabel("customer"), "Customer");
  assert.equal(paymentDashboardOwnerLabel("partner"), "Partner");
  assert.equal(
    paymentDashboardAttemptHref("abc", "customer"),
    "/admin/payments/abc"
  );
  assert.equal(
    paymentDashboardAttemptHref("abc", "partner"),
    "/admin/payments/abc?kind=partner"
  );
  assert.match(paymentDashboardInquiryPlaceholder(), /Check on detail/i);
  assert.equal(formatAdminPaymentChargeLabel(300, "PKR"), "3.00 PKR");
  assert.equal(formatAdminPaymentChargeLabel(10000, "pkr"), "100.00 PKR");
  assert.equal(formatAdminPaymentChargeLabel(null, "PKR"), null);
  assert.equal(formatAdminPaymentChargeLabel(300, null), null);
  assert.match(shared, /formatAdminPaymentChargeLabel/);
  assert.match(service, /formatAdminPaymentChargeLabel/);
  assert.match(pendingLegacy, /formatAdminPaymentChargeLabel/);

  const fromBound = parsePaymentDashboardDateBound("2026-09-01", "start");
  const toBound = parsePaymentDashboardDateBound("2026-09-30", "end");
  assert.ok(fromBound);
  assert.ok(toBound);
  assert.equal(fromBound!.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(toBound!.toISOString(), "2026-09-30T23:59:59.999Z");
  assert.equal(parsePaymentDashboardDateBound("bad", "start"), null);
  const swapped = normalizePaymentDashboardDateRange("2026-09-30", "2026-09-01");
  assert.equal(swapped.fromParam, "2026-09-01");
  assert.equal(swapped.toParam, "2026-09-30");

  assert.equal(buildAdminPaymentsHref({}), "/admin/payments");
  assert.match(
    buildAdminPaymentsHref({ status: "FAILED", provider: "SIMPAISA" }),
    /status=FAILED/
  );
  assert.match(
    buildAdminPaymentsHref({ owner: "PARTNER", from: "2026-09-01" }),
    /owner=PARTNER/
  );
  assert.match(
    buildAdminPaymentsHref({ owner: "PARTNER", from: "2026-09-01" }),
    /from=2026-09-01/
  );
  console.log("PASS shared_filter_helpers");

  assert.match(hub, /name="owner"/);
  assert.match(hub, /name="from"/);
  assert.match(hub, /name="to"/);
  assert.match(hub, /Customer \/ Partner/);
  assert.match(hub, /Payment ID/);
  assert.match(hub, /ownerKind/);
  assert.match(hub, /PaymentListRowActions/);
  assert.match(hub, /View Details|detailHref/);
  assert.match(service, /listAdminPayments/);
  assert.match(service, /partnerEsimPurchasePaymentAttempt\.findMany/);
  assert.match(service, /paymentDashboardAttemptHref/);
  assert.match(service, /staleReleaseEligible/);
  assert.match(service, /staleReleaseHref/);
  assert.match(service, /reconciliationHref/);
  assert.match(service, /isPaymentRecoveryStaleReleaseEligible/);
  assert.match(service, /isAdminWalletReconciliationLinkApplicable/);
  assert.match(service, /buildAdminWalletPurchaseReconciliationHref/);
  assert.match(
    detail,
    /gatewayOnlyDismissEligible|Dismiss Stale Attempt|Dismiss \/ Mark Expired/
  );
  assert.match(shared, /kind=partner/);
  assert.match(
    read("app/components/admin/PaymentListRowActions.tsx"),
    /View Details/
  );
  assert.match(
    read("app/components/admin/PaymentListRowActions.tsx"),
    /Mark as Abandoned \/ Expired/
  );
  assert.match(
    read("app/components/admin/PaymentListRowActions.tsx"),
    /Reconciliation/
  );
  assert.match(
    read("app/components/admin/StaleGatewayReservationReleaseForm.tsx"),
    /id="stale-release"/
  );
  assert.match(
    read("app/lib/admin/paymentRecoveryShared.ts"),
    /isPaymentRecoveryStaleReleaseEligible/
  );
  assert.match(
    read("app/lib/admin/failedPaymentAttempts.ts"),
    /partnerEsimPurchasePaymentAttempt/
  );
  assert.match(
    read("app/admin/payments/failed/page.tsx"),
    /ownerKind/
  );
  assert.match(
    read("app/lib/admin/pendingPaymentVerify.ts"),
    /partnerEsimPurchasePaymentAttempt/
  );
  assert.match(
    read("app/admin/payments/pending/page.tsx"),
    /detailHref/
  );
  assert.doesNotMatch(hub, /Mark paid|Cancel payment|Replay webhook/i);
  assert.doesNotMatch(
    read("app/components/admin/PaymentListRowActions.tsx"),
    /releaseStaleGatewayReservationAction|Mark paid|applyVerified/i
  );
  console.log("PASS unified_owner_filters_and_table");

  assert.match(detail, /PendingSimpaisaInvestigateForm/);
  assert.match(detail, /PendingPaymentVerifyForm/);
  assert.match(detail, /isSimpaisa/);
  assert.match(detail, /investigationAvailable/);
  assert.match(detail, /Next safe action/);
  assert.match(detail, /Payment timeline/);
  assert.match(detail, /Advanced technical details/);
  assert.match(detail, /Related records/);
  assert.match(detail, /suggestPaymentDetailNextSafeAction/);
  assert.match(detail, /kindHint/);
  assert.match(detail, /recovery extras load failed|getAdminPaymentDetail/);
  assert.match(service, /partner attempt load failed/);
  assert.match(service, /Partner unavailable/);
  assert.match(service, /purchase\.partner \?\? null|partner\?\.user|partner \?\? null/);
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
    ])
      .map((e) => e.id)
      .join(","),
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
