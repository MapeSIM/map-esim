/**
 * Offline QA: admin-saved ManualPaymentConfig is fetched and copyable on checkout.
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

  const adminApi = read("app/api/admin/manual-payment-settings/route.ts");
  assert.match(adminApi, /getPublicManualPaymentConfig/);
  assert.match(adminApi, /upsertManualPaymentConfig/);
  assert.match(adminApi, /export async function POST/);

  const publicApi = read("app/api/checkout/manual-payment-config/route.ts");
  assert.match(publicApi, /getPublicManualPaymentConfig/);
  assert.doesNotMatch(publicApi, /requireActiveAdminForOperations/);

  const review = read("app/account/esim/buy/review/page.tsx");
  assert.match(review, /getPublicManualPaymentConfig/);
  assert.doesNotMatch(review, /as any\)\.manualPaymentConfig/);

  const confirm = read("app/components/account/WalletPurchaseConfirmForm.tsx");
  assert.match(confirm, /ManualPaymentDetailsBox/);
  assert.match(confirm, /\/api\/checkout\/manual-payment-config/);

  const guest = read("app/checkout/CheckoutClient.tsx");
  assert.match(guest, /\/api\/checkout\/manual-payment-config/);
  assert.match(guest, /ManualPaymentDetailsBox/);
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

  console.log("PASS qa-manual-payment-checkout");
}

main();
