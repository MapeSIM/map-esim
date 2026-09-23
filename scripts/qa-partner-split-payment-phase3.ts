/**
 * Offline QA for Partner eSIM split payment Phase 3
 * (pesim_ webhook verify → attempt confirm → FUNDED → VeSIM).
 * Does not call VeSIM, gateways, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parsePartnerEsimPurchaseAttemptIdFromMerchantUserKey,
  partnerEsimPurchaseMerchantUserKey,
  PARTNER_ESIM_PAYMENT_FAILED,
  PARTNER_ESIM_PAYMENT_RECONCILIATION,
  PARTNER_ESIM_PAYMENT_WEBHOOK_DUPLICATE,
  PARTNER_ESIM_PURCHASE_FUNDED,
  PARTNER_ESIM_PURCHASE_USER_KEY_PREFIX,
} from "../app/lib/partner/partnerEsimPurchasePaymentConstants";
import {
  calculatePartnerPurchaseFunding,
  partnerPurchaseRequiresGateway,
} from "../app/lib/partner/partnerPurchaseFunding";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  console.log("1) Constants + merchant key namespace");
  assert.equal(PARTNER_ESIM_PURCHASE_USER_KEY_PREFIX, "pesim_");
  assert.equal(
    partnerEsimPurchaseMerchantUserKey("att_abc"),
    "pesim_att_abc"
  );
  assert.equal(
    parsePartnerEsimPurchaseAttemptIdFromMerchantUserKey("pesim_att_abc"),
    "att_abc"
  );
  assert.equal(
    parsePartnerEsimPurchaseAttemptIdFromMerchantUserKey("ptop_x"),
    null
  );
  assert.equal(PARTNER_ESIM_PURCHASE_FUNDED, "partner.esim_purchase_funded");
  assert.equal(
    PARTNER_ESIM_PAYMENT_WEBHOOK_DUPLICATE,
    "partner.esim_purchase_payment_webhook_duplicate"
  );
  assert.equal(
    PARTNER_ESIM_PAYMENT_FAILED,
    "partner.esim_purchase_payment_failed"
  );
  assert.equal(
    PARTNER_ESIM_PAYMENT_RECONCILIATION,
    "partner.esim_purchase_payment_reconciliation"
  );
  console.log("   ok");

  console.log("2) Funding kinds still stable (wallet / split / gateway)");
  const split = calculatePartnerPurchaseFunding({
    partnerChargeCents: 1000,
    walletBalanceCents: 250,
    useWallet: true,
  });
  assert.equal(split.fundingKind, "split");
  assert.equal(partnerPurchaseRequiresGateway(split), true);
  const walletOnly = calculatePartnerPurchaseFunding({
    partnerChargeCents: 1000,
    walletBalanceCents: 5000,
    useWallet: true,
  });
  assert.equal(walletOnly.fundingKind, "wallet_only");
  assert.equal(partnerPurchaseRequiresGateway(walletOnly), false);
  const gatewayOnly = calculatePartnerPurchaseFunding({
    partnerChargeCents: 1000,
    walletBalanceCents: 0,
    useWallet: true,
  });
  assert.equal(gatewayOnly.fundingKind, "gateway_only");
  assert.equal(partnerPurchaseRequiresGateway(gatewayOnly), true);
  const gatewayOnlyExplicit = calculatePartnerPurchaseFunding({
    partnerChargeCents: 1000,
    walletBalanceCents: 500,
    useWallet: false,
  });
  assert.equal(gatewayOnlyExplicit.fundingKind, "gateway_only");
  assert.equal(gatewayOnlyExplicit.walletAppliedCents, 0);
  assert.equal(gatewayOnlyExplicit.gatewayAmountCents, 1000);
  console.log("   ok");

  const apply = read("app/lib/partner/partnerEsimPurchasePaymentApply.ts");
  const dispatch = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const provider = read("app/lib/partner/partnerEsimPurchaseProvider.ts");
  const buy = read("app/lib/partner/partnerPurchaseBuy.ts");
  const gateway = read("app/lib/partner/partnerEsimPurchaseGatewayCheckout.ts");
  const webhookRoute = read("app/api/payments/simpaisa/webhook/route.ts");
  const webhookParse = read("app/lib/payments/simpaisaWebhookParse.ts");
  const customerApply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const customerBuy = read("app/lib/esim/walletPurchase.ts");
  const discount = read("app/lib/partner/partnerEsimPurchase.ts");
  const pkg = read("package.json");

  console.log("3) Webhook dispatch wires PARTNER_ESIM_PURCHASE → apply");
  assert.match(dispatch, /kind: "partner_esim_purchase"/);
  assert.match(
    dispatch,
    /purpose === "PARTNER_ESIM_PURCHASE"[\s\S]*applyVerifiedPartnerEsimPurchasePaymentEvent/
  );
  assert.doesNotMatch(
    dispatch,
    /Partner eSIM split checkout — funding apply is Phase 3\. Fail closed/
  );
  assert.match(dispatch, /applyVerifiedPartnerEsimPurchasePaymentEvent/);
  assert.match(webhookRoute, /applyVerifiedPaymentEvent/);
  assert.match(webhookParse, /pesim_/);
  assert.match(webhookParse, /PARTNER_ESIM_PURCHASE/);
  console.log("   ok");

  console.log("4) Attempt confirm → AWAITING_GATEWAY_PAYMENT → FUNDED");
  assert.match(apply, /export async function applyVerifiedPartnerEsimPurchasePaymentEvent/);
  assert.match(apply, /PAYMENT_CONFIRMED/);
  assert.match(apply, /webhookEventId/);
  assert.match(
    apply,
    /AWAITING_GATEWAY_PAYMENT[\s\S]*status:\s*PartnerEsimPurchaseStatus\.FUNDED/
  );
  assert.match(apply, /PARTNER_ESIM_PURCHASE_FUNDED/);
  assert.match(apply, /PARTNER_ESIM_PAYMENT_WEBHOOK_DUPLICATE/);
  assert.match(apply, /outcome:\s*"duplicate"/);
  assert.match(apply, /amount_currency_mismatch|PARTNER_ESIM_PAYMENT_RECONCILIATION/);
  console.log("   ok");

  console.log("5) FUNDED → VeSIM only after claim; never before FUNDED");
  assert.match(apply, /export async function fulfillFundedPartnerEsimPurchase/);
  assert.match(
    apply,
    /status !== PartnerEsimPurchaseStatus\.FUNDED[\s\S]*return \{ ok: false \}/
  );
  assert.match(
    apply,
    /FUNDED[\s\S]*PROVIDER_PENDING[\s\S]*executePartnerEsimProviderPurchase/
  );
  // Gateway checkout start must never call VeSIM.
  assert.doesNotMatch(
    gateway,
    /executePartnerEsimProviderPurchase|executeCreditCheckout/
  );
  assert.match(gateway, /AWAITING_GATEWAY_PAYMENT/);
  assert.match(gateway, /browserReturnMustNotFundPartnerEsimPurchase/);
  // Apply must not call provider before the FUNDED CAS claim.
  const fulfillIdx = apply.indexOf(
    "export async function fulfillFundedPartnerEsimPurchase"
  );
  assert.ok(fulfillIdx >= 0);
  const fulfillBody = apply.slice(fulfillIdx, fulfillIdx + 3500);
  assert.match(fulfillBody, /status: PartnerEsimPurchaseStatus\.FUNDED/);
  assert.match(fulfillBody, /PROVIDER_PENDING/);
  assert.match(fulfillBody, /executePartnerEsimProviderPurchase/);
  const providerCallIdx = fulfillBody.indexOf(
    "executePartnerEsimProviderPurchase"
  );
  const fundedClaimIdx = fulfillBody.indexOf(
    "status: PartnerEsimPurchaseStatus.FUNDED"
  );
  assert.ok(
    fundedClaimIdx >= 0 &&
      providerCallIdx > fundedClaimIdx,
    "VeSIM must run only after FUNDED claim"
  );
  console.log("   ok");

  console.log("6) Idempotent webhook + no duplicate orders");
  assert.match(apply, /findUnique\(\s*\{\s*where:\s*\{\s*webhookEventId/);
  assert.match(apply, /P2002/);
  assert.match(apply, /duplicate:\s*true/);
  assert.match(
    apply,
    /COMPLETED[\s\S]*orderId[\s\S]*duplicate:\s*true/
  );
  // Provider claim is single-flight; gateway-only allowed without debit.
  assert.match(provider, /claimPartnerProviderExecution/);
  assert.match(provider, /walletAppliedCents:\s*0/);
  assert.match(provider, /gatewayAmountCents:\s*\{\s*gt:\s*0\s*\}/);
  assert.match(provider, /gatewayOnlyFunded/);
  // Confirmed-failure refund uses walletAppliedCents only (not full charge).
  assert.match(
    provider,
    /refundAmountCents\s*=\s*current\.walletAppliedCents/
  );
  assert.doesNotMatch(
    provider.slice(
      provider.indexOf("async function refundConfirmedProviderFailure"),
      provider.indexOf("async function refundConfirmedProviderFailure") + 2500
    ),
    /amountCents:\s*options\.partnerChargeCents/
  );
  console.log("   ok");

  console.log("7) Wallet-only path unchanged");
  assert.match(buy, /reservePartnerEsimPurchase/);
  assert.match(buy, /executePartnerEsimProviderPurchase/);
  assert.match(buy, /isPartnerEsimSplitPaymentEnabled/);
  // Flag-off / full wallet still reserves then executes without gateway.
  assert.match(
    buy,
    /full wallet coverage → fall through to wallet-only path|else: full wallet/
  );
  assert.match(buy, /status === PartnerEsimPurchaseStatus\.PROVIDER_PENDING/);
  console.log("   ok");

  console.log("8) Customer checkout + admin discount untouched");
  assert.doesNotMatch(
    apply,
    /WalletEsimPurchase|applyVerifiedEsimPurchasePaymentEvent|fulfillFundedEsimPurchase/
  );
  assert.doesNotMatch(gateway, /WalletEsimPurchase|esimPurchasePaymentAttempt\b/);
  assert.doesNotMatch(buy, /WalletEsimPurchase|startEsimPurchaseHostedCheckout/);
  assert.match(customerApply, /export async function applyVerifiedEsimPurchasePaymentEvent/);
  assert.match(customerApply, /export async function fulfillFundedEsimPurchase/);
  assert.match(customerBuy, /export async function/);
  assert.match(discount, /discountBps|discountVersion/);
  assert.doesNotMatch(apply, /discountBps|adminDiscount|setPartnerDiscount/);
  console.log("   ok");

  console.log("9) Package script");
  assert.match(pkg, /qa:partner-split-payment-phase3/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=partner-split-payment-phase3");
}

main();
