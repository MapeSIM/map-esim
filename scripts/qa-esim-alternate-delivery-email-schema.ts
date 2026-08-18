/**
 * Offline QA: P1B alternate eSIM delivery-email schema foundation (no OTP).
 * Does not connect to Production, send email, or mutate wallets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyPurchaseDeliveryLock,
  classifyPurchaseDeliveryRecipient,
  isPurchaseDeliveryEmailLocked,
} from "../app/lib/esim/esimDeliveryEmailState";

const root = join(__dirname, "..");
const MIGRATION =
  "prisma/migrations/20260819120000_add_esim_alternate_delivery_email/migration.sql";

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function extractModel(schema: string, name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  assert.ok(start >= 0, `missing model ${name}`);
  const end = schema.indexOf("\nmodel ", start + 1);
  const nextEnum = schema.indexOf("\nenum ", start + 1);
  let cut = schema.length;
  if (end >= 0) cut = Math.min(cut, end);
  if (nextEnum >= 0) cut = Math.min(cut, nextEnum);
  return schema.slice(start, cut);
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(MIGRATION);
  const helper = read("app/lib/esim/esimDeliveryEmailState.ts");
  const pkg = read("package.json");
  const emailOtp = extractModel(schema, "EmailOtp");
  const otpPurpose = schema.slice(
    schema.indexOf("enum OtpPurpose {"),
    schema.indexOf("}", schema.indexOf("enum OtpPurpose {")) + 1
  );
  const order = extractModel(schema, "Order");
  const purchase = extractModel(schema, "WalletEsimPurchase");
  const credit = read("app/lib/vesim/creditCheckout.ts");

  console.log("1) Prisma models — confirmed alternate, no challenge");
  assert.match(order, /customerEmail\s+String/);
  assert.match(order, /alternateDeliveryEmail\s+String\?/);
  assert.doesNotMatch(order, /@@index\(\[\s*alternateDeliveryEmail\s*\]\)/);
  assert.match(purchase, /alternateDeliveryEmail\s+String\?/);
  assert.match(purchase, /alternateDeliveryEmailConfirmedAt\s+DateTime\?/);
  assert.match(purchase, /alternateDeliveryEmailLockedAt\s+DateTime\?/);
  assert.doesNotMatch(schema, /alternateDeliveryEmailVerifiedAt/);
  assert.doesNotMatch(schema, /model\s+EsimDeliveryEmailChallenge\b/);
  assert.doesNotMatch(purchase, /deliveryEmailChallenges/);
  assert.doesNotMatch(purchase, /\bcodeHash\b/);
  assert.doesNotMatch(schema, /pendingEmailNormalized|pendingEmailHash/);
  assert.doesNotMatch(helper, /verified|challenge|OTP|otp|codeHash/i);
  console.log("   ok");

  console.log("2) Migration is additive, CHECK NOT VALID, no table/OTP");
  const sqlWithoutComments = migration
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlWithoutComments, /\bDROP\b/i);
  assert.doesNotMatch(sqlWithoutComments, /\bDELETE\b/i);
  assert.doesNotMatch(sqlWithoutComments, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sqlWithoutComments, /\bUPDATE\b/i);
  assert.doesNotMatch(sqlWithoutComments, /SET\s+NOT\s+NULL/i);
  assert.doesNotMatch(sqlWithoutComments, /\bCREATE\s+TYPE\b/i);
  assert.doesNotMatch(sqlWithoutComments, /\bCREATE\s+ENUM\b/i);
  assert.doesNotMatch(sqlWithoutComments, /\bCREATE\s+TABLE\b/i);
  assert.doesNotMatch(sqlWithoutComments, /\bCREATE\s+(UNIQUE\s+)?INDEX\b/i);
  assert.doesNotMatch(migration, /EsimDeliveryEmailChallenge|codeHash|pendingEmail/);
  assert.doesNotMatch(migration, /VerifiedAt|verified_ck/i);
  assert.match(
    migration,
    /ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "alternateDeliveryEmail" TEXT/
  );
  assert.match(
    migration,
    /ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "alternateDeliveryEmail" TEXT/
  );
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS "alternateDeliveryEmailConfirmedAt" TIMESTAMP\(3\)/
  );
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS "alternateDeliveryEmailLockedAt" TIMESTAMP\(3\)/
  );
  assert.match(
    migration,
    /CONSTRAINT "WalletEsimPurchase_alternate_delivery_email_confirmed_ck"/
  );
  assert.match(migration, /\) NOT VALID;/);
  assert.match(
    migration,
    /"alternateDeliveryEmail" IS NULL\s+AND\s+"alternateDeliveryEmailConfirmedAt" IS NULL/
  );
  assert.match(
    migration,
    /"alternateDeliveryEmail" IS NOT NULL\s+AND\s+"alternateDeliveryEmailConfirmedAt" IS NOT NULL/
  );
  assert.doesNotMatch(
    migration,
    /alternateDeliveryEmailLockedAt" IS NOT NULL/
  );
  console.log("   ok");

  console.log("3) Raw alternate-email fields are not indexed");
  assert.doesNotMatch(
    migration,
    /CREATE(?:\s+UNIQUE)?\s+INDEX[^;]*"alternateDeliveryEmail"/i
  );
  assert.doesNotMatch(
    purchase,
    /@@index\(\[[^\]]*alternateDeliveryEmail[^\]]*\]\)/
  );
  console.log("   ok");

  console.log("4) EmailOtp / OtpPurpose / VeSIM relay unchanged");
  assert.match(otpPurpose, /EMAIL_VERIFICATION/);
  assert.match(otpPurpose, /PASSWORD_RESET/);
  assert.match(otpPurpose, /ACCOUNT_DELETION/);
  assert.doesNotMatch(otpPurpose, /DELIVERY/);
  assert.doesNotMatch(otpPurpose, /ESIM/);
  assert.match(emailOtp, /purpose\s+OtpPurpose/);
  assert.doesNotMatch(migration, /EmailOtp|OtpPurpose/);
  assert.match(
    credit,
    /VESIM_PROVIDER_CUSTOMER_EMAIL\s*=\s*"orders@mapesim\.com"/
  );
  console.log("   ok");

  console.log("5) Helper is pure");
  assert.match(helper, /classifyPurchaseDeliveryRecipient/);
  assert.match(helper, /classifyPurchaseDeliveryLock/);
  assert.match(helper, /confirmed_alternate/);
  assert.match(helper, /account_default/);
  assert.doesNotMatch(helper, /from ["']@prisma\/client["']/);
  assert.doesNotMatch(helper, /\bfetch\s*\(/);
  assert.doesNotMatch(helper, /prisma\./);
  assert.match(pkg, /"qa:esim-alternate-delivery-email-schema"/);
  console.log("   ok");

  console.log("6) Derived-state classifiers");
  assert.equal(classifyPurchaseDeliveryRecipient({}), "account_default");
  assert.equal(
    classifyPurchaseDeliveryRecipient({
      alternateDeliveryEmail: null,
      alternateDeliveryEmailConfirmedAt: null,
    }),
    "account_default"
  );
  assert.equal(
    classifyPurchaseDeliveryRecipient({
      alternateDeliveryEmail: "alt@example.com",
      alternateDeliveryEmailConfirmedAt: null,
    }),
    "account_default"
  );
  assert.equal(
    classifyPurchaseDeliveryRecipient({
      alternateDeliveryEmail: "alt@example.com",
      alternateDeliveryEmailConfirmedAt: new Date("2026-08-19T00:00:00Z"),
    }),
    "confirmed_alternate"
  );
  assert.equal(classifyPurchaseDeliveryLock({}), "unlocked");
  assert.equal(
    classifyPurchaseDeliveryLock({
      alternateDeliveryEmailLockedAt: new Date("2026-08-19T01:00:00Z"),
    }),
    "locked"
  );
  assert.equal(isPurchaseDeliveryEmailLocked(null), false);
  assert.equal(
    isPurchaseDeliveryEmailLocked(new Date("2026-08-19T01:00:00Z")),
    true
  );
  console.log("   ok");

  console.log("PASS qa-esim-alternate-delivery-email-schema");
}

main();
