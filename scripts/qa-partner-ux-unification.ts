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
  const plansListing = read("app/components/plans/PlansListing.tsx");
  const access = read("app/lib/partner/partnerAccess.ts");
  const authConfig = read("auth.config.ts");

  assert.match(partnerLayout, /AccountMenu/);
  assert.match(partnerLayout, /["']\/countries["']/);
  assert.match(partnerLayout, /["']\/partner\/catalog["']/);
  assert.match(partnerLayout, /["']\/partner\/orders["']/);
  assert.match(partnerHome, /Partner Balance|Available Partner Balance|balanceLabel/);
  assert.match(partnerHome, /Current Partner Discount|discountPercentLabel/);
  assert.match(partnerHome, /Share Branding/);
  assert.match(partnerHome, /Quick Actions/);
  assert.doesNotMatch(partnerHome, /Reward Points|rewardPoints/i);
  assert.doesNotMatch(partnerWallet, /Reward Points|rewardPoints|Add funds/i);
  assert.doesNotMatch(partnerWallet, /href=["']\/account\/wallet\/top-up["']/);
  assert.match(partnerWallet, /Available Partner Balance/);
  assert.match(partnerOrders, /My eSIMs/);
  assert.match(partnerOrderDetail, /PartnerEsimInstallPanel/);
  assert.doesNotMatch(
    partnerOrderDetail,
    /Use the full ICCID above|Secure QR and one-tap install for Partners will follow/
  );
  assert.match(partnerWallet, /Partner/);
  assert.match(access, /Purchase debit/);
  assert.match(access, /Purchase refund/);
  assert.match(navbar, /partner\?/);
  assert.match(navbar, /\/partner\/wallet/);
  assert.match(navbar, /\/partner\/orders/);
  assert.match(rootLayout, /coerceAppRole/);
  assert.match(rootLayout, /getPartnerPortalSummary/);
  assert.match(accountPage, /AccountActionRow/);
  assert.match(catalogRead, /partnerCatalogOfferForbiddenKeys|discountBps|providerCost/);
  assert.match(buyPage, /buyPartnerEsim|listPartnerCatalogOffers|requireRole\(["']PARTNER["']\)/);
  assert.match(plansListing, /buildPartnerCheckoutHref/);
  assert.match(authConfig, /\/partner\/buy/);
  assert.match(authConfig, /\/account\/esim\/buy/);
  assert.equal(isTawkEnabledRoute("/partner"), false);

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
