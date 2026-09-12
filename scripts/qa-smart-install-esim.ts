/**
 * Offline QA for the universal "Install eSIM" progressive-enhancement button.
 * No DB. No live VeSIM. Never logs activation secrets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAppleEsimInstallUrl } from "../app/lib/install/appleEsimInstall";
import {
  AUTOMATIC_INSTALL_UNAVAILABLE_BODY,
  AUTOMATIC_INSTALL_UNAVAILABLE_TITLE,
  canAttemptAppleNativeEsimInstall,
  DEVICE_COMPATIBILITY_HREF,
  isAndroidUserAgent,
  isSafeSmartInstallLaunchHref,
  resolveSmartEsimInstallFromLpa,
  SMART_INSTALL_BUTTON_LABEL,
} from "../app/lib/install/smartEsimInstall";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const SAMPLE_LPA = "LPA:1$smdp.example.invalid$SAMPLE-ACTIVATION-CODE";
const IPHONE_OFFICIAL = "/api/account/orders/ord_qa/iphone";
const ANDROID_OFFICIAL = "/api/account/orders/ord_qa/android";

const UA = {
  safari174:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  safari173:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
  chromeIos174:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1",
  edgeIos180:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/125.0.2535.60 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/116.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  ipad:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  unknown: "GarbageUA",
};

function resolve(
  userAgent: string,
  options?: {
    lpa?: string | null;
    iphoneOfficialHref?: string | null;
    androidOfficialHref?: string | null;
  }
) {
  return resolveSmartEsimInstallFromLpa({
    userAgent,
    activationLpa: options && "lpa" in options ? options.lpa : SAMPLE_LPA,
    iphoneOfficialHref: options?.iphoneOfficialHref ?? null,
    androidOfficialHref: options?.androidOfficialHref ?? null,
  });
}

function main() {
  assert.equal(SMART_INSTALL_BUTTON_LABEL, "Install eSIM");
  assert.equal(
    AUTOMATIC_INSTALL_UNAVAILABLE_TITLE,
    "Automatic eSIM installation isn't available on this device."
  );
  assert.equal(
    AUTOMATIC_INSTALL_UNAVAILABLE_BODY,
    "You can still install your eSIM using QR code or manual setup."
  );
  assert.equal(DEVICE_COMPATIBILITY_HREF, "/device-compatibility");
  console.log("PASS copy_constants");

  const appleUrl = buildAppleEsimInstallUrl(SAMPLE_LPA);
  assert.ok(appleUrl);
  assert.match(appleUrl!, /^https:\/\/esimsetup\.apple\.com\//);

  assert.equal(canAttemptAppleNativeEsimInstall(UA.safari174), true);
  assert.equal(canAttemptAppleNativeEsimInstall(UA.chromeIos174), true);
  assert.equal(canAttemptAppleNativeEsimInstall(UA.edgeIos180), true);
  assert.equal(canAttemptAppleNativeEsimInstall(UA.safari173), false);
  assert.equal(canAttemptAppleNativeEsimInstall(UA.androidChrome), false);
  assert.equal(canAttemptAppleNativeEsimInstall(UA.desktopChrome), false);
  assert.equal(isAndroidUserAgent(UA.androidChrome), true);
  assert.equal(isAndroidUserAgent(UA.samsungInternet), true);
  assert.equal(isAndroidUserAgent(UA.safari174), false);
  console.log("PASS capability_detection");

  // iPhone Safari 17.4+ + LPA → native Apple URL
  assert.deepEqual(resolve(UA.safari174), {
    kind: "apple_native",
    href: appleUrl,
  });
  // iPhone Chrome / Edge 17.4+ are not blocked just for not being Safari
  assert.deepEqual(resolve(UA.chromeIos174), {
    kind: "apple_native",
    href: appleUrl,
  });
  assert.deepEqual(resolve(UA.edgeIos180), {
    kind: "apple_native",
    href: appleUrl,
  });
  // Older iOS cannot use Apple native — fallback even with LPA
  assert.deepEqual(resolve(UA.safari173), { kind: "fallback" });
  // iPhone 17.4+ without LPA can use an official carrier/Apple session href
  assert.deepEqual(
    resolve(UA.chromeIos174, { lpa: null, iphoneOfficialHref: IPHONE_OFFICIAL }),
    { kind: "iphone_official", href: IPHONE_OFFICIAL }
  );
  console.log("PASS iphone_safari_and_chrome_paths");

  // Android: official HTTPS/session URL only — never invent LPA/intent
  assert.deepEqual(
    resolve(UA.androidChrome, {
      lpa: SAMPLE_LPA,
      androidOfficialHref: ANDROID_OFFICIAL,
    }),
    { kind: "android_official", href: ANDROID_OFFICIAL }
  );
  assert.deepEqual(resolve(UA.androidChrome), { kind: "fallback" });
  assert.deepEqual(resolve(UA.samsungInternet), { kind: "fallback" });
  assert.deepEqual(
    resolve(UA.samsungInternet, {
      lpa: SAMPLE_LPA,
      androidOfficialHref: ANDROID_OFFICIAL,
    }),
    { kind: "android_official", href: ANDROID_OFFICIAL }
  );
  console.log("PASS android_chrome_and_samsung_paths");

  // Desktop / iPad / unknown: button still exists; click is fallback
  assert.deepEqual(resolve(UA.desktopChrome), { kind: "fallback" });
  assert.deepEqual(resolve(UA.desktopSafari), { kind: "fallback" });
  assert.deepEqual(resolve(UA.ipad), { kind: "fallback" });
  assert.deepEqual(resolve(UA.unknown), { kind: "fallback" });
  console.log("PASS desktop_unknown_fallback_paths");

  assert.equal(isSafeSmartInstallLaunchHref(IPHONE_OFFICIAL), true);
  assert.equal(isSafeSmartInstallLaunchHref(appleUrl), true);
  assert.equal(isSafeSmartInstallLaunchHref("javascript:alert(1)"), false);
  assert.equal(isSafeSmartInstallLaunchHref("data:text/html,hi"), false);
  assert.equal(isSafeSmartInstallLaunchHref("//evil.example"), false);
  assert.equal(isSafeSmartInstallLaunchHref("http://esimsetup.apple.com/x"), false);
  console.log("PASS launch_href_allowlist");

  const helper = read("app/lib/install/smartEsimInstall.ts");
  assert.doesNotMatch(helper, /intent:\/\/|#Intent|lpa:\/\/|android-app:/i);
  assert.doesNotMatch(helper, /console\.(log|info|warn|debug)/);
  assert.match(helper, /Does not invent Android LPA\/intents/);
  console.log("PASS no_invented_android_intents");

  const button = read("app/components/install/SmartInstallEsimButton.tsx");
  const sheet = read("app/components/install/SmartInstallFallbackSheet.tsx");
  const experience = read("app/components/install/EsimInstallExperience.tsx");
  const panel = read("app/components/orders/CustomerEsimInstallPanel.tsx");
  const card = read("app/components/orders/CustomerEsimOrderCard.tsx");
  const success = read("app/components/install/OrderInstallActions.tsx");
  const installSheet = read("app/components/install/InstallEsimSheet.tsx");
  const partnerPanel = read(
    "app/components/partner/PartnerEsimInstallPanel.tsx"
  );
  const shareView = read("app/components/partner/PartnerEsimShareView.tsx");
  const installApi = read("app/api/account/orders/[orderId]/install/route.ts");
  const installLib = read("app/lib/orders/customerOrderInstall.ts");

  assert.match(button, /SMART_INSTALL_BUTTON_LABEL/);
  assert.match(button, /ensureInstallData/);
  assert.match(button, /resolveSmartEsimInstallFromLpa/);
  assert.match(button, /scheduleNativeHandoffFallback/);
  assert.doesNotMatch(button, /supportsAppleOneTapEsimInstall/);
  assert.doesNotMatch(button, /isIphoneSafariBrowser/);

  assert.match(sheet, /AUTOMATIC_INSTALL_UNAVAILABLE_TITLE/);
  assert.match(sheet, /View QR Code/);
  assert.match(sheet, /Manual Installation/);
  assert.match(sheet, /Check Device Compatibility/);
  assert.match(sheet, /DEVICE_COMPATIBILITY_HREF/);
  assert.match(sheet, /iPhone Guide/);
  assert.match(sheet, /Android Guide/);

  assert.match(experience, /SmartInstallEsimButton/);
  assert.doesNotMatch(experience, /One-Tap Install eSIM/);
  assert.doesNotMatch(
    experience,
    /Open this page in Safari for One-Tap Install/
  );

  assert.match(panel, /SmartInstallEsimButton/);
  assert.match(panel, /ensureInstallData/);
  assert.match(
    panel,
    /\/api\/account\/orders\/\$\{encodeURIComponent\(orderId\)\}\/install/
  );
  assert.match(panel, /hasInstallHashIntent/);
  assert.match(panel, /void loadInstall\(\)/);
  assert.doesNotMatch(panel, /launchSmartEsimInstallPath/);
  assert.doesNotMatch(panel, /location\.assign/);
  assert.doesNotMatch(panel, /View QR Code & Details/);

  assert.match(card, />\s*Install eSIM\s*</);
  assert.match(card, /#install/);
  assert.doesNotMatch(card, /View QR Code & Details/);

  assert.match(success, /EsimInstallExperience/);
  assert.doesNotMatch(success, /useAppleOneTapInstallState/);

  assert.match(installSheet, /resolveSmartEsimInstallFromLpa/);
  assert.match(installSheet, /SMART_INSTALL_BUTTON_LABEL/);
  assert.doesNotMatch(installSheet, /One-Tap Install eSIM/);

  assert.match(partnerPanel, /InstallEsimSheet/);
  assert.doesNotMatch(partnerPanel, /useAppleOneTapInstallState/);
  assert.match(shareView, /SmartInstallEsimButton/);
  assert.doesNotMatch(shareView, /One-Tap Install eSIM/);

  assert.match(installApi, /authorizeCustomerOwnedOrderInstall/);
  assert.match(installLib, /authorizeCustomerOwnedOrderInstall/);
  assert.match(installLib, /userId:\s*owner\.id/);
  assert.doesNotMatch(installApi, /iccid:/);
  console.log("PASS ui_always_shows_install_esim_and_keeps_auth");

  const pkg = read("package.json");
  assert.match(pkg, /"qa:smart-install-esim"/);
  console.log("PASS package_script");

  console.log("ALL PASS qa-smart-install-esim");
}

main();
