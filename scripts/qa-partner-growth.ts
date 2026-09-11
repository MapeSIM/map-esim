/**
 * Offline QA for Partner Growth MVP (Day 11).
 * Does not query Prisma, mutate money, or call providers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PARTNER_GROWTH_PERIOD_ORDER,
  PARTNER_SALES_CSV_HEADERS,
  buildPartnerSalesCsv,
  escapeCsvCell,
  isPartnerGrowthPeriodKey,
  parsePartnerGrowthPeriod,
  partnerGrowthPeriodBound,
} from "../app/lib/partner/partnerGrowthShared";
import { utcDayStart } from "../app/lib/admin/revenueOverviewShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.deepEqual(PARTNER_GROWTH_PERIOD_ORDER, [
    "today",
    "last7Days",
    "last30Days",
    "allTime",
  ]);
  assert.equal(isPartnerGrowthPeriodKey("yesterday"), false);
  assert.equal(parsePartnerGrowthPeriod("yesterday"), "last30Days");
  assert.equal(parsePartnerGrowthPeriod("today"), "today");
  assert.equal(parsePartnerGrowthPeriod(null), "last30Days");

  const now = new Date(Date.UTC(2026, 8, 12, 15, 30, 0));
  const today = partnerGrowthPeriodBound("today", now);
  assert.equal(today.gte?.getTime(), utcDayStart(now).getTime());
  assert.equal(today.lt, undefined);
  const all = partnerGrowthPeriodBound("allTime", now);
  assert.deepEqual(all, {});
  console.log("PASS period_helpers");

  assert.equal(escapeCsvCell('a,b'), '"a,b"');
  assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
  const csv = buildPartnerSalesCsv([
    [...PARTNER_SALES_CSV_HEADERS],
    ["2026-01-01", "Japan", "Plan", "1GB", "OFFER", "$10.00", "$8.00", "$2.00", "abcd…wxyz"],
  ]);
  assert.match(csv, /retailUsd,partnerSpendUsd,discountSavingsUsd/);
  assert.doesNotMatch(csv, /providerCost/i);
  console.log("PASS csv_helpers");

  const shared = read("app/lib/partner/partnerGrowthShared.ts");
  assert.doesNotMatch(shared, /from "@prisma\/client"|import "server-only"/);
  assert.doesNotMatch(shared, /commission/i);
  console.log("PASS shared_offline");

  const lib = read("app/lib/partner/partnerGrowth.ts");
  assert.match(lib, /import "server-only"/);
  assert.match(lib, /export async function getPartnerGrowthSummary/);
  assert.match(lib, /export async function buildPartnerSalesExportCsv/);
  assert.match(lib, /PartnerEsimPurchaseStatus\.COMPLETED/);
  assert.match(lib, /orderId:\s*\{\s*not:\s*null\s*\}/);
  assert.match(lib, /retailPriceCents/);
  assert.match(lib, /partnerChargeCents/);
  assert.match(lib, /discountSavingsCents/);
  assert.match(lib, /destinationCode/);
  assert.match(lib, /offerId/);
  assert.match(lib, /\$transaction\(/);
  assert.ok(
    !/\$transaction\(\s*async/.test(lib),
    "must not use interactive $transaction(async …)"
  );
  assert.ok(
    !/Promise\.all\(\[/.test(lib),
    "growth summary must not fan-out parallel Prisma queries"
  );
  assert.doesNotMatch(lib, /providerCostCents/);
  assert.doesNotMatch(lib, /commission/i);
  assert.doesNotMatch(lib, /_sum:\s*\{[^}]*providerCost/);
  console.log("PASS growth_lib_gates");

  const page = read("app/partner/(portal)/sales/page.tsx");
  assert.match(page, /getPartnerGrowthSummary/);
  assert.match(page, /Completed orders/);
  assert.match(page, /Retail value/);
  assert.match(page, /Partner spend/);
  assert.match(page, /Discount savings/);
  assert.match(page, /Top destinations/);
  assert.match(page, /Top packages/);
  assert.match(page, /Export CSV/);
  assert.match(page, /\/api\/partner\/sales\/export/);
  assert.doesNotMatch(page, /providerCostCents|commission/i);
  console.log("PASS sales_page_ui");

  const exportRoute = read("app/api/partner/sales/export/route.ts");
  assert.match(exportRoute, /buildPartnerSalesExportCsv/);
  assert.match(exportRoute, /text\/csv/);
  assert.match(exportRoute, /sessionRole !== "PARTNER"/);
  assert.doesNotMatch(exportRoute, /providerCostCents/);
  console.log("PASS export_route");

  const layout = read("app/partner/(portal)/layout.tsx");
  assert.match(layout, /href:\s*["']\/partner\/sales["']/);
  assert.match(layout, /label:\s*["']Sales["']/);
  console.log("PASS nav_link");

  const home = read("app/partner/(portal)/page.tsx");
  assert.match(home, /\/partner\/sales/);
  assert.match(home, /Sales report/);
  console.log("PASS dashboard_link");

  const purchaseWallet = read("app/lib/partner/partnerPurchaseWallet.ts");
  const purchaseBuy = read("app/lib/partner/partnerPurchaseBuy.ts");
  assert.doesNotMatch(purchaseWallet, /partnerGrowth|getPartnerGrowthSummary/);
  assert.doesNotMatch(purchaseBuy, /partnerGrowth|getPartnerGrowthSummary/);
  console.log("PASS purchase_logic_untouched");

  const pkg = read("package.json");
  assert.match(pkg, /qa:partner-growth/);
  console.log("PASS package_script");

  console.log("ALL_QA_PASSED=partner-growth");
}

main();
