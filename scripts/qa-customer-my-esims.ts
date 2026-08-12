/**
 * Offline QA for customer My eSIMs list/detail experience.
 * Does not call VeSIM, debit wallets, send email, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  customerStatusMatchesFilter,
  normalizeCustomerOrderSearch,
  parseCustomerEsimStatusFilter,
  parseCustomerOrderDateFilter,
  resolveCustomerEsimStatusBadge,
  shortCustomerOrderReference,
} from "../app/lib/orders/customerOrderDisplay";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(parseCustomerEsimStatusFilter("refunded"), "REFUNDED");
  assert.equal(parseCustomerEsimStatusFilter("nope"), "ALL");
  assert.equal(normalizeCustomerOrderSearch("  hi  "), "hi");
  assert.equal(normalizeCustomerOrderSearch("x".repeat(150)).length, 100);
  assert.equal(parseCustomerOrderDateFilter("2026-08-01"), "2026-08-01");
  assert.equal(parseCustomerOrderDateFilter("08/01/2026"), "");
  assert.equal(shortCustomerOrderReference("abcdefghijklmnop"), "abcd…mnop");
  assert.equal(
    resolveCustomerEsimStatusBadge({
      orderStatus: "COMPLETED",
      walletPurchaseStatus: "FAILED_REFUNDED",
    }),
    "Refunded"
  );
  assert.equal(
    resolveCustomerEsimStatusBadge({
      orderStatus: "COMPLETED",
      walletPurchaseStatus: "COMPLETED",
    }),
    "Completed"
  );
  assert.equal(
    resolveCustomerEsimStatusBadge({
      orderStatus: "PENDING",
    }),
    "Processing"
  );
  assert.equal(
    resolveCustomerEsimStatusBadge({
      orderStatus: "COMPLETED",
      assignmentStatus: "RECONCILIATION_REQUIRED",
    }),
    "Review needed"
  );
  assert.equal(
    customerStatusMatchesFilter("Refunded", "REFUNDED"),
    true
  );
  assert.equal(
    customerStatusMatchesFilter("Completed", "FAILED"),
    false
  );
  console.log("PASS display_helpers");

  const listPage = read("app/account/orders/page.tsx");
  const detailPage = read("app/account/orders/[orderId]/page.tsx");
  const ordersLib = read("app/lib/orders/customerOrders.ts");
  const installLib = read("app/lib/orders/customerOrderInstall.ts");
  const installApi = read("app/api/account/orders/[orderId]/install/route.ts");
  const installPanel = read(
    "app/components/orders/CustomerEsimInstallPanel.tsx"
  );
  const layout = read("app/account/layout.tsx");
  const revealPanel = read("app/components/orders/IccidRevealPanel.tsx");
  const adminCustomerPage = read("app/admin/customers/[id]/page.tsx");
  const adminOrdersLib = read("app/lib/admin/orders.ts");
  const adminWalletLib = read("app/lib/admin/wallet.ts");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const pkg = read("package.json");

  assert.match(layout, /My eSIMs/);
  assert.match(listPage, /My eSIMs/);
  assert.match(listPage, /You have not purchased an eSIM yet/);
  assert.match(listPage, /Browse destinations/);
  assert.match(listPage, /listCustomerOrders/);
  assert.match(listPage, /requireSession/);
  assert.match(listPage, /iccidMasked/);
  assert.match(listPage, /View details/);
  assert.match(listPage, /View QR Code & Details/);
  assert.match(listPage, /name="status"/);
  assert.match(listPage, /name="q"/);
  assert.doesNotMatch(listPage, /Show full ICCID|decryptIccid|IccidRevealPanel/);
  assert.doesNotMatch(
    listPage,
    /smdpAddress|activationCode|qrValue|fetchBrokerOrderPayload/
  );
  console.log("PASS list_page_my_esims");

  assert.match(ordersLib, /import "server-only"/);
  assert.match(ordersLib, /userId:\s*id/);
  assert.match(ordersLib, /userId:\s*owner\.id/);
  assert.match(ordersLib, /iccidLast4/);
  assert.match(ordersLib, /iccidMasked/);
  assert.doesNotMatch(ordersLib, /fetchBrokerOrderPayload/);
  assert.doesNotMatch(ordersLib, /decryptIccid/);
  assert.match(ordersLib, /Boolean\(.*iccidEncrypted/);
  assert.doesNotMatch(
    ordersLib,
    /qrValue|activationCode|smdpAddress|manualInstallText/
  );
  console.log("PASS orders_lib_local_db_only");

  assert.match(detailPage, /IccidRevealPanel/);
  assert.match(detailPage, /CustomerEsimInstallPanel/);
  assert.match(detailPage, /notFound/);
  assert.match(detailPage, /Order refunded/);
  assert.doesNotMatch(
    detailPage,
    /smdpAddress|activationCode|qrValue|manualInstallText|fetchBrokerOrderPayload/
  );
  assert.match(revealPanel, /Show full ICCID/);
  assert.match(revealPanel, /AUTO_HIDE_MS/);
  console.log("PASS detail_secure_reveal_and_install_panel");

  assert.match(installApi, /authorizeCustomerOwnedOrderInstall/);
  assert.match(installApi, /Cache-Control": "private, no-store"|private, no-store/);
  assert.match(installApi, /smdpAddress/);
  assert.match(installApi, /activationCode/);
  assert.doesNotMatch(installApi, /iccid:/);
  assert.doesNotMatch(
    installApi,
    /console\.(log|info|warn|error)\([^\n]*(smdp|activation|lpa|qrValue|iccid)/i
  );
  assert.match(installLib, /FAILED_REFUNDED/);
  assert.match(installLib, /RECONCILIATION_REQUIRED/);
  assert.match(installPanel, /View QR Code & Details/);
  assert.match(installPanel, /Install the eSIM only when you are ready to use it/);
  assert.match(installPanel, /Order refunded/);
  assert.match(installPanel, /EsimInstallExperience/);
  assert.doesNotMatch(installPanel, /Add data to this eSIM/i);
  console.log("PASS install_on_demand_and_refund_guards");

  const usageLib = read("app/lib/orders/customerEsimUsage.ts");
  const usageApi = read("app/api/account/orders/[orderId]/usage/route.ts");
  const usagePanel = read("app/components/orders/CustomerEsimUsagePanel.tsx");
  assert.match(listPage, /View usage/);
  assert.match(detailPage, /CustomerEsimUsagePanel/);
  assert.match(usageLib, /import "server-only"/);
  assert.match(usageLib, /authorizeCustomerOwnedOrderInstall/);
  assert.match(usageLib, /\/api\/esim\/usage\//);
  assert.match(usageLib, /usedDataGB = Math\.max\(initialDataGB - remainingDataGB, 0\)/);
  assert.doesNotMatch(usageApi, /iccid:\s/);
  assert.doesNotMatch(usageApi, /accessToken|bearer/i);
  assert.match(usagePanel, /View usage/);
  assert.match(usagePanel, /Refresh usage/);
  assert.match(usagePanel, /Usage data may be delayed by up to 1 hour/);
  assert.doesNotMatch(usagePanel, /setInterval|setTimeout\(\s*loadUsage/i);
  assert.doesNotMatch(usagePanel, /\bimei\b|\beid\b|\btac\b|deviceModel/i);
  console.log("PASS customer_usage_on_demand");

  assert.match(adminCustomerPage, /Recent eSIM Orders/);
  assert.match(adminCustomerPage, /getAdminCustomerRecentOrders/);
  assert.match(adminCustomerPage, /View related order/);
  assert.match(adminOrdersLib, /getAdminCustomerRecentOrders/);
  assert.match(adminWalletLib, /purchaseAsDebit/);
  assert.match(adminWalletLib, /relatedOrderId/);
  console.log("PASS admin_customer_orders_preserved");

  assert.match(guestGate, /ENABLE_GUEST_VESIM_CHECKOUT/);
  assert.match(pkg, /qa:customer-my-esims/);
  console.log("PASS package_and_guest_gate_present");

  console.log("ALL_QA_PASSED=customer-my-esims");
}

main();
