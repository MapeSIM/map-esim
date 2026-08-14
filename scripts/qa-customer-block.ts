/**
 * Offline QA for Model 2 customer block / reactivate.
 * Uses smoke stubs for server-only modules. Does not mutate production DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  const {
    resolveCustomerAccountStatus,
    CUSTOMER_ACCOUNT_RESTRICTED_MESSAGE,
  } = await import("../app/lib/auth/customerAccountStatus");

  assert.equal(
    resolveCustomerAccountStatus({ deletedAt: new Date(), blockedAt: new Date() }),
    "DELETED"
  );
  assert.equal(
    resolveCustomerAccountStatus({ deletedAt: null, blockedAt: new Date() }),
    "BLOCKED"
  );
  assert.equal(
    resolveCustomerAccountStatus({ deletedAt: null, blockedAt: null }),
    "ACTIVE"
  );
  assert.match(
    CUSTOMER_ACCOUNT_RESTRICTED_MESSAGE,
    /restricted\. Please contact support@mapesim\.com/
  );
  console.log("PASS status_precedence_and_public_message");

  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260815120000_add_customer_block_fields/migration.sql"
  );
  assert.match(schema, /blockedAt\s+DateTime\?/);
  assert.match(schema, /blockedReason\s+String\?/);
  assert.match(schema, /blockedByAdminId\s+String\?/);
  assert.match(schema, /accountStatusVersion\s+Int\s+@default\(0\)/);
  assert.doesNotMatch(schema, /reactivatedAt/);
  assert.match(migration, /ADD COLUMN "blockedAt"/);
  assert.match(migration, /ADD COLUMN "accountStatusVersion"/);
  assert.match(migration, /User_blockedAt_idx/);
  assert.match(migration, /User_blockedByAdminId_fkey/);
  console.log("PASS schema_and_migration_additive");

  const blockLib = read("app/lib/admin/customerBlock.ts");
  assert.match(blockLib, /customer\.blocked/);
  assert.match(blockLib, /customer\.reactivated/);
  assert.match(blockLib, /accountStatusVersion: expectedVersion/);
  assert.match(blockLib, /REASON_MIN = 8/);
  assert.match(blockLib, /REASON_MAX = 500/);
  assert.match(blockLib, /already_blocked|already_active|stale_version|deleted/);
  assert.doesNotMatch(blockLib, /prisma\.session\.delete|signOut\(/);
  assert.doesNotMatch(blockLib, /executeCreditCheckout|\/api\/checkout/);
  console.log("PASS block_reactivate_cas_and_audit");

  const guard = read("app/lib/auth/customerAccountStatus.ts");
  assert.match(guard, /assertCustomerFinancialActivityAllowed/);
  assert.match(guard, /blockedAt/);
  assert.doesNotMatch(guard, /credentialsChangedAt/);
  console.log("PASS central_guard");

  const walletPurchase = read("app/lib/esim/walletPurchase.ts");
  assert.match(walletPurchase, /assertCustomerFinancialActivityAllowed/);
  assert.match(walletPurchase, /assertCustomerMayStartWalletPurchase/);
  const gateway = read("app/lib/esim/esimPurchaseGatewayCheckout.ts");
  assert.match(gateway, /assertCustomerFinancialActivityAllowed/);
  const topup = read("app/lib/wallet/topup.ts");
  assert.match(topup, /assertCustomerMayStartTopup/);
  const assign = read("app/lib/esim/adminPackageAssignment.ts");
  assert.match(assign, /assertCustomerMayReceiveAssignment/);
  console.log("PASS financial_enforcement_wired");

  const refund = read("app/lib/refunds/refundRequest.ts");
  assert.doesNotMatch(refund, /assertCustomerFinancialActivityAllowed/);
  const usage = read("app/lib/orders/customerEsimUsage.ts");
  assert.doesNotMatch(usage, /assertCustomerFinancialActivityAllowed/);
  const install = read("app/lib/orders/customerOrderInstall.ts");
  assert.doesNotMatch(install, /assertCustomerFinancialActivityAllowed/);
  console.log("PASS allowed_surfaces_not_blocked");

  const customers = read("app/lib/admin/customers.ts");
  assert.match(customers, /Blocked/);
  assert.match(customers, /blockedAt/);
  assert.match(customers, /accountStatusVersion/);
  const display = read("app/lib/admin/display.ts");
  assert.match(display, /"BLOCKED"/);
  const detail = read("app/admin/customers/[id]/page.tsx");
  assert.match(detail, /CustomerBlockPanel/);
  assert.match(detail, /Block reason \(admin only\)/);
  assert.match(detail, /mode="block"/);
  assert.match(detail, /mode="reactivate"/);
  const list = read("app/admin/customers/page.tsx");
  assert.match(list, /BLOCKED/);
  const panel = read("app/components/admin/CustomerBlockPanel.tsx");
  assert.match(panel, /minLength=\{8\}/);
  assert.match(panel, /maxLength=\{500\}/);
  assert.match(panel, /expectedVersion/);
  console.log("PASS admin_ui");

  assert.doesNotMatch(detail, /blockedReasonLabel.*customer/i);
  // Customer APIs must not serialize blockedReason
  const usageApi = read("app/api/account/orders/[orderId]/usage/route.ts");
  assert.doesNotMatch(usageApi, /blockedReason/);
  const installApi = read("app/api/account/orders/[orderId]/install/route.ts");
  assert.doesNotMatch(installApi, /blockedReason/);
  console.log("PASS no_blockedReason_in_customer_apis");

  const authTs = read("auth.ts");
  assert.doesNotMatch(
    authTs,
    /blockedAt[\s\S]{0,80}return null|if \(.*blockedAt/
  );
  const session = read("app/lib/auth/session.ts");
  assert.doesNotMatch(session, /blockedAt/);
  console.log("PASS model2_login_not_denied_for_block");

  const pkg = read("package.json");
  assert.match(pkg, /qa:customer-block/);
  console.log("PASS package_script");

  console.log("ALL PASS qa-customer-block");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
