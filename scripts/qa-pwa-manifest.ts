/**
 * Offline QA for PWA manifest, icons, and mobile dashboard snapshot wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function main() {
  const manifest = read("app/manifest.ts");
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /start_url:\s*"\/"/);
  assert.match(manifest, /short_name:\s*"MAP eSIM"/);
  assert.match(manifest, /shortcuts:/);
  assert.match(manifest, /\/account\/orders/);
  assert.match(manifest, /\/account\/wallet/);
  assert.match(manifest, /\/support/);
  assert.match(manifest, /\/icons\/icon-192/);
  assert.match(manifest, /\/icons\/maskable-512/);
  assert.match(manifest, /purpose:\s*"maskable"/);
  console.log("PASS manifest_standalone_shortcuts_icons");

  const layout = read("app/layout.tsx");
  assert.match(layout, /appleWebApp:/);
  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.match(layout, /themeColor:/);
  assert.match(layout, /apple-icon/);
  console.log("PASS layout_apple_viewport_theme");

  for (const rel of [
    "app/icons/icon-192/route.ts",
    "app/icons/icon-512/route.ts",
    "app/icons/maskable-192/route.ts",
    "app/icons/maskable-512/route.ts",
  ]) {
    const src = read(rel);
    assert.match(src, /createPwaIconResponse/);
  }
  console.log("PASS pwa_icon_routes");

  const snapshot = read("app/lib/orders/customerMobileEsimSnapshot.ts");
  assert.match(snapshot, /getCustomerMobileEsimSnapshot/);
  assert.doesNotMatch(snapshot, /executeCreditCheckout|getBrokerToken|\/api\/esim/);
  assert.match(snapshot, /providerRemainingDataGb|providerLifecycleStatus/);
  console.log("PASS mobile_snapshot_cache_only");

  const account = read("app/account/page.tsx");
  assert.match(account, /MobileActiveEsimSnapshot/);
  assert.match(account, /getCustomerMobileEsimSnapshot/);
  const card = read("app/components/account/MobileActiveEsimSnapshot.tsx");
  assert.match(card, /lg:hidden/);
  assert.match(card, /Data balance/);
  console.log("PASS account_mobile_data_strip");

  console.log("qa-pwa-manifest: OK");
}

main();
