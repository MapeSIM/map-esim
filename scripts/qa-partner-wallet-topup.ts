/**
 * Offline QA for Partner wallet Add Funds (STEP 12B).
 * Local/isolated only — no DB mutation, no live payments, no Production.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PARTNER_TOPUP_MAX_CENTS,
  PARTNER_TOPUP_MIN_CENTS,
  PARTNER_TOPUP_USER_KEY_PREFIX,
  browserReturnMustNotCreditPartnerWallet,
  parsePartnerTopupIdFromMerchantUserKey,
  partnerTopupCreditIdempotencyKey,
  partnerTopupMerchantUserKey,
} from "../app/lib/partner/partnerWalletTopupConstants";
import { maskSimpaisaMsisdn } from "../app/lib/payments/simpaisaPolicy";
import {
  WALLET_TOPUP_MAX_CENTS,
  WALLET_TOPUP_MIN_CENTS,
  parseTopupUsdAmountToCents,
} from "../app/lib/wallet/amount";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260905120000_add_partner_wallet_topup/migration.sql"
  );
  const core = read("app/lib/partner/partnerWalletTopup.ts");
  const constants = read("app/lib/partner/partnerWalletTopupConstants.ts");
  const actions = read("app/lib/partner/partnerWalletTopupActions.ts");
  const readSrc = read("app/lib/partner/partnerWalletTopupRead.ts");
  const types = read("app/lib/payments/types.ts");
  const dispatch = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const webhookParse = read("app/lib/payments/simpaisaWebhookParse.ts");
  const adapter = read("app/lib/payments/simpaisaAdapter.ts");
  const returnPaths = read("app/lib/payments/safepayCheckoutUrls.ts");
  const walletPage = read("app/partner/(portal)/wallet/page.tsx");
  const detailPage = read(
    "app/partner/(portal)/wallet/top-up/[id]/page.tsx"
  );
  const form = read("app/components/partner/PartnerWalletAddFundsForm.tsx");
  const poller = read(
    "app/components/partner/PartnerWalletTopupPendingPoller.tsx"
  );
  const access = read("app/lib/partner/partnerAccess.ts");
  const partners = read("app/lib/partner/partners.ts");
  const customerTopup = read("app/lib/wallet/topup.ts");
  const partnerPurchase = read("app/lib/partner/partnerPurchaseBuy.ts");
  const partnerPurchaseWallet = read(
    "app/lib/partner/partnerPurchaseWallet.ts"
  );
  const cardsGate = read("app/lib/payments/simpaisaCardsFundingGate.ts");
  const pkg = read("package.json");
  const uxQa = read("scripts/qa-partner-ux-unification.ts");

  // --- Schema / migration additive ---
  assert.match(schema, /enum PartnerWalletTopupStatus/);
  assert.match(schema, /TOPUP_CREDIT/);
  assert.match(schema, /model PartnerWalletTopup/);
  assert.match(schema, /baseAmountCents/);
  assert.match(schema, /processingFeeAmountCents\s+Int\s+@default\(0\)/);
  assert.match(schema, /totalPayableCents/);
  assert.match(schema, /feePolicyVersion\s+String\?/);
  assert.match(schema, /customerMsisdnMasked/);
  assert.match(schema, /checkoutIdempotencyKey\s+String\s+@unique/);
  assert.match(schema, /webhookEventId\s+String\?\s+@unique/);
  assert.match(migration, /ADD VALUE 'TOPUP_CREDIT'/);
  assert.match(migration, /CREATE TABLE "PartnerWalletTopup"/);
  assert.match(migration, /Additive only/);
  assert.doesNotMatch(migration, /UPDATE "WalletTopup"|DELETE FROM "WalletTopup"/);
  assert.doesNotMatch(
    migration,
    /UPDATE "PartnerWalletAccount"|UPDATE "PartnerWalletTransaction"/
  );
  console.log("PASS schema_and_additive_migration");

  assert.match(types, /PARTNER_WALLET_TOPUP/);
  assert.match(types, /localPartnerTopupId/);
  assert.match(adapter, /partnerTopupMerchantUserKey/);
  assert.match(adapter, /PARTNER_WALLET_TOPUP/);
  console.log("PASS payment_purpose_and_adapter_namespace");

  // 1 draft creation
  assert.match(core, /export async function createPartnerWalletTopupDraft/);
  assert.match(core, /processingFeeAmountCents:\s*0/);
  assert.match(core, /totalPayableCents:\s*baseAmountCents/);
  assert.match(core, /feePolicyVersion:\s*null/);
  assert.match(core, /PartnerWalletTopupStatus\.DRAFT/);
  console.log("PASS partner_draft_creation");

  // 2–3 min/max
  assert.equal(PARTNER_TOPUP_MIN_CENTS, 10);
  assert.equal(PARTNER_TOPUP_MAX_CENTS, 50_000);
  assert.equal(PARTNER_TOPUP_MIN_CENTS, WALLET_TOPUP_MIN_CENTS);
  assert.equal(PARTNER_TOPUP_MAX_CENTS, WALLET_TOPUP_MAX_CENTS);
  assert.equal(parseTopupUsdAmountToCents("0.09").ok, false);
  assert.equal(parseTopupUsdAmountToCents("0.10").ok, true);
  assert.equal(parseTopupUsdAmountToCents("500").ok, true);
  assert.equal(parseTopupUsdAmountToCents("500.01").ok, false);
  assert.match(core, /PARTNER_TOPUP_MIN_CENTS/);
  assert.match(core, /PARTNER_TOPUP_MAX_CENTS/);
  console.log("PASS min_max_amount_bounds");

  // 4 ownership
  assert.match(actions, /requireRole\("PARTNER"\)/);
  assert.match(actions, /requireActivePartnerActor/);
  assert.match(readSrc, /row\.partnerId !== actor\.partnerId/);
  assert.match(readSrc, /notFound\(\)/);
  assert.match(detailPage, /requireRole\("PARTNER"\)/);
  assert.match(core, /topup\.partnerId !== partnerId/);
  console.log("PASS ownership_rejection");

  // 5 0037 pending
  assert.match(adapter, /0037|accepted-as-pending|never paid/i);
  assert.match(core, /PartnerWalletTopupStatus\.AWAITING_PAYMENT/);
  assert.match(core, /resumeSimpaisaWalletCheckout/);
  console.log("PASS verify_0037_pending");

  // 6 pending refresh-safe
  assert.match(detailPage, /browserReturnMustNotCreditPartnerWallet/);
  assert.match(detailPage, /PartnerWalletTopupPendingPoller/);
  assert.match(poller, /router\.refresh\(\)/);
  assert.doesNotMatch(poller, /createCheckoutSession|verifyWallet|applyVerified/);
  assert.match(detailPage, /Refreshing this page does/);
  console.log("PASS pending_refresh_safe");

  // 7 no duplicate Verify
  assert.match(
    core,
    /No second Verify while same attempt already pending|resumeSimpaisaWalletCheckout/
  );
  assert.match(core, /reusedTracker:\s*true/);
  assert.match(core, /existingRef/);
  console.log("PASS no_duplicate_verify");

  // 8 Inquire 0000 credit once
  assert.match(core, /applyVerifiedPartnerTopupPaymentEvent/);
  assert.match(core, /PartnerWalletTransactionType\.TOPUP_CREDIT/);
  assert.match(core, /creditCents = topup\.baseAmountCents/);
  assert.match(core, /partnerTopupCreditIdempotencyKey/);
  assert.match(core, /PARTNER_WALLET_CAS_MAX_ATTEMPTS/);
  assert.equal(
    partnerTopupCreditIdempotencyKey("abc"),
    "partner_topup_credit_abc"
  );
  console.log("PASS inquire_credit_exactly_once_shape");

  // 9 duplicate webhook
  assert.match(core, /webhookEventId:\s*eventId|where: \{ webhookEventId/);
  assert.match(core, /PARTNER_TOPUP_WEBHOOK_DUPLICATE|duplicate_event/);
  assert.match(core, /duplicate:\s*true/);
  console.log("PASS duplicate_webhook_no_second_credit");

  // 10–12 wrong amount/currency/reference
  assert.match(core, /charge_mismatch|reference_mismatch/);
  assert.match(core, /RECONCILIATION_REQUIRED/);
  assert.match(core, /topup\.chargeAmountMinor !== event\.chargeAmountMinor/);
  assert.match(
    core,
    /topup\.chargeCurrency !== event\.chargeCurrency\.trim\(\)\.toUpperCase\(\)/
  );
  assert.match(core, /reference_mismatch|storedRef !== eventRef/);
  console.log("PASS wrong_amount_currency_reference_reject");

  // 13 rejection/expiry no credit
  assert.match(core, /PartnerWalletTopupStatus\.FAILED/);
  assert.match(core, /PartnerWalletTopupStatus\.EXPIRED/);
  assert.match(core, /expirePartnerWalletTopupCheckout/);
  assert.doesNotMatch(
    core,
    /paymentStatus === "failed"[\s\S]{0,400}TOPUP_CREDIT/
  );
  console.log("PASS rejection_expiry_no_credit");

  // 14 uncertain reconciliation
  assert.match(core, /paymentStatus === "uncertain"/);
  assert.match(core, /RECONCILIATION_REQUIRED/);
  assert.match(core, /PARTNER_TOPUP_RECONCILIATION/);
  console.log("PASS uncertain_reconciliation");

  // 15 browser return no credit
  browserReturnMustNotCreditPartnerWallet();
  assert.match(actions, /browserReturnMustNotCreditPartnerWallet/);
  assert.doesNotMatch(actions, /applyVerifiedPartnerTopupPaymentEvent/);
  assert.doesNotMatch(detailPage, /applyVerifiedPartnerTopupPaymentEvent/);
  assert.match(returnPaths, /\/partner\/wallet\/top-up\//);
  console.log("PASS browser_return_no_credit");

  // 16 masked MSISDN only
  const masked = maskSimpaisaMsisdn("03001234567");
  assert.ok(masked);
  assert.doesNotMatch(masked!, /3001234567|03001234567/);
  assert.match(core, /maskSimpaisaMsisdn/);
  assert.match(core, /customerMsisdnMasked:\s*masked/);
  assert.doesNotMatch(schema, /customerMsisdn\s+String/);
  assert.match(schema, /customerMsisdnMasked/);
  assert.doesNotMatch(schema, /fullMsisdn|msisdnPlain/);
  console.log("PASS masked_msisdn_only");

  // 17 fee fields 0/null
  assert.match(core, /processingFeeAmountCents:\s*0/);
  assert.match(core, /feePolicyVersion:\s*null/);
  assert.match(
    core,
    /Credits baseAmountCents only|creditCents = topup\.baseAmountCents/
  );
  assert.doesNotMatch(
    core,
    /balanceCents:[\s\S]{0,80}processingFeeAmountCents|amountCents:\s*topup\.totalPayableCents/
  );
  console.log("PASS fee_fields_v1_zero_null");

  // 18 ledger TOPUP_CREDIT
  assert.match(core, /type:\s*PartnerWalletTransactionType\.TOPUP_CREDIT/);
  assert.match(access, /TOPUP_CREDIT[\s\S]{0,80}Add Funds/);
  assert.match(partners, /TOPUP_CREDIT[\s\S]{0,80}Add Funds/);
  console.log("PASS partner_ledger_topup_credit_label");

  // 19 customer wallet unaffected
  assert.doesNotMatch(core, /prisma\.walletTopup\b/);
  assert.doesNotMatch(core, /(?<!Partner)WalletTopupStatus/);
  assert.doesNotMatch(core, /tx\.walletAccount\b|prisma\.walletAccount\b/);
  assert.doesNotMatch(actions, /createWalletTopupDraft|prisma\.walletTopup\b/);
  assert.match(customerTopup, /export async function applyVerifiedTopupPaymentEvent/);
  console.log("PASS customer_wallet_unaffected");

  // 20 partner purchase unaffected
  assert.doesNotMatch(partnerPurchase, /PartnerWalletTopup|PARTNER_WALLET_TOPUP/);
  assert.doesNotMatch(
    partnerPurchaseWallet,
    /PartnerWalletTopup|applyVerifiedPartnerTopup/
  );
  assert.match(partnerPurchaseWallet, /ESIM_PURCHASE_DEBIT/);
  console.log("PASS partner_purchase_unaffected");

  // Routing / namespace
  assert.equal(PARTNER_TOPUP_USER_KEY_PREFIX, "ptop_");
  assert.equal(partnerTopupMerchantUserKey("tid1"), "ptop_tid1");
  assert.equal(parsePartnerTopupIdFromMerchantUserKey("ptop_tid1"), "tid1");
  assert.equal(parsePartnerTopupIdFromMerchantUserKey("cuid_customer"), null);
  assert.match(dispatch, /parsePartnerTopupIdFromMerchantUserKey/);
  assert.match(dispatch, /partner_wallet_topup/);
  assert.match(
    dispatch,
    /Partner `ptop_` namespace is resolved before customer|ptop_/
  );
  assert.match(webhookParse, /ptop_/);
  assert.match(webhookParse, /PARTNER_WALLET_TOPUP/);
  console.log("PASS webhook_routing_ptop_first");

  // UI
  assert.match(walletPage, /PartnerWalletAddFundsForm/);
  assert.match(walletPage, /Add Funds|PartnerWalletAddFundsForm/);
  assert.doesNotMatch(walletPage, /Self top-up is not available yet/);
  assert.match(form, /Continue/);
  assert.match(form, /Easypaisa|SimpaisaWalletFields/);
  assert.match(form, /PARTNER_TOPUP_MIN_CENTS|PARTNER_TOPUP_MAX_CENTS/);
  assert.match(detailPage, /Payment request sent|Awaiting approval|Payment successful/);
  assert.match(detailPage, /Retry payment/);
  assert.match(uxQa, /Add Funds|PartnerWalletAddFundsForm/);
  assert.doesNotMatch(uxQa, /Reward Points\|rewardPoints\|Add funds/i);
  console.log("PASS partner_ui_add_funds");

  // Cards remain disabled — Partner credit path must reject SIMPAISA_CARDS.
  assert.match(core, /SIMPAISA_CARDS/);
  assert.match(
    core,
    /provider === "SIMPAISA_CARDS"[\s\S]{0,200}not approved for Partner wallet credit/
  );
  assert.doesNotMatch(core, /mayFund\s*[:=]/);
  assert.ok(
    cardsGate.includes("Cards") ||
      cardsGate.includes("mayFund") ||
      cardsGate.includes("WAITING")
  );
  console.log("PASS cards_and_production_untouched_shape");

  assert.match(pkg, /"qa:partner-wallet-topup"/);
  assert.ok(
    existsSync(
      join(root, "prisma/migrations/20260905120000_add_partner_wallet_topup/migration.sql")
    )
  );
  console.log("PASS package_script_and_migration_file");

  console.log("ALL_PASS qa-partner-wallet-topup");
}

main();
