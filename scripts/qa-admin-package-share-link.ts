/**
 * Offline QA: Admin package Copy Link / WhatsApp share URLs.
 * Asserts path generation, offerId/country presence, WhatsApp format,
 * and that share deep links match customer login-return preservation.
 * Does not call providers, mutate the database, or change product code.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_NAME, BRAND_SITE_URL } from "../app/lib/brand";
import {
  buildWalletBuyReturnPath,
  resolvePostSignInPath,
  safeCallbackPath,
} from "../app/lib/auth/redirects";
import { normalizeCustomerBuyCountryHint } from "../app/lib/plans/customerBuyCountryHint";
import {
  buildAbsolutePackageCheckoutUrl,
  buildAbsolutePackageCheckoutUrlFromOffer,
  buildPackageCheckoutPath,
  buildPackageShareClipboardText,
  buildPackageShareMessage,
  buildPackageShareWhatsAppHref,
  buildPackageShareWhatsAppText,
  normalizePackageShareCountry,
  normalizePackageShareOfferId,
  packageShareFlagEmoji,
} from "../app/lib/support/packageShareLink";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const offerId = "offer_pkg_share_1";
  const country = "PK";
  const expectedPath = `/account/esim/buy?offerId=${encodeURIComponent(offerId)}&country=${country}`;
  const sameOrigin = "http://localhost:3000";
  const opts = { requestOrigin: sameOrigin };

  // 1) Relative path generation includes offerId + country
  assert.equal(normalizePackageShareOfferId(offerId), offerId);
  assert.equal(normalizePackageShareCountry("pk"), "PK");
  assert.equal(normalizePackageShareCountry("region-asia"), "region-asia");

  const path = buildPackageCheckoutPath({ offerId, country });
  assert.equal(path, expectedPath);
  assert.ok(path?.includes(`offerId=${encodeURIComponent(offerId)}`));
  assert.ok(path?.includes(`country=${country}`));
  assert.ok(path?.startsWith("/account/esim/buy?"));
  assert.doesNotMatch(path ?? "", /fromOrder=|purchaseId=|purchase=/);
  console.log("PASS package_share_path_includes_offer_and_country");

  // 2) Absolute checkout URL (generation unchanged)
  const absolute = buildAbsolutePackageCheckoutUrl({ offerId, country });
  assert.equal(absolute, `${BRAND_SITE_URL.replace(/\/+$/, "")}${expectedPath}`);
  assert.equal(
    buildAbsolutePackageCheckoutUrlFromOffer({ id: offerId }, country),
    absolute
  );
  assert.ok(absolute?.startsWith("https://mapesim.com/account/esim/buy?"));
  console.log("PASS package_share_absolute_copy_link");

  // 3) Shared Copy + WhatsApp message (country, data, validity, Activate URL)
  const shareFields = {
    offerId,
    country,
    destination: "Pakistan",
    planName: "1GB",
    dataAllowance: "1 GB",
    validity: "7 days",
  };
  const shareText = buildPackageShareMessage(shareFields);
  const copyText = buildPackageShareClipboardText(shareFields);
  const waText = buildPackageShareWhatsAppText(shareFields);
  assert.ok(shareText);
  assert.equal(shareText, copyText);
  assert.equal(shareText, waText);
  assert.match(shareText!, /Pakistan/);
  assert.match(shareText!, /1 GB/);
  assert.match(shareText!, /7 days/);
  assert.match(shareText!, /Activate:/);
  assert.ok(shareText!.includes(absolute!));
  assert.equal(packageShareFlagEmoji("PK"), "🇵🇰");
  assert.match(shareText!, /🇵🇰 Pakistan\n📶 1 GB\n⏳ 7 days\nActivate:\n/);
  assert.doesNotMatch(shareText!, /purchaseId|providerOrderId|fromOrder=/i);
  assert.doesNotMatch(shareText!, new RegExp(BRAND_NAME));

  const waHref = buildPackageShareWhatsAppHref(shareFields);
  assert.ok(waHref);
  assert.ok(waHref!.startsWith("https://wa.me/?text="));
  const encoded = waHref!.slice("https://wa.me/?text=".length);
  assert.equal(decodeURIComponent(encoded), waText);
  console.log("PASS package_share_whatsapp_url_format");

  // 4) Reject unsafe / incomplete inputs (no bad deep links)
  assert.equal(buildPackageCheckoutPath({ offerId: "", country: "PK" }), null);
  assert.equal(buildPackageCheckoutPath({ offerId, country: "" }), null);
  assert.equal(
    buildPackageCheckoutPath({ offerId: "purchase-secret", country: "PK" }),
    null
  );
  assert.equal(normalizePackageShareOfferId("bad id!!"), null);
  // Admin Copy Link generation still rejects display names (codes only).
  assert.equal(normalizePackageShareCountry("Pakistan"), null);
  assert.equal(normalizePackageShareCountry("PK"), "PK");
  console.log("PASS package_share_rejects_invalid_inputs");

  // Customer buy URL consumption normalizes display names; Admin Copy Link unchanged.
  assert.equal(normalizeCustomerBuyCountryHint("PK"), "PK");
  assert.equal(normalizeCustomerBuyCountryHint("pk"), "PK");
  assert.equal(normalizeCustomerBuyCountryHint("Pakistan"), "PK");
  assert.equal(normalizeCustomerBuyCountryHint("  pakistan  "), "PK");
  assert.equal(normalizeCustomerBuyCountryHint("region-asia"), "region-asia");
  assert.equal(normalizeCustomerBuyCountryHint("NotARealCountry"), null);
  assert.equal(normalizeCustomerBuyCountryHint("http://evil"), null);
  assert.equal(normalizeCustomerBuyCountryHint(""), null);
  console.log("PASS customer_buy_country_display_name_normalize");

  // 5) Customer checkout return path preservation (same as Buy Now deep link)
  const returnPath = buildWalletBuyReturnPath({ offerId, country });
  assert.equal(returnPath, expectedPath);
  assert.equal(path, returnPath);
  assert.equal(resolvePostSignInPath("CUSTOMER", path!, opts), path);
  assert.equal(
    resolvePostSignInPath("CUSTOMER", absolute!, {
      requestOrigin: BRAND_SITE_URL,
    }),
    path
  );
  assert.equal(
    safeCallbackPath(absolute!, "/", { requestOrigin: BRAND_SITE_URL }),
    path
  );
  assert.equal(
    resolvePostSignInPath("CUSTOMER", `${sameOrigin}${path}`, opts),
    path
  );
  console.log("PASS package_share_login_return_preservation");

  // 6) Wiring: admin UI + buy page (no behavior change — source asserts only)
  const controls = read("app/components/admin/AdminPackageShareControls.tsx");
  const assignForm = read("app/components/admin/AdminPackageAssignSelectForm.tsx");
  const walletBuyForm = read("app/components/admin/AdminWalletBuySelectForm.tsx");
  const buyPage = read("app/account/esim/buy/page.tsx");
  const helpers = read("app/lib/support/packageShareLink.ts");

  assert.match(controls, /buildAbsolutePackageCheckoutUrlFromOffer/);
  assert.match(controls, /buildPackageShareClipboardText/);
  assert.match(controls, /buildPackageShareWhatsAppHref/);
  assert.match(controls, /Copy Link/);
  assert.match(controls, /Share on WhatsApp/);
  assert.match(helpers, /buildPackageShareMessage/);
  assert.match(helpers, /buildPackageShareClipboardText/);
  assert.match(assignForm, /AdminPackageShareControls/);
  assert.match(walletBuyForm, /AdminPackageShareControls/);
  assert.match(read("app/admin/countries/[code]/page.tsx"), /AdminPackageShareControls/);
  assert.match(read("app/admin/countries/page.tsx"), /AdminCountriesDirectory/);
  assert.match(buyPage, /buildWalletBuyReturnPath/);
  assert.match(buyPage, /requireRole\(\s*"CUSTOMER"/);
  assert.match(buyPage, /normalizeCustomerBuyCountryHint/);
  assert.doesNotMatch(
    buyPage,
    /const countryHint = sanitizeCountryHint\(query\.country\)/
  );
  assert.match(helpers, /buildCheckoutHref/);
  assert.match(helpers, /never passes/);
  assert.match(helpers, /fromOrder \(that is purchase/);
  assert.doesNotMatch(helpers, /options\?\.fromOrder|fromOrder:\s*fromOrder/);
  console.log("PASS package_share_admin_and_buy_wiring");

  console.log("OK qa-admin-package-share-link");
}

main();
