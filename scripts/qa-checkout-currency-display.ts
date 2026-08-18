/**
 * Offline QA for customer checkout display-currency presentation.
 * Does not call VeSIM, gateways, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FALLBACK_USD_RATES,
} from "../app/lib/currency/currencies";
import {
  CHECKOUT_DISPLAY_MINUS,
  CHECKOUT_NON_USD_DISPLAY_NOTE,
  applyCheckoutDisplaySign,
  formatCheckoutEstimatedPrimary,
  formatCheckoutUsdSecondaryLabel,
  isCheckoutDisplayUsd,
  usdCentsToCatalogAmount,
} from "../app/lib/currency/checkoutMoney";
import { convertFromUsd, formatMoney } from "../app/lib/currency/format";
import { formatUsdCents } from "../app/lib/wallet/display";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const helper = read("app/lib/currency/checkoutMoney.ts");
  const money = read("app/components/account/CheckoutMoney.tsx");
  const confirmForm = read(
    "app/components/account/WalletPurchaseConfirmForm.tsx"
  );
  const promoSection = read(
    "app/components/account/CheckoutPromoCodeSection.tsx"
  );
  const readSrc = read("app/lib/esim/walletPurchaseRead.ts");
  const service = read("app/lib/esim/walletPurchase.ts");
  const formatSrc = read("app/lib/currency/format.ts");
  const provider = read("app/components/currency/CurrencyProvider.tsx");
  const partnerStore = read("app/components/partner/PartnerStorefrontBuy.tsx");
  const partnerPortal = read("app/partner/(portal)/page.tsx");
  const pkg = read("package.json");

  assert.equal(FALLBACK_USD_RATES.PKR, 293);
  assert.match(helper, /CHECKOUT_NON_USD_DISPLAY_NOTE/);
  assert.match(helper, /usdCentsToCatalogAmount/);
  assert.match(helper, /applyCheckoutDisplaySign/);
  assert.match(helper, /formatCheckoutUsdSecondaryLabel/);
  assert.doesNotMatch(helper, /-\s*cents|cents\s*\*\s*-1/);
  assert.match(formatSrc, /convertFromUsd/);
  assert.match(formatSrc, /formatMoney/);
  assert.match(provider, /formatPrice: \(amountUsd\) => formatMoney\(amountUsd, currency, rates\)/);
  console.log("PASS catalog_formatter_and_pkr_rate_unchanged");

  const cents = 1299;
  assert.equal(usdCentsToCatalogAmount(cents), 12.99);
  assert.equal(formatUsdCents(cents), "$12.99");
  assert.equal(isCheckoutDisplayUsd("USD"), true);
  assert.equal(isCheckoutDisplayUsd("PKR"), false);
  assert.equal(applyCheckoutDisplaySign(formatUsdCents(cents), false), "$12.99");
  assert.equal(
    applyCheckoutDisplaySign(formatUsdCents(cents), true),
    `${CHECKOUT_DISPLAY_MINUS}$12.99`
  );
  assert.equal(
    formatCheckoutUsdSecondaryLabel(cents, "base"),
    "USD base amount: $12.99"
  );
  assert.equal(
    formatCheckoutUsdSecondaryLabel(cents, "wallet-balance"),
    "USD wallet balance: $12.99"
  );
  assert.equal(
    formatCheckoutUsdSecondaryLabel(cents, "wallet-deduction"),
    "USD wallet deduction: $12.99"
  );
  assert.equal(
    formatCheckoutUsdSecondaryLabel(cents, "base", true),
    `USD base amount: ${CHECKOUT_DISPLAY_MINUS}$12.99`
  );
  assert.equal(
    formatCheckoutUsdSecondaryLabel(cents, "wallet-deduction", true),
    `USD wallet deduction: ${CHECKOUT_DISPLAY_MINUS}$12.99`
  );
  const pkrFormatted = formatMoney(12.99, "PKR");
  const pkrPrimary = formatCheckoutEstimatedPrimary(pkrFormatted);
  const pkrSigned = formatCheckoutEstimatedPrimary(pkrFormatted, true);
  assert.match(pkrPrimary, /^Estimated Rs/);
  assert.equal(pkrPrimary, `Estimated ${pkrFormatted}`);
  assert.equal(pkrSigned, `Estimated ${CHECKOUT_DISPLAY_MINUS}${pkrFormatted}`);
  assert.match(pkrSigned, /^Estimated −/);
  assert.doesNotMatch(pkrSigned, /−Estimated/);
  assert.doesNotMatch(pkrPrimary, /−Estimated/);
  assert.doesNotMatch(helper, /−Estimated/);
  assert.doesNotMatch(money, /−Estimated/);
  assert.equal(convertFromUsd(12.99, "PKR"), 12.99 * 293);
  assert.notEqual(pkrPrimary, "Rs12.99");
  assert.notEqual(pkrPrimary, "$12.99".replace("$", "Rs"));
  assert.notEqual(formatMoney(12.99, "EUR"), formatUsdCents(cents));
  console.log("PASS shared_formatter_not_symbol_only");
  console.log("PASS signed_unsigned_display_wording");

  assert.match(money, /useCurrency\(\)/);
  assert.match(money, /formatPrice/);
  assert.match(money, /formatUsdCents\(cents\)/);
  assert.match(money, /isCheckoutDisplayUsd\(currency\)/);
  assert.match(money, /applyCheckoutDisplaySign\(formatUsdCents\(cents\), signed\)/);
  assert.match(money, /formatCheckoutEstimatedPrimary/);
  assert.match(money, /formatCheckoutUsdSecondaryLabel\(cents, variant, signed\)/);
  assert.match(money, /usdCentsToCatalogAmount\(cents\)/);
  assert.match(
    money,
    /formatCheckoutEstimatedPrimary\(\s*formatPrice\(usdCentsToCatalogAmount\(cents\)\),\s*signed\s*\)/
  );
  assert.doesNotMatch(money, /Charged in USD/);
  assert.doesNotMatch(money, /\.replace\(\s*["']\$["']/);
  assert.match(money, /CHECKOUT_NON_USD_DISPLAY_NOTE/);
  assert.equal(
    CHECKOUT_NON_USD_DISPLAY_NOTE,
    "Non-USD amounts are estimated using the current display rate. Order and wallet values remain recorded in USD. Final payment currency will be shown before payment."
  );
  console.log("PASS checkout_money_component_uses_catalog_formatter");

  assert.match(confirmForm, /CheckoutMoney/);
  assert.match(confirmForm, /CheckoutDisplayCurrencyNote/);
  assert.doesNotMatch(confirmForm, /formatUsdCents/);
  assert.doesNotMatch(promoSection, /formatUsdCents/);
  assert.match(promoSection, /CheckoutMoney cents=\{originalCents\}/);
  assert.match(promoSection, /CheckoutMoney cents=\{discountCents\} signed/);
  assert.match(promoSection, /CheckoutMoney cents=\{totalCents\}/);
  console.log("PASS checkout_forms_use_shared_component");

  const moneyRows = [
    ["package total", /<CheckoutMoney cents=\{review\.priceCents\} \/>/],
    ["wallet balance", /variant="wallet-balance"/],
    ["wallet deduction", /variant="wallet-deduction"/],
    ["rewards discount", /CheckoutMoney cents=\{preview\.rewardPointsRedeemed\} signed/],
    ["promo discount", /CheckoutMoney cents=\{review\.promoDiscountCents\} signed/],
    ["pay now", /<CheckoutMoney cents=\{preview\.gatewayAmountCents\} \/>/],
    ["remaining due", /Remaining due:[\s\S]*CheckoutMoney cents=\{preview\.gatewayAmountCents\}/],
    ["rewards value", /CheckoutMoney cents=\{review\.rewardPointsBalance\}/],
  ] as const;
  for (const [name, pattern] of moneyRows) {
    assert.match(confirmForm, pattern, `missing ${name} CheckoutMoney row`);
  }
  assert.match(confirmForm, /Current balance:/);
  assert.match(confirmForm, /Package total/);
  assert.match(confirmForm, /Pay now/);
  assert.match(confirmForm, /Remaining due:/);
  console.log("PASS every_checkout_money_row_uses_checkout_money");

  assert.match(readSrc, /priceCents: row\.priceCents/);
  assert.match(readSrc, /balanceCents,/);
  assert.match(readSrc, /payableCents,/);
  assert.match(readSrc, /promoDiscountCents: row\.promoDiscountCents/);
  assert.match(readSrc, /walletAppliedCents: displayFunding\.walletAppliedCents/);
  assert.match(readSrc, /gatewayAmountCents: displayFunding\.gatewayAmountCents/);
  assert.match(readSrc, /Checkout review presents these integer cents via CheckoutMoney/);
  assert.match(
    service,
    /formatWalletPurchasePriceLabel\(cents: number\): string \{\s*return `\$\{formatUsdCents\(cents\)\} USD`;/
  );
  assert.match(service, /if \(currency !== "USD"\) \{\s*return null;/);
  assert.match(service, /priceCents: snapshot\.priceCents/);
  assert.doesNotMatch(service, /FALLBACK_USD_RATES|convertFromUsd|formatMoney/);
  console.log("PASS authoritative_usd_cents_unchanged");

  assert.doesNotMatch(confirmForm, /Charged in USD/);
  assert.doesNotMatch(promoSection, /Charged in USD/);
  assert.doesNotMatch(partnerStore, /CheckoutMoney/);
  assert.doesNotMatch(partnerPortal, /CheckoutMoney|CHECKOUT_NON_USD_DISPLAY_NOTE/);
  assert.match(pkg, /"qa:checkout-currency-display"/);
  console.log("PASS partner_excluded_and_no_charge_currency_guess");

  console.log("ALL_CHECKOUT_CURRENCY_DISPLAY_CHECKS_PASSED");
}

main();
