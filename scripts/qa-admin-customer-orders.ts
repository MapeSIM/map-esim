/**
 * Offline QA: admin customer detail Recent eSIM Orders + wallet→order links.
 * Does not call VeSIM, debit wallets, send email, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const ordersLib = read("app/lib/admin/orders.ts");
  const walletLib = read("app/lib/admin/wallet.ts");
  const detailPage = read("app/admin/customers/[id]/page.tsx");
  const layout = read("app/admin/layout.tsx");
  const nextConfig = read("next.config.ts");
  const schema = read("prisma/schema.prisma");
  const pkg = read("package.json");

  assert.match(ordersLib, /import "server-only"/);
  assert.match(ordersLib, /getAdminCustomerRecentOrders/);
  assert.match(ordersLib, /userId:\s*customer\.id/);
  assert.match(ordersLib, /role:\s*Role\.CUSTOMER/);
  assert.match(ordersLib, /iccidMasked/);
  const recentFnStart = ordersLib.indexOf("getAdminCustomerRecentOrders");
  assert.ok(recentFnStart > 0);
  const recentFn = ordersLib.slice(recentFnStart);
  assert.match(recentFn, /iccidLast4:\s*true/);
  assert.doesNotMatch(recentFn, /iccidEncrypted/);
  assert.doesNotMatch(
    ordersLib,
    /decryptIccid|qrValue|activationCode|smDpAddress|matchingId/i
  );
  assert.doesNotMatch(ordersLib, /checkout\/credit|vesim\/checkout/i);
  console.log("PASS recent_orders_query_scoped_and_safe");

  assert.match(walletLib, /purchaseAsDebit/);
  assert.match(walletLib, /purchaseAsRefund/);
  assert.match(walletLib, /relatedOrderId/);
  assert.match(walletLib, /purchaseAsDebit\?\.orderId/);
  assert.match(walletLib, /purchaseAsRefund\?\.orderId/);
  assert.doesNotMatch(
    walletLib,
    /relatedOrderId:\s*.*referenceId|infer.*order/i
  );
  console.log("PASS wallet_tx_links_via_purchase_relation");

  assert.match(detailPage, /Recent eSIM Orders/);
  assert.match(detailPage, /getAdminCustomerRecentOrders/);
  assert.match(detailPage, /No eSIM orders found for this customer/);
  assert.match(detailPage, /View Order/);
  assert.match(detailPage, /\/admin\/orders\/\$\{encodeURIComponent\(order\.id\)\}/);
  assert.match(detailPage, /View related order/);
  assert.match(
    detailPage,
    /\/admin\/orders\/\$\{encodeURIComponent\(row\.relatedOrderId\)\}/
  );
  assert.match(detailPage, /iccidMasked/);
  assert.doesNotMatch(detailPage, /decryptIccid|Show full ICCID|iccidEncrypted/i);
  assert.doesNotMatch(
    detailPage,
    /qrValue|activationCode|smDpAddress|matchingId/i
  );
  assert.match(detailPage, /getAdminCustomerWalletSummary/);
  assert.match(detailPage, /Recent wallet transactions/);
  console.log("PASS customer_detail_ui");

  assert.match(layout, /requireRole\("ADMIN"\)/);
  assert.match(nextConfig, /source: "\/admin\/:path\*"/);
  assert.match(nextConfig, /private, no-store/);
  console.log("PASS admin_auth_and_no_store");

  assert.match(schema, /model WalletEsimPurchase/);
  assert.match(schema, /debitTransactionId/);
  assert.match(schema, /refundTransactionId/);
  assert.match(schema, /orderId\s+String\?\s+@unique/);
  assert.match(schema, /purchaseAsDebit/);
  assert.match(schema, /purchaseAsRefund/);
  console.log("PASS schema_order_wallet_relations");

  assert.match(pkg, /"qa:admin-customer-orders"/);
  console.log("PASS package_script");

  console.log("ALL_QA_PASSED=6");
}

main();
