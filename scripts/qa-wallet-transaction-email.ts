/**
 * Offline QA for Phase 8E customer wallet transaction email notifications.
 * Does not mutate wallets, call providers, or send SMTP mail.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderWalletTransactionEmailHtml,
  renderWalletTransactionEmailText,
} from "../app/lib/email/walletTransactionTemplate";
import {
  shortWalletTransactionReference,
  formatUsdCents,
} from "../app/lib/wallet/display";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function assertNoSensitive(content: string) {
  const banned = [
    "ICCID",
    "iccid",
    "LPA:",
    "SM-DP+",
    "smdpAddress",
    "activationCode",
    "qrCode",
    "QR code",
    "SMTP_PASSWORD",
    "providerPayload",
  ];
  for (const token of banned) {
    assert.equal(
      content.includes(token),
      false,
      `sensitive token leaked: ${token}`
    );
  }
}

/** Mirrors walletEmailNotificationLabel — keep in sync with transactionNotification.ts */
function notificationLabel(status: string | null | undefined): string | null {
  switch ((status ?? "").trim()) {
    case "sent":
      return "Notification sent";
    case "sending":
      return "Notification pending";
    case "failed":
      return "Notification failed";
    case "not_configured":
      return "Notification pending";
    case "skipped":
      return null;
    default:
      return null;
  }
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260806180000_add_wallet_transaction_email_notification/migration.sql"
  );
  const notify = read("app/lib/wallet/transactionNotification.ts");
  const template = read("app/lib/email/walletTransactionTemplate.ts");
  const adminCredit = read("app/lib/wallet/adminCredit.ts");
  const adminDebit = read("app/lib/wallet/adminDebit.ts");
  const topup = read("app/lib/wallet/topup.ts");
  const purchase = read("app/lib/esim/walletPurchase.ts");
  const customerRead = read("app/lib/wallet/read.ts");
  const adminWallet = read("app/lib/admin/wallet.ts");
  const customerPage = read("app/account/wallet/page.tsx");
  const adminCustomerPage = read("app/admin/customers/[id]/page.tsx");
  const orderEmail = read("app/lib/email/deliverAfterCheckout.ts");
  const billingSend = read("app/lib/email/sendBillingEmail.ts");
  const paymentPage = read("app/payment/page.tsx");
  const pkg = read("package.json");

  console.log("1) Schema + nullable-safe migration");
  assert.match(schema, /balanceBeforeCents\s+Int\?/);
  assert.match(schema, /emailNotificationStatus\s+String\?/);
  assert.match(schema, /emailNotifiedAt\s+DateTime\?/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "balanceBeforeCents"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "emailNotificationStatus"/);
  assert.match(migration, /IS NULL OR "balanceBeforeCents" >= 0/);
  console.log("   ok");

  console.log("2) Shared post-commit dispatcher (billing channel)");
  assert.match(notify, /channel:\s*"billing"/);
  assert.match(notify, /emailNotificationStatus:\s*null/);
  assert.match(notify, /updateMany/);
  assert.match(notify, /WalletTransactionStatus\.COMPLETED/);
  assert.match(notify, /isEmailConfigured\("billing"\)/);
  assert.match(notify, /scheduleWalletTransactionNotification/);
  assert.ok(!/prisma\.\$transaction/.test(notify));
  assert.ok(!notify.includes("SMTP_PASSWORD"));
  assert.ok(!notify.includes("ICCID"));
  console.log("   ok");

  console.log("3) Event wiring after durable commit");
  for (const [label, src] of [
    ["adminCredit", adminCredit],
    ["adminDebit", adminDebit],
    ["topup", topup],
    ["purchase", purchase],
  ] as const) {
    assert.match(
      src,
      /scheduleWalletTransactionNotification/,
      `${label} missing schedule`
    );
    assert.match(src, /balanceBeforeCents/, `${label} missing before balance`);
  }
  assert.match(purchase, /status:\s*WalletTransactionStatus\.PENDING/);
  assert.match(
    purchase,
    /completedDebitTransactionId[\s\S]*scheduleWalletTransactionNotification/
  );
  assert.match(
    purchase,
    /createdRefundTransactionId[\s\S]*scheduleWalletTransactionNotification/
  );
  assert.ok(
    !/WALLET_FUNDS_RESERVED[\s\S]{0,400}scheduleWalletTransactionNotification/.test(
      purchase
    )
  );
  console.log("   ok");

  console.log("4) Idempotency claim + UI safe labels");
  assert.equal(notificationLabel("sent"), "Notification sent");
  assert.equal(notificationLabel("sending"), "Notification pending");
  assert.equal(notificationLabel("failed"), "Notification failed");
  assert.equal(notificationLabel("not_configured"), "Notification pending");
  assert.equal(notificationLabel("skipped"), null);
  assert.equal(notificationLabel(null), null);
  assert.match(notify, /walletEmailNotificationLabel/);
  assert.match(notify, /Notification sent/);
  assert.match(notify, /Notification failed/);
  assert.match(customerRead, /notificationLabel/);
  assert.match(adminWallet, /notificationLabel/);
  assert.match(customerPage, /notificationLabel/);
  assert.match(adminCustomerPage, /notificationLabel/);
  assert.ok(!customerPage.includes("SMTP"));
  assert.ok(!adminCustomerPage.includes("SMTP"));
  console.log("   ok");

  console.log("5) Email content (no sensitive eSIM / secrets)");
  const payload = {
    customerName: "Ada Lovelace",
    transactionTypeLabel: "Wallet debit",
    amountLabel: formatUsdCents(-1999),
    currencyLabel: "USD",
    description: "eSIM package purchase",
    orderReference: "ord_…9f2a",
    orderUrl: "https://mapesim.com/account/orders/ord_abc12345",
    transactionReference: shortWalletTransactionReference("clxwallettrx0001"),
    previousBalanceLabel: formatUsdCents(5000),
    newBalanceLabel: formatUsdCents(3001),
    occurredAtLabel: "22 Jul 2026, 10:00 UTC",
    walletUrl: "https://mapesim.com/account/wallet",
  };
  const html = renderWalletTransactionEmailHtml(payload);
  const text = renderWalletTransactionEmailText(payload);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /Wallet debit/);
  assert.match(html, /Previous balance/);
  assert.match(html, /New balance/);
  assert.match(html, /Related order/);
  assert.match(html, /support@mapesim\.com/);
  assert.match(html, /account\/wallet/);
  assert.match(text, /Previous balance: \$50\.00/);
  assert.match(text, /New balance: \$30\.01/);
  assertNoSensitive(html);
  assertNoSensitive(text);
  assertNoSensitive(template);
  assert.equal(shortWalletTransactionReference("abcdefghij"), "abcd…ghij");
  console.log("   ok");

  console.log("6) Failure / non-events / order emails unchanged");
  assert.match(notify, /not_configured/);
  assert.match(notify, /WALLET_TX_EMAIL_FAILED/);
  assert.match(notify, /already_handled_or_incomplete/);
  assert.match(billingSend, /wallet_transaction/);
  assert.match(orderEmail, /deliverOrderEmailAfterCheckout/);
  assert.ok(!orderEmail.includes("scheduleWalletTransactionNotification"));
  assert.ok(!paymentPage.includes("scheduleWalletTransactionNotification"));
  assert.match(pkg, /"qa:wallet-transaction-email"/);
  console.log("   ok");

  console.log("7) Balance snapshot source");
  assert.match(notify, /balanceBeforeCents/);
  assert.match(notify, /balanceAfterCents/);
  assert.match(notify, /never client input/i);
  console.log("   ok");

  console.log("PASS wallet_transaction_email_offline_qa");
}

main();
