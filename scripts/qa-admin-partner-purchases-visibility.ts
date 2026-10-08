/**
 * Offline QA: Admin partner detail shows all PartnerEsimPurchase rows.
 * Does not mutate DB, call providers, or move funds.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  const libPath = "app/lib/partner/partners.ts";
  const pagePath = "app/admin/partners/[id]/page.tsx";
  const walletPath = "app/lib/partner/partnerWallet.ts";
  const schemaPath = "prisma/schema.prisma";
  assert.ok(existsSync(join(root, libPath)));
  assert.ok(existsSync(join(root, pagePath)));

  const lib = read(libPath);
  const page = read(pagePath);
  const schema = read(schemaPath);
  const pkg = read("package.json");

  console.log("1) Exact PartnerEsimPurchaseStatus allowlist");
  for (const status of [
    "DRAFT",
    "READY",
    "AWAITING_GATEWAY_PAYMENT",
    "FUNDS_RESERVED",
    "FUNDED",
    "PROVIDER_PENDING",
    "COMPLETED",
    "FAILED_REFUNDED",
    "RECONCILIATION_REQUIRED",
  ]) {
    assert.match(schema, new RegExp(`\\b${status}\\b`));
    assert.match(lib, new RegExp(`PartnerEsimPurchaseStatus\\.${status}`));
  }
  assert.doesNotMatch(lib, /CANCELLED|EXPIRED(?!_)/);
  console.log("   ok");

  console.log("2) Purchases query is no longer COMPLETED-only");
  assert.match(lib, /partnerDetailPurchasesWhere|purchasesWhere/);
  assert.match(lib, /purchaseStatus/);
  // List path uses partnerId (+ optional status), not COMPLETED-only.
  assert.match(
    lib,
    /prisma\.partnerEsimPurchase\.findMany\(\{[\s\S]*where:\s*purchasesWhere/
  );
  assert.match(
    lib,
    /prisma\.partnerEsimPurchase\.count\(\{\s*where:\s*purchasesWhere/
  );
  // KPI aggregates remain COMPLETED-only.
  assert.match(
    lib,
    /completedWhere[\s\S]*status:\s*PartnerEsimPurchaseStatus\.COMPLETED/
  );
  console.log("   ok");

  console.log("3) COMPLETED still supported + non-completed statuses filterable");
  assert.match(lib, /PARTNER_DETAIL_PURCHASE_STATUSES/);
  assert.match(page, /PARTNER_DETAIL_PURCHASE_STATUSES/);
  assert.match(page, /purchaseStatus/);
  assert.match(page, /All statuses/);
  assert.match(page, /All partner eSIM purchases/);
  assert.match(page, /AdminVoidPendingPartnerPurchaseForm|canVoidPending/);
  console.log("   ok");

  console.log("4) Partner boundary + payment attempt scoping");
  assert.match(lib, /partnerId/);
  assert.match(
    lib,
    /paymentAttempts:\s*\{[\s\S]*orderBy:[\s\S]*take:\s*1/
  );
  assert.match(lib, /\?kind=partner/);
  assert.match(
    lib,
    /\/admin\/payments\/\$\{encodeURIComponent\(latestAttempt\.id\)\}\?kind=partner/
  );
  assert.match(page, /Open payment|paymentHref/);
  assert.doesNotMatch(page, /Investigate|Mark Paid|Release Reservation|Verify/);
  assert.match(page, /Open reconciliation/);
  console.log("   ok");

  console.log("5) Server-side pagination + filter preserved");
  assert.match(lib, /PARTNER_DETAIL_ORDERS_PAGE_SIZE/);
  assert.match(lib, /skip:\s*\(safeOrdersPage - 1\) \* PARTNER_DETAIL_ORDERS_PAGE_SIZE/);
  assert.match(lib, /take:\s*PARTNER_DETAIL_ORDERS_PAGE_SIZE/);
  assert.match(page, /purchaseStatus:\s*purchaseStatusFilter/);
  assert.match(page, /ordersPage/);
  console.log("   ok");

  console.log("6) No financial/provider/schema mutations in this change");
  assert.equal(gitDiff(walletPath).trim(), "", "partnerWallet.ts must be untouched");
  assert.equal(gitDiff(schemaPath).trim(), "", "prisma schema must be untouched");
  assert.doesNotMatch(lib, /fetch\(|axios|simpaisa|inquireTransaction/i);
  assert.doesNotMatch(page, /creditPartnerWalletByAdmin|debitPartnerWalletByAdmin/);
  assert.match(pkg, /qa:admin-partner-purchases-visibility/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=admin-partner-purchases-visibility");
}

main();
