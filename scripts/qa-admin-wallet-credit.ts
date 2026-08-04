/**
 * Offline QA for Phase 4B ADMIN manual wallet credit (no DB writes, no secrets).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_CREDIT_MAX_CENTS,
  ADMIN_CREDIT_MIN_CENTS,
  parseAdminCreditInternalReference,
  parseAdminCreditReason,
  parseUsdAmountToCents,
} from "../app/lib/wallet/amount";
import { formatWalletTransactionAmount } from "../app/lib/wallet/display";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const creditSrc = read("app/lib/wallet/adminCredit.ts");
  const actionsSrc = read("app/lib/wallet/adminCreditActions.ts");
  const formStateSrc = read("app/lib/wallet/adminCreditFormState.ts");
  const amountSrc = read("app/lib/wallet/amount.ts");
  const adminWalletSrc = read("app/lib/admin/wallet.ts");
  const formSrc = read("app/components/admin/AdminWalletCreditForm.tsx");
  const creditPage = read(
    "app/admin/customers/[id]/wallet/credit/page.tsx"
  );
  const successPage = read(
    "app/admin/customers/[id]/wallet/credit/success/page.tsx"
  );
  const detailPage = read("app/admin/customers/[id]/page.tsx");
  const customerWalletPage = read("app/account/wallet/page.tsx");
  const customerRead = read("app/lib/wallet/read.ts");

  assert.match(actionsSrc, /requireRole\("ADMIN"\)/);
  assert.match(actionsSrc, /^"use server"/m);
  assert.match(actionsSrc, /export async function creditCustomerWalletAction/);
  assert.ok(!/export const /.test(actionsSrc));
  assert.ok(!/export type /.test(actionsSrc));
  assert.ok(!/^["']use server["']/m.test(formStateSrc));
  assert.match(formStateSrc, /export const initialAdminWalletCreditState/);
  assert.match(formSrc, /adminCreditFormState/);
  assert.match(creditPage, /getAdminCustomerWalletSummary/);
  assert.match(detailPage, /Add wallet credit/);
  console.log("PASS admin_only_protection_exists");

  assert.match(creditSrc, /role !== Role\.CUSTOMER/);
  assert.match(creditSrc, /deletedAt/);
  assert.match(creditSrc, /role !== Role\.ADMIN/);
  assert.ok(!/role === Role\.ADMIN[\s\S]*creditCustomerWalletByAdmin/.test(creditSrc));
  console.log("PASS only_active_customer_can_receive_credit");

  const ten = parseUsdAmountToCents("10");
  assert.equal(ten.ok, true);
  if (ten.ok) assert.equal(ten.cents, 1000);
  const tenExact = parseUsdAmountToCents("10.00");
  assert.equal(tenExact.ok, true);
  if (tenExact.ok) assert.equal(tenExact.cents, 1000);
  const oneFifty = parseUsdAmountToCents("1.5");
  assert.equal(oneFifty.ok, true);
  if (oneFifty.ok) assert.equal(oneFifty.cents, 150);
  assert.equal(ADMIN_CREDIT_MIN_CENTS, 10);
  assert.equal(ADMIN_CREDIT_MAX_CENTS, 50_000);
  assert.equal(parseUsdAmountToCents("0.09").ok, false);
  assert.equal(parseUsdAmountToCents("0.10").ok, true);
  const tenCents = parseUsdAmountToCents("0.10");
  if (tenCents.ok) assert.equal(tenCents.cents, 10);
  assert.equal(parseUsdAmountToCents("0.11").ok, true);
  const elevenCents = parseUsdAmountToCents("0.11");
  if (elevenCents.ok) assert.equal(elevenCents.cents, 11);
  assert.equal(parseUsdAmountToCents("500.01").ok, false);
  assert.equal(parseUsdAmountToCents("500.00").ok, true);
  assert.equal(parseUsdAmountToCents("1.00").ok, true);
  console.log("PASS usd_to_cents_and_min_max_limits");

  assert.equal(parseUsdAmountToCents("10.999").ok, false);
  assert.equal(parseUsdAmountToCents("10.001").ok, false);
  assert.equal(parseUsdAmountToCents("1.234").ok, false);
  console.log("PASS more_than_two_decimals_rejected");

  assert.equal(parseUsdAmountToCents("0").ok, false);
  assert.equal(parseUsdAmountToCents("0.00").ok, false);
  assert.equal(parseUsdAmountToCents("-10").ok, false);
  assert.equal(parseUsdAmountToCents("NaN").ok, false);
  assert.equal(parseUsdAmountToCents("1e2").ok, false);
  assert.equal(parseUsdAmountToCents("1E2").ok, false);
  assert.equal(parseUsdAmountToCents("10.").ok, false);
  assert.equal(parseUsdAmountToCents(".5").ok, false);
  console.log("PASS negative_zero_nan_exponent_rejected");

  assert.equal(parseAdminCreditReason("").ok, false);
  assert.equal(parseAdminCreditReason("abcd").ok, false);
  assert.equal(parseAdminCreditReason("abcde").ok, true);
  assert.equal(parseAdminCreditReason("x".repeat(201)).ok, false);
  assert.equal(parseAdminCreditReason("x".repeat(200)).ok, true);
  assert.equal(parseAdminCreditInternalReference("y".repeat(101)).ok, false);
  assert.equal(parseAdminCreditInternalReference("  ref  ").ok, true);
  console.log("PASS reason_required_and_length_limited");

  assert.match(creditSrc, /walletAccount\.create/);
  assert.match(adminWalletSrc, /Never creates a wallet row/);
  assert.ok(!/\.create\(/.test(adminWalletSrc));
  assert.ok(!/\.create\(/.test(customerRead));
  console.log("PASS wallet_created_only_during_valid_first_credit");

  assert.match(creditSrc, /\$transaction/);
  assert.match(creditSrc, /walletAccount\.update/);
  assert.match(creditSrc, /walletTransaction\.create/);
  assert.match(creditSrc, /auditLog\.create/);
  console.log("PASS balance_and_transaction_atomic");

  assert.match(creditSrc, /WalletTransactionType\.ADMIN_CREDIT/);
  assert.match(creditSrc, /WalletDirection\.CREDIT/);
  assert.match(creditSrc, /WalletTransactionStatus\.COMPLETED/);
  assert.match(creditSrc, /balanceAfterCents:\s*updatedWallet\.balanceCents/);
  assert.match(creditSrc, /version:\s*\{\s*increment:\s*1\s*\}/);
  console.log("PASS admin_credit_completed_balance_after_version");

  assert.match(creditSrc, /idempotencyKey/);
  assert.match(creditSrc, /duplicate:\s*true/);
  assert.match(formSrc, /idempotencyKey/);
  assert.match(formSrc, /useState\(newIdempotencyKey\)/);
  console.log("PASS duplicate_submission_idempotency");

  assert.match(creditSrc, /wallet\.admin_credit_completed/);
  assert.match(creditSrc, /method:\s*"admin_manual_credit"/);
  assert.match(creditSrc, /amountCents/);
  assert.match(creditSrc, /reason/);
  assert.ok(!/email:\s*|password|JWT|cookie|user-agent|userAgent|ipAddress/i.test(creditSrc));
  console.log("PASS safe_audit_entry_created");

  assert.equal(formatWalletTransactionAmount(1000, "CREDIT"), "+$10.00");
  assert.match(customerRead, /type === "ADMIN_CREDIT"/);
  assert.match(customerRead, /referenceLabel:/);
  assert.ok(!/reason/.test(customerWalletPage));
  assert.ok(!/idempotencyKey/.test(customerWalletPage));
  console.log("PASS customer_displays_credit_without_internal_reason");

  assert.ok(!/vesim\/checkout|sendOtpEmail|sendAccountDeletedEmail|payment gateway|stripe/i.test(creditSrc));
  assert.ok(!/vesim\/checkout|sendOtpEmail|refund/i.test(actionsSrc));
  assert.ok(!/TOPUP_CREDIT|PURCHASE_DEBIT|REFUND_CREDIT/.test(creditSrc.replace(/WalletTransactionType/g, "")));
  // Ensure write path only creates ADMIN_CREDIT type
  assert.match(creditSrc, /type:\s*WalletTransactionType\.ADMIN_CREDIT/);
  assert.ok(!/type:\s*WalletTransactionType\.(TOPUP|PURCHASE|REFUND)/.test(creditSrc));
  console.log("PASS no_payment_vesim_refund_or_email_write");

  const forbidden =
    /cardNumber|\bcvv\b|\bcvc\b|\bpan\b|passwordHash|access_token|refresh_token|providerPayload/i;
  assert.ok(!forbidden.test(creditSrc));
  assert.ok(!forbidden.test(actionsSrc));
  assert.ok(!forbidden.test(formSrc));
  assert.ok(!forbidden.test(creditPage));
  assert.ok(!/idempotencyKey/.test(successPage));
  assert.ok(!/walletVersion|adminSessionVersion|idempotencyKey/i.test(detailPage));
  assert.ok(!/Internal wallet version/i.test(detailPage));
  // Success page must not trust URL money values — only tx id, then DB load.
  assert.match(actionsSrc, /tx:\s*result\.transactionId/);
  assert.ok(!/amount:\s*String\(result\.amountCents\)/.test(actionsSrc));
  assert.ok(!/balance:\s*String\(result\.balanceCents\)/.test(actionsSrc));
  assert.match(successPage, /requireRole\("ADMIN"\)/);
  assert.match(successPage, /getAdminCompletedWalletCredit/);
  assert.ok(!/query\.amount|query\.balance/.test(successPage));
  assert.ok(!/\.create\(|\.update\(|\.upsert\(|\.delete\(/.test(successPage));
  assert.match(adminWalletSrc, /getAdminCompletedWalletCredit/);
  assert.match(adminWalletSrc, /WalletTransactionType\.ADMIN_CREDIT/);
  assert.match(adminWalletSrc, /WalletTransactionStatus\.COMPLETED/);
  assert.ok(!/\.create\(|\.update\(|\.upsert\(|\.delete\(/.test(adminWalletSrc));
  const creditLookupSrc = adminWalletSrc.slice(
    adminWalletSrc.indexOf("getAdminCompletedWalletCredit"),
    adminWalletSrc.indexOf("export type AdminCustomerWalletSummary")
  );
  assert.match(creditLookupSrc, /amountCents:\s*true/);
  assert.match(creditLookupSrc, /balanceAfterCents:\s*true/);
  assert.ok(!/idempotencyKey|passwordHash|access_token|referenceId|referenceType|version/.test(creditLookupSrc));
  console.log("PASS no_secret_private_fields_exposed");

  assert.ok(!/migrate reset|db push|migrate dev/i.test(creditSrc));
  assert.ok(!/migrate reset|db push|migrate dev/i.test(actionsSrc));
  assert.ok(!/\$executeRawUnsafe|\$queryRawUnsafe/.test(creditSrc));
  console.log("PASS no_destructive_prisma_command");

  assert.match(amountSrc, /parseUsdAmountToCents/);
  assert.match(creditSrc, /import "server-only"/);
  assert.match(actionsSrc, /"use server"/);
  assert.ok(existsSync(join(root, "app/lib/wallet/adminCredit.ts")));

  const packageJson = read("package.json");
  assert.match(packageJson, /"qa:admin-wallet-credit"/);

  // Credit form has irreversible warning + confirmation
  assert.match(
    formSrc,
    /This action immediately adds USD wallet credit and is recorded in the/
  );
  assert.match(formSrc, /name="confirm"/);
  assert.match(formSrc, /placeholder="0\.10"/);
  assert.match(formSrc, /useState\(""\)/);
  assert.ok(!/placeholder="10\.00"/.test(formSrc));
  assert.ok(!/defaultValue=["']10\.00["']/.test(formSrc));
  assert.ok(!/value=["']10\.00["']/.test(formSrc));

  // Customer read path still has no mutation
  assert.ok(!/\.create\(|\.upsert\(|\.update\(/.test(customerRead));

  console.log("ALL_QA_PASSED=18");
}

main();
