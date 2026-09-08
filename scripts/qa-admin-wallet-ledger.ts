/**
 * Offline QA for Admin Wallet Ledger MVP.
 * Does not mutate balances, mark paid, or release reservations.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAdminWalletLedgerHref,
  walletLedgerLifecycleLabel,
} from "../app/lib/admin/walletLedgerShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(
    existsSync(join(root, "app/admin/customers/[id]/wallet/page.tsx"))
  );
  assert.ok(existsSync(join(root, "app/lib/admin/walletLedger.ts")));
  assert.ok(existsSync(join(root, "app/lib/admin/walletLedgerShared.ts")));

  const page = read("app/admin/customers/[id]/wallet/page.tsx");
  const service = read("app/lib/admin/walletLedger.ts");
  const shared = read("app/lib/admin/walletLedgerShared.ts");
  const customer = read("app/admin/customers/[id]/page.tsx");
  const pkg = read("package.json");
  const reserve = read("app/lib/esim/walletPurchase.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");

  assert.match(page, /requireRole\("ADMIN"\)/);
  assert.match(page, /getAdminWalletLedgerPage/);
  assert.match(page, /never[\s\S]{0,40}balance/i);
  assert.match(page, /never marks paid|never[\s\S]{0,20}marks paid/i);
  assert.doesNotMatch(page, /Release Reservation|Mark paid|markPaid/i);
  assert.doesNotMatch(service, /maybeReleasePendingGatewayReservation\s*\(/);
  assert.doesNotMatch(service, /reserveWalletPurchaseFundsInTx\s*\(/);
  assert.doesNotMatch(service, /refundReservedFundsInTx\s*\(/);
  assert.doesNotMatch(service, /walletAccount\.update|walletTransaction\.create/);
  assert.doesNotMatch(service, /\$executeRaw|prisma\.\$transaction/);
  console.log("PASS admin_read_only_no_mutations");

  assert.equal(
    walletLedgerLifecycleLabel({ type: "PURCHASE_DEBIT", status: "PENDING" }),
    "Reserved"
  );
  assert.equal(
    walletLedgerLifecycleLabel({
      type: "PURCHASE_DEBIT",
      status: "COMPLETED",
    }),
    "Captured"
  );
  assert.equal(
    walletLedgerLifecycleLabel({ type: "PURCHASE_DEBIT", status: "REVERSED" }),
    "Released"
  );
  assert.equal(
    walletLedgerLifecycleLabel({ type: "TOPUP_CREDIT", status: "COMPLETED" }),
    "Top-up"
  );
  assert.equal(
    walletLedgerLifecycleLabel({ type: "ADMIN_CREDIT", status: "COMPLETED" }),
    "Manual"
  );
  assert.equal(
    walletLedgerLifecycleLabel({
      type: "ADJUSTMENT_DEBIT",
      status: "COMPLETED",
    }),
    "Manual"
  );
  assert.equal(
    walletLedgerLifecycleLabel({ type: "REFUND_CREDIT", status: "COMPLETED" }),
    "Refund credit"
  );
  console.log("PASS lifecycle_labels");

  assert.match(service, /purchaseAsDebit/);
  assert.match(service, /purchaseAsRefund/);
  assert.match(service, /esimPurchasePaymentAttempt/);
  assert.match(service, /\/admin\/payments\//);
  assert.match(service, /wallet_purchase/);
  assert.match(page, /paymentAttemptHref|Payment/);
  assert.match(page, /purchaseHref|Purchase/);
  assert.match(customer, /View full wallet ledger/);
  assert.match(customer, /\/wallet`/);
  console.log("PASS joins_and_links");

  assert.match(reserve, /export async function reserveWalletPurchaseFundsInTx/);
  assert.match(reserve, /export async function refundReservedFundsInTx/);
  assert.match(apply, /export async function maybeReleasePendingGatewayReservation/);
  assert.doesNotMatch(service, /allowProduction:\s*true/);
  assert.doesNotMatch(shared, /from ["']@prisma\/client["']/);
  assert.equal(
    buildAdminWalletLedgerHref({ customerId: "cust_1", page: 2 }),
    "/admin/customers/cust_1/wallet?page=2"
  );
  assert.match(pkg, /"qa:admin-wallet-ledger"/);
  console.log("PASS reuse_lifecycle_primitives_untouched");

  console.log("ALL_ADMIN_WALLET_LEDGER_CHECKS_PASSED");
}

main();
