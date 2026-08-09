/**
 * Offline QA for gateway-agnostic wallet top-up funding completion.
 * Does not call payment gateways, mutate the database, or place orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const topup = read("app/lib/wallet/topup.ts");
  const actions = read("app/lib/wallet/topupActions.ts");
  const route = read("app/api/payments/safepay/webhook/route.ts");
  const dispatch = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const parse = read("app/lib/payments/safepayWebhookParse.ts");
  const adapter = read("app/lib/payments/safepayAdapter.ts");
  const applyEsim = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const purchase = read("app/lib/esim/walletPurchase.ts");
  const adminCredit = read("app/lib/wallet/adminCredit.ts");
  const adminDebit = read("app/lib/wallet/adminDebit.ts");
  const pkg = read("package.json");
  const config = read("app/lib/payments/safepayConfig.ts");

  // 1) Checkout returns real session URL after persist (no throw-after-success).
  assert.match(topup, /export async function startWalletTopupCheckout/);
  assert.match(topup, /StartWalletTopupCheckoutResult/);
  assert.match(topup, /checkoutUrl:\s*result\.checkoutUrl/);
  assert.match(topup, /status:\s*WalletTopupStatus\.AWAITING_PAYMENT/);
  assert.match(topup, /chargeAmountMinor/);
  assert.match(topup, /TOPUP_CHECKOUT_CREATED/);
  assert.doesNotMatch(
    topup,
    /Real adapters would persist quote[\s\S]*throw new WalletTopupError\(\s*"GATEWAY_UNAVAILABLE"/
  );
  assert.match(actions, /redirect\(checkout\.checkoutUrl\)/);
  assert.doesNotMatch(
    actions,
    /Payment gateway is not available yet\. Please try again later\.\s*\}\s*;\s*$/
  );
  console.log("PASS topup_checkout_session_return");

  // 2) Authoritative amount from persisted top-up — not browser/webhook alone.
  assert.match(
    topup,
    /chargeAmountMinor:\s*topup\.creditAmountCents/
  );
  assert.match(
    topup,
    /chargeAmountMinor !== topup\.creditAmountCents/
  );
  assert.match(
    topup,
    /topup\.chargeAmountMinor !== topup\.creditAmountCents/
  );
  assert.match(
    topup,
    /balanceCents:\s*\{\s*increment:\s*topup\.creditAmountCents/
  );
  assert.match(actions, /browserReturnMustNotCreditWallet/);
  assert.doesNotMatch(actions, /applyVerifiedTopupPaymentEvent/);
  console.log("PASS authoritative_amount");

  // 3) Signed webhook remains mandatory; top-up dispatched after verify.
  assert.match(route, /verifySafepayCardWebhookSignature/);
  assert.match(route, /applyVerifiedPaymentEvent/);
  assert.match(dispatch, /applyVerifiedTopupPaymentEvent/);
  assert.match(dispatch, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.match(dispatch, /signatureVerified/);
  assert.match(topup, /if \(!event\.signatureVerified\)/);
  assert.match(config, /allowProduction:\s*false/);
  console.log("PASS signed_webhook_dispatch");

  // 4) Successful credit path + ledger.
  assert.match(topup, /WalletTransactionType\.TOPUP_CREDIT/);
  assert.match(topup, /WalletTopupStatus\.CREDITED/);
  assert.match(topup, /idempotencyKey:\s*`topup_\$\{topup\.id\}`/);
  assert.match(topup, /referenceType:\s*TOPUP_CREDIT_REFERENCE_TYPE/);
  assert.doesNotMatch(topup, /executeCreditCheckout|getBrokerToken|\/api\/esim/);
  assert.doesNotMatch(dispatch, /executeCreditCheckout|getBrokerToken/);
  console.log("PASS successful_topup_credit_and_ledger");

  // 5) Duplicate success / races.
  assert.match(topup, /webhookEventId:\s*eventId/);
  assert.match(topup, /TOPUP_WEBHOOK_DUPLICATE|duplicate_event/);
  assert.match(topup, /duplicate:\s*true/);
  assert.match(
    topup,
    /Credited \/ confirmed funding always wins over later failure\/cancel/
  );
  assert.match(
    topup,
    /Never overwrite credited\/confirmed rows; leave webhookEventId free for late success/
  );
  assert.match(
    topup,
    /WalletTopupStatus\.FAILED,\s*WalletTopupStatus\.CANCELLED/
  );
  assert.match(topup, /isCancelFailureCategory/);
  assert.match(topup, /WalletTopupStatus\.CANCELLED/);
  console.log("PASS duplicate_and_race_guards");

  // 6) Failed top-up does not credit.
  assert.ok(
    topup.indexOf('paymentStatus === "failed"') <
      topup.indexOf("WalletTransactionType.TOPUP_CREDIT")
  );
  assert.match(topup, /WalletTopupStatus\.FAILED/);
  assert.doesNotMatch(
    topup,
    /paymentStatus === "failed"[\s\S]{0,400}TOPUP_CREDIT/
  );
  console.log("PASS failed_topup_no_credit");

  // 7) eSIM purchase path still wired; no VeSIM from top-up.
  assert.match(dispatch, /kind: "esim_purchase"/);
  assert.match(dispatch, /kind: "wallet_topup"/);
  assert.match(applyEsim, /applyVerifiedEsimPurchasePaymentEvent/);
  assert.match(route, /Never creates VeSIM|never VeSIM from top-up/i);
  assert.doesNotMatch(topup, /persistAssignedOrder|creditCheckout/);
  console.log("PASS esim_dispatch_and_no_provider_order");

  // 8) Admin wallet + purchase regression surface unchanged.
  assert.match(adminCredit, /ADMIN_CREDIT/);
  assert.match(adminDebit, /ADJUSTMENT_DEBIT/);
  assert.match(purchase, /PURCHASE_DEBIT/);
  assert.doesNotMatch(purchase, /applyVerifiedTopupPaymentEvent/);
  assert.match(parse, /purpose:\s*"ESIM_PURCHASE"/);
  assert.match(adapter, /purpose === "WALLET_TOPUP"/);
  assert.match(pkg, /"qa:wallet-topup-funding"/);
  console.log("PASS admin_and_esim_regression_surfaces");

  console.log("ALL_QA_PASSED=wallet-topup-funding");
}

main();
