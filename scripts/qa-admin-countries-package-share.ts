/**
 * Offline QA: Admin Countries package Copy Link.
 * Reuses packageShareLink helpers — no purchase/payment/auth changes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canAccessAdminPath } from "../app/lib/admin/adminPageAccess";
import {
  buildAbsolutePackageCheckoutUrl,
  buildPackageCheckoutPath,
} from "../app/lib/support/packageShareLink";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  // Destination code (PK), not display name — matches buy sanitizeCountryHint.
  const path = buildPackageCheckoutPath({
    offerId: "offer_pk_100mb",
    country: "PK",
  });
  assert.equal(
    path,
    "/account/esim/buy?offerId=offer_pk_100mb&country=PK"
  );
  assert.equal(
    buildAbsolutePackageCheckoutUrl({
      offerId: "offer_pk_100mb",
      country: "PK",
    }),
    "https://mapesim.com/account/esim/buy?offerId=offer_pk_100mb&country=PK"
  );
  // Display names are rejected for Admin Copy Link generation (codes only).
  // Customer buy page normalizes display names separately.
  assert.equal(
    buildPackageCheckoutPath({
      offerId: "offer_pk_100mb",
      country: "Pakistan",
    }),
    null
  );
  console.log("PASS countries_copy_link_uses_destination_code");

  assert.equal(
    canAccessAdminPath(["ESIM_FULFILLMENT"], "/admin/countries"),
    true
  );
  assert.equal(
    canAccessAdminPath(["ESIM_FULFILLMENT"], "/admin/countries/PK"),
    true
  );
  assert.equal(canAccessAdminPath(["CUSTOMERS_VIEW"], "/admin/countries"), false);
  console.log("PASS countries_admin_permission_esim_fulfillment");

  const listPage = read("app/admin/countries/page.tsx");
  const detailPage = read("app/admin/countries/[code]/page.tsx");
  const directory = read("app/components/admin/AdminCountriesDirectory.tsx");
  const controls = read("app/components/admin/AdminPackageShareControls.tsx");
  const helpers = read("app/lib/support/packageShareLink.ts");
  const nav = read("app/components/admin/AdminNav.tsx");
  const access = read("app/lib/admin/adminPageAccess.ts");
  const buyPage = read("app/account/esim/buy/page.tsx");
  const pkg = read("package.json");

  assert.match(listPage, /listAdminAssignmentDestinations/);
  assert.match(listPage, /AdminCountriesDirectory/);
  assert.doesNotMatch(listPage, /prepareWallet|confirmWallet|createPartner/);
  assert.match(detailPage, /listAdminAssignmentOffers/);
  assert.match(detailPage, /AdminPackageShareControls/);
  assert.match(detailPage, /sanitizeCountryHint/);
  assert.match(detailPage, /country=\{code\}/);
  assert.doesNotMatch(detailPage, /prepareAdminPackageAssignment|walletPurchase/);
  assert.match(directory, /\/admin\/countries\/\$\{encodeURIComponent/);
  assert.match(controls, /buildAbsolutePackageCheckoutUrlFromOffer/);
  assert.match(controls, /Copied|Copy Link/);
  assert.match(helpers, /buildCheckoutHref/);
  assert.match(nav, /href: "\/admin\/countries"/);
  assert.match(access, /path\.startsWith\("\/admin\/countries"\)/);
  assert.match(access, /ESIM_FULFILLMENT/);
  assert.match(buyPage, /buildWalletBuyReturnPath/);
  assert.match(buyPage, /normalizeCustomerBuyCountryHint/);
  assert.match(pkg, /qa:admin-countries-package-share/);
  // Customer surfaces must not import admin countries copy UI.
  assert.doesNotMatch(
    read("app/components/plans/PlansListing.tsx"),
    /AdminPackageShareControls|AdminCountriesDirectory/
  );
  assert.doesNotMatch(
    read("app/account/esim/buy/page.tsx"),
    /AdminPackageShareControls|AdminCountriesDirectory/
  );
  console.log("PASS countries_package_copy_wiring");

  console.log("OK qa-admin-countries-package-share");
}

main();
