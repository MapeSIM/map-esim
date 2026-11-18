/**
 * Offline QA: admin-saved ManualPaymentConfig is fetched and copyable on checkout,
 * and manual payment submit persists pending fulfillable orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyManualPaymentSettingKey,
  parseManualPaymentConfigBody,
  toManualPaymentSettingsMap,
  EMPTY_MANUAL_PAYMENT_CONFIG,
} from "../app/lib/payments/manualPaymentConfigShared";
import {
  MANUAL_CHECKOUT_PAYMENT_METHOD,
  clipManualSenderName,
  generateManualOrderReference,
} from "../app/lib/support/manualCheckoutOrderShared";
import {
  resolveAdminOrderPaymentMethodDisplay,
  shouldBackfillOrderPaymentMethodToManual,
} from "../app/lib/admin/orderPaymentMethodShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model ManualPaymentConfig/);
  assert.match(schema, /jazzcashNumber/);
  assert.match(schema, /easypaisaNumber/);
  assert.match(schema, /bankAccountNumber/);
  assert.match(schema, /paymentProofUrl/);
  assert.match(schema, /senderName/);

  const migration = read(
    "prisma/migrations/20261114090000_add_manual_payment_config/migration.sql"
  );
  assert.match(migration, /ManualPaymentConfig/);
  const orderMigration = read(
    "prisma/migrations/20261114120000_add_manual_payment_order_fields/migration.sql"
  );
  assert.match(orderMigration, /paymentProofUrl/);
  assert.match(orderMigration, /WhatsAppCheckoutOrder/);

  const adminApi = read("app/api/admin/manual-payment-settings/route.ts");
  assert.match(adminApi, /getPublicManualPaymentConfig/);
  assert.match(adminApi, /upsertManualPaymentConfig/);
  assert.match(adminApi, /export async function POST/);

  const publicApi = read("app/api/checkout/manual-payment-config/route.ts");
  assert.match(publicApi, /getPublicManualPaymentConfig/);
  assert.doesNotMatch(publicApi, /requireActiveAdminForOperations/);

  const submitApi = read("app/api/checkout/manual-payment/route.ts");
  assert.match(submitApi, /createManualPendingOrderFromPurchase/);
  assert.match(submitApi, /createManualPendingOrderFromGuest/);
  assert.match(submitApi, /notifyManualPaymentSubmissionEmails/);
  assert.match(
    submitApi,
    /await notifyManualPaymentSubmissionEmails/
  );

  const notify = read("app/lib/esim/manualPaymentSubmissionEmail.ts");
  assert.match(notify, /resolveManualPaymentAdminAlertRecipient/);
  assert.match(notify, /ADMIN_ALERT_EMAIL/);
  assert.match(notify, /SUPPORT_EMAIL/);
  assert.match(notify, /ORDERS_FROM_EMAIL/);
  assert.match(notify, /SMTP_USER/);
  assert.match(notify, /Promise\.allSettled/);
  assert.match(notify, /MANUAL_PAYMENT_EMAIL_TIMEOUT_MS/);
  assert.match(notify, /admin_alert/);
  assert.match(notify, /customer_confirmation/);
  assert.match(notify, /channel:\s*"orders"|isEmailConfigured\("orders"\)/);
  assert.doesNotMatch(notify, /applyVerifiedPaymentEvent/);

  const templates = read("app/lib/email/manualPaymentSubmissionTemplate.ts");
  assert.match(templates, /under review/);
  assert.match(templates, /Review in Admin/);
  assert.match(templates, /manualPaymentCustomerSubject/);

  const review = read("app/account/esim/buy/review/page.tsx");
  assert.match(review, /getPublicManualPaymentConfig/);
  assert.doesNotMatch(review, /as any\)\.manualPaymentConfig/);

  const confirm = read("app/components/account/WalletPurchaseConfirmForm.tsx");
  assert.match(confirm, /ManualPaymentDetailsBox/);
  assert.match(confirm, /\/api\/checkout\/manual-payment-config/);
  assert.match(confirm, /\/api\/checkout\/manual-payment/);
  assert.match(confirm, /manual-pending/);
  // Manual Payment must stay visible when the online gateway is paused.
  assert.match(confirm, /alternateCashCheckoutAvailable/);
  assert.match(confirm, /showInsufficientWalletOnly/);
  assert.match(
    confirm,
    /walletOnlyInsufficient && !alternateCashCheckoutAvailable|showInsufficientWalletOnly/
  );
  assert.match(confirm, /manualPaymentsEnabled \?\s*\(/);

  const guest = read("app/checkout/CheckoutClient.tsx");
  assert.match(guest, /\/api\/checkout\/manual-payment-config/);
  assert.match(guest, /ManualPaymentDetailsBox/);
  assert.match(guest, /\/api\/checkout\/manual-payment/);
  assert.doesNotMatch(guest, /\/api\/admin\/manual-payment-settings/);

  const copy = read("app/components/account/ManualPaymentCopyField.tsx");
  assert.match(copy, /navigator\.clipboard\.writeText/);
  assert.match(copy, /Copied!/);

  const box = read("app/components/account/ManualPaymentDetailsBox.tsx");
  assert.match(box, /Account title/);
  assert.match(box, /JazzCash number/);
  assert.match(box, /EasyPaisa number/);
  assert.match(box, /Bank name/);
  assert.match(box, /Bank account title/);
  assert.match(box, /Account number \/ IBAN/);

  const fulfill = read("app/lib/admin/whatsappCheckoutFulfillment.ts");
  assert.match(fulfill, /paymentProofUrl/);
  assert.match(fulfill, /Verify Payment|Manual payment verified|paymentMethod/);
  assert.match(fulfill, /prepareAdminPackageAssignment/);
  assert.match(fulfill, /paymentMethod:\s*pendingPaymentMethod|paymentMethod:\s*pending\.paymentMethod/);

  const persist = read("app/lib/orders/persistAssignedOrder.ts");
  assert.match(persist, /paymentMethod/);
  assert.match(
    read("app/lib/esim/adminPackageAssignment.ts"),
    /paymentMethod/
  );

  const createManual = read("app/lib/esim/manualCheckoutOrder.ts");
  assert.match(createManual, /paymentMethod:\s*MANUAL_CHECKOUT_PAYMENT_METHOD/);

  assert.match(notify, /recordEmailCenterDelivery/);
  assert.match(notify, /esim\.manual_payment_admin_email_sent/);
  assert.match(notify, /esim\.manual_payment_customer_email_sent/);
  assert.match(
    read("app/lib/admin/emailCenterShared.ts"),
    /esim\.manual_payment_admin_email_sent/
  );
  assert.match(
    read("app/lib/admin/emailCenterLog.ts"),
    /recordEmailCenterDelivery/
  );

  const panel = read("app/components/admin/WhatsAppPendingOrdersPanel.tsx");
  assert.match(panel, /View payment proof/);
  assert.match(panel, /Verify Payment & Issue eSIM/);

  const vesim = read("app/api/vesim/checkout/route.ts");
  assert.match(vesim, /pendingLocalOrder/);
  assert.match(vesim, /status: \"PENDING\"/);

  const mapped = toManualPaymentSettingsMap({
    ...EMPTY_MANUAL_PAYMENT_CONFIG,
    enabled: true,
    jazzcashNumber: "03124448025",
  });
  assert.equal(mapped.MANUAL_PAYMENTS_ENABLED, "true");
  assert.equal(mapped.JAZZCASH_NUMBER, "03124448025");

  const keyed = applyManualPaymentSettingKey(
    EMPTY_MANUAL_PAYMENT_CONFIG,
    "BANK_ACCOUNT_NUMBER",
    "PK00TEST"
  );
  assert.equal(keyed.bankAccountNumber, "PK00TEST");

  const parsed = parseManualPaymentConfigBody(
    { enabled: true, accountTitle: "MAP eSIM" },
    EMPTY_MANUAL_PAYMENT_CONFIG
  );
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.accountTitle, "MAP eSIM");

  assert.equal(MANUAL_CHECKOUT_PAYMENT_METHOD, "MANUAL");
  assert.equal(clipManualSenderName("  Ali  Khan  "), "Ali Khan");
  assert.match(generateManualOrderReference(1_700_000_000_000), /^MP-/);

  assert.equal(
    resolveAdminOrderPaymentMethodDisplay({
      paymentMethod: "SAFEPAY",
      whatsappPaymentMethod: "MANUAL",
      hasWhatsappCheckoutLink: true,
      fundingSource: "COMPANY_FUNDED",
    }),
    "MANUAL"
  );
  assert.equal(
    resolveAdminOrderPaymentMethodDisplay({
      paymentMethod: "SAFEPAY",
      paymentProofUrl: "https://example.com/proof.png",
      fundingSource: "DIRECT_PAYMENT",
    }),
    "MANUAL"
  );
  assert.equal(
    resolveAdminOrderPaymentMethodDisplay({
      paymentMethod: "SAFEPAY",
      fundingSource: "COMPANY_FUNDED",
      hasAdminPackageAssignment: true,
      hasGatewayPaymentAttempt: false,
    }),
    "MANUAL"
  );
  assert.equal(
    resolveAdminOrderPaymentMethodDisplay({
      paymentMethod: "SAFEPAY",
      whatsappSenderName: "Ali",
      whatsappPaymentProofUrl: "https://example.com/wa-proof.png",
      hasWhatsappCheckoutLink: true,
      hasGatewayPaymentAttempt: false,
    }),
    "MANUAL"
  );
  assert.equal(
    resolveAdminOrderPaymentMethodDisplay({
      paymentMethod: "SAFEPAY",
      hasGatewayPaymentAttempt: true,
    }),
    "SAFEPAY"
  );
  assert.equal(
    shouldBackfillOrderPaymentMethodToManual({
      paymentMethod: "SAFEPAY",
      whatsappPaymentMethod: "MANUAL",
      hasWhatsappCheckoutLink: true,
      fundingSource: "COMPANY_FUNDED",
    }),
    true
  );
  assert.equal(
    shouldBackfillOrderPaymentMethodToManual({
      paymentMethod: "MANUAL",
      whatsappPaymentMethod: "MANUAL",
      hasWhatsappCheckoutLink: true,
    }),
    false
  );

  const adminOrders = read("app/lib/admin/orders.ts");
  assert.match(adminOrders, /resolveAdminOrderPaymentMethodDisplay/);
  assert.match(adminOrders, /whatsAppCheckoutOrder/);
  assert.match(
    read("scripts/backfill-manual-order-payment-method.ts"),
    /shouldBackfillOrderPaymentMethodToManual|--apply/
  );

  const pkg = read("package.json");
  assert.match(pkg, /qa:manual-payment-checkout/);
  assert.match(pkg, /backfill:manual-order-payment-method/);

  console.log("PASS qa-manual-payment-checkout");
}

main();
