/**
 * Offline QA for Phase 3B admin overview helpers (no DB, no secrets).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_AUDIT_LOG_LIMIT,
  ADMIN_RECENT_ORDERS_LIMIT,
  formatSafeAuditDetails,
  maskProviderOrderRef,
  sanitizeAuditMetadata,
} from "../app/lib/admin/display";

const root = join(__dirname, "..");

function main() {
  assert.equal(ADMIN_RECENT_ORDERS_LIMIT, 10);
  assert.ok(ADMIN_RECENT_ORDERS_LIMIT <= 10);
  assert.equal(ADMIN_AUDIT_LOG_LIMIT, 50);
  console.log("PASS recent_orders_limit");

  assert.equal(maskProviderOrderRef(""), "Not available");
  assert.equal(maskProviderOrderRef("short"), "••••");
  const masked = maskProviderOrderRef("ABCDEFGHIJKLMNOP");
  assert.match(masked, /^ABCD…MNOP$/);
  assert.ok(!masked.includes("EFGHIJKL"));
  console.log("PASS provider_ref_masked");

  const safe = sanitizeAuditMetadata({
    method: "otp",
    channel: "otp",
    termsVersion: "3 August 2026",
    email: "should-not-appear@example.com",
    access_token: "secret",
    providerAccountId: "google-sub",
    passwordHash: "hash",
  });
  assert.equal(safe.method, "otp");
  assert.equal(safe.channel, "otp");
  assert.equal(safe.termsVersion, "3 August 2026");
  assert.equal(safe.email, undefined);
  assert.equal(safe.access_token, undefined);
  assert.equal(safe.providerAccountId, undefined);
  assert.equal(safe.passwordHash, undefined);
  console.log("PASS audit_metadata_allowlist");

  const details = formatSafeAuditDetails({
    method: "otp",
    email: "hidden@example.com",
  });
  assert.match(details, /method=otp/);
  assert.ok(!details.includes("@"));
  console.log("PASS audit_details_no_email");

  const overviewSrc = readFileSync(
    join(root, "app/lib/admin/overview.ts"),
    "utf8"
  );
  assert.match(overviewSrc, /import "server-only"/);
  assert.ok(
    !/\$transaction\(\s*async/.test(overviewSrc),
    "must not use interactive $transaction(async …)"
  );
  assert.ok(
    !/Promise\.all\(\[/.test(overviewSrc),
    "overview must not fan-out parallel Prisma queries"
  );
  assert.match(
    overviewSrc,
    /\$transaction\(\[/,
    "must use batch $transaction([...])"
  );
  assert.ok(!/checkout\/credit|vesim\/checkout/i.test(overviewSrc));
  assert.ok(!/\bRevenue\b/.test(overviewSrc));
  assert.match(overviewSrc, /stagingProviderTotalUsd/);
  console.log("PASS overview_batch_transaction_strategy");

  const dbSrc = readFileSync(join(root, "app/lib/db.ts"), "utf8");
  assert.match(dbSrc, /globalThis/);
  assert.match(dbSrc, /globalForPrisma\.prisma/);
  assert.equal((dbSrc.match(/new PrismaClient/g) || []).length, 1);
  console.log("PASS prisma_singleton_db_module");

  const pageSrc = readFileSync(join(root, "app/admin/page.tsx"), "utf8");
  assert.match(pageSrc, /VeSIM staging checkout total \(USD\)/);
  assert.match(
    pageSrc,
    /staging provider-wallet total, not live customer revenue/
  );
  assert.match(
    pageSrc,
    /Dashboard data is temporarily unavailable\. Please refresh shortly\./
  );
  assert.ok(!/\bRevenue\b/.test(pageSrc));
  assert.ok(!/qrValue|activationCode|iccid|LPA|access_token/i.test(pageSrc));
  console.log("PASS overview_page_safe_labels_and_fallback");

  const layoutSrc = readFileSync(join(root, "app/admin/layout.tsx"), "utf8");
  assert.match(layoutSrc, /requireRole\("ADMIN"\)/);
  assert.match(layoutSrc, /force-dynamic/);
  console.log("PASS admin_layout_require_role");

  const adminFiles = [
    "app/admin/page.tsx",
    "app/admin/layout.tsx",
    "app/admin/audit-logs/page.tsx",
    "app/lib/admin/overview.ts",
    "app/lib/admin/auditLogs.ts",
    "app/lib/admin/display.ts",
  ];
  for (const rel of adminFiles) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.ok(
      !/prisma\.\$executeRaw|checkout\/credit|sendOrderEmail|sendBillingEmail/i.test(
        src
      ),
      `unexpected mutation/write path in ${rel}`
    );
  }
  console.log("PASS no_admin_mutations_or_vesim_checkout");

  const authConfig = readFileSync(join(root, "auth.config.ts"), "utf8");
  assert.match(authConfig, /pathname === "\/admin"/);
  assert.match(authConfig, /role !== "ADMIN"/);
  console.log("PASS middleware_admin_gate_present");

  console.log("ALL_QA_PASSED=10");
}

main();
