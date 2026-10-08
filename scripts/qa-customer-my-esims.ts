/**
 * Offline QA for customer My eSIMs list/detail experience.
 * Does not call VeSIM, debit wallets, send email, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  customerStatusMatchesFilter,
  customerEsimStatusHelp,
  customerEsimStatusLabel,
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
      hasCompletedRefund: false,
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
      orderStatus: "COMPLETED",
      walletPurchaseStatus: "COMPLETED",
      hasCompletedRefund: true,
    }),
    "Refunded"
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
    resolveCustomerEsimStatusBadge({
      orderStatus: "PENDING",
      walletPurchaseStatus: "FUNDED",
    }),
    "Processing"
  );
  assert.equal(
    resolveCustomerEsimStatusBadge({
      orderStatus: "PENDING",
      walletPurchaseStatus: "PROVIDER_PENDING",
    }),
    "Processing"
  );
  assert.equal(
    resolveCustomerEsimStatusBadge({
      orderStatus: "PENDING",
      walletPurchaseStatus: "RECONCILIATION_REQUIRED",
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
  assert.equal(customerEsimStatusLabel("Completed"), "Ready to install");
  assert.equal(customerEsimStatusLabel("Processing"), "Setting up");
  assert.match(
    customerEsimStatusHelp("Completed"),
    /Install it when you want to go online/
  );
  assert.equal(
    resolveCustomerEsimStatusBadge({
      orderStatus: "COMPLETED",
      walletPurchaseStatus: "COMPLETED",
      providerLifecycleStatus: "NOT_ACTIVE",
    }),
    "Completed"
  );
  assert.equal(
    resolveCustomerEsimStatusBadge({
      orderStatus: "COMPLETED",
      walletPurchaseStatus: "COMPLETED",
      providerLifecycleStatus: "ACTIVE",
    }),
    "Active"
  );
  assert.equal(customerEsimStatusLabel("Active"), "Active");
  assert.match(
    customerEsimStatusHelp("Active"),
    /active and connected to the network/
  );
  assert.equal(
    resolveCustomerEsimStatusBadge({
      orderStatus: "COMPLETED",
      walletPurchaseStatus: "COMPLETED",
      providerLifecycleStatus: "DEPLETED",
    }),
    "Data Depleted"
  );
  assert.equal(customerEsimStatusLabel("Data Depleted"), "Data Depleted");
  assert.equal(
    resolveCustomerEsimStatusBadge({
      orderStatus: "COMPLETED",
      walletPurchaseStatus: "COMPLETED",
      providerLifecycleStatus: "EXPIRED",
    }),
    "eSIM Expired"
  );
  assert.equal(customerEsimStatusLabel("eSIM Expired"), "eSIM Expired");
  assert.match(
    customerEsimStatusHelp("eSIM Expired"),
    /package has expired/
  );
  assert.equal(customerStatusMatchesFilter("eSIM Expired", "COMPLETED"), true);
  assert.equal(customerStatusMatchesFilter("Active", "COMPLETED"), true);
  assert.equal(customerStatusMatchesFilter("Data Depleted", "COMPLETED"), true);
  console.log("PASS display_helpers");

  const listPage = read("app/account/orders/page.tsx");
  const orderCard = read("app/components/orders/CustomerEsimOrderCard.tsx");
  const helpLinks = read(
    "app/components/orders/CustomerEsimInstallHelpLinks.tsx"
  );
  const detailPage = read("app/account/orders/[orderId]/page.tsx");
  const detailView = read("app/components/orders/CustomerOrderDetailView.tsx");
  const detailCard = read("app/components/orders/EsimOrderDetailCard.tsx");
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
  assert.doesNotMatch(listPage, /listCustomerPendingWalletPurchases/);
  assert.doesNotMatch(listPage, /CustomerPendingPurchases/);
  assert.doesNotMatch(listPage, /Unfinished purchases|pendingPurchases/);
  assert.match(listPage, /requireSession/);
  assert.match(listPage, /CustomerEsimOrderCard/);
  assert.match(orderCard, /iccidMasked/);
  assert.match(orderCard, /View details/);
  assert.match(
    orderCard,
    /\/account\/orders\/\$\{encodeURIComponent\(order\.id\)\}/
  );
  assert.doesNotMatch(
    orderCard,
    /#install\?|carddata=|activationCode=|lpa=|qrValue=/i
  );
  assert.match(listPage, /name="status"/);
  assert.match(listPage, /name="q"/);
  assert.match(helpLinks, /href="\/install\/iphone"/);
  assert.match(helpLinks, /href="\/install\/android"/);
  assert.match(orderCard, /customerEsimStatusLabel/);
  assert.match(detailPage, /customerEsimStatusLabel/);
  assert.match(detailView, /CustomerEsimInstallHelpLinks/);
  assert.match(detailView, /CustomerOrderDetailView|EsimOrderDetailCard/);
  assert.match(ordersLib, /statusLabel:\s*customerEsimStatusLabel\(statusBadge\)/);
  assert.doesNotMatch(ordersLib, /statusLabel:\s*statusBadge,/);
  assert.doesNotMatch(listPage, /Show full ICCID|decryptIccid|IccidRevealPanel/);
  assert.doesNotMatch(
    listPage,
    /smdpAddress|activationCode|qrValue|fetchBrokerOrderPayload/
  );
  console.log("PASS list_page_my_esims");

  assert.match(ordersLib, /import "server-only"/);
  assert.match(ordersLib, /OrderWhereInput = \{ userId \}/);
  assert.match(ordersLib, /userId:\s*owner\.id/);
  assert.match(ordersLib, /iccidMasked/);
  assert.match(ordersLib, /loadOrderIccidPlaintextMap|resolveOrderIccidPlaintext/);
  assert.doesNotMatch(ordersLib, /fetchBrokerOrderPayload/);
  assert.doesNotMatch(ordersLib, /decryptIccid/);
  assert.match(ordersLib, /Boolean\(iccid\)|iccidRevealable:\s*Boolean\(iccid\)/);
  assert.doesNotMatch(
    ordersLib,
    /qrValue|activationCode|smdpAddress|manualInstallText/
  );
  console.log("PASS orders_lib_local_db_only");

  assert.match(detailView, /IccidRevealPanel/);
  assert.match(detailView, /CustomerEsimInstallPanel/);
  assert.match(detailPage, /notFound/);
  assert.match(detailPage, /CustomerOrderDetailView/);
  assert.match(detailCard, /Order Refunded/);
  assert.doesNotMatch(
    detailPage,
    /smdpAddress|activationCode|qrValue|manualInstallText|fetchBrokerOrderPayload/
  );
  assert.match(revealPanel, /Copy ICCID/);
  assert.doesNotMatch(revealPanel, /Show full ICCID|Hide ICCID|AUTO_HIDE_MS/);
  assert.match(ordersLib, /loadOrderIccidPlaintextMap|resolveOrderIccidPlaintext/);
  console.log("PASS detail_always_visible_iccid_and_install_panel");

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
  assert.match(installPanel, /Install eSIM|SMART_INSTALL_BUTTON_LABEL/);
  assert.match(installPanel, /Install the eSIM only when you are ready to use it/);
  assert.match(installPanel, /CustomerEsimInstallHelpLinks/);
  assert.match(installPanel, /Order refunded/);
  assert.match(installPanel, /EsimInstallExperience/);
  assert.doesNotMatch(installPanel, /Add data to this eSIM/i);
  assert.match(installPanel, /hasInstallHashIntent|location\.hash/);
  assert.match(installPanel, /autoOpenStarted/);
  assert.match(installPanel, /loadInstall\(\)/);
  // Auto-open only when hash intent is present — not on every mount.
  assert.match(
    installPanel,
    /if \(!hasInstallHashIntent\(\)\) return;|hasInstallHashIntent\(\)/
  );
  assert.doesNotMatch(
    installPanel,
    /searchParams\.(get|has)\([`'"](lpa|qrValue|activationCode|carddata)/i
  );
  console.log("PASS install_on_demand_and_refund_guards");
  console.log("PASS install_hash_intent_auto_open_once");

  const usageLib = read("app/lib/orders/customerEsimUsage.ts");
  const usageApi = read("app/api/account/orders/[orderId]/usage/route.ts");
  const usagePanel = read("app/components/orders/CustomerEsimUsagePanel.tsx");
  const walletPurchasePostCommit = read("app/lib/esim/walletPurchase.ts");
  const walletPurchaseRead = read("app/lib/esim/walletPurchaseRead.ts");
  const buySuccess = read("app/account/esim/buy/success/page.tsx");
  assert.match(usageLib, /refreshOrderProviderLifecycleCacheBestEffort/);
  assert.match(usageLib, /persistOrderProviderLifecycleCache/);
  assert.match(
    walletPurchasePostCommit,
    /refreshOrderProviderLifecycleCacheBestEffort/
  );
  assert.match(walletPurchasePostCommit, /parseAddDataSourceOrderId/);
  assert.match(walletPurchaseRead, /addDataSourceOrderId/);
  assert.match(buySuccess, /addDataSourceOrderId/);
  assert.match(buySuccess, /\?usage=1/);
  assert.match(buySuccess, /View eSIM details/);
  assert.match(detailPage, /autoRefreshUsage|autoOpenUsage/);
  assert.match(detailView, /autoRefresh=\{autoRefreshUsage\}/);
  assert.match(detailCard, /autoRefresh/);
  assert.match(detailCard, /liveUsage \|\| loading/);
  assert.match(orderCard, /View details/);
  assert.match(orderCard, /∞ Unlimited|remainingDataLabel/);
  assert.match(detailView, /addDataEligible/);
  // Add More Data lives in the shared Order Details card (EsimOrderDetailCard).
  assert.doesNotMatch(detailPage, /Need more data\?/);
  assert.doesNotMatch(detailPage, /add-more-data-heading/);
  assert.match(detailPage, /CustomerOrderDetailView/);
  assert.match(detailView, /EsimOrderDetailCard/);
  assert.match(
    detailView,
    /\$\{encodeURIComponent\(orderId\)\}\/add-data/
  );
  assert.doesNotMatch(
    detailPage,
    /encodeURIComponent\(detail\.rechargeOrderId\)/
  );
  assert.match(detailCard, /Add data to this eSIM/);
  assert.match(detailCard, /addDataHref/);
  assert.match(usagePanel, /addDataEligible/);
  assert.match(usagePanel, /Add More Data/);
  assert.match(usagePanel, /\/add-data/);
  assert.match(usagePanel, /encodeURIComponent\(orderId\)/);
  assert.doesNotMatch(usagePanel, /rechargeOrderId/);
  const customerOrders = read("app/lib/orders/customerOrders.ts");
  assert.match(customerOrders, /providerOrderId/);
  assert.match(customerOrders, /missing_provider_order/);
  assert.match(customerOrders, /const rechargeOrderId = providerOrderId/);
  assert.match(
    customerOrders,
    /buildAddDataEligibility\(\{\s*providerOrderId,/
  );
  assert.doesNotMatch(customerOrders, /rechargeOrderId:\s*(order|row)\.id\b/);
  assert.doesNotMatch(
    customerOrders,
    /buildAddDataEligibility\(\{\s*orderId:/
  );
  const addDataPage = read("app/account/orders/[orderId]/add-data/page.tsx");
  assert.match(addDataPage, /CustomerAddDataForm/);
  assert.match(addDataPage, /Continue to checkout/);
  assert.match(addDataPage, /getCustomerOwnedOrderDetail/);
  assert.doesNotMatch(addDataPage, /name="rechargeOrderId"|name="providerOrderId"/);
  const customerAddDataForm = read(
    "app/components/orders/CustomerAddDataForm.tsx"
  );
  assert.match(customerAddDataForm, /startCustomerAddDataCheckoutAction/);
  assert.match(customerAddDataForm, /useActionState/);
  assert.match(customerAddDataForm, /disabled=\{pending\}/);
  assert.match(customerAddDataForm, /name="orderId"/);
  assert.doesNotMatch(
    customerAddDataForm,
    /name="rechargeOrderId"|name="providerOrderId"/
  );
  const addDataLib = read("app/lib/esim/addDataCheckout.ts");
  assert.match(addDataLib, /buildAddDataIdempotencyKey/);
  assert.match(addDataLib, /resolveWalletAddDataIdempotencyKey/);
  assert.match(addDataLib, /resolvePartnerAddDataIdempotencyKey/);
  assert.match(addDataLib, /createHash/);
  assert.doesNotMatch(addDataLib, /randomBytes/);
  assert.match(addDataLib, /parseAddDataSourceOrderId/);
  assert.match(addDataLib, /resolveOwnedRechargeOrderId/);
  assert.match(addDataLib, /isEncryptedOrderIccidExpiredForAddData/);
  assert.match(addDataLib, /isProviderUsageExpired/);
  assert.match(addDataLib, /fetchProviderUsage/);
  assert.doesNotMatch(addDataLib, /daysRemaining/);
  assert.doesNotMatch(
    addDataLib,
    /validity.*expir|expir.*Order\.validity/i
  );
  const partnerAddData = read("app/lib/partner/partnerAddDataCheckout.ts");
  assert.match(partnerAddData, /isEncryptedOrderIccidExpiredForAddData/);
  assert.match(partnerAddData, /resolvePartnerOwnedRechargeOrderId/);
  const lifecycleShared = read(
    "app/lib/esim/esimLifecycleNotificationShared.ts"
  );
  assert.match(lifecycleShared, /export function isProviderUsageExpired/);
  const creditCheckout = read("app/lib/vesim/creditCheckout.ts");
  assert.match(creditCheckout, /rechargeOrderId/);
  assert.match(
    creditCheckout,
    /\.\.\.\(rechargeOrderId \? \{ rechargeOrderId \} : \{\}\)/
  );
  const walletPurchase = read("app/lib/esim/walletPurchase.ts");
  assert.match(walletPurchase, /rechargeOrderId/);
  assert.match(walletPurchase, /parseAddDataSourceOrderId/);
  const paymentApply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  assert.match(paymentApply, /rechargeOrderId/);
  assert.match(paymentApply, /parseAddDataSourceOrderId/);
  const walletActions = read("app/lib/esim/walletPurchaseActions.ts");
  assert.match(walletActions, /startCustomerAddDataCheckoutAction/);
  assert.match(walletActions, /resolveWalletAddDataIdempotencyKey/);
  const adminAddDataActions = read(
    "app/lib/esim/adminWalletPurchaseActions.ts"
  );
  assert.match(adminAddDataActions, /resolveWalletAddDataIdempotencyKey/);
  const partnerAddDataActions = read(
    "app/lib/partner/partnerPurchaseActions.ts"
  );
  assert.match(partnerAddDataActions, /resolvePartnerAddDataIdempotencyKey/);
  assert.doesNotMatch(addDataPage, /Coming soon/);
  assert.match(detailPage, /CustomerOrderDetailView/);
  assert.match(detailView, /EsimOrderDetailCard/);
  assert.match(usageLib, /import "server-only"/);
  assert.match(usageLib, /authorizeCustomerOwnedOrderInstall/);
  assert.match(usageLib, /\/api\/esim\/usage\//);
  assert.match(usageLib, /usedDataGB = Math\.max\(initialDataGB - remainingDataGB, 0\)/);
  assert.match(usageLib, /RATE_LIMITED/);
  assert.match(usageLib, /consumeRateLimit/);
  assert.match(usageLib, /30_000/);
  assert.match(usageLib, /getBrokerToken/);
  assert.match(usageLib, /Authorization: `\$\{token\.tokenType\} \$\{token\.accessToken\}`/);
  assert.doesNotMatch(usageLib, /vesimAuthorizedFetch/);
  assert.doesNotMatch(usageApi, /iccid:\s/);
  assert.doesNotMatch(usageApi, /accessToken|bearer/i);
  assert.match(usageApi, /Retry-After/);
  assert.match(usagePanel, /View usage/);
  assert.match(usagePanel, /Refresh Status/);
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
