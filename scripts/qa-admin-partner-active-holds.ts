/**
 * Offline QA: Admin Partner Detail active wallet holds (read-only).
 * Does not mutate DB, call providers, or move funds.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPartnerActiveWalletHold,
  PARTNER_DETAIL_ACTIVE_HOLD_STATUS_STRINGS,
  PARTNER_DETAIL_ACTIVE_HOLDS_TAKE,
} from "../app/lib/partner/partnerDetailActiveHoldsShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function gitDiff(rel: string): string {
  try {
    return execFileSync("git", ["diff", "--", rel], {
      cwd: root,
      encoding: "utf8",
    });
  } catch {
    return "GIT_DIFF_UNAVAILABLE";
  }
}

function main() {
  const sharedPath = "app/lib/partner/partnerDetailActiveHoldsShared.ts";
  const libPath = "app/lib/partner/partners.ts";
  const pagePath = "app/admin/partners/[id]/page.tsx";
  const walletPath = "app/lib/partner/partnerWallet.ts";
  const purchaseWalletPath = "app/lib/partner/partnerPurchaseWallet.ts";
  const schemaPath = "prisma/schema.prisma";

  assert.ok(existsSync(join(root, sharedPath)));
  assert.ok(existsSync(join(root, libPath)));
  assert.ok(existsSync(join(root, pagePath)));

  const shared = read(sharedPath);
  const lib = read(libPath);
  const page = read(pagePath);
  const pkg = read("package.json");

  console.log("1) Genuine active hold appears; released/consumed/terminal excluded");
  assert.equal(
    isPartnerActiveWalletHold({
      status: "AWAITING_GATEWAY_PAYMENT",
      walletAppliedCents: 500,
      refundTransactionId: null,
    }),
    true
  );
  assert.equal(
    isPartnerActiveWalletHold({
      status: "FUNDS_RESERVED",
      walletAppliedCents: 100,
      refundTransactionId: null,
    }),
    true
  );
  assert.equal(
    isPartnerActiveWalletHold({
      status: "RECONCILIATION_REQUIRED",
      walletAppliedCents: 250,
      refundTransactionId: null,
    }),
    true
  );
  // Released / restored READY
  assert.equal(
    isPartnerActiveWalletHold({
      status: "READY",
      walletAppliedCents: 500,
      refundTransactionId: null,
    }),
    false
  );
  // Consumed into provider / funded / completed
  for (const status of [
    "PROVIDER_PENDING",
    "FUNDED",
    "COMPLETED",
    "FAILED_REFUNDED",
  ]) {
    assert.equal(
      isPartnerActiveWalletHold({
        status,
        walletAppliedCents: 500,
        refundTransactionId: null,
      }),
      false,
      status
    );
  }
  // Refunded hold excluded
  assert.equal(
    isPartnerActiveWalletHold({
      status: "AWAITING_GATEWAY_PAYMENT",
      walletAppliedCents: 500,
      refundTransactionId: "refund_tx_1",
    }),
    false
  );
  // Gateway-only (no wallet reserved)
  assert.equal(
    isPartnerActiveWalletHold({
      status: "AWAITING_GATEWAY_PAYMENT",
      walletAppliedCents: 0,
      refundTransactionId: null,
    }),
    false
  );
  assert.deepEqual(
    [...PARTNER_DETAIL_ACTIVE_HOLD_STATUS_STRINGS],
    ["FUNDS_RESERVED", "AWAITING_GATEWAY_PAYMENT", "RECONCILIATION_REQUIRED"]
  );
  console.log("   ok");

  console.log("2) Partner scoping + authoritative reserved amount + payment link");
  assert.match(lib, /partnerId:\s*row\.id/);
  assert.match(lib, /walletAppliedCents:\s*\{\s*gt:\s*0\s*\}/);
  assert.match(lib, /refundTransactionId:\s*null/);
  assert.match(lib, /PARTNER_DETAIL_ACTIVE_HOLD_STATUS_STRINGS/);
  assert.match(lib, /formatUsdCents\(hold\.walletAppliedCents\)/);
  assert.match(
    lib,
    /\/admin\/payments\/\$\{encodeURIComponent\(latestAttempt\.id\)\}\?kind=partner/
  );
  assert.match(page, /Active Wallet Holds/);
  assert.match(page, /Open payment|paymentHref/);
  assert.doesNotMatch(
    page,
    /Release Reservation|Mark Paid|Investigate|Recover|Refund Wallet/
  );
  console.log("   ok");

  console.log("3) Bounded query, no N+1, no mutations/provider calls");
  assert.equal(PARTNER_DETAIL_ACTIVE_HOLDS_TAKE, 20);
  assert.match(lib, /PARTNER_DETAIL_ACTIVE_HOLDS_TAKE/);
  assert.match(
    lib,
    /paymentAttempts:\s*\{[\s\S]*orderBy:[\s\S]*take:\s*1/
  );
  assert.equal(gitDiff(walletPath).trim(), "", "partnerWallet.ts untouched");
  assert.equal(
    gitDiff(purchaseWalletPath).trim(),
    "",
    "partnerPurchaseWallet.ts untouched"
  );
  assert.equal(gitDiff(schemaPath).trim(), "", "prisma schema untouched");
  assert.doesNotMatch(lib, /fetch\(|axios|simpaisa|inquireTransaction/i);
  assert.doesNotMatch(shared, /from ["']@prisma\/client["']|PrismaClient/);
  assert.match(pkg, /qa:admin-partner-active-holds/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=admin-partner-active-holds");
}

main();
