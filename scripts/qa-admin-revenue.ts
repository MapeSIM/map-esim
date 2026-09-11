/**
 * Offline QA for Admin Revenue Dashboard v1.
 * Does not query Prisma, mutate money, or call providers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REVENUE_PERIOD_LABELS,
  buildRevenuePeriodBounds,
  utcDayStart,
} from "../app/lib/admin/revenueOverviewShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const now = new Date(Date.UTC(2026, 8, 11, 15, 30, 0)); // 11 Sep 2026
  const today = utcDayStart(now);
  assert.equal(today.toISOString(), "2026-09-11T00:00:00.000Z");

  const bounds = buildRevenuePeriodBounds(now);
  assert.equal(bounds.today.gte?.toISOString(), "2026-09-11T00:00:00.000Z");
  assert.equal(bounds.today.lt, undefined);
  assert.equal(bounds.yesterday.gte?.toISOString(), "2026-09-10T00:00:00.000Z");
  assert.equal(bounds.yesterday.lt?.toISOString(), "2026-09-11T00:00:00.000Z");
  assert.equal(bounds.last7Days.gte?.toISOString(), "2026-09-05T00:00:00.000Z");
  assert.equal(bounds.last30Days.gte?.toISOString(), "2026-08-13T00:00:00.000Z");
  assert.deepEqual(bounds.allTime, {});
  assert.equal(REVENUE_PERIOD_LABELS.today, "Today");
  assert.equal(REVENUE_PERIOD_LABELS.allTime, "All time");
  console.log("PASS period_windows_utc");

  const lib = read("app/lib/admin/revenueOverview.ts");
  assert.match(lib, /import "server-only"/);
  assert.match(lib, /export async function getAdminRevenueOverview/);
  assert.match(lib, /\$transaction\(/);
  assert.ok(
    !/\$transaction\(\s*async/.test(lib),
    "must not use interactive $transaction(async …)"
  );
  assert.ok(
    !/Promise\.all\(\[/.test(lib),
    "revenue overview must not fan-out parallel Prisma queries"
  );
  assert.match(lib, /from "@\/app\/lib\/admin\/revenueOverviewShared"/);
  assert.match(lib, /WalletEsimPurchaseStatus\.COMPLETED/);
  assert.match(lib, /PartnerEsimPurchaseStatus\.COMPLETED/);
  assert.match(lib, /priceCents/);
  assert.match(lib, /partnerChargeCents/);
  assert.match(lib, /COMPANY_FUNDED/);
  assert.doesNotMatch(lib, /_sum:\s*\{\s*providerAmount/);
  assert.doesNotMatch(lib, /_sum:\s*\{\s*providerCostCents/);
  assert.doesNotMatch(lib, /providerCostCents/);
  assert.match(lib, /OrderStatus\.PENDING/);
  assert.match(lib, /OrderStatus\.FAILED/);
  assert.match(lib, /OrderStatus\.COMPLETED/);
  console.log("PASS revenue_lib_gates");

  const shared = read("app/lib/admin/revenueOverviewShared.ts");
  assert.match(shared, /export function buildRevenuePeriodBounds/);
  assert.match(shared, /export function utcDayStart/);
  assert.doesNotMatch(shared, /from "@prisma\/client"|import "server-only"|process\.env/);
  console.log("PASS revenue_shared_offline");

  const page = read("app/admin/revenue/page.tsx");
  assert.match(page, /getAdminRevenueOverview/);
  assert.match(page, /Customer revenue/);
  assert.match(page, /Partner revenue/);
  assert.match(page, /Total orders/);
  assert.match(page, /Completed orders/);
  assert.match(page, /Pending orders/);
  assert.match(page, /Failed orders/);
  assert.match(page, /customerRevenueLabel/);
  assert.match(page, /partnerRevenueLabel/);
  assert.doesNotMatch(page, /providerAmount|provider cost as revenue/i);
  console.log("PASS revenue_page_ui");

  const nav = read("app/components/admin/AdminNav.tsx");
  assert.match(nav, /href: "\/admin\/revenue"/);
  assert.match(nav, /label: "Revenue"/);
  console.log("PASS revenue_nav");

  const pkg = read("package.json");
  assert.match(pkg, /qa:admin-revenue/);
  console.log("PASS package_script");

  console.log("ALL_QA_PASSED=admin-revenue");
}

main();
