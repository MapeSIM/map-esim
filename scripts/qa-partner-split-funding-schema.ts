/**
 * Offline QA for Partner Phase 1 split-payment schema foundation.
 * Does not call VeSIM, gateways, or mutate the database.
 * Asserts schema + migration only — no checkout/webhook/split orchestration.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const MIGRATION =
  "prisma/migrations/20260923184500_add_partner_esim_split_funding_foundation/migration.sql";

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(existsSync(join(root, MIGRATION)), true, `missing ${MIGRATION}`);

  const schema = read("prisma/schema.prisma");
  const migration = read(MIGRATION);
  const prepare = read("app/lib/partner/partnerEsimPurchase.ts");
  const buy = read("app/lib/partner/partnerPurchaseBuy.ts");
  const pkg = read("package.json");

  console.log("1) Enums");
  assert.match(schema, /PARTNER_SPLIT/);
  assert.match(schema, /PARTNER_GATEWAY/);
  assert.match(schema, /PARTNER_BALANCE/);
  assert.match(schema, /enum PartnerEsimPurchaseStatus/);
  const statusBlock = schema.slice(
    schema.indexOf("enum PartnerEsimPurchaseStatus"),
    schema.indexOf("enum PartnerEsimPurchaseStatus") + 500
  );
  assert.match(statusBlock, /AWAITING_GATEWAY_PAYMENT/);
  assert.match(statusBlock, /FUNDED/);
  assert.match(statusBlock, /FUNDS_RESERVED/);
  assert.match(statusBlock, /PROVIDER_PENDING/);
  console.log("   ok");

  console.log("2) PartnerEsimPurchase funding fields");
  const pepIdx = schema.indexOf("model PartnerEsimPurchase {");
  assert.ok(pepIdx >= 0);
  const pepClose = schema.indexOf("\n}", pepIdx);
  assert.ok(pepClose > pepIdx);
  const pepBody = schema.slice(pepIdx, pepClose + 2);
  assert.match(pepBody, /useWallet\s+Boolean\s+@default\(true\)/);
  assert.match(pepBody, /walletAppliedCents\s+Int/);
  assert.match(pepBody, /gatewayAmountCents\s+Int\s+@default\(0\)/);
  assert.match(pepBody, /paymentAttempts\s+PartnerEsimPurchasePaymentAttempt\[\]/);
  assert.match(pepBody, /partnerChargeCents/);
  assert.doesNotMatch(pepBody, /customerUserId/);
  assert.doesNotMatch(pepBody, /\bWalletAccount\b/);
  assert.doesNotMatch(pepBody, /\bWalletEsimPurchase\b/);
  console.log("   ok");

  console.log("3) PartnerEsimPurchasePaymentAttempt model");
  assert.match(schema, /model PartnerEsimPurchasePaymentAttempt/);
  const attemptIdx = schema.indexOf("model PartnerEsimPurchasePaymentAttempt");
  const attemptNext = schema.indexOf("\nmodel ", attemptIdx + 1);
  const attemptBody = schema.slice(
    attemptIdx,
    attemptNext > 0 ? attemptNext : undefined
  );
  assert.match(attemptBody, /purchaseId\s+String/);
  assert.match(attemptBody, /gatewayAmountCents\s+Int/);
  assert.match(attemptBody, /checkoutIdempotencyKey\s+String\s+@unique/);
  assert.match(attemptBody, /webhookEventId\s+String\?\s+@unique/);
  assert.match(attemptBody, /EsimPurchasePaymentAttemptStatus/);
  assert.match(attemptBody, /purchase\s+PartnerEsimPurchase\s+@relation/);
  assert.doesNotMatch(attemptBody, /purchase\s+WalletEsimPurchase\s+@relation/);
  // Customer attempt table must remain customer-only.
  const customerAttemptIdx = schema.indexOf("model EsimPurchasePaymentAttempt {");
  assert.ok(customerAttemptIdx >= 0);
  const customerAttemptClose = schema.indexOf("\n}", customerAttemptIdx);
  const customerAttempt = schema.slice(
    customerAttemptIdx,
    customerAttemptClose > 0 ? customerAttemptClose + 2 : customerAttemptIdx + 2500
  );
  assert.match(customerAttempt, /purchase\s+WalletEsimPurchase\s+@relation/);
  assert.doesNotMatch(customerAttempt, /PartnerEsimPurchase/);
  console.log("   ok");

  console.log("4) Safe migration shape");
  assert.match(migration, /ADD VALUE 'PARTNER_SPLIT'/);
  assert.match(migration, /ADD VALUE 'PARTNER_GATEWAY'/);
  assert.match(migration, /ADD VALUE 'AWAITING_GATEWAY_PAYMENT'/);
  assert.match(migration, /ADD VALUE 'FUNDED'/);
  assert.match(migration, /ADD COLUMN "useWallet" BOOLEAN/);
  assert.match(migration, /ADD COLUMN "walletAppliedCents" INTEGER/);
  assert.match(migration, /ADD COLUMN "gatewayAmountCents" INTEGER/);
  assert.match(
    migration,
    /"walletAppliedCents" = "partnerChargeCents"/
  );
  assert.match(migration, /"gatewayAmountCents" = 0/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION "PartnerEsimPurchase_legacy_funding_compat"/
  );
  assert.match(
    migration,
    /CREATE TRIGGER "PartnerEsimPurchase_legacy_funding_compat_bi"/
  );
  assert.match(migration, /IF NEW\."walletAppliedCents" IS NULL THEN/);
  assert.match(
    migration,
    /NEW\."walletAppliedCents" := NEW\."partnerChargeCents";/
  );
  assert.ok(
    migration.indexOf(
      'CREATE TRIGGER "PartnerEsimPurchase_legacy_funding_compat_bi"'
    ) < migration.indexOf('ALTER COLUMN "walletAppliedCents" SET NOT NULL')
  );
  assert.match(
    migration,
    /PartnerEsimPurchase_funding_breakdown_check/
  );
  assert.match(
    migration,
    /"walletAppliedCents" \+ "gatewayAmountCents" = "partnerChargeCents"/
  );
  assert.match(migration, /CREATE TABLE "PartnerEsimPurchasePaymentAttempt"/);
  assert.match(
    migration,
    /REFERENCES "PartnerEsimPurchase"\("id"\)/
  );
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  assert.doesNotMatch(
    migration,
    /ADD CONSTRAINT "EsimPurchasePaymentAttempt_purchaseId_fkey"/
  );
  assert.doesNotMatch(migration, /ALTER TABLE "WalletEsimPurchase"/);
  assert.doesNotMatch(migration, /ALTER TABLE "PartnerWalletTopup"/);
  console.log("   ok");

  console.log("5) Wallet-only prepare still writes PARTNER_BALANCE defaults");
  const prepareFn = prepare.slice(
    prepare.indexOf("export async function preparePartnerEsimPurchase"),
    prepare.indexOf("export async function setPartnerPurchaseFundingChoice")
  );
  assert.match(
    prepareFn,
    /walletAppliedCents:\s*snapshot\.partnerChargeCents/
  );
  assert.match(prepareFn, /gatewayAmountCents:\s*0/);
  assert.match(prepareFn, /useWallet:\s*true/);
  assert.match(prepareFn, /fundingSource:\s*OrderFundingSource\.PARTNER_BALANCE/);
  assert.doesNotMatch(prepareFn, /PARTNER_SPLIT|PARTNER_GATEWAY/);
  assert.doesNotMatch(prepareFn, /AWAITING_GATEWAY_PAYMENT|PartnerEsimPurchasePaymentAttempt/);
  // Buy may gate split behind flag; must still keep wallet-only reserve→provider path.
  assert.match(buy, /isPartnerEsimSplitPaymentEnabled/);
  assert.match(buy, /reservePartnerEsimPurchase/);
  assert.match(buy, /executePartnerEsimProviderPurchase/);
  assert.match(buy, /setPartnerPurchaseFundingChoice/);
  assert.match(prepare, /export async function setPartnerPurchaseFundingChoice/);
  assert.match(prepare, /OrderFundingSource\.PARTNER_SPLIT/);
  assert.match(prepare, /OrderFundingSource\.PARTNER_GATEWAY/);
  assert.match(pkg, /qa:partner-split-funding-schema/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=partner-split-funding-schema");
}

main();
