/**
 * Offline QA for Partner eSIM split payment Phase 2 (funding + checkout start).
 * Does not call VeSIM, gateways, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calculatePartnerPurchaseFunding,
  partnerPurchaseRequiresGateway,
} from "../app/lib/partner/partnerPurchaseFunding";
import {
  isPartnerEsimSplitPaymentEnabled,
  PARTNER_ESIM_SPLIT_PAYMENT_ENABLED_ENV,
} from "../app/lib/partner/partnerEsimSplitPaymentPolicy";
import {
  partnerEsimGatewayCheckoutIdempotencyKey,
  partnerEsimPurchaseMerchantUserKey,
  PARTNER_ESIM_PURCHASE_USER_KEY_PREFIX,
} from "../app/lib/partner/partnerEsimPurchasePaymentConstants";
import {
  isPartnerEsimPurchasePaymentCancelPath,
  isPartnerEsimPurchasePaymentReturnPath,
  partnerEsimPurchasePaymentCancelPath,
  partnerEsimPurchasePaymentReturnPath,
} from "../app/lib/partner/partnerEsimPurchaseCheckoutPaths";
import { resolvePartnerPaymentReturnKind } from "../app/lib/partner/partnerEsimPurchasePaymentReturnState";
import {
  parsePartnerEsimPaymentMode,
  resolvePartnerCheckoutUseWallet,
  useWalletFromPartnerPaymentMode,
} from "../app/lib/partner/partnerPurchaseValidation";
import { resolvePartnerPaymentModeVisibility } from "../app/lib/partner/partnerPaymentModeUi";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  console.log("1) Funding math (partnerChargeCents base)");
  const cases = [
    {
      name: "partial",
      charge: 1000,
      balance: 250,
      wallet: 250,
      gateway: 750,
      kind: "split" as const,
    },
    {
      name: "full_wallet",
      charge: 1000,
      balance: 1000,
      wallet: 1000,
      gateway: 0,
      kind: "wallet_only" as const,
    },
    {
      name: "surplus_wallet",
      charge: 1000,
      balance: 5000,
      wallet: 1000,
      gateway: 0,
      kind: "wallet_only" as const,
    },
    {
      name: "zero_wallet",
      charge: 1000,
      balance: 0,
      wallet: 0,
      gateway: 1000,
      kind: "gateway_only" as const,
    },
  ];
  for (const c of cases) {
    const f = calculatePartnerPurchaseFunding({
      partnerChargeCents: c.charge,
      walletBalanceCents: c.balance,
      useWallet: true,
    });
    assert.equal(f.walletAppliedCents, c.wallet, c.name);
    assert.equal(f.gatewayAmountCents, c.gateway, c.name);
    assert.equal(f.fundingKind, c.kind, c.name);
    assert.equal(
      partnerPurchaseRequiresGateway(f),
      c.gateway > 0,
      `${c.name}_requires_gateway`
    );
    assert.equal(
      f.walletAppliedCents + f.gatewayAmountCents,
      c.charge,
      `${c.name}_sum`
    );
  }
  const noWallet = calculatePartnerPurchaseFunding({
    partnerChargeCents: 800,
    walletBalanceCents: 800,
    useWallet: false,
  });
  assert.equal(noWallet.walletAppliedCents, 0);
  assert.equal(noWallet.gatewayAmountCents, 800);
  assert.equal(noWallet.fundingKind, "gateway_only");
  console.log("   ok");

  console.log("2) Feature flag default off");
  assert.equal(isPartnerEsimSplitPaymentEnabled({}), false);
  assert.equal(
    isPartnerEsimSplitPaymentEnabled({
      [PARTNER_ESIM_SPLIT_PAYMENT_ENABLED_ENV]: "true",
    }),
    true
  );
  assert.equal(
    isPartnerEsimSplitPaymentEnabled({
      [PARTNER_ESIM_SPLIT_PAYMENT_ENABLED_ENV]: "false",
    }),
    false
  );
  assert.equal(
    isPartnerEsimSplitPaymentEnabled({
      [PARTNER_ESIM_SPLIT_PAYMENT_ENABLED_ENV]: "1",
    }),
    false
  );
  console.log("   ok");

  console.log("3) Merchant key + return paths");
  assert.equal(
    partnerEsimPurchaseMerchantUserKey("attempt_1"),
    `${PARTNER_ESIM_PURCHASE_USER_KEY_PREFIX}attempt_1`
  );
  assert.match(
    partnerEsimGatewayCheckoutIdempotencyKey("abc_key"),
    /:partner-esim-gw$/
  );
  const ret = partnerEsimPurchasePaymentReturnPath("att_123");
  const can = partnerEsimPurchasePaymentCancelPath("att_123");
  assert.equal(isPartnerEsimPurchasePaymentReturnPath(ret), true);
  assert.equal(isPartnerEsimPurchasePaymentCancelPath(can), true);
  assert.equal(isPartnerEsimPurchasePaymentReturnPath("/account/esim/buy/payment/return/x"), false);
  console.log("   ok");

  console.log("4) Source wiring — wallet-only when flag off; no VeSIM before pay");
  const buy = read("app/lib/partner/partnerPurchaseBuy.ts");
  const gateway = read("app/lib/partner/partnerEsimPurchaseGatewayCheckout.ts");
  const actions = read("app/lib/partner/partnerPurchaseActions.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const types = read("app/lib/payments/types.ts");
  const adapter = read("app/lib/payments/simpaisaAdapter.ts");
  const webhook = read("app/lib/payments/simpaisaWebhookParse.ts");
  const safeUrls = read("app/lib/payments/safepayCheckoutUrls.ts");
  const envExample = read(".env.example");
  const pkg = read("package.json");

  assert.match(buy, /isPartnerEsimSplitPaymentEnabled/);
  assert.match(buy, /startPartnerEsimPurchaseHostedCheckout/);
  assert.match(buy, /checkout_redirect/);
  assert.match(buy, /reservePartnerEsimPurchase/);
  assert.match(buy, /executePartnerEsimProviderPurchase/);
  assert.match(buy, /setPartnerPurchaseFundingChoice/);
  // Wallet-only path still present; gateway path must not call provider.
  assert.doesNotMatch(gateway, /executePartnerEsimProviderPurchase|executeCreditCheckout/);
  assert.match(gateway, /AWAITING_GATEWAY_PAYMENT/);
  assert.match(gateway, /reservePartnerPurchaseFundsInTx/);
  assert.match(gateway, /partnerEsimPurchasePaymentAttempt\.create/);
  assert.match(gateway, /purpose:\s*"PARTNER_ESIM_PURCHASE"/);
  assert.match(gateway, /browserReturnMustNotFundPartnerEsimPurchase/);
  assert.match(gateway, /input\.useWallet/);
  assert.match(gateway, /purchase\.useWallet/);

  assert.match(actions, /checkout_redirect/);
  assert.match(actions, /redirect\(result\.checkoutUrl\)/);
  assert.match(actions, /walletOperatorId/);
  assert.match(actions, /void formData\.get\("walletAppliedCents"\)/);
  assert.match(actions, /void formData\.get\("gatewayAmountCents"\)/);
  assert.match(actions, /resolvePartnerCheckoutUseWallet/);
  assert.match(actions, /setPartnerPurchaseFundingChoiceAction/);
  assert.match(actions, /useWallet:\s*resolved\.useWallet/);

  assert.match(types, /PARTNER_ESIM_PURCHASE/);
  assert.match(adapter, /PARTNER_ESIM_PURCHASE/);
  assert.match(adapter, /partnerEsimPurchaseMerchantUserKey/);
  assert.match(webhook, /pesim_/);
  assert.match(webhook, /PARTNER_ESIM_PURCHASE/);
  // Phase 2 left apply fail-closed; Phase 3 wires apply — this script still
  // asserts checkout start only (no VeSIM in gateway checkout).
  assert.match(apply, /purpose === "PARTNER_ESIM_PURCHASE"/);
  assert.match(apply, /applyVerifiedPartnerEsimPurchasePaymentEvent/);
  assert.match(safeUrls, /isPartnerEsimPurchasePaymentReturnPath/);
  assert.match(envExample, /PARTNER_ESIM_SPLIT_PAYMENT_ENABLED/);
  assert.match(pkg, /qa:partner-split-payment-phase2/);
  console.log("   ok");

  console.log("5) Customer checkout untouched by partner buy");
  assert.doesNotMatch(buy, /WalletEsimPurchase|startEsimPurchaseHostedCheckout/);
  assert.doesNotMatch(gateway, /WalletEsimPurchase|esimPurchasePaymentAttempt/);
  console.log("   ok");

  console.log("6) Partner payment return UX follows durable statuses");
  const returnPage = read(
    "app/partner/(portal)/catalog/payment/return/[attemptId]/page.tsx"
  );
  const returnView = read(
    "app/partner/(portal)/catalog/payment/return/PartnerEsimPurchasePaymentReturnView.tsx"
  );
  const returnState = read(
    "app/lib/partner/partnerEsimPurchasePaymentReturnState.ts"
  );
  assert.match(gateway, /export async function getOwnedPartnerEsimPurchasePaymentAttempt/);
  assert.match(returnPage, /getOwnedPartnerEsimPurchasePaymentAttempt/);
  assert.match(returnPage, /resolvePartnerPaymentReturnKind/);
  assert.match(returnPage, /browserReturnMustNotFundPartnerEsimPurchase/);
  assert.match(returnPage, /kind === "completed"/);
  assert.doesNotMatch(returnPage, /applyVerifiedPartnerEsimPurchasePaymentEvent/);
  assert.doesNotMatch(returnPage, /executePartnerEsimProviderPurchase/);
  assert.match(returnState, /resolveEsimPaymentReturnKind/);
  assert.match(returnView, /kind === "verified"/);
  assert.match(returnView, /kind === "not_completed"/);
  assert.match(returnView, /kind === "invalid"/);
  assert.match(returnView, /Payment processing/);
  assert.match(returnView, /Payment verified/);
  assert.match(returnView, /Payment not completed/);
  assert.match(returnView, /Payment reference not found/);
  // Must not always claim success regardless of status.
  assert.doesNotMatch(
    returnPage,
    /<h1[^>]*>Payment received<\/h1>/
  );
  assert.equal(
    resolvePartnerPaymentReturnKind({
      purchaseStatus: "FUNDED",
      attemptStatus: "PAYMENT_CONFIRMED",
    }),
    "verified"
  );
  assert.equal(
    resolvePartnerPaymentReturnKind({
      purchaseStatus: "AWAITING_GATEWAY_PAYMENT",
      attemptStatus: "AWAITING_PAYMENT",
    }),
    "pending"
  );
  assert.equal(
    resolvePartnerPaymentReturnKind({
      purchaseStatus: "READY",
      attemptStatus: "CANCELLED",
    }),
    "not_completed"
  );
  assert.equal(
    resolvePartnerPaymentReturnKind({
      purchaseStatus: "AWAITING_GATEWAY_PAYMENT",
      attemptStatus: "FAILED",
    }),
    "not_completed"
  );
  assert.equal(
    resolvePartnerPaymentReturnKind({
      purchaseStatus: "COMPLETED",
      attemptStatus: "PAYMENT_CONFIRMED",
    }),
    "completed"
  );
  console.log("   ok");

  console.log("7) Phase A payment mode + funding choice (no UI)");
  assert.equal(useWalletFromPartnerPaymentMode("full_wallet"), true);
  assert.equal(useWalletFromPartnerPaymentMode("wallet_and_mobile"), true);
  assert.equal(useWalletFromPartnerPaymentMode("mobile_only"), false);
  assert.equal(parsePartnerEsimPaymentMode("full_wallet").ok, true);
  assert.equal(parsePartnerEsimPaymentMode("nope").ok, false);

  const emptyFd = new FormData();
  assert.equal(resolvePartnerCheckoutUseWallet(emptyFd).useWallet, true);
  emptyFd.set("paymentMode", "mobile_only");
  assert.equal(resolvePartnerCheckoutUseWallet(emptyFd).useWallet, false);
  const walletFd = new FormData();
  walletFd.set("paymentMode", "wallet_and_mobile");
  assert.equal(resolvePartnerCheckoutUseWallet(walletFd).useWallet, true);

  const full = calculatePartnerPurchaseFunding({
    partnerChargeCents: 1000,
    walletBalanceCents: 1000,
    useWallet: true,
  });
  assert.equal(full.gatewayAmountCents, 0);
  assert.equal(full.fundingKind, "wallet_only");

  const partial = calculatePartnerPurchaseFunding({
    partnerChargeCents: 1000,
    walletBalanceCents: 250,
    useWallet: true,
  });
  assert.equal(partial.walletAppliedCents, 250);
  assert.equal(partial.gatewayAmountCents, 750);
  assert.equal(partial.fundingKind, "split");

  const zero = calculatePartnerPurchaseFunding({
    partnerChargeCents: 1000,
    walletBalanceCents: 0,
    useWallet: true,
  });
  assert.equal(zero.walletAppliedCents, 0);
  assert.equal(zero.gatewayAmountCents, 1000);
  assert.equal(zero.fundingKind, "gateway_only");

  const mobileOnly = calculatePartnerPurchaseFunding({
    partnerChargeCents: 1000,
    walletBalanceCents: 500,
    useWallet: false,
  });
  assert.equal(mobileOnly.walletAppliedCents, 0);
  assert.equal(mobileOnly.gatewayAmountCents, 1000);
  assert.equal(mobileOnly.fundingKind, "gateway_only");

  const pep = read("app/lib/partner/partnerEsimPurchase.ts");
  assert.match(pep, /export async function setPartnerPurchaseFundingChoice/);
  assert.match(pep, /OrderFundingSource\.PARTNER_BALANCE/);
  assert.match(pep, /OrderFundingSource\.PARTNER_SPLIT/);
  assert.match(pep, /OrderFundingSource\.PARTNER_GATEWAY/);
  assert.match(
    buy,
    /full wallet coverage → fall through to wallet-only path/
  );
  assert.doesNotMatch(buy, /applyVerifiedPartnerEsimPurchasePaymentEvent/);
  assert.doesNotMatch(gateway, /applyVerifiedPartnerEsimPurchasePaymentEvent/);
  console.log("   ok");

  console.log("8) Phase B partner payment UI visibility");
  // Full wallet: Buy with Partner balance + Pay online; never wallet+online.
  const fullVis = resolvePartnerPaymentModeVisibility({
    payableCents: 1000,
    balanceCents: 1000,
    onlinePaymentsAllowed: true,
  });
  assert.equal(fullVis.showFullWalletOption, true);
  assert.equal(fullVis.showWalletAndOnlineOption, false);
  assert.equal(fullVis.showOnlinePaymentOption, true);
  assert.equal(fullVis.defaultMode, "full_wallet");

  const fullVisNoGateway = resolvePartnerPaymentModeVisibility({
    payableCents: 1000,
    balanceCents: 1000,
    onlinePaymentsAllowed: false,
  });
  assert.equal(fullVisNoGateway.showFullWalletOption, true);
  assert.equal(fullVisNoGateway.showWalletAndOnlineOption, false);
  assert.equal(fullVisNoGateway.showOnlinePaymentOption, false);
  assert.equal(fullVisNoGateway.defaultMode, "full_wallet");

  const partialVis = resolvePartnerPaymentModeVisibility({
    payableCents: 1000,
    balanceCents: 250,
    onlinePaymentsAllowed: true,
  });
  assert.equal(partialVis.showFullWalletOption, false);
  assert.equal(partialVis.showWalletAndOnlineOption, true);
  assert.equal(partialVis.showOnlinePaymentOption, true);
  assert.equal(partialVis.defaultMode, "wallet_and_mobile");

  const zeroVis = resolvePartnerPaymentModeVisibility({
    payableCents: 1000,
    balanceCents: 0,
    onlinePaymentsAllowed: true,
  });
  assert.equal(zeroVis.showFullWalletOption, false);
  assert.equal(zeroVis.showWalletAndOnlineOption, false);
  assert.equal(zeroVis.showOnlinePaymentOption, true);
  assert.equal(zeroVis.defaultMode, "mobile_only");

  const catalogUi = read("app/components/partner/PartnerCatalogBuy.tsx");
  const storefrontUi = read("app/components/partner/PartnerStorefrontBuy.tsx");
  const paymentForm = read(
    "app/components/partner/PartnerOfferPaymentForm.tsx"
  );
  const modeUi = read("app/lib/partner/partnerPaymentModeUi.ts");
  assert.match(catalogUi, /PartnerOfferPaymentForm/);
  assert.match(storefrontUi, /PartnerOfferPaymentForm/);
  assert.match(paymentForm, /paymentMode/);
  assert.match(paymentForm, /Buy with Partner balance/);
  assert.match(paymentForm, /Pay online/);
  assert.match(paymentForm, /Continue to payment/);
  assert.match(modeUi, /Never show Wallet \+ online split/);
  assert.doesNotMatch(catalogUi, /partnerChargeCents/);
  assert.doesNotMatch(storefrontUi, /partnerChargeCents/);
  assert.doesNotMatch(paymentForm, /partnerChargeCents/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=partner-split-payment-phase2");
}

main();
