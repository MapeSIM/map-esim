/**
 * Offline QA for customer refund request + admin review foundation.
 * Does not mutate DB, call gateways, credit wallets, or place orders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFUND_AUDIT,
  REFUND_REQUEST_OPEN_STATUSES,
  REFUND_REQUEST_REASONS,
  isOpenRefundStatus,
  parseRefundRequestReason,
  refundStatusLabel,
} from "../app/lib/refunds/refundRequestConstants";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migrationPath =
    "prisma/migrations/20260809120000_add_refund_request_foundation/migration.sql";
  assert.ok(existsSync(join(root, migrationPath)));
  const migration = read(migrationPath);
  const service = read("app/lib/refunds/refundRequest.ts");
  const actions = read("app/lib/refunds/refundRequestActions.ts");
  const admin = read("app/lib/refunds/refundRequestAdmin.ts");
  const adminActions = read("app/lib/refunds/refundRequestAdminActions.ts");
  const customerForm = read(
    "app/components/orders/CustomerRefundRequestForm.tsx"
  );
  const adminForm = read(
    "app/components/admin/AdminRefundRequestActions.tsx"
  );
  const orderPage = read("app/account/orders/[orderId]/page.tsx");
  const adminList = read("app/admin/refund-requests/page.tsx");
  const adminDetail = read("app/admin/refund-requests/[id]/page.tsx");
  const nav = read("app/components/admin/AdminNav.tsx");
  const purchase = read("app/lib/esim/walletPurchase.ts");
  const topup = read("app/lib/wallet/topup.ts");
  const pg4 = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const pkg = read("package.json");

  assert.match(schema, /enum RefundRequestStatus/);
  assert.match(schema, /APPROVED_PENDING_EXECUTION/);
  assert.match(schema, /model RefundRequest/);
  assert.match(schema, /openOrderKey/);
  assert.match(migration, /CREATE TABLE "RefundRequest"/);
  assert.match(migration, /RefundRequest_openOrderKey_key/);
  console.log("PASS schema_and_migration");

  for (const reason of REFUND_REQUEST_REASONS) {
    assert.equal(parseRefundRequestReason(reason), reason);
  }
  assert.equal(parseRefundRequestReason("HACK"), null);
  assert.ok(isOpenRefundStatus("REQUESTED"));
  assert.ok(isOpenRefundStatus("APPROVED_PENDING_EXECUTION"));
  assert.ok(!isOpenRefundStatus("REJECTED"));
  assert.ok(!isOpenRefundStatus("COMPLETED"));
  assert.equal(
    refundStatusLabel("APPROVED_PENDING_EXECUTION"),
    "Approved — pending execution"
  );
  assert.deepEqual(REFUND_REQUEST_OPEN_STATUSES, [
    "REQUESTED",
    "UNDER_REVIEW",
    "APPROVED_PENDING_EXECUTION",
  ]);
  console.log("PASS reason_and_status_helpers");

  assert.match(service, /createCustomerRefundRequest/);
  assert.match(service, /userId: customer\.id/);
  assert.match(service, /DUPLICATE_OPEN/);
  assert.match(service, /openOrderKey:\s*order\.id/);
  assert.match(service, /refundAmountCents/);
  assert.match(service, /purchase\.priceCents/);
  assert.doesNotMatch(service, /formData\.get\("amount"\)|input\.refundAmount/);
  assert.match(actions, /void formData\.get\("amount"\)/);
  assert.match(actions, /void formData\.get\("refundAmountCents"\)/);
  assert.match(actions, /requireRole\("CUSTOMER"/);
  assert.match(actions, /redirect\(orderDetailPath\(orderId\)\)/);
  assert.match(actions, /refund=requested/);
  assert.doesNotMatch(actions, /revalidatePath\s*\(/);
  assert.match(service, /createdAt:\s*now/);
  assert.match(service, /updatedAt:\s*now/);
  assert.match(orderPage, /CustomerRefundRequestForm/);
  assert.match(orderPage, /listCustomerRefundRequestsForOrder/);
  assert.match(orderPage, /Fail soft/);
  assert.match(orderPage, /refundJustRequested/);
  assert.match(customerForm, /Select a reason/);
  console.log("PASS customer_request_ownership_amount");

  assert.match(adminList, /requireRole\("ADMIN"\)/);
  assert.match(adminDetail, /requireRole\("ADMIN"\)/);
  assert.match(adminActions, /requireRole\("ADMIN"\)/);
  assert.match(nav, /\/admin\/refund-requests/);
  assert.match(admin, /listAdminRefundRequests/);
  assert.match(admin, /getAdminRefundRequestDetail/);
  assert.match(adminDetail, /Payment composition/);
  assert.match(adminDetail, /Provider result/);
  assert.match(adminDetail, /ICCID \(masked\)/);
  assert.doesNotMatch(adminDetail, /iccidEncrypted|full ICCID/i);
  console.log("PASS admin_queue_review_admin_only");

  assert.match(service, /APPROVED_PENDING_EXECUTION/);
  assert.match(
    service,
    /status:\s*RefundRequestStatus\.APPROVED_PENDING_EXECUTION/
  );
  assert.doesNotMatch(service, /RefundRequestStatus\.COMPLETED/);
  assert.match(service, /moneyMoved:\s*false/);
  assert.match(service, /gatewayRefundCalled:\s*false/);
  assert.match(service, /providerRefundCalled:\s*false/);
  assert.match(adminForm, /Approve \(pending execution\)/);
  assert.match(adminForm, /never[\s\S]*credit a wallet/i);
  assert.match(adminActions, /void formData\.get\("creditWallet"\)/);
  assert.match(adminActions, /void formData\.get\("executeRefund"\)/);
  assert.match(adminActions, /void formData\.get\("markCompleted"\)/);
  console.log("PASS approve_pending_execution_no_money");

  assert.match(service, /action === "reject"/);
  assert.match(service, /Add a short decision note before rejecting/);
  assert.match(service, /adminDecisionNote:\s*note/);
  assert.match(service, /openOrderKey:\s*null/);
  assert.match(adminForm, /required to reject/);
  console.log("PASS reject_with_note");

  assert.match(service, /REFUND_AUDIT\.CREATED/);
  assert.match(service, /REFUND_AUDIT\.APPROVED_PENDING/);
  assert.match(service, /REFUND_AUDIT\.REJECTED/);
  assert.match(service, /writeAuditLog|auditLog\.create/);
  assert.equal(REFUND_AUDIT.APPROVED_PENDING, "refund.request_approved_pending_execution");
  console.log("PASS audit_log");

  assert.doesNotMatch(service, /balanceCents:\s*\{|REFUND_CREDIT|requestRefund\(/);
  assert.doesNotMatch(service, /executeCreditCheckout|getBrokerToken/);
  assert.doesNotMatch(adminActions, /REFUND_CREDIT|requestRefund\(/);
  assert.doesNotMatch(service, /RefundRequestStatus\.COMPLETED|status:\s*["']COMPLETED["']/);
  console.log("PASS no_money_gateway_provider_refund");

  assert.match(purchase, /PURCHASE_DEBIT/);
  assert.match(topup, /startWalletTopupCheckout/);
  assert.match(pg4, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.doesNotMatch(purchase, /createCustomerRefundRequest/);
  assert.match(pkg, /"qa:refund-request-foundation"/);
  console.log("PASS purchase_payment_regression_surfaces");

  console.log("ALL_QA_PASSED=refund-request-foundation");
}

main();
