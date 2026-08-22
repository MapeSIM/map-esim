/**
 * Offline QA for basic device-compatibility UX (guidance only).
 * Does not call providers, invent device databases, or collect IMEI/EID/TAC.
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
  const plansListing = read("app/components/plans/PlansListing.tsx");
  const footer = read("app/components/Footer.tsx");
  const pkg = read("package.json");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const credit = read("app/lib/vesim/creditCheckout.ts");
  const payApply = read("app/lib/esim/esimPurchasePaymentApply.ts");

  console.log("1) Page route + SEO metadata");
  assert.match(page, /Check Device Compatibility/);
  assert.match(page, /<h1[\s\S]*Check Device Compatibility/);
  assert.match(page, /absoluteCanonical\("\/device-compatibility"\)/);
  assert.match(page, /robots:\s*\{\s*index:\s*true/);
  assert.match(page, /Browse eSIM Plans/);
  assert.match(page, /href="\/countries"/);
  assert.match(page, /Need Help\?/);
  assert.match(page, /href="\/support"/);
  console.log("   ok");

  console.log("2) No IMEI / EID / TAC collection UI");
  assert.doesNotMatch(page, /<input[\s\S]*?(IMEI|EID|TAC)/i);
  assert.doesNotMatch(page, /type=["'](?:tel|text)["'][^>]*(?:imei|eid|tac)/i);
  assert.match(page, /does not require IMEI, EID, or TAC/i);
  assert.ok(
    !existsSync(join(root, "app/components/deviceCompatibility/DeviceCompatibilityChecker.tsx")),
    "brand/model checker component must remain removed"
  );
  assert.ok(
    !existsSync(join(root, "app/lib/deviceCompatibility/catalog.ts")),
    "device family catalog must remain removed"
  );
  assert.doesNotMatch(page, /DEVICE_FAMILIES|Likely compatible|Device brand/);
  console.log("   ok");

  console.log("3) Footer entry points");
  assert.match(footer, /href:\s*["']\/device-compatibility["']/);
  assert.doesNotMatch(plansListing, /href="\/device-compatibility"/);
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
