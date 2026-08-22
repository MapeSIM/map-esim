/**
 * Offline QA: public iPhone/Android install guide presentation.
 * Does not generate QR codes, call install APIs, or change order flow.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildInstallGuideContent } from "../app/lib/install/installGuideContent";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const iphone = buildInstallGuideContent("iphone");
  const android = buildInstallGuideContent("android");

  assert.equal(iphone.title, "iPhone eSIM installation guide");
  assert.equal(android.title, "Android eSIM installation guide");
  assert.ok(iphone.checklist.length >= 4);
  assert.ok(iphone.steps.length >= 6);
  assert.ok(iphone.issues.length >= 3);
  assert.match(iphone.intro, /one-tap Install on iPhone/);
  assert.match(iphone.intro, /official carrier activation link/);
  assert.ok(iphone.steps.some((step) => /iOS 17\.4/.test(step.description)));
  assert.ok(iphone.steps.some((step) => /SM-DP\+/.test(step.description)));
  assert.match(android.intro, /does not claim universal one-click Android/);
  assert.equal(iphone.otherGuide.href, "/install/android");
  assert.equal(android.otherGuide.href, "/install/iphone");
  console.log("PASS install_guide_copy");

  assert.ok(existsSync(join(root, "app/components/install/InstallGuidePage.tsx")));
  const ui = read("app/components/install/InstallGuidePage.tsx");
  const iphonePage = read("app/install/iphone/page.tsx");
  const androidPage = read("app/install/android/page.tsx");
  const copy = read("app/lib/install/installGuideContent.ts");
  const pkg = read("package.json");
  const prelaunch = read("scripts/qa-prelaunch.ts");
  const qrRoute = read("app/api/vesim/install/qr/route.ts");
  const iphoneApi = read("app/api/vesim/install/iphone/route.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const checkout = read("app/lib/vesim/creditCheckout.ts");
  const apple = read("app/lib/install/appleEsimInstall.ts");

  assert.match(iphonePage, /<InstallGuidePage platform="iphone" \/>/);
  assert.match(androidPage, /<InstallGuidePage platform="android" \/>/);
  assert.match(iphonePage, /absoluteCanonical\("\/install\/iphone"\)/);
  assert.match(androidPage, /absoluteCanonical\("\/install\/android"\)/);
  assert.match(ui, /install-checklist-heading/);
  assert.match(ui, /install-steps-heading/);
  assert.match(ui, /install-issues-heading/);
  assert.match(ui, /install-support-heading/);
  assert.match(ui, /<details/);
  assert.match(ui, /href="\/support"/);
  assert.match(ui, /href="\/contact"/);
  assert.match(ui, /href="\/account\/orders"/);
  assert.match(ui, /BRAND_SUPPORT_EMAIL/);
  assert.doesNotMatch(ui, /buildAppleEsimInstallUrl|fetch\(|\/api\/vesim\/install/);
  assert.doesNotMatch(copy, /PAYMENT_GATEWAY_ENABLED|providerPriceUSD/);
  assert.doesNotMatch(iphonePage, /appleEsimInstall|creditCheckout/);
  assert.doesNotMatch(androidPage, /appleEsimInstall|creditCheckout/);
  console.log("PASS guide_pages_presentation");

  assert.match(pkg, /qa:install-guides/);
  assert.match(prelaunch, /qa:install-guides/);
  assert.doesNotMatch(apply, /InstallGuidePage|buildInstallGuideContent/);
  assert.doesNotMatch(checkout, /InstallGuidePage|buildInstallGuideContent/);
  assert.doesNotMatch(qrRoute, /InstallGuidePage|buildInstallGuideContent/);
  assert.doesNotMatch(iphoneApi, /InstallGuidePage|buildInstallGuideContent/);
  assert.doesNotMatch(apple, /InstallGuidePage|buildInstallGuideContent/);
  console.log("PASS install_logic_untouched");

  console.log("ALL PASS qa-install-guides");
}

main();
