/**
 * Offline QA: customer refund MAP Wallet execution path.
 * Does not mutate DB, call gateways, or send SMTP.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOMER_REFUND_REQUEST_REFERENCE_TYPE,
  REFUND_AUDIT,
  REFUND_CUSTOMER_WALLET_PHRASE,
  REFUND_REQUEST_EXECUTABLE_STATUSES,
  REFUND_REQUEST_OPEN_STATUSES,
  REFUND_STATUS_EMAIL_EVENTS,
  customerRefundRequestIdempotencyKey,
  isExecutableRefundStatus,
  isOpenRefundStatus,
  refundStatusLabel,
} from "../app/lib/refunds/refundRequestConstants";
import {
  evaluateCustomerRefundExecutionEligibility,
  customerRefundExecutionBlockerLabel,
  sanitizeCustomerRefundExecutionFailureReason,
} from "../app/lib/refunds/refundRequestExecutionShared";
import {
  refundStatusEmailSubject,
  renderRefundStatusEmailHtml,
  renderRefundStatusEmailText,
} from "../app/lib/email/refundStatusTemplate";
import { formatUsdCents } from "../app/lib/wallet/display";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migrationPath =
    "prisma/migrations/20260826140000_add_customer_refund_execution/migration.sql";
  assert.ok(existsSync(join(root, migrationPath)));
  const migration = read(migrationPath);
  const execution = read("app/lib/refunds/refundRequestExecution.ts");
  const actions = read("app/lib/refunds/refundRequestExecutionActions.ts");
  const sync = read("app/lib/refunds/refundRequestSync.ts");
  const admin = read("app/lib/refunds/refundRequestAdmin.ts");
  const review = read("app/lib/refunds/refundRequest.ts");
  const notify = read("app/lib/refunds/refundRequestNotification.ts");
  const template = read("app/lib/email/refundStatusTemplate.ts");
  const ui = read("app/components/admin/AdminCustomerRefundRequestExecute.tsx");
  const detail = read("app/admin/refund-requests/[id]/page.tsx");
  const recon = read("app/lib/admin/reconciliationWalletRefund.ts");
  const partnerExec = read("app/lib/partner/partnerRefundRequestExecution.ts");
  const pkg = read("package.json");

  console.log("1) Schema + migration");
  assert.match(schema, /EXECUTION_FAILED/);
  assert.match(schema, /executedRefundTransactionId/);
  assert.match(schema, /executedAmountCents/);
  assert.match(schema, /executedAt/);
  assert.match(schema, /executedByAdminId/);
  assert.match(schema, /lastExecutionError/);
  assert.match(migration, /EXECUTION_FAILED/);
  assert.match(migration, /executedRefundTransactionId/);
  console.log("   ok");

  console.log("2) Status helpers");
  assert.ok(isOpenRefundStatus("EXECUTION_FAILED"));
  assert.ok(isExecutableRefundStatus("APPROVED_PENDING_EXECUTION"));
  assert.ok(isExecutableRefundStatus("EXECUTION_FAILED"));
  assert.ok(!isExecutableRefundStatus("REQUESTED"));
  assert.deepEqual([...REFUND_REQUEST_EXECUTABLE_STATUSES], [
    "APPROVED_PENDING_EXECUTION",
    "EXECUTION_FAILED",
  ]);
  assert.ok(REFUND_REQUEST_OPEN_STATUSES.includes("EXECUTION_FAILED"));
  assert.equal(
    refundStatusLabel("EXECUTION_FAILED"),
    "Execution failed — retry"
  );
  assert.equal(
    customerRefundRequestIdempotencyKey("abc"),
    "customer_refund_req_abc"
  );
  assert.equal(REFUND_CUSTOMER_WALLET_PHRASE, "REFUND CUSTOMER WALLET");
  assert.equal(CUSTOMER_REFUND_REQUEST_REFERENCE_TYPE, "CUSTOMER_REFUND_REQUEST");
  console.log("   ok");

  console.log("3) Eligibility");
  assert.equal(
    evaluateCustomerRefundExecutionEligibility({
      requestStatus: "APPROVED_PENDING_EXECUTION",
      refundAmountCents: 1000,
      customerRole: "CUSTOMER",
      customerDeleted: false,
    }).ok,
    true
  );
  const blocked = evaluateCustomerRefundExecutionEligibility({
    requestStatus: "REQUESTED",
    refundAmountCents: 1000,
    customerRole: "CUSTOMER",
    customerDeleted: false,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.blocker, "NOT_APPROVED");
    assert.match(customerRefundExecutionBlockerLabel(blocked.blocker), /approved/i);
  }
  console.log("   ok");

  console.log("4) Execution credits approved amount, not composition");
  assert.match(execution, /refundAmountCents/);
  assert.match(execution, /customerRefundRequestIdempotencyKey/);
  assert.match(execution, /CUSTOMER_REFUND_REQUEST/);
  assert.match(execution, /REFUND_CREDIT/);
  assert.match(execution, /balanceCents:\s*\{\s*increment:\s*amountCents/);
  assert.doesNotMatch(execution, /from ["']@\/app\/lib\/esim\/walletPurchase["']/);
  assert.doesNotMatch(execution, /await refundReservedFundsInTx/);
  assert.doesNotMatch(execution, /requestRefund\(/);
  assert.doesNotMatch(execution, /walletAppliedCents/);
  assert.match(execution, /REFUND_CUSTOMER_WALLET_PHRASE|REFUND CUSTOMER WALLET/);
  assert.match(execution, /EXECUTION_FAILED/);
  assert.match(execution, /markExecutionFailed/);
  assert.match(execution, /applyCustomerRewardFullRefundEffectsInTx/);
  assert.match(execution, /scheduleRefundStatusNotification\([\s\S]*"completed"/);
  assert.match(execution, /CUSTOMER_REFUND_EXECUTION_TX/);
  assert.match(execution, /maxWait:\s*10_000/);
  assert.match(execution, /timeout:\s*20_000/);
  const txOptionUses = execution.match(/\}, CUSTOMER_REFUND_EXECUTION_TX\)/g) || [];
  assert.equal(txOptionUses.length, 2, "both interactive $transaction calls use TX options");
  assert.match(execution, /sanitizeCustomerRefundExecutionFailureReason/);
  assert.doesNotMatch(
    execution,
    /reason:\s*"wallet_credit_failed"/,
    "generic wallet_credit_failed-only path replaced"
  );
  console.log("   ok");

  console.log("4b) Sanitized execution failure reasons");
  assert.equal(
    sanitizeCustomerRefundExecutionFailureReason(
      new Error(
        "Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5242 ms passed since the start of the transaction."
      )
    ),
    "transaction_timeout"
  );
  assert.equal(
    sanitizeCustomerRefundExecutionFailureReason(
      new Error("Transaction not found. Transaction ID is invalid")
    ),
    "transaction_timeout"
  );
  assert.equal(
    sanitizeCustomerRefundExecutionFailureReason(
      new Error("Timed out fetching a new connection from the connection pool")
    ),
    "db_pool_timeout"
  );
  const redacted = sanitizeCustomerRefundExecutionFailureReason(
    new Error(
      "connect failed postgres://user:secretpass@db.example/map email admin@mapesim.com password=leak"
    )
  );
  assert.doesNotMatch(redacted, /secretpass|admin@mapesim\.com|password=leak/i);
  assert.match(redacted, /wallet_credit_failed/);
  assert.ok(redacted.length <= 120);
  console.log("   ok");

  console.log("5) Admin action + UI");
  assert.match(actions, /assertSameOriginAdminRequest/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /void formData\.get\("requestRefund"\)/);
  assert.match(actions, /void formData\.get\("amountCents"\)/);
  assert.match(ui, /REFUND_CUSTOMER_WALLET_PHRASE/);
  assert.match(ui, /Credit MAP Wallet/);
  assert.match(detail, /AdminCustomerRefundRequestExecute/);
  assert.match(detail, /MAP Wallet credited/);
  assert.match(detail, /Gateway refund/);
  assert.match(admin, /canExecute/);
  assert.match(admin, /Gateway ·/);
  assert.doesNotMatch(admin, /Card ·/);
  console.log("   ok");

  console.log("6) Sync from existing purchase refund");
  assert.match(sync, /syncCustomerRefundRequestsForPurchase/);
  assert.match(sync, /EXECUTION_FAILED/);
  assert.match(execution, /syncCustomerRefundRequestsForOrder/);
  assert.match(recon, /syncCustomerRefundRequestsForPurchase/);
  console.log("   ok");

  console.log("7) Review path still money-free; partner untouched");
  assert.doesNotMatch(review, /REFUND_CREDIT|requestRefund\(/);
  assert.match(review, /moneyMoved:\s*false/);
  assert.doesNotMatch(partnerExec, /executeAdminCustomerRefundRequest/);
  assert.doesNotMatch(partnerExec, /customer_refund_req_/);
  console.log("   ok");

  console.log("8) Completed email");
  assert.ok(REFUND_STATUS_EMAIL_EVENTS.includes("completed"));
  assert.equal(REFUND_AUDIT.EMAIL_COMPLETED, "refund.email_completed");
  assert.match(notify, /case "completed"/);
  assert.match(template, /Refund completed/);
  const completedHtml = renderRefundStatusEmailHtml({
    kind: "completed",
    customerName: "Alex",
    orderReference: "abcd…wxyz",
    amountLabel: formatUsdCents(1000),
    currencyLabel: "USD",
    orderUrl: "https://mapesim.com/account/orders/test",
    requestedAtLabel: "26 Aug 2026, 12:00 UTC",
    walletCreditedLabel: formatUsdCents(1000),
  });
  const completedText = renderRefundStatusEmailText({
    kind: "completed",
    customerName: "Alex",
    orderReference: "abcd…wxyz",
    amountLabel: formatUsdCents(1000),
    currencyLabel: "USD",
    orderUrl: "https://mapesim.com/account/orders/test",
    requestedAtLabel: "26 Aug 2026, 12:00 UTC",
    walletCreditedLabel: formatUsdCents(1000),
  });
  assert.match(completedText, /MAP Wallet credited/i);
  assert.match(completedText, /not a Simpaisa|No Simpaisa/i);
  assert.match(refundStatusEmailSubject("completed"), /completed/i);
  assert.match(completedHtml, /MAP Wallet credited/i);
  const approvedText = renderRefundStatusEmailText({
    kind: "approved_pending_execution",
    customerName: "Alex",
    orderReference: "abcd…wxyz",
    amountLabel: formatUsdCents(1000),
    currencyLabel: "USD",
    orderUrl: "https://mapesim.com/account/orders/test",
    requestedAtLabel: "26 Aug 2026, 12:00 UTC",
  });
  assert.doesNotMatch(
    approvedText,
    /another confirmation only after refund execution succeeds/i
  );
  assert.match(approvedText, /refund-completed notice|MAP Wallet/i);
  assert.match(pkg, /"qa:customer-refund-execution"/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=customer-refund-execution");
}

main();
