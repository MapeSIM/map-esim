/**
 * Offline QA for Apple one-tap eSIM install helpers (iPhone Safari / iOS 17.4+).
 * Pure static checks — never logs activation credentials, never calls providers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAppleEsimInstallUrl,
  isIphoneSafariBrowser,
  shouldShowAppleOneTapSafariGuidance,
  supportsAppleOneTapEsimInstall,
} from "../app/lib/install/appleEsimInstall";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const safari174 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const safari175 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const safari180 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const safari173 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1";
const chrome174 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1";
const chrome180 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1";

function assertUrlRoundTrip(lpa: string) {
  const href = buildAppleEsimInstallUrl(lpa);
  assert.ok(href, "expected Apple install URL");
  const parsed = new URL(href!);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, "esimsetup.apple.com");
  assert.equal(parsed.pathname, "/esim_qrcode_provisioning");
  assert.equal(parsed.searchParams.get("carddata"), lpa);
  assert.match(parsed.search, /carddata=/);
  assert.ok(
    parsed.search.includes("%24") || parsed.href.includes("%24"),
    "expected $ to be URL-encoded in the query"
  );
  assert.equal(parsed.searchParams.get("carddata"), lpa);
}

function main() {
  const sample =
    "LPA:1$smdp.example.invalid$SAMPLE-ACTIVATION-CODE";
  const special =
    "LPA:1$rsp-eu.example.com$ABC+DEF/123==$extra";

  assertUrlRoundTrip(sample);
  assert.equal(
    buildAppleEsimInstallUrl(`  ${sample}  `),
    buildAppleEsimInstallUrl(sample),
    "trim surrounding whitespace only"
  );
  assertUrlRoundTrip(special);

  const built = buildAppleEsimInstallUrl(sample)!;
  const carddata = new URL(built).searchParams.get("carddata");
  assert.equal(carddata, sample);
  assert.notEqual(carddata, sample.replace("LPA:1$", "lpa:1$"));
  console.log("PASS apple_url_round_trip_and_encoding");

  assert.equal(buildAppleEsimInstallUrl(""), null);
  assert.equal(buildAppleEsimInstallUrl("   "), null);
  assert.equal(buildAppleEsimInstallUrl(null), null);
  assert.equal(buildAppleEsimInstallUrl(undefined), null);
  assert.equal(buildAppleEsimInstallUrl("not-an-lpa"), null);
  assert.equal(buildAppleEsimInstallUrl("https://evil.example/x"), null);
  assert.equal(buildAppleEsimInstallUrl("LPA:1$"), null);
  assert.equal(buildAppleEsimInstallUrl("LPA:1$only-smdp"), null);
  assert.equal(buildAppleEsimInstallUrl("LPA:2$smdp$code"), null);
  console.log("PASS apple_url_rejects_invalid");

  const helperSrc = read("app/lib/install/appleEsimInstall.ts");
  assert.doesNotMatch(helperSrc, /console\.(log|info|warn|debug)/);
  assert.match(helperSrc, /URLSearchParams|searchParams\.set/);
  assert.doesNotMatch(
    helperSrc,
    /esimsetup\.apple\.com\/esim_qrcode_provisioning\?carddata=\$\{/
  );
  console.log("PASS helper_no_logs_uses_url_api");

  assert.equal(supportsAppleOneTapEsimInstall(safari174), true);
  assert.equal(supportsAppleOneTapEsimInstall(safari175), true);
  assert.equal(supportsAppleOneTapEsimInstall(safari180), true);
  assert.equal(supportsAppleOneTapEsimInstall(safari173), false);
  assert.equal(isIphoneSafariBrowser(safari174), true);
  assert.equal(isIphoneSafariBrowser(chrome174), false);
  assert.equal(supportsAppleOneTapEsimInstall(chrome174), false);
  assert.equal(supportsAppleOneTapEsimInstall(chrome180), false);
  assert.equal(shouldShowAppleOneTapSafariGuidance(chrome174), true);
  assert.equal(shouldShowAppleOneTapSafariGuidance(chrome180), true);
  assert.equal(shouldShowAppleOneTapSafariGuidance(safari174), false);
  assert.equal(shouldShowAppleOneTapSafariGuidance(safari173), false);
  assert.equal(
    supportsAppleOneTapEsimInstall(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    ),
    false
  );
  assert.equal(
    shouldShowAppleOneTapSafariGuidance(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    ),
    false
  );
  assert.equal(
    supportsAppleOneTapEsimInstall(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    false
  );
  assert.equal(
    supportsAppleOneTapEsimInstall(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
    ),
    false
  );
  assert.equal(supportsAppleOneTapEsimInstall(""), false);
  assert.equal(supportsAppleOneTapEsimInstall(null), false);
  assert.equal(supportsAppleOneTapEsimInstall(undefined), false);
  assert.equal(supportsAppleOneTapEsimInstall("GarbageUA"), false);
  assert.equal(
    supportsAppleOneTapEsimInstall(
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
    ),
    false
  );
  console.log("PASS ios_safari_support_detection");

  const oneTapUi = read("app/components/install/AppleOneTapInstallButton.tsx");
  const experience = read("app/components/install/EsimInstallExperience.tsx");
  const panel = read("app/components/orders/CustomerEsimInstallPanel.tsx");
  const successActions = read("app/components/install/OrderInstallActions.tsx");
  assert.match(oneTapUi, /buildAppleEsimInstallUrl/);
  assert.match(oneTapUi, /supportsAppleOneTapEsimInstall/);
  assert.match(oneTapUi, /shouldShowAppleOneTapSafariGuidance/);
  assert.match(oneTapUi, /Install eSIM/);
  assert.match(oneTapUi, /Available on iPhone with iOS 17\.4 or later/);
  assert.match(oneTapUi, /Open this page in Safari for One-Tap Install/);
  assert.doesNotMatch(oneTapUi, /console\.(log|info|warn|debug)/);
  assert.doesNotMatch(oneTapUi, /gtag|analytics|trackEvent|dataLayer/i);

  assert.match(experience, /One-Tap Install eSIM|AppleOneTapInstallButton/);
  assert.match(experience, /AppleOneTapSafariGuidance|showSafariOneTapGuidance/);
  assert.match(experience, /Or install using QR code \/ manual details/);
  assert.match(experience, /If one-tap does not work, use manual install or the QR code/);
  assert.match(experience, /Download QR Code/);
  assert.match(experience, /Manual installation details/);
  assert.match(experience, /Installation guide/);
  assert.match(experience, /Important tips/);
  assert.doesNotMatch(experience, /Add data to this eSIM/i);
  assert.doesNotMatch(experience, /console\.(log|info|warn|debug)/);
  assert.doesNotMatch(experience, /mapesim\.com.*carddata|carddata=.*mapesim/i);

  assert.match(panel, /useAppleOneTapInstallState|EsimInstallExperience/);
  assert.match(panel, /showSafariOneTapGuidance/);
  assert.match(panel, /View QR Code & Details/);
  assert.doesNotMatch(panel, /console\.(log|info|warn|debug)/);
  assert.doesNotMatch(panel, /mapesim\.com.*carddata|carddata=.*mapesim/i);

  assert.match(successActions, /useAppleOneTapInstallState\(qrValue\)/);
  assert.match(successActions, /showSafariOneTapGuidance/);
  assert.match(successActions, /EsimInstallExperience/);
  assert.doesNotMatch(successActions, /console\.(log|info|warn|debug)/);
  console.log("PASS ui_surfaces_one_tap_safari_and_fallback");

  const iphoneApi = read("app/api/account/orders/[orderId]/iphone/route.ts");
  const vesimIphone = read("app/api/vesim/install/iphone/route.ts");
  assert.doesNotMatch(iphoneApi, /buildAppleEsimInstallUrl/);
  assert.doesNotMatch(vesimIphone, /buildAppleEsimInstallUrl/);
  assert.match(iphoneApi, /"carddata"/);
  assert.doesNotMatch(
    read("prisma/schema.prisma"),
    /appleInstall|oneTap|carddata|esimsetup/i
  );
  console.log("PASS no_map_redirect_invention_no_schema");

  const pkg = read("package.json");
  assert.match(pkg, /"qa:apple-one-tap-esim-install"/);
  console.log("PASS package_script");

  const extractSrc = read("app/lib/email/extract.ts");
  const orderDetails = read("app/api/vesim/order-details/route.ts");
  const successPage = read("app/success/page.tsx");
  assert.match(extractSrc, /function isLpaString/);
  assert.match(extractSrc, /resolvedQr = `LPA:1\$\$\{smdpAddress\}\$\$\{activationCode\}`/);
  assert.match(extractSrc, /isLikelyImagePayload/);
  assert.match(orderDetails, /qrValue:\s*install\.qrValue/);
  assert.match(successPage, /qrValue=\{order\?\.qrValue\}/);
  console.log("PASS success_qrValue_is_extract_lpa");

  console.log("ALL PASS qa-apple-one-tap-esim-install");
}

main();
