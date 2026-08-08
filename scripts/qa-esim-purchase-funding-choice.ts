/**
 * Offline QA for Phase PG2 wallet-choice + checkout UX / Buy Now routing.
 * Does not call VeSIM, gateways, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calculatePurchaseFunding,
  PurchaseFundingError,
} from "../app/lib/esim/purchaseFunding";
import { parseUseWalletChoice } from "../app/lib/esim/walletPurchaseValidation";
import { CARD_PAYMENT_UNAVAILABLE_MESSAGE } from "../app/lib/esim/walletPurchaseFormState";
import {
  postSignInPath,
  resolvePostSignInPath,
  safeCallbackPath,
} from "../app/lib/auth/redirects";
import { resolveCheckoutBackHref } from "../app/lib/plans/checkoutBackHref";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const actions = read("app/lib/esim/walletPurchaseActions.ts");
  const service = read("app/lib/esim/walletPurchase.ts");
  const confirmForm = read(
    "app/components/account/WalletPurchaseConfirmForm.tsx"
  );
  const selectForm = read(
    "app/components/account/WalletPurchaseSelectForm.tsx"
  );
  const buyPage = read("app/account/esim/buy/page.tsx");
  const reviewPage = read("app/account/esim/buy/review/page.tsx");
  const readSrc = read("app/lib/esim/walletPurchaseRead.ts");
  const accountLayout = read("app/account/layout.tsx");
  const accountMenu = read("app/components/account/AccountMenu.tsx");
  const redirects = read("app/lib/auth/redirects.ts");
  const signinPage = read("app/signin/page.tsx");
  const googleSignIn = read("app/lib/auth/googleSignInAction.ts");
  const checkoutBack = read("app/lib/plans/checkoutBackHref.ts");
  const planUtils = read("app/lib/plans/plan-utils.ts");
  const navbar = read("app/components/Navbar.tsx");
  const disabledAdapter = read("app/lib/payments/disabledAdapter.ts");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const pkg = read("package.json");

  const cases = [
    {
      name: "partial_wallet_selected",
      price: 500,
      balance: 100,
      useWallet: true,
      wallet: 100,
      gateway: 400,
    },
    {
      name: "wallet_not_selected",
      price: 500,
      balance: 100,
      useWallet: false,
      wallet: 0,
      gateway: 500,
    },
    {
      name: "exact_wallet_selected",
      price: 500,
      balance: 500,
      useWallet: true,
      wallet: 500,
      gateway: 0,
    },
    {
      name: "surplus_wallet_selected",
      price: 500,
      balance: 1000,
      useWallet: true,
      wallet: 500,
      gateway: 0,
    },
  ] as const;

  for (const c of cases) {
    const result = calculatePurchaseFunding({
      priceCents: c.price,
      walletBalanceCents: c.balance,
      useWallet: c.useWallet,
    });
    assert.equal(result.walletAppliedCents, c.wallet, c.name);
    assert.equal(result.gatewayAmountCents, c.gateway, c.name);
    assert.equal(
      result.walletAppliedCents + result.gatewayAmountCents,
      c.price,
      `${c.name}_sum`
    );
    console.log(`PASS funding_math_${c.name}`);
  }

  assert.equal(parseUseWalletChoice("on"), true);
  assert.equal(parseUseWalletChoice("true"), true);
  assert.equal(parseUseWalletChoice(null), false);
  assert.equal(parseUseWalletChoice("off"), false);
  console.log("PASS useWallet_boolean_parser");

  assert.match(actions, /setWalletPurchaseFundingChoice/);
  assert.match(actions, /parseUseWalletChoice\(formData\.get\("useWallet"\)\)/);
  assert.match(actions, /void formData\.get\("walletAppliedCents"\)/);
  assert.match(actions, /void formData\.get\("gatewayAmountCents"\)/);
  assert.match(actions, /void formData\.get\("priceCents"\)/);
  assert.match(actions, /CARD_PAYMENT_UNAVAILABLE_MESSAGE/);
  assert.match(actions, /funding\.gatewayAmountCents > 0/);
  assert.match(actions, /startEsimPurchaseHostedCheckout/);
  assert.match(actions, /isPaymentGatewayConfigured/);
  assert.doesNotMatch(actions, /SPLIT_PAYMENT_UNAVAILABLE_MESSAGE/);
  assert.ok(
    actions.indexOf("funding.gatewayAmountCents > 0") <
      actions.indexOf("confirmWalletEsimPurchase({")
  );
  assert.ok(
    actions.indexOf("startEsimPurchaseHostedCheckout") <
      actions.indexOf("confirmWalletEsimPurchase({")
  );
  console.log("PASS server_accepts_useWallet_only_and_gates_gateway");

  assert.match(service, /export async function setWalletPurchaseFundingChoice/);
  assert.match(service, /status:\s*WalletEsimPurchaseStatus\.READY/);
  assert.match(service, /calculatePurchaseFunding/);
  assert.match(service, /OrderFundingSource\.DIRECT_PAYMENT/);
  assert.match(service, /OrderFundingSource\.CUSTOMER_SPLIT/);
  assert.match(service, /OrderFundingSource\.CUSTOMER_WALLET/);
  assert.ok(
    !/AWAITING_GATEWAY_PAYMENT/.test(
      service.split("setWalletPurchaseFundingChoice")[1]?.slice(0, 2500) ?? ""
    )
  );
  assert.match(service, /Does not reserve wallet funds/);
  console.log("PASS funding_choice_stays_ready_no_reserve");

  // Direct Buy Now: valid offerId prepares and redirects to review (no selector first).
  assert.match(planUtils, /\/account\/esim\/buy\?/);
  assert.match(planUtils, /offerId/);
  assert.match(buyPage, /searchParams/);
  assert.match(buyPage, /normalizeOfferId/);
  assert.match(buyPage, /prepareWalletEsimPurchase/);
  assert.match(buyPage, /redirect\(reviewPath/);
  assert.match(buyPage, /WalletPurchaseSelectForm/);
  assert.match(buyPage, />Buy eSIM</);
  assert.doesNotMatch(buyPage, /Buy eSIM with wallet/);
  assert.match(buyPage, /That package is no longer available/);
  console.log("PASS direct_buy_now_prepare_and_redirect");

  // Generic entry points keep package selection; navbar stays Get eSIM.
  assert.match(navbar, /Get eSIM/);
  assert.match(navbar, /href="\/account\/esim\/buy"/);
  assert.match(accountLayout, /label: "Buy eSIM"/);
  assert.match(accountLayout, /AccountMenu/);
  assert.doesNotMatch(accountLayout, /Buy with wallet/);
  assert.doesNotMatch(accountLayout, /lg:grid-cols-\[220px/);
  assert.doesNotMatch(accountLayout, /<aside/);
  assert.match(accountMenu, /Open account menu/);
  assert.match(accountMenu, /aria-expanded/);
  assert.match(accountMenu, /Sign out/);
  assert.match(accountMenu, /usePathname/);
  assert.match(selectForm, /Continue to checkout/);
  assert.match(selectForm, /Wallet funding is optional at checkout/);
  console.log("PASS generic_buy_and_compact_account_menu");

  // Normal sign-in → `/`; protected callbackUrl preserved; no open redirect.
  assert.equal(postSignInPath("CUSTOMER"), "/");
  assert.equal(postSignInPath("ADMIN"), "/admin");
  assert.equal(resolvePostSignInPath("CUSTOMER"), "/");
  assert.equal(resolvePostSignInPath("CUSTOMER", ""), "/");
  assert.equal(
    resolvePostSignInPath("CUSTOMER", "/account/esim/buy?offerId=abc"),
    "/account/esim/buy?offerId=abc"
  );
  assert.equal(
    resolvePostSignInPath("CUSTOMER", "/account/esim/buy/review?purchase=x"),
    "/account/esim/buy/review?purchase=x"
  );
  assert.equal(
    resolvePostSignInPath("CUSTOMER", "https://evil.example/phish"),
    "/"
  );
  assert.equal(resolvePostSignInPath("CUSTOMER", "//evil.example"), "/");
  assert.equal(safeCallbackPath("https://evil.example", "/"), "/");
  // Auth.js absolute same-site callbackUrl → internal path (+ offerId)
  assert.equal(
    safeCallbackPath(
      "http://localhost:3000/account/esim/buy?offerId=abc",
      "/",
      { requestOrigin: "http://localhost:3000" }
    ),
    "/account/esim/buy?offerId=abc"
  );
  assert.match(redirects, /return role === "ADMIN" \? "\/admin" : "\/"/);
  assert.match(signinPage, /callbackUrl \|\| "\/"/);
  assert.match(signinPage, /readRequestOrigin/);
  assert.match(googleSignIn, /safeCallbackPath\(rawCallback, "\/"/);
  assert.match(googleSignIn, /readRequestOrigin/);
  assert.match(buyPage, /buildWalletBuyReturnPath/);
  console.log("PASS normal_signin_home_and_callback_preserved");

  assert.match(reviewPage, />Checkout</);
  assert.match(reviewPage, /Review your plan and choose how to fund/);
  assert.match(reviewPage, /resolveCheckoutBackHref/);
  assert.doesNotMatch(reviewPage, /Buy eSIM with wallet/);
  assert.match(readSrc, /customerEmail/);
  assert.match(readSrc, /destinationCode/);
  assert.match(readSrc, /deliveryLabel/);
  assert.match(readSrc, /paymentGatewayConfigured/);
  assert.match(readSrc, /walletAppliedCents/);
  assert.match(readSrc, /gatewayAmountCents/);
  assert.match(checkoutBack, /Never trusts client-supplied return URLs/);
  assert.equal(
    resolveCheckoutBackHref({ destinationCode: "PK" }).href,
    "/countries/pakistan"
  );
  assert.equal(
    resolveCheckoutBackHref({ destinationName: "Pakistan" }).href,
    "/countries/pakistan"
  );
  assert.equal(
    resolveCheckoutBackHref({}).href,
    "/account/esim/buy"
  );
  console.log("PASS checkout_heading_and_country_back_nav");

  assert.match(confirmForm, /Plan summary/);
  assert.match(confirmForm, /Customer/);
  assert.match(confirmForm, /customerEmail/);
  assert.match(confirmForm, /Use wallet balance/);
  assert.match(confirmForm, /Order summary/);
  assert.match(confirmForm, /Wallet applied/);
  assert.match(confirmForm, /Pay now/);
  assert.match(confirmForm, /calculatePurchaseFunding/);
  assert.match(confirmForm, /previewPurchaseFunding/);
  assert.match(confirmForm, /setWalletPurchaseFundingChoiceAction/);
  assert.match(confirmForm, /gatewayRequired/);
  assert.match(confirmForm, /walletFundsApplied/);
  assert.match(confirmForm, /fullWallet = !gatewayRequired && walletFundsApplied/);
  assert.match(confirmForm, /Payment method/);
  assert.match(confirmForm, /CARD_PAYMENT_UNAVAILABLE_MESSAGE/);
  assert.match(confirmForm, /Continue to Payment/);
  assert.match(confirmForm, /Continue to Secure Payment/);
  assert.match(confirmForm, /paymentGatewayConfigured/);
  assert.match(confirmForm, /gatewayReady/);
  assert.doesNotMatch(confirmForm, /partialWalletSplit/);
  assert.match(confirmForm, /type="button"/);
  assert.match(confirmForm, /Buy eSIM with Wallet/);
  assert.match(confirmForm, /\{gatewayRequired \?/);
  assert.doesNotMatch(
    confirmForm,
    /walletAppliedCents:\s*0,\s*gatewayAmountCents:\s*review\.priceCents/
  );
  assert.ok(!/createCheckoutSession|fake payment|Apple Pay|Google Pay|Promo Code|VReward/i.test(confirmForm));
  assert.ok(!/JazzCash|EasyPaisa/i.test(confirmForm));
  console.log("PASS checkout_structure_and_fail_closed_cta");

  assert.ok(
    /export function isPaymentGatewayConfigured\(\): boolean \{[\s\S]*PAYMENT_GATEWAY_ENABLED[\s\S]*tryCreateSafepayAdapter[\s\S]*return created\.ok;[\s\S]*\}/.test(
      disabledAdapter
    )
  );
  assert.match(guestGate, /ENABLE_GUEST_VESIM_CHECKOUT === "true"/);
  assert.match(pkg, /"qa:esim-purchase-funding-choice"/);
  assert.equal(
    CARD_PAYMENT_UNAVAILABLE_MESSAGE,
    "Online payment will be available once payment setup is completed."
  );
  console.log("PASS gateway_guest_still_disabled");

  // Self-service prepare allows partial balance; assisted still requires full wallet.
  assert.match(service, /isAssisted && wallet\.balanceCents < snapshot\.priceCents/);
  assert.match(service, /calculatePurchaseFunding\(\{[\s\S]*useWallet:\s*true/);
  console.log("PASS prepare_allows_partial_for_self_service");

  assert.throws(
    () =>
      calculatePurchaseFunding({
        priceCents: -1,
        walletBalanceCents: 100,
        useWallet: true,
      }),
    (e: unknown) => e instanceof PurchaseFundingError
  );
  console.log("PASS funding_rejects_invalid_price");

  console.log("ALL_PG2_CHECKS_PASSED");
}

main();
