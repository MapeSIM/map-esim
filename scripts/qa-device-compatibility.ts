/**
 * Offline QA for device-compatibility UX (guidance + interactive modal).
 * Does not call providers or collect IMEI/EID/TAC as form input.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const pagePath = "app/device-compatibility/page.tsx";
  const page = read(pagePath);
  const plansListing = [
    read("app/components/plans/PlansListing.tsx"),
    read("app/components/plans/PlansListingClient.tsx"),
  ].join("\n");
  const footer = read("app/components/Footer.tsx");
  const pkg = read("package.json");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const credit = read("app/lib/vesim/creditCheckout.ts");
  const payApply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const modal = read("app/components/esim/EsimCompatibilityModal.tsx");
  const catalog = read("app/lib/checkout/esimCompatibilityCatalog.ts");
  const checkoutCompat = read(
    "app/components/account/CheckoutCompatibilityModal.tsx"
  );

  console.log("1) Page route + SEO metadata");
  assert.match(page, /Check Device Compatibility/);
  assert.match(page, /<h1[\s\S]*Check Device Compatibility/);
  assert.match(page, /absoluteCanonical\("\/device-compatibility"\)/);
  assert.match(page, /robots:\s*\{\s*index:\s*true/);
  assert.match(page, /Browse eSIM Plans/);
  assert.match(page, /href="\/countries"/);
  assert.match(page, /Need Help\?/);
  assert.match(page, /href="\/support"/);
  assert.match(page, /EsimCompatibilityInlineTrigger|Check eSIM compatibility/);
  console.log("   ok");

  console.log("2) No IMEI / EID / TAC collection UI on static page");
  assert.doesNotMatch(page, /<input[\s\S]*?(IMEI|EID|TAC)/i);
  assert.doesNotMatch(page, /type=["'](?:tel|text)["'][^>]*(?:imei|eid|tac)/i);
  assert.match(page, /does not require IMEI, EID, or TAC/i);
  assert.ok(
    !existsSync(
      join(root, "app/components/deviceCompatibility/DeviceCompatibilityChecker.tsx")
    ),
    "legacy brand/model checker component must remain removed"
  );
  assert.ok(
    !existsSync(join(root, "app/lib/deviceCompatibility/catalog.ts")),
    "legacy device family catalog must remain removed"
  );
  assert.doesNotMatch(page, /DEVICE_FAMILIES|Likely compatible|Device brand/);
  assert.doesNotMatch(page, /Non-PTA|non-pta/i);
  console.log("   ok");

  console.log("3) Plan-page + footer + home wire interactive modal");
  assert.match(plansListing, /EsimCompatibilityInlineTrigger/);
  assert.match(plansListing, /Check eSIM compatibility/);
  assert.match(footer, /FooterEsimCompatibilityLink/);
  assert.match(
    read("app/components/esim/FooterEsimCompatibilityLink.tsx"),
    /footerAction="explore"/
  );
  assert.match(
    read("app/page.tsx"),
    /EsimCompatibilityInlineTrigger/
  );
  console.log("   ok");

  console.log("3b) Shared guide + interactive catalog/modal");
  const guide = read("app/lib/checkout/checkoutCompatibilityGuide.ts");
  assert.match(page, /COMMON_SUPPORTED_ESIM_MODELS/);
  assert.match(page, /COMPATIBILITY_IPHONE_QUICK_CHECK/);
  assert.match(guide, /iPhone XR through iPhone 16 \/ 17/);
  assert.match(guide, /Pixel 4 and newer/);
  assert.match(guide, /Galaxy S20\+/);
  assert.doesNotMatch(guide, /Non-PTA|non-pta/i);
  assert.match(catalog, /ESIM_COMPAT_DEVICES/);
  assert.match(catalog, /iPhone 15 Pro/);
  assert.match(catalog, /Galaxy S26/);
  assert.match(catalog, /Pixel 10/);
  assert.match(catalog, /\*#06#/);
  assert.match(catalog, /No SIM restrictions/);
  assert.match(modal, /Got it, Continue/);
  assert.match(modal, /Explore Plans/);
  assert.match(modal, /eSIM Supported/);
  assert.match(modal, /Not Supported/);
  assert.match(modal, /ESIM_COMPAT_BRAND_FILTERS/);
  assert.match(checkoutCompat, /CheckoutCompatibilityCheck/);
  assert.match(checkoutCompat, /footerAction="continue"/);
  assert.match(checkoutCompat, /Check eSIM compatibility \(\?\)/);
  console.log("   ok");

  console.log("4) Purchase / payment / provider paths untouched by this QA scope");
  assert.doesNotMatch(wallet, /device-compatibility|DEVICE_FAMILIES|IMEI|EID|TAC/);
  assert.doesNotMatch(credit, /device-compatibility|DEVICE_FAMILIES/);
  assert.doesNotMatch(payApply, /device-compatibility|DEVICE_FAMILIES/);
  assert.match(pkg, /qa:device-compatibility/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=device-compatibility");
}

main();
