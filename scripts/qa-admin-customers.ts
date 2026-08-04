/**
 * Offline QA for Phase 3C2 admin customers (no DB, no secrets, no VeSIM).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_CUSTOMERS_PAGE_SIZE,
  ADMIN_CUSTOMERS_PAGE_SIZE_MAX,
  ADMIN_SEARCH_MAX_LENGTH,
  maskAdminEmail,
  normalizeAdminSearchQuery,
  normalizeAdminUserIdFilter,
  parseAdminCustomerAccountFilter,
  parseAdminCustomerAuthFilter,
  parseAdminCustomersPage,
  parseAdminCustomerVerificationFilter,
  resolveAdminCustomersPageSize,
} from "../app/lib/admin/display";

const root = join(__dirname, "..");

function main() {
  assert.equal(ADMIN_CUSTOMERS_PAGE_SIZE, 20);
  assert.equal(ADMIN_CUSTOMERS_PAGE_SIZE_MAX, 100);
  assert.equal(resolveAdminCustomersPageSize(500), 100);
  assert.equal(resolveAdminCustomersPageSize(null), 20);
  assert.equal(parseAdminCustomersPage("-2"), 1);
  assert.equal(parseAdminCustomersPage("abc"), 1);
  assert.equal(parseAdminCustomersPage("3"), 3);
  console.log("PASS pagination_parsing_and_clamping");

  assert.equal(ADMIN_SEARCH_MAX_LENGTH, 100);
  assert.equal(normalizeAdminSearchQuery("  hi  "), "hi");
  assert.equal(normalizeAdminSearchQuery("x".repeat(150)).length, 100);
  console.log("PASS search_length_limited");

  assert.equal(parseAdminCustomerVerificationFilter("verified"), "VERIFIED");
  assert.equal(parseAdminCustomerVerificationFilter("NOPE"), "ALL");
  assert.equal(parseAdminCustomerAuthFilter("google"), "GOOGLE");
  assert.equal(parseAdminCustomerAuthFilter("credentials"), "CREDENTIALS");
  assert.equal(parseAdminCustomerAuthFilter("oauth"), "ALL");
  assert.equal(parseAdminCustomerAccountFilter("deleted"), "DELETED");
  assert.equal(parseAdminCustomerAccountFilter("suspended"), "ALL");
  assert.equal(normalizeAdminUserIdFilter("abc_123"), "abc_123");
  assert.equal(normalizeAdminUserIdFilter("bad id!"), "");
  assert.equal(normalizeAdminUserIdFilter("a".repeat(65)), "");
  console.log("PASS invalid_filters_default_safely");

  assert.equal(maskAdminEmail("rana@example.com"), "r***@example.com");
  assert.equal(maskAdminEmail("ab@x.co"), "a***@x.co");
  assert.equal(maskAdminEmail(""), "Not available");
  assert.ok(!maskAdminEmail("secret@example.com").includes("secret@"));
  console.log("PASS email_masking_helper");

  const customersSrc = readFileSync(
    join(root, "app/lib/admin/customers.ts"),
    "utf8"
  );
  assert.match(customersSrc, /import "server-only"/);
  assert.match(customersSrc, /role:\s*Role\.CUSTOMER/);
  assert.ok(!/Promise\.all\(\[/.test(customersSrc));
  assert.ok(!/\$transaction\(\s*async/.test(customersSrc));
  assert.ok(!/passwordHash:\s*true/.test(customersSrc));
  assert.ok(!/access_token|refresh_token|id_token|providerAccountId/.test(customersSrc));
  assert.ok(!/vesim\/checkout|checkout\/credit/i.test(customersSrc));
  assert.ok(!/\.create\(|\.update\(|\.delete\(/.test(customersSrc));
  assert.match(customersSrc, /deletedAt/);
  console.log("PASS customers_module_server_only_safe");

  const listSrc = readFileSync(
    join(root, "app/admin/customers/page.tsx"),
    "utf8"
  );
  assert.match(listSrc, /emailMasked/);
  assert.match(listSrc, /No customers match the selected filters/);
  assert.match(listSrc, /Customer data is temporarily unavailable/);
  assert.ok(!/passwordHash|access_token|refresh_token|providerAccountId/i.test(listSrc));
  assert.ok(!/"use server"/.test(listSrc));
  assert.ok(!/\b(Edit customer|Suspend|Reset password|Delete customer)\b/i.test(listSrc));
  console.log("PASS list_page_masked_and_readonly");

  const detailSrc = readFileSync(
    join(root, "app/admin/customers/[id]/page.tsx"),
    "utf8"
  );
  assert.match(detailSrc, /notFound/);
  assert.match(detailSrc, /Customer email|label="Email"/);
  assert.match(detailSrc, /userId=/);
  assert.ok(!/passwordHash|access_token|refresh_token|providerAccountId|session_state/i.test(detailSrc));
  assert.ok(!/JSON\.stringify/.test(detailSrc));
  assert.ok(!/vesim\/checkout|sendOtp|resetPassword/i.test(detailSrc));
  console.log("PASS detail_page_safe_notfound");

  const layoutSrc = readFileSync(join(root, "app/admin/layout.tsx"), "utf8");
  assert.match(layoutSrc, /requireRole\("ADMIN"\)/);
  const authConfig = readFileSync(join(root, "auth.config.ts"), "utf8");
  assert.match(authConfig, /\/admin/);
  console.log("PASS admin_protection_exists");

  const dbSrc = readFileSync(join(root, "app/lib/db.ts"), "utf8");
  assert.match(dbSrc, /globalForPrisma/);
  console.log("PASS shared_prisma_singleton");

  // Soft-deleted representation: list maps deletedAt → Deleted label
  assert.match(customersSrc, /accountStatusLabel: row\.deletedAt \? "Deleted" : "Active"/);
  console.log("PASS soft_deleted_status_represented");

  console.log("ALL_QA_PASSED=10");
}

main();
