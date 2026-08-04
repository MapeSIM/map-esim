/**
 * Offline QA for Phase 5A ADMIN company-funded eSIM assignment.
 * Does not create provider orders, send email, or mutate the wallet/DB.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASSIGNMENT_CONFIRM_PHRASE,
  ASSIGNMENT_REASON_MAX,
  ASSIGNMENT_REASON_MIN,
  parseAssignmentConfirmPhrase,
  parseAssignmentIdempotencyKey,
  parseAssignmentReason,
  usdPriceToCents,
} from "../app/lib/esim/assignmentValidation";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260804210000_add_admin_package_assignment/migration.sql"
  );
  const service = read("app/lib/esim/adminPackageAssignment.ts");
  const actions = read("app/lib/esim/adminPackageAssignmentActions.ts");
  const formState = read("app/lib/esim/adminPackageAssignmentFormState.ts");
  const readSrc = read("app/lib/esim/adminPackageAssignmentRead.ts");
  const persist = read("app/lib/orders/persistAssignedOrder.ts");
  const selectForm = read(
    "app/components/admin/AdminPackageAssignSelectForm.tsx"
  );
  const confirmForm = read(
    "app/components/admin/AdminPackageAssignConfirmForm.tsx"
  );
  const assignPage = read("app/admin/customers/[id]/esim/assign/page.tsx");
  const reviewPage = read(
    "app/admin/customers/[id]/esim/assign/review/page.tsx"
  );
  const successPage = read(
    "app/admin/customers/[id]/esim/assign/success/page.tsx"
  );
  const detailPage = read("app/admin/customers/[id]/page.tsx");
  const accountOrders = read("app/account/orders/page.tsx");
  const accountOrderDetail = read("app/account/orders/[orderId]/page.tsx");
  const customerOrdersLib = read("app/lib/orders/customerOrders.ts");
  const customerInstallLib = read("app/lib/orders/customerOrderInstall.ts");
  const customerQrRoute = read("app/api/account/orders/[orderId]/qr/route.ts");
  const customerIphoneRoute = read(
    "app/api/account/orders/[orderId]/iphone/route.ts"
  );
  const customerAndroidRoute = read(
    "app/api/account/orders/[orderId]/android/route.ts"
  );
  const adminOrders = read("app/lib/admin/orders.ts");
  const adminOrderDetail = read("app/admin/orders/[id]/page.tsx");
  const guestPersist = read("app/lib/orders/persistGuestOrder.ts");
  const credit = read("app/lib/wallet/adminCredit.ts");
  const debit = read("app/lib/wallet/adminDebit.ts");
  const pkg = read("package.json");

  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /^"use server"/m);
  assert.match(successPage, /requireRole\("ADMIN"\)/);
  assert.match(assignPage, /getAdminAssignableCustomer/);
  assert.match(detailPage, /Assign eSIM package/);
  assert.ok(!/export const /.test(actions));
  assert.ok(!/^["']use server["']/m.test(formState));
  console.log("PASS admin_only_protection_exists");

  assert.match(service, /role !== Role\.CUSTOMER/);
  assert.match(service, /deletedAt/);
  assert.match(service, /role !== Role\.ADMIN/);
  assert.match(readSrc, /role !== Role\.CUSTOMER/);
  console.log("PASS active_customer_only");

  assert.match(service, /verifyOfferAuthoritative/);
  assert.match(actions, /normalizeOfferId/);
  assert.match(actions, /void formData\.get\("price"\)/);
  assert.match(actions, /void formData\.get\("priceUSD"\)/);
  assert.ok(!/formData\.get\("price"\)\s*\|\|/.test(actions));
  console.log("PASS offer_revalidated_browser_price_not_trusted");

  assert.match(schema, /enum OrderFundingSource/);
  assert.match(schema, /COMPANY_FUNDED/);
  assert.match(schema, /CUSTOMER_WALLET/);
  assert.match(schema, /DIRECT_PAYMENT/);
  assert.match(service, /OrderFundingSource\.COMPANY_FUNDED/);
  assert.match(persist, /CUSTOMER_WALLET/);
  assert.match(persist, /COMPANY_FUNDED/);
  assert.ok(!/CUSTOMER_WALLET/.test(service));
  assert.ok(!/DIRECT_PAYMENT/.test(service));
  console.log("PASS company_funded_only_enabled");

  assert.ok(!/walletAccount\.(update|create|upsert)/.test(service));
  assert.ok(!/walletTransaction\.(create|update|upsert)/.test(service));
  assert.ok(!/balanceCents:\s*\{\s*(increment|decrement)/.test(service));
  assert.ok(!/PURCHASE_DEBIT/.test(service));
  assert.ok(!/WalletTransactionType/.test(service));
  assert.match(confirmForm, /wallet will not be charged/i);
  assert.match(successPage, /Unchanged/);
  console.log("PASS wallet_never_modified_no_wallet_transaction");

  assert.equal(ASSIGNMENT_CONFIRM_PHRASE, "ASSIGN");
  assert.equal(parseAssignmentConfirmPhrase("ASSIGN").ok, true);
  assert.equal(parseAssignmentConfirmPhrase("assign").ok, false);
  assert.equal(parseAssignmentConfirmPhrase("YES").ok, false);
  assert.match(actions, /formData\.get\("confirm"\) === "on"/);
  assert.match(confirmForm, /confirmPhrase/);
  console.log("PASS confirmation_checkbox_and_assign_phrase_required");

  assert.equal(parseAssignmentReason("abcd").ok, false);
  assert.equal(parseAssignmentReason("abcde").ok, true);
  assert.equal(parseAssignmentReason("x".repeat(ASSIGNMENT_REASON_MAX + 1)).ok, false);
  assert.equal(ASSIGNMENT_REASON_MIN, 5);
  console.log("PASS required_reason_validation");

  assert.equal(parseAssignmentIdempotencyKey("short").ok, false);
  assert.equal(parseAssignmentIdempotencyKey("a".repeat(8)).ok, true);
  assert.match(schema, /idempotencyKey/);
  assert.match(migration, /AdminPackageAssignment_idempotencyKey_key/);
  assert.match(service, /findUnique\(\s*\{\s*where:\s*\{\s*idempotencyKey/);
  console.log("PASS stable_idempotency_duplicate_protection");

  assert.match(service, /PROVIDER_PENDING/);
  assert.match(service, /updateMany/);
  assert.match(service, /status:\s*AdminPackageAssignmentStatus\.READY/);
  assert.match(service, /\/api\/checkout\/credit/);
  // Provider call appears once in confirm path; prepare must not checkout.
  assert.ok(!/\/api\/checkout\/credit/.test(read("app/lib/esim/adminPackageAssignment.ts").split("confirmAdminPackageAssignment")[0]));
  const providerCalls = service.match(/\/api\/checkout\/credit/g) || [];
  assert.equal(providerCalls.length, 1);
  console.log("PASS provider_checkout_cannot_run_twice_for_one_assignment");

  assert.match(service, /RECONCILIATION_REQUIRED/);
  assert.match(service, /Do not submit again/);
  assert.match(service, /provider_timeout|provider_uncertain|checkout_transport_error/);
  assert.match(reviewPage, /Reconciliation required/);
  console.log("PASS timeout_unknown_becomes_reconciliation_required");

  assert.match(service, /persistAssignedOrder/);
  assert.match(persist, /userId:\s*customerUserId/);
  assert.match(persist, /CLAIMED/);
  assert.match(service, /AdminPackageAssignmentStatus\.COMPLETED/);
  const confirmFn = service.slice(
    service.indexOf("export async function confirmAdminPackageAssignment")
  );
  assert.ok(confirmFn.includes("/api/checkout/credit"));
  assert.ok(
    confirmFn.indexOf("await persistAssignedOrder") >
      confirmFn.indexOf("/api/checkout/credit")
  );
  console.log("PASS local_order_only_after_confirmed_provider_success");

  assert.match(schema, /model AdminPackageAssignment/);
  assert.match(schema, /orderId/);
  assert.match(persist, /fundingSource:\s*options\.fundingSource/);
  assert.match(service, /OrderFundingSource\.COMPANY_FUNDED/);
  assert.match(readSrc, /getAdminCompletedAssignment/);
  console.log("PASS assignment_order_customer_relationship_validated");

  assert.match(successPage, /getAdminCompletedAssignment/);
  assert.match(successPage, /void query\.price/);
  assert.match(successPage, /void query\.status/);
  assert.match(successPage, /notFound\(\)/);
  console.log("PASS success_page_uses_db_values_only");

  assert.match(accountOrders, /\/account\/orders\/\$\{/);
  assert.match(accountOrders, /View order details/);
  assert.match(accountOrders, /cursor-pointer/);
  assert.match(accountOrderDetail, /getCustomerOwnedOrderDetail/);
  assert.match(accountOrderDetail, /notFound\(\)/);
  assert.match(customerOrdersLib, /userId:\s*owner\.id/);
  assert.match(customerOrdersLib, /role !== Role\.CUSTOMER/);
  assert.match(customerOrdersLib, /findFirst/);
  assert.ok(!/providerCost|internal reason|adminUserId|ASSIGNMENT/i.test(accountOrders));
  assert.ok(!/providerCost|internal reason|adminUserId|fundingSource|Company-funded/i.test(accountOrderDetail));
  assert.ok(!/fundingSource|Company-funded/.test(accountOrders));
  assert.ok(!/reason/.test(accountOrders));
  assert.ok(!/smdpAddress|activationCode|qrValue|manualInstallText|accessToken/.test(accountOrderDetail));
  assert.ok(!/Guest purchases are not attached/i.test(accountOrders));
  assert.ok(!/prisma\.(order|wallet|adminPackageAssignment)\.(create|update|upsert|delete)/.test(customerOrdersLib));
  assert.ok(!/prisma\.(order|wallet|adminPackageAssignment)\.(create|update|upsert|delete)/.test(accountOrderDetail));
  assert.ok(!/\/api\/checkout\/credit/.test(customerOrdersLib));
  assert.ok(!/\/api\/checkout\/credit/.test(accountOrderDetail));
  assert.ok(!/deliverOrderEmail|sendOrderEmail/.test(customerOrdersLib));
  assert.ok(!/deliverOrderEmail|sendOrderEmail/.test(accountOrderDetail));
  assert.match(adminOrders, /Company-funded/);
  assert.match(adminOrderDetail, /Funding/);
  console.log("PASS customer_hides_provider_cost_reason_admin_identity");
  console.log("PASS customer_order_detail_link_and_ownership");
  console.log("PASS guest_message_removed_or_conditional");
  console.log("PASS detail_refresh_creates_no_writes");

  assert.match(customerInstallLib, /buildCustomerSessionInstallActions/);
  assert.match(customerInstallLib, /\/api\/account\/orders\//);
  assert.match(customerInstallLib, /qr\?download=1/);
  assert.match(customerInstallLib, /authorizeCustomerOwnedOrderInstall/);
  assert.match(customerInstallLib, /userId:\s*owner\.id/);
  assert.match(customerInstallLib, /sessionRole !== "CUSTOMER"/);
  assert.match(customerOrdersLib, /buildCustomerSessionInstallActions/);
  assert.ok(!/createOrderAccessToken|buildSafeInstallActions|buildAuthorizedOrderPath/.test(customerOrdersLib));
  assert.ok(!/createOrderAccessToken|buildSafeInstallActions|access=/.test(customerInstallLib));
  assert.ok(!/access=/.test(customerInstallLib));
  assert.ok(!/LPA:1\$|eyJ[A-Za-z0-9_-]+\./.test(customerInstallLib));
  assert.ok(!/access=|createOrderAccessToken/.test(accountOrderDetail));
  assert.match(customerInstallLib, /\$\{base\}\/qr`/);
  assert.match(customerInstallLib, /\$\{base\}\/iphone/);
  assert.match(customerInstallLib, /\$\{base\}\/android/);
  // Hrefs must be local-order paths only — never token query params.
  assert.match(
    customerInstallLib,
    /qrDownloadHref: hasVerifiedLpa \? `\$\{base\}\/qr\?download=1`/
  );
  assert.match(
    customerInstallLib,
    /qrViewHref: hasVerifiedLpa \? `\$\{base\}\/qr`/
  );
  assert.match(customerQrRoute, /authorizeCustomerOwnedOrderInstall/);
  assert.match(customerQrRoute, /download/);
  assert.match(customerQrRoute, /private, no-store/);
  assert.match(customerQrRoute, /image\/png/);
  assert.match(customerIphoneRoute, /authorizeCustomerOwnedOrderInstall/);
  assert.match(customerAndroidRoute, /authorizeCustomerOwnedOrderInstall/);
  assert.ok(!/authorizeOrderAccess/.test(customerQrRoute));
  assert.ok(!/authorizeOrderAccess/.test(customerIphoneRoute));
  assert.ok(!/authorizeOrderAccess/.test(customerAndroidRoute));
  assert.ok(!/prisma\.(order|wallet|adminPackageAssignment)\.(create|update|upsert|delete)/.test(customerQrRoute));
  assert.ok(!/prisma\.(order|wallet|adminPackageAssignment)\.(create|update|upsert|delete)/.test(customerIphoneRoute));
  assert.ok(!/prisma\.(order|wallet|adminPackageAssignment)\.(create|update|upsert|delete)/.test(customerAndroidRoute));
  assert.ok(!/prisma\.(order|wallet|adminPackageAssignment)\.(create|update|upsert|delete)/.test(customerInstallLib));
  console.log("PASS customer_install_hrefs_local_order_id_only");
  console.log("PASS customer_qr_requires_session_owner");
  console.log("PASS customer_install_routes_no_db_writes");

  assert.ok(!/stripe|paypal|promo|reward|refund|webhook/i.test(service));
  assert.ok(!/stripe|paypal|promo|reward|refund|webhook/i.test(actions));
  assert.ok(!/WalletEsimPurchase|walletPurchase/.test(service));
  console.log("PASS no_payment_gateway_refund_promo_reward");

  assert.ok(!/checkoutPayload/.test(persist));
  assert.ok(!/qrValue|activationCode/.test(persist));
  assert.match(persist, /iccidEncrypted:\s*null/);
  assert.ok(!/accessToken|lpaString|qrPayload/.test(persist));
  assert.ok(!/VESIM_PASSWORD|VESIM_EMAIL/.test(selectForm));
  assert.ok(!/VESIM_PASSWORD|VESIM_EMAIL/.test(confirmForm));
  assert.ok(!/VESIM_PASSWORD|VESIM_EMAIL/.test(successPage));
  console.log("PASS no_raw_provider_secrets_persisted_or_rendered");

  assert.match(credit, /ADMIN_CREDIT/);
  assert.match(debit, /ADJUSTMENT_DEBIT/);
  assert.ok(!/AdminPackageAssignment/.test(credit));
  assert.ok(!/AdminPackageAssignment/.test(debit));
  console.log("PASS existing_wallet_credit_debit_unchanged");

  assert.ok(!/migrate reset|db push|migrate dev/.test(service));
  assert.ok(!/migrate reset|db push/.test(migration));
  assert.ok(existsSync(join(root, "prisma/migrations/20260804210000_add_admin_package_assignment/migration.sql")));
  assert.match(pkg, /qa:admin-package-assignment/);
  assert.equal(usdPriceToCents(10), 1000);
  assert.equal(usdPriceToCents(-1), null);
  assert.match(guestPersist, /userId:\s*null/);
  console.log("PASS no_destructive_prisma_command");

  console.log("ALL_QA_PASSED=24");
}

main();
