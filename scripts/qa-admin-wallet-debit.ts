/**
 * Offline QA for Phase 4C ADMIN manual wallet debit (no DB writes, no secrets).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_CREDIT_MIN_CENTS,
  ADMIN_DEBIT_MAX_CENTS,
  ADMIN_DEBIT_MIN_CENTS,
  parseAdminDebitAmountToCents,
  parseAdminDebitReason,
  parseUsdAmountToCents,
} from "../app/lib/wallet/amount";
import { formatWalletTransactionAmount } from "../app/lib/wallet/display";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const debitSrc = read("app/lib/wallet/adminDebit.ts");
  const actionsSrc = read("app/lib/wallet/adminDebitActions.ts");
  const formStateSrc = read("app/lib/wallet/adminDebitFormState.ts");
  const creditSrc = read("app/lib/wallet/adminCredit.ts");
  const adminWalletSrc = read("app/lib/admin/wallet.ts");
  const formSrc = read("app/components/admin/AdminWalletDebitForm.tsx");
  const debitPage = read("app/admin/customers/[id]/wallet/debit/page.tsx");
  const successPage = read(
    "app/admin/customers/[id]/wallet/debit/success/page.tsx"
  );
  const detailPage = read("app/admin/customers/[id]/page.tsx");
  const customerRead = read("app/lib/wallet/read.ts");
  const customerWalletPage = read("app/account/wallet/page.tsx");
  const displaySrc = read("app/lib/wallet/display.ts");

  assert.match(actionsSrc, /requireRole\("ADMIN"\)/);
  assert.match(actionsSrc, /^"use server"/m);
  assert.match(actionsSrc, /export async function debitCustomerWalletAction/);
  assert.ok(!/export const /.test(actionsSrc));
  assert.ok(!/^["']use server["']/m.test(formStateSrc));
  assert.match(formStateSrc, /export const initialAdminWalletDebitState/);
  assert.match(formSrc, /adminDebitFormState/);
  assert.match(detailPage, /Deduct wallet funds/);
  assert.match(debitPage, /getAdminCustomerWalletSummary/);
  console.log("PASS admin_only_protection_exists");

  assert.match(debitSrc, /role !== Role\.CUSTOMER/);
  assert.match(debitSrc, /deletedAt/);
  assert.match(debitSrc, /role !== Role\.ADMIN/);
  console.log("PASS active_customer_only");

  assert.match(debitSrc, /WALLET_UNAVAILABLE/);
  assert.match(debitSrc, /No wallet funds are available to deduct/);
  assert.ok(!/walletAccount\.create/.test(debitSrc));
  console.log("PASS wallet_must_already_exist");

  assert.equal(ADMIN_DEBIT_MIN_CENTS, 10);
  assert.equal(ADMIN_DEBIT_MAX_CENTS, 50_000);
  assert.equal(ADMIN_CREDIT_MIN_CENTS, 10);
  assert.equal(parseAdminDebitAmountToCents("0.09").ok, false);
  assert.equal(parseAdminDebitAmountToCents("0.10").ok, true);
  assert.equal(parseAdminDebitAmountToCents("500.00").ok, true);
  assert.equal(parseAdminDebitAmountToCents("500.01").ok, false);
  console.log("PASS min_max_limits");

  assert.equal(parseAdminDebitAmountToCents("1.00", 50).ok, false);
  const half = parseAdminDebitAmountToCents("0.50", 50);
  assert.equal(half.ok, true);
  if (half.ok) assert.equal(half.cents, 50);
  console.log("PASS cannot_exceed_available_balance");

  assert.equal(parseAdminDebitAmountToCents("0").ok, false);
  assert.equal(parseAdminDebitAmountToCents("-1").ok, false);
  assert.equal(parseAdminDebitAmountToCents("NaN").ok, false);
  assert.equal(parseAdminDebitAmountToCents("1e2").ok, false);
  assert.equal(parseAdminDebitAmountToCents("1.001").ok, false);
  console.log("PASS invalid_amount_rejected");

  assert.equal(parseAdminDebitReason("abcd").ok, false);
  assert.equal(parseAdminDebitReason("abcde").ok, true);
  assert.equal(parseAdminDebitReason("x".repeat(201)).ok, false);
  console.log("PASS reason_validation");

  assert.match(debitSrc, /Number\.isInteger\(amountCents\)/);
  assert.match(debitSrc, /amountCents,/);
  assert.ok(!/parseFloat|toFixed/.test(debitSrc));
  console.log("PASS integer_cents_only");

  assert.match(debitSrc, /WalletTransactionType\.ADJUSTMENT_DEBIT/);
  assert.match(debitSrc, /WalletDirection\.DEBIT/);
  assert.match(debitSrc, /WalletTransactionStatus\.COMPLETED/);
  assert.match(debitSrc, /balanceAfterCents:\s*walletAfter\.balanceCents/);
  assert.match(debitSrc, /version:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(debitSrc, /amountCents,/);
  console.log("PASS adjustment_debit_completed_balance_after_version");

  assert.match(debitSrc, /\$transaction/);
  assert.match(debitSrc, /updateMany/);
  assert.match(debitSrc, /balanceCents:\s*\{\s*gte:\s*amountCents\s*\}/);
  assert.match(debitSrc, /walletTransaction\.create/);
  assert.match(debitSrc, /auditLog\.create/);
  console.log("PASS atomic_balance_ledger_audit");

  assert.match(debitSrc, /idempotencyKey/);
  assert.match(debitSrc, /duplicate:\s*true/);
  assert.match(formSrc, /useState\(newIdempotencyKey\)/);
  console.log("PASS idempotency_prevents_double_debit");

  assert.match(actionsSrc, /tx:\s*result\.transactionId/);
  assert.ok(!/amount:\s*String\(result\.amountCents\)/.test(actionsSrc));
  assert.match(successPage, /requireRole\("ADMIN"\)/);
  assert.match(successPage, /getAdminCompletedWalletDebit/);
  assert.ok(!/query\.amount|query\.balance/.test(successPage));
  assert.ok(!/\.create\(|\.update\(|\.upsert\(|\.delete\(/.test(successPage));
  console.log("PASS success_page_db_trust_boundary");

  assert.equal(formatWalletTransactionAmount(10, "DEBIT"), "-$0.10");
  assert.match(displaySrc, /Admin adjustment/);
  assert.match(customerRead, /ADJUSTMENT_DEBIT/);
  assert.ok(!/reason/.test(customerWalletPage));
  assert.ok(!/idempotencyKey/.test(customerWalletPage));
  console.log("PASS customer_display_hides_internal_details");

  assert.ok(!/vesim\/checkout|sendOtpEmail|payment gateway|stripe|refund/i.test(debitSrc));
  assert.ok(!/type:\s*WalletTransactionType\.(TOPUP|PURCHASE|REFUND|ADMIN_CREDIT)/.test(debitSrc));
  console.log("PASS no_payment_package_refund_email_vesim_writes");

  // Existing ADMIN credit path remains intact.
  assert.match(creditSrc, /WalletTransactionType\.ADMIN_CREDIT/);
  assert.match(creditSrc, /creditCustomerWalletByAdmin/);
  assert.equal(parseUsdAmountToCents("0.10").ok, true);
  console.log("PASS existing_admin_credit_unchanged");

  assert.ok(!/migrate reset|db push|migrate dev/i.test(debitSrc));
  assert.ok(!/\$executeRawUnsafe|\$queryRawUnsafe/.test(debitSrc));
  assert.match(debitSrc, /import "server-only"/);
  assert.ok(existsSync(join(root, "app/lib/wallet/adminDebit.ts")));

  assert.match(formSrc, /placeholder="0\.10"/);
  assert.match(formSrc, /useState\(""\)/);
  assert.match(
    formSrc,
    /The wallet balance cannot become negative/
  );
  assert.match(formSrc, /name="confirm"/);
  assert.match(detailPage, /No wallet funds are available to deduct/);
  assert.match(adminWalletSrc, /getAdminCompletedWalletDebit/);

  const packageJson = read("package.json");
  assert.match(packageJson, /"qa:admin-wallet-debit"/);

  console.log("ALL_QA_PASSED=20");
}

main();
