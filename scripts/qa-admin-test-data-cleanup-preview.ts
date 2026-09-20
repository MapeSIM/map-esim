/**
 * Offline QA: Admin Test Data Cleanup Preview (Phase 1).
 * Read-only — asserts no delete/update mutations and protected assets.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canAccessAdminPath } from "../app/lib/admin/adminPageAccess";
import {
  ADMIN_TEST_DATA_CLEANUP_HREF,
  TEST_DATA_CLEANUP_PREVIEW_WARNING,
  isNonCreditedTopupCandidate,
} from "../app/lib/admin/testDataCleanupPreviewShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(
    existsSync(join(root, "app/admin/test-data-cleanup/page.tsx")),
    "route page exists"
  );
  assert.ok(
    existsSync(join(root, "app/lib/admin/testDataCleanupPreview.ts")),
    "loader exists"
  );
  assert.ok(
    existsSync(join(root, "app/lib/admin/testDataCleanupPreviewShared.ts")),
    "shared helpers exist"
  );
  assert.equal(ADMIN_TEST_DATA_CLEANUP_HREF, "/admin/test-data-cleanup");

  const page = read("app/admin/test-data-cleanup/page.tsx");
  const loader = read("app/lib/admin/testDataCleanupPreview.ts");
  const shared = read("app/lib/admin/testDataCleanupPreviewShared.ts");
  const access = read("app/lib/admin/adminPageAccess.ts");
  const nav = read("app/components/admin/AdminNav.tsx");
  const pkg = read("package.json");

  assert.match(page, /Test Data Cleanup Preview/);
  assert.match(page, /getTestDataCleanupPreviewCounts/);
  assert.match(page, /requireActiveAdminForTestDataCleanupPreview/);
  assert.ok(page.includes("TEST_DATA_CLEANUP_PREVIEW_WARNING"));
  assert.ok(
    shared.includes(TEST_DATA_CLEANUP_PREVIEW_WARNING) ||
      TEST_DATA_CLEANUP_PREVIEW_WARNING.includes("No records are deleted")
  );
  assert.match(shared, /No records are deleted/);
  assert.match(page, /data-test-data-cleanup-preview-warning/);
  assert.match(page, /Payment Data/);
  assert.match(page, /Notifications/);
  assert.match(page, /Refunds/);
  assert.match(page, /Wallet/);
  assert.match(page, /Protected/);
  assert.match(page, /Customers \(will remain\)/);
  assert.match(page, /Partners \(will remain\)/);
  assert.match(page, /Orders \(will remain\)/);
  assert.match(page, /Eligible customer topups/);
  assert.match(page, /Protected credited customer topups/);
  assert.match(page, /Webhook receipts/);
  assert.match(page, /Payment attempts \(total\)/);
  assert.match(page, /data-test-data-cleanup-preview-warning/);
  assert.match(page, /data-test-data-cleanup-protected/);
  assert.doesNotMatch(page, /\b(Purge|Wipe|Confirm cleanup)\b/i);
  assert.doesNotMatch(page, /type=["']submit["'][^>]*>[\s\S]*Delete/i);
  assert.doesNotMatch(page, /deleteMany|\.delete\(|\.update\(/);
  assert.doesNotMatch(page, /href=["'][^"']*delete/i);
  console.log("PASS page_preview_only_ui");

  assert.match(loader, /server-only/);
  assert.match(loader, /getTestDataCleanupPreviewCounts/);
  assert.match(loader, /requireActiveAdminForTestDataCleanupPreview/);
  assert.match(loader, /MANAGE_ADMINS/);
  assert.match(loader, /paymentWebhookReceipt\.count/);
  assert.match(loader, /alertNotificationState\.count/);
  assert.match(loader, /alertNotificationDelivery\.count/);
  assert.match(loader, /esimPurchasePaymentAttempt\.count/);
  assert.match(loader, /refundRequest\.count/);
  assert.match(loader, /partnerRefundRequest\.count/);
  assert.match(loader, /walletTopup\.count/);
  assert.match(loader, /partnerWalletTopup\.count/);
  assert.match(loader, /role:\s*Role\.CUSTOMER/);
  assert.match(loader, /partnerProfile\.count/);
  assert.match(loader, /order\.count/);
  assert.doesNotMatch(loader, /deleteMany|\.delete\(|\.update\(|\.create\(/);
  assert.doesNotMatch(loader, /\$executeRaw|\$queryRawUnsafe/);
  assert.doesNotMatch(
    loader,
    /refundReserved|maybeRelease|markPaid|confirmWallet/i
  );
  console.log("PASS loader_read_only_counts");

  assert.equal(
    isNonCreditedTopupCandidate({ status: "FAILED", walletTransactionId: null }),
    true
  );
  assert.equal(
    isNonCreditedTopupCandidate({
      status: "CREDITED",
      walletTransactionId: null,
    }),
    false
  );
  assert.equal(
    isNonCreditedTopupCandidate({
      status: "FAILED",
      walletTransactionId: "tx_1",
    }),
    false
  );
  console.log("PASS topup_candidate_classification");

  assert.match(access, /\/admin\/test-data-cleanup/);
  assert.match(access, /MANAGE_ADMINS/);
  assert.equal(
    canAccessAdminPath(["MANAGE_ADMINS"], "/admin/test-data-cleanup"),
    true
  );
  assert.equal(
    canAccessAdminPath(["OPERATIONS_CONTROLS"], "/admin/test-data-cleanup"),
    false
  );
  assert.equal(
    canAccessAdminPath(["CUSTOMERS_VIEW"], "/admin/test-data-cleanup"),
    false
  );
  assert.match(nav, /\/admin\/test-data-cleanup/);
  assert.match(nav, /Test Data Cleanup/);
  assert.match(pkg, /qa:admin-test-data-cleanup-preview/);
  console.log("PASS admin_only_access_and_nav");

  // Protected assets called out in shared/page copy
  assert.match(shared, /Customers|customers/i);
  assert.match(page, /never deletes customers, partners,\s*or orders/i);
  console.log("PASS customers_partners_orders_protected");

  console.log("ALL_ADMIN_TEST_DATA_CLEANUP_PREVIEW_CHECKS_PASSED");
}

main();
