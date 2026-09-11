/**
 * Offline QA for Admin Business Insights (Day 10 MVP).
 * Does not query Prisma, mutate money, or call providers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const lib = read("app/lib/admin/businessInsights.ts");
  assert.match(lib, /import "server-only"/);
  assert.match(lib, /export async function getAdminBusinessInsights/);
  assert.match(lib, /BUSINESS_INSIGHTS_TOP_N\s*=\s*5/);
  assert.match(lib, /\$transaction\(/);
  assert.ok(
    !/\$transaction\(\s*async/.test(lib),
    "must not use interactive $transaction(async …)"
  );
  assert.ok(
    !/Promise\.all\(\[/.test(lib),
    "insights must not fan-out parallel Prisma queries"
  );
  assert.match(lib, /from "@\/app\/lib\/admin\/revenueOverviewShared"/);
  assert.match(lib, /WalletEsimPurchaseStatus\.COMPLETED/);
  assert.match(lib, /PartnerEsimPurchaseStatus\.COMPLETED/);
  assert.match(lib, /COMPANY_FUNDED/);
  assert.match(lib, /destinationCode/);
  assert.match(lib, /offerId/);
  assert.match(lib, /_count:\s*\{\s*gte:\s*2\s*\}/);
  assert.match(lib, /ADD_DATA_IDEMPOTENCY_PREFIX/);
  assert.match(lib, /startsWith/);
  assert.match(lib, /Role\.CUSTOMER/);
  assert.match(lib, /priceCents/);
  assert.match(lib, /partnerChargeCents/);
  assert.doesNotMatch(lib, /providerCostCents/);
  assert.doesNotMatch(lib, /_sum:\s*\{\s*providerAmount/);
  assert.doesNotMatch(lib, /prisma\.(walletTopup|partnerWalletTopup)/i);
  console.log("PASS insights_lib_gates");

  const page = read("app/admin/revenue/page.tsx");
  assert.match(page, /getAdminBusinessInsights/);
  assert.match(page, /Business insights/);
  assert.match(page, /Top countries/);
  assert.match(page, /Top packages/);
  assert.match(page, /Customer growth/);
  assert.match(page, /Repeat customers/);
  assert.match(page, /Add More Data/);
  assert.match(page, /customerAddMoreDataRevenueLabel/);
  assert.match(page, /partnerAddMoreDataRevenueLabel/);
  assert.match(page, /getAdminRevenueOverview/);
  assert.doesNotMatch(page, /providerAmount/);
  console.log("PASS insights_page_ui");

  const addData = read("app/lib/esim/addDataCheckout.ts");
  assert.match(addData, /ADD_DATA_IDEMPOTENCY_PREFIX\s*=\s*"adddata_"/);
  console.log("PASS add_more_data_prefix");

  const shared = read("app/lib/admin/revenueOverviewShared.ts");
  assert.match(shared, /buildRevenuePeriodBounds/);
  assert.doesNotMatch(shared, /from "@prisma\/client"|import "server-only"/);
  console.log("PASS reuses_revenue_period_helpers");

  const pkg = read("package.json");
  assert.match(pkg, /qa:admin-business-insights/);
  console.log("PASS package_script");

  console.log("ALL_QA_PASSED=admin-business-insights");
}

main();
