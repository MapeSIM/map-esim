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

  assert.match(partnerLayout, /AccountMenu/);
  assert.match(partnerLayout, /["']\/countries["']/);
  assert.match(partnerLayout, /label:\s*["']Catalog["']/);
  assert.match(partnerLayout, /["']\/partner\/orders["']/);
  assert.match(partnerLayout, /["']\/partner\/sales["']/);
  assert.match(partnerHome, /Partner Balance|Available Partner Balance|balanceLabel/);
  assert.match(partnerHome, /\/partner\/sales|Sales report/);
  assert.match(partnerHome, /Current Partner Discount|discountPercentLabel/);
  assert.match(partnerHome, /Total eSIM orders|totalEsimOrdersLabel/);
  assert.match(partnerHome, /Total spent|totalSpentLabel/);
  assert.match(partnerHome, /Total savings|totalSavingsLabel/);
  assert.match(partnerHome, /Share Branding/);
  assert.match(partnerHome, /Quick Actions/);
  assert.doesNotMatch(partnerHome, /Reward Points|rewardPoints/i);
  assert.doesNotMatch(partnerWallet, /Reward Points|rewardPoints/i);
  assert.doesNotMatch(partnerWallet, /href=["']\/account\/wallet\/top-up["']/);
  assert.match(partnerWallet, /PartnerWalletAddFundsForm|Available Partner Balance/);
  assert.match(partnerWallet, /Available Partner Balance/);
  assert.match(partnerOrders, /My eSIMs/);
  assert.match(partnerOrders, /PartnerEsimOrderCard/);
  assert.match(partnerOrders, /Amount Paid/);
  assert.doesNotMatch(partnerOrders, /Reward Points|rewardPoints/i);
  assert.match(partnerOrderDetail, /PartnerEsimOrderCard/);
  assert.doesNotMatch(
    partnerOrderDetail,
    /Use the full ICCID above|Secure QR and one-tap install for Partners will follow|eSIM activated and ready to use/
  );
  const partnerCard = read("app/components/partner/PartnerEsimOrderCard.tsx");
  assert.match(partnerCard, /Show eSIM Status & Usage/);
  assert.match(partnerCard, /PARTNER_ESIM_READY_LABEL/);
  assert.doesNotMatch(partnerCard, /Recharge|Add Data|Reward Points/i);
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
  assert.match(catalogRead, /fundingDisplay/);
  assert.doesNotMatch(catalogRead, /retailPriceLabel:/);
  assert.match(buyPage, /buyPartnerEsim|listPartnerCatalogOffers|requireRole\(["']PARTNER["']\)/);
  assert.match(buyPage, /Partner price|your Partner price/i);
  assert.doesNotMatch(
    buyPage,
    /Retail price is shown|Partner discount is applied server-side/
  );
  assert.match(catalogBuy, /partnerPriceLabel/);
  assert.match(catalogBuy, /Total amount|Wallet applied|Remaining to pay/);
  assert.doesNotMatch(catalogBuy, /retailPriceLabel/);
  assert.doesNotMatch(
    catalogBuy,
    /Catalog prices match MAP eSIM retail|Your Partner rate is applied|discountPercent|%\s*off/i
  );
  assert.match(storefrontBuy, /partnerPriceLabel/);
  assert.match(storefrontBuy, /Total amount|Wallet applied|Remaining to pay/);
  assert.doesNotMatch(storefrontBuy, /retailPriceLabel/);
  assert.doesNotMatch(
    storefrontBuy,
    /Catalog prices match MAP eSIM retail|Your Partner rate is applied/i
  );
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

  console.log("ALL_QA_PASSED=partner-ux-unification");
}

main();
