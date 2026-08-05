/**
 * Offline QA for Phase 3C1 admin orders (no DB, no secrets, no VeSIM).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_ORDERS_PAGE_SIZE,
  ADMIN_ORDERS_PAGE_SIZE_MAX,
  ADMIN_SEARCH_MAX_LENGTH,
  maskIccidLast4,
  maskProviderOrderRef,
  normalizeAdminSearchQuery,
  parseAdminOrderAssociationFilter,
  parseAdminOrdersPage,
  parseAdminOrderStatusFilter,
  resolveAdminOrdersPageSize,
} from "../app/lib/admin/display";

const root = join(__dirname, "..");

function main() {
  assert.equal(ADMIN_ORDERS_PAGE_SIZE, 20);
  assert.equal(ADMIN_ORDERS_PAGE_SIZE_MAX, 100);
  assert.equal(resolveAdminOrdersPageSize(500), 100);
  assert.equal(resolveAdminOrdersPageSize(null), 20);
  console.log("PASS pagination_fixed_at_20");

  assert.equal(ADMIN_SEARCH_MAX_LENGTH, 100);
  assert.equal(normalizeAdminSearchQuery("  hello  "), "hello");
  assert.equal(normalizeAdminSearchQuery("a".repeat(150)).length, 100);
  assert.equal(normalizeAdminSearchQuery("   "), "");
  console.log("PASS search_length_limited");

  assert.equal(parseAdminOrdersPage("-3"), 1);
  assert.equal(parseAdminOrdersPage("abc"), 1);
  assert.equal(parseAdminOrdersPage("4"), 4);
  assert.equal(parseAdminOrderStatusFilter("completed"), "COMPLETED");
  assert.equal(parseAdminOrderStatusFilter("REFUNDED"), "ALL");
  assert.equal(parseAdminOrderAssociationFilter("guest"), "GUEST");
  console.log("PASS query_param_parsing");

  assert.match(maskProviderOrderRef("ABCDEFGHIJKLMNOP"), /^ABCD…MNOP$/);
  assert.equal(maskProviderOrderRef("short"), "••••");
  assert.equal(maskIccidLast4("8901234567890123456").endsWith("3456"), true);
  assert.ok(!maskIccidLast4("8901234567890123456").includes("890123456789"));
  assert.equal(maskIccidLast4(""), "Pending from provider");
  console.log("PASS masking_helpers");

  const ordersSrc = readFileSync(join(root, "app/lib/admin/orders.ts"), "utf8");
  assert.match(ordersSrc, /import "server-only"/);
  assert.ok(!/Promise\.all\(\[/.test(ordersSrc));
  assert.ok(!/\$transaction\(\s*async/.test(ordersSrc));
  assert.ok(!/checkout\/credit|vesim\/checkout/i.test(ordersSrc));
  assert.ok(!/orderAccess|createOrderAccessToken|broker\/orders/i.test(ordersSrc));
  assert.ok(!/qrValue|activationCode|smDpAddress|matchingId/i.test(ordersSrc));
  assert.match(ordersSrc, /customerEmail/);
  assert.match(ordersSrc, /Pending from provider/);
  assert.match(ordersSrc, /iccidLast4/);
  assert.ok(!/decryptIccid|iccidEncrypted/.test(ordersSrc));
  console.log("PASS orders_module_server_only_safe");

  const listSrc = readFileSync(join(root, "app/admin/orders/page.tsx"), "utf8");
  assert.ok(!/customerEmail/i.test(listSrc));
  assert.match(listSrc, /No local orders match the selected filters/);
  assert.match(listSrc, /Order data is temporarily unavailable/);
  assert.match(
    listSrc,
    /Provider fulfilment status is not\s+refreshed from this page/
  );
  assert.ok(!/qrValue|activationCode|iccidEncrypted|access_token/i.test(listSrc));
  assert.ok(!/"use server"/.test(listSrc));
  console.log("PASS list_page_no_email_safe_states");

  const detailSrc = readFileSync(
    join(root, "app/admin/orders/[id]/page.tsx"),
    "utf8"
  );
  assert.match(detailSrc, /Customer email/);
  assert.match(detailSrc, /notFound/);
  assert.ok(!/JSON\.stringify/.test(detailSrc));
  assert.ok(!/createOrderAccessToken|checkout\/credit/i.test(detailSrc));
  console.log("PASS detail_page_email_and_notfound");

  const authConfig = readFileSync(join(root, "auth.config.ts"), "utf8");
  assert.match(authConfig, /pathname === "\/admin"/);
  assert.match(authConfig, /role !== "ADMIN"/);
  const layoutSrc = readFileSync(join(root, "app/admin/layout.tsx"), "utf8");
  assert.match(layoutSrc, /requireRole\("ADMIN"\)/);
  console.log("PASS admin_access_gates");

  const dbSrc = readFileSync(join(root, "app/lib/db.ts"), "utf8");
  assert.equal((dbSrc.match(/new PrismaClient/g) || []).length, 1);
  console.log("PASS shared_prisma_singleton");

  console.log("ALL_QA_PASSED=10");
}

main();
