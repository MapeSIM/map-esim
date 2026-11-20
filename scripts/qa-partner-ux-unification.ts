/**
 * Offline QA for Partner UX unification.
 * No DB. No live VeSIM. No Production.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isTawkEnabledRoute } from "../app/lib/support/tawkRoutes";
import { buildPartnerCheckoutHref, buildCheckoutHref } from "../app/lib/plans/plan-utils";
import type { VesimOffer } from "../app/lib/vesim/offers";

const root = join(__dirname, "..");
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const partnerHome = read("app/partner/(portal)/page.tsx");
  const partnerLayout = read("app/partner/(portal)/layout.tsx");
  const partnerWallet = read("app/partner/(portal)/wallet/page.tsx");
  const partnerOrders = read("app/partner/(portal)/orders/page.tsx");
  const partnerOrderDetail = read(
    "app/partner/(portal)/orders/[orderId]/page.tsx"
  );
  const navbar = read("app/components/Navbar.tsx");
  const rootLayout = read("app/layout.tsx");
  const accountPage = read("app/account/page.tsx");
  const catalogRead = read("app/lib/partner/partnerCatalogRead.ts");
  const buyPage = read("app/partner/(portal)/buy/page.tsx");
  const catalogBuy = read("app/components/partner/PartnerCatalogBuy.tsx");
  const storefrontBuy = read("app/components/partner/PartnerStorefrontBuy.tsx");
  const addDataPage = read(
    "app/partner/(portal)/orders/[orderId]/add-data/page.tsx"
  );
  const plansListing = [
    read("app/components/plans/PlansListing.tsx"),
    read("app/components/plans/PlansListingClient.tsx"),
    read("app/components/plans/PlansListingChrome.tsx"),
  ].join("\n");
  const access = read("app/lib/partner/partnerAccess.ts");
  const authConfig = read("auth.config.ts");

  assert.match(partnerLayout, /PartnerMenu/);
  assert.match(partnerLayout, /label:\s*["']Catalog["']/);
  assert.match(partnerLayout, /["']\/partner\/countries["']/);
  assert.match(partnerLayout, /["']\/partner\/orders["']/);
  assert.match(partnerLayout, /["']\/partner\/wallet["']/);
  assert.match(partnerHome, /Available Balance|balanceLabel/);
  assert.match(partnerHome, /totalEsimOrdersLabel|Total Orders/);
  assert.match(partnerHome, /totalSpentLabel|Total Spend/);
  assert.match(partnerHome, /Browse Catalog|\/partner\/catalog|\/partner\/countries/);
  assert.doesNotMatch(partnerHome, /Reward Points|rewardPoints/i);

  const catalogPage = read("app/partner/(portal)/catalog/page.tsx");
  // Deep-link checkout params → confirm page; bare catalog → partner countries.
  assert.match(catalogPage, /\/partner\/buy\?/);
  assert.match(catalogPage, /redirect\(\s*["']\/partner\/countries["']\s*\)/);
  const nextConfig = read("next.config.ts");
  // Must not 308 /partner/catalog → public /countries (that broke Buy Now deep-links).
  assert.doesNotMatch(
    nextConfig,
    /source:\s*["']\/partner\/catalog["'][\s\S]*destination:\s*["']\/countries["']/
  );
  const partnerCountries = read("app/partner/(portal)/countries/page.tsx");
  assert.match(partnerCountries, /CountriesListing|PARTNER_COUNTRIES_BASE_PATH/);
  assert.match(
    read("app/partner/(portal)/countries/[slug]/page.tsx"),
    /forcePartnerCheckout|PARTNER_COUNTRIES_BASE_PATH/
  );
  assert.match(partnerLayout, /["']\/partner\/countries["']/);

  const returnState = read(
    "app/lib/partner/partnerEsimPurchasePaymentReturnState.ts"
  );
  assert.match(returnState, /partnerEsimPurchasePaymentCatalogHref[\s\S]*return ["']\/partner\/catalog["']/);
  assert.doesNotMatch(returnState, /return ["']\/countries["']/);

  const cancelPage = read(
    "app/partner/(portal)/catalog/payment/cancel/[attemptId]/page.tsx"
  );
  assert.match(cancelPage, /Back to catalog/);
  assert.match(cancelPage, /href=["']\/partner\/catalog["']/);
  assert.doesNotMatch(cancelPage, /Back to destinations/);

  const returnView = read(
    "app/partner/(portal)/catalog/payment/return/PartnerEsimPurchasePaymentReturnView.tsx"
  );
  assert.match(returnView, /Back to catalog/);
  assert.doesNotMatch(returnView, /Back to destinations/);

  assert.doesNotMatch(partnerWallet, /Reward Points|rewardPoints/i);
  assert.doesNotMatch(partnerWallet, /href=["']\/account\/wallet\/top-up["']/);
  assert.match(partnerWallet, /PartnerWalletAddFundsForm/);
  assert.match(partnerWallet, /Available balance|balanceLabel/i);
  assert.match(partnerOrders, /PartnerOrdersTableClient|\/partner\/orders/);
  assert.doesNotMatch(partnerOrders, /Reward Points|rewardPoints/i);
  assert.match(partnerOrderDetail, /PartnerEsimOrderCard/);
  assert.doesNotMatch(
    partnerOrderDetail,
    /Use the full ICCID above|Secure QR and one-tap install for Partners will follow|eSIM activated and ready to use/
  );
  const partnerCard = read("app/components/partner/PartnerEsimOrderCard.tsx");
  const orderDetailCard = read("app/components/orders/EsimOrderDetailCard.tsx");
  assert.match(partnerCard, /EsimOrderDetailCard/);
  assert.match(orderDetailCard, /Update|Refreshing|Updating/);
  assert.match(partnerCard, /partnerOrderStatusLabel/);
  assert.match(partnerCard, /Amount Paid|amountPaid/);
  assert.doesNotMatch(partnerCard, /Recharge|Reward Points/i);
  const partnerInstall = read("app/components/partner/PartnerEsimInstallPanel.tsx");
  assert.match(partnerInstall, /View QR Code & Install/);
  assert.match(partnerInstall, /ManualInstallSheet/);
  assert.doesNotMatch(partnerInstall, /eSIM activated and ready to use/);
  assert.match(partnerWallet, /Partner/);
  assert.match(access, /Purchase debit/);
  assert.match(access, /Purchase refund/);
  assert.match(access, /ESIM_PURCHASE_DEBIT/);
  assert.match(access, /TOPUP_CREDIT/);
  assert.match(access, /totalSpentLabel:\s*formatUsdCents\(totalSpentCents\)/);
  assert.doesNotMatch(access, /totalSpentLabel:\s*formatUsdCents\(0\)/);
  assert.match(access, /totalEsimOrders/);
  assert.match(access, /totalSavingsLabel/);
  assert.match(access, /retailPriceCents[\s\S]*partnerChargeCents/);
  assert.match(navbar, /partner\?/);
  assert.match(navbar, /\/partner\/wallet/);
  assert.match(navbar, /\/partner\/orders/);
  const navbarShell = read("app/components/NavbarShell.tsx");
  assert.match(navbarShell, /coerceAppRole/);
  assert.doesNotMatch(rootLayout, /getPartnerPortalSummary/);
  assert.doesNotMatch(rootLayout, /getCustomerWalletSummary/);
  assert.match(navbarShell, /partner|customer/);
  assert.match(navbarShell, /walletBalanceLabel:\s*null/);
  assert.match(rootLayout, /NavbarShell/);
  assert.doesNotMatch(rootLayout, /await auth\(/);
  assert.doesNotMatch(rootLayout, /from ["']next\/headers["']/);
  assert.match(accountPage, /AccountActionRow/);
  assert.match(catalogRead, /partnerCatalogOfferForbiddenKeys|discountBps|providerCost/);
  assert.match(catalogRead, /partnerPriceLabel/);
  assert.match(catalogRead, /partnerPriceCents/);
  assert.match(catalogRead, /fundingDisplay/);
  assert.match(catalogRead, /retailPriceLabel:/);
  assert.match(buyPage, /listPartnerCatalogOffers|requireRole\(["']PARTNER["']\)/);
  assert.match(buyPage, /Partner price|your Partner price|Issue eSIM|Confirm purchase/i);
  assert.match(buyPage, /redirect\(\s*["']\/partner\/countries["']\s*\)/);
  assert.match(catalogBuy, /partnerPriceLabel|PartnerOfferPaymentForm/);
  assert.match(catalogBuy, /Browse catalog again|\/partner\/catalog|\/partner\/countries/);
  assert.match(catalogBuy, /retailPriceLabel/);
  assert.match(
    catalogBuy,
    /partner discount at checkout|discount applied at checkout/i
  );
  assert.match(storefrontBuy, /partnerPriceLabel/);
  assert.match(storefrontBuy, /PartnerOfferPaymentForm/);
  assert.match(storefrontBuy, /retailPriceLabel/);
  assert.match(storefrontBuy, /Partner discount|discountPercentLabel/i);
  const offerPaymentForm = read(
    "app/components/partner/PartnerOfferPaymentForm.tsx"
  );
  assert.match(
    offerPaymentForm,
    /Wallet Balance:[\s\S]*Plan Cost:|Total amount|Wallet applied|Remaining to pay/
  );
  assert.match(offerPaymentForm, /Issue eSIM|Confirm purchase/);
  assert.match(addDataPage, /partnerDebitLabel|Partner price/);
  assert.doesNotMatch(addDataPage, /Retail\s+|retailPriceLabel/);
  assert.match(plansListing, /buildPartnerCheckoutHref/);
  assert.match(authConfig, /\/partner\/buy/);
  assert.match(authConfig, /\/account\/esim\/buy/);
  assert.equal(isTawkEnabledRoute("/partner"), false);

  assert.match(access, /\$queryRaw|aggregate/);
  assert.doesNotMatch(
    access,
    /partnerEsimPurchase\.findMany\([\s\S]*retailPriceCents[\s\S]*partnerChargeCents/
  );

  const offer = { id: "ESIM-QA-1" } as VesimOffer;
  assert.equal(
    buildCheckoutHref(offer, "JP"),
    "/account/esim/buy?offerId=ESIM-QA-1&country=JP"
  );
  assert.equal(
    buildPartnerCheckoutHref(offer, "JP"),
    "/partner/buy?offerId=ESIM-QA-1&country=JP"
  );
  assert.doesNotMatch(buildPartnerCheckoutHref(offer, "JP"), /discount|partnerCharge|providerCost/);
  assert.doesNotMatch(buildPartnerCheckoutHref(offer, "JP"), /\/partner\/catalog/);

  console.log("ALL_QA_PASSED=partner-ux-unification");
}

main();
