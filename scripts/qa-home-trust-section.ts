/**
 * Offline QA: homepage trust bar (display only).
 * Does not start a server, mutate payments, or change checkout/API logic.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOME_TRUST_ITEMS,
  HOME_TRUST_SECTION_TITLE,
} from "../app/lib/home/homeTrustSection";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(HOME_TRUST_SECTION_TITLE, "Trusted Travel eSIM");
  assert.equal(HOME_TRUST_ITEMS.length, 5);
  assert.equal(HOME_TRUST_ITEMS[0]?.title, "Instant QR Delivery");
  assert.equal(
    HOME_TRUST_ITEMS[0]?.description,
    "Get your eSIM details quickly after purchase."
  );
  assert.equal(HOME_TRUST_ITEMS[1]?.title, "200+ Destinations");
  assert.equal(
    HOME_TRUST_ITEMS[1]?.description,
    "Stay connected across countries worldwide."
  );
  assert.equal(HOME_TRUST_ITEMS[2]?.title, "No Physical SIM Required");
  assert.equal(
    HOME_TRUST_ITEMS[2]?.description,
    "Use digital connectivity without swapping SIM cards."
  );
  assert.equal(HOME_TRUST_ITEMS[3]?.title, "Secure Payments");
  assert.equal(
    HOME_TRUST_ITEMS[3]?.description,
    "Safe and reliable payment experience."
  );
  assert.equal(HOME_TRUST_ITEMS[4]?.title, "24/7 Support");
  assert.equal(
    HOME_TRUST_ITEMS[4]?.description,
    "Help available when you need it."
  );
  console.log("PASS trust_copy");

  assert.ok(existsSync(join(root, "app/components/home/HomeTrustSection.tsx")));
  const home = read("app/page.tsx");
  const section = read("app/components/home/HomeTrustSection.tsx");
  const pkg = read("package.json");
  const prelaunch = read("scripts/qa-prelaunch.ts");
  const apply = read("app/lib/payments/applyVerifiedPaymentEvent.ts");
  const checkout = read("app/lib/vesim/creditCheckout.ts");

  const heroIdx = home.indexOf("{/* Hero */}");
  const trustIdx = home.indexOf("<HomeTrustSection");
  const categoriesIdx = home.indexOf("{/* Categories */}");
  assert.ok(heroIdx >= 0 && trustIdx > heroIdx);
  assert.ok(categoriesIdx > trustIdx);
  assert.match(home, /Stay connected abroad with travel eSIM plans/);
  console.log("PASS homepage_renders_trust_below_hero");

  assert.match(section, /aria-labelledby="home-trust-heading"/);
  assert.match(section, /id="home-trust-heading"/);
  assert.match(section, /lg:grid-cols-5/);
  assert.match(section, /grid-cols-1/);
  assert.match(section, /sm:grid-cols-2/);
  assert.match(section, /<ul/);
  assert.match(section, /<article/);
  assert.match(section, /aria-hidden="true"/);
  assert.match(section, /HOME_TRUST_SECTION_TITLE/);
  assert.match(section, /HOME_TRUST_ITEMS/);
  assert.doesNotMatch(section, /href="\/checkout"|href="\/payment"/);
  assert.doesNotMatch(section, /PAYMENT_GATEWAY_ENABLED|applyVerifiedPaymentEvent/);
  console.log("PASS trust_section_accessible_layout");

  assert.match(pkg, /qa:home-trust-section/);
  assert.match(prelaunch, /qa:home-trust-section/);
  assert.doesNotMatch(apply, /HomeTrustSection|HOME_TRUST_ITEMS/);
  assert.doesNotMatch(checkout, /HomeTrustSection|HOME_TRUST_ITEMS/);
  assert.doesNotMatch(home, /PAYMENT_GATEWAY_ENABLED|applyVerifiedPaymentEvent/);
  console.log("PASS payments_checkout_untouched");

  console.log("ALL PASS qa-home-trust-section");
}

main();
