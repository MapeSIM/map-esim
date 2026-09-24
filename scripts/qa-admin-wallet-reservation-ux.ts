/**
 * Offline QA for admin wallet reservation UX (display/copy/nav only).
 * Does not mutate balances, mark paid, release reservations, or change status machines.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_REFUND_WALLET_FUNDS_BLURB,
  ADMIN_RELEASE_RESERVATION_BLURB,
  adminWalletReservationStatusLabel,
  buildAdminWalletPurchaseReconciliationHref,
  formatAdminReservedWalletAmount,
  formatAdminReservedWalletListFragment,
  isAdminWalletReconciliationLinkApplicable,
} from "../app/lib/admin/adminWalletReservationDisplay";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(
    existsSync(join(root, "app/lib/admin/adminWalletReservationDisplay.ts"))
  );

  assert.equal(formatAdminReservedWalletAmount(0), "none (gateway-only)");
  assert.equal(formatAdminReservedWalletAmount(null), "none (gateway-only)");
  assert.equal(formatAdminReservedWalletAmount(1500), "$15.00 (1500 cents)");
  assert.equal(
    formatAdminReservedWalletAmount(1500, { showCentsSecondary: false }),
    "$15.00"
  );
  assert.equal(
    formatAdminReservedWalletListFragment(1500),
    "wallet reserved $15.00 (1500 cents)"
  );
  assert.equal(formatAdminReservedWalletListFragment(0), "");
  console.log("PASS reserved_amount_formatting");

  assert.equal(
    adminWalletReservationStatusLabel("AWAITING_GATEWAY_PAYMENT"),
    "Awaiting gateway payment"
  );
  assert.equal(
    adminWalletReservationStatusLabel("FUNDS_RESERVED"),
    "Funds reserved"
  );
  assert.equal(
    adminWalletReservationStatusLabel("RECONCILIATION_REQUIRED"),
    "Needs reconciliation"
  );
  assert.equal(
    adminWalletReservationStatusLabel("PAYMENT_PENDING"),
    "Payment pending"
  );
  console.log("PASS status_labels");

  assert.equal(
    isAdminWalletReconciliationLinkApplicable({
      purchaseStatus: "FUNDS_RESERVED",
    }),
    true
  );
  assert.equal(
    isAdminWalletReconciliationLinkApplicable({
      attemptStatus: "RECONCILIATION_REQUIRED",
    }),
    true
  );
  assert.equal(
    isAdminWalletReconciliationLinkApplicable({
      purchaseStatus: "AWAITING_GATEWAY_PAYMENT",
      attemptStatus: "PAYMENT_PENDING",
    }),
    false
  );
  assert.equal(
    buildAdminWalletPurchaseReconciliationHref("abc/123"),
    "/admin/reconciliation/wallet_purchase/abc%2F123"
  );
  console.log("PASS reconciliation_nav_helpers");

  assert.match(ADMIN_RELEASE_RESERVATION_BLURB, /wallet hold/i);
  assert.match(ADMIN_RELEASE_RESERVATION_BLURB, /retry/i);
  assert.match(ADMIN_RELEASE_RESERVATION_BLURB, /never funds, marks paid/i);
  assert.match(ADMIN_REFUND_WALLET_FUNDS_BLURB, /confirmed refund/i);
  console.log("PASS action_blurbs");

  const pendingList = read("app/admin/payments/pending/page.tsx");
  const pendingDetail = read("app/admin/payments/pending/[attemptId]/page.tsx");
  const paymentDetail = read("app/admin/payments/[attemptId]/page.tsx");
  const recovery = read("app/admin/payments/recovery/page.tsx");
  const casePanel = read("app/components/admin/CaseManagementPanel.tsx");
  const simpaisaForm = read(
    "app/components/admin/PendingSimpaisaInvestigateForm.tsx"
  );
  const shared = read("app/lib/admin/adminWalletReservationDisplay.ts");
  const recoveryShared = read("app/lib/admin/paymentRecoveryShared.ts");
  const pkg = read("package.json");

  assert.match(pendingList, /formatAdminReservedWalletListFragment/);
  assert.match(pendingList, /adminWalletReservationStatusLabel/);
  assert.match(pendingList, /buildAdminWalletPurchaseReconciliationHref/);
  assert.match(pendingList, /Stale Unpaid Holds|staleUnpaidHolds|Stale unpaid holds/);
  assert.doesNotMatch(pendingList, /wallet reserved \$\{row\.walletAppliedCents\}/);
  assert.doesNotMatch(pendingList, /wallet reserved \$\{.*walletAppliedCents\}/);

  assert.match(pendingDetail, /formatAdminReservedWalletAmount/);
  assert.match(pendingDetail, /Open stuck case/);
  assert.match(paymentDetail, /formatAdminReservedWalletAmount/);
  assert.match(paymentDetail, /Verify Pending|ADMIN_UX_NAV\.verifyPending/);
  assert.match(paymentDetail, /Open stuck case/);
  assert.doesNotMatch(paymentDetail, /\$\{detail\.walletAppliedCents\} cents/);

  assert.match(recovery, /ADMIN_UX_NAV\.verifyPending|Verify Pending/);
  assert.match(recovery, /\/admin\/payments\/pending/);

  assert.match(simpaisaForm, /ADMIN_RELEASE_RESERVATION_BLURB/);
  assert.match(simpaisaForm, /Release Reservation/);
  assert.match(casePanel, /ADMIN_REFUND_WALLET_FUNDS_BLURB/);
  assert.match(casePanel, /Refund wallet funds/);
  assert.match(casePanel, /confirmed refund cases/i);

  assert.match(
    recoveryShared,
    /Open Verify Pending for release if eligible/
  );
  assert.match(shared, /formatAdminReservedWalletAmount/);
  assert.match(pkg, /"qa:admin-wallet-reservation-ux"/);
  console.log("PASS ui_wiring_and_nav");

  // Safety: display module must stay presentation-only.
  assert.doesNotMatch(shared, /prisma|refundReserved|maybeRelease|markPaid/i);
  console.log("PASS display_module_no_payment_side_effects");

  console.log("ALL_ADMIN_WALLET_RESERVATION_UX_CHECKS_PASSED");
}

main();
