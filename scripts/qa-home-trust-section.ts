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
  assert.equal(HOME_TRUST_ITEMS[3]?.title, "Verified Payments");
  assert.equal(
    HOME_TRUST_ITEMS[3]?.description,
    "Payment is confirmed before your eSIM is delivered."
  );
  assert.equal(HOME_TRUST_ITEMS[4]?.title, "Support Available");
  assert.equal(
    HOME_TRUST_ITEMS[4]?.description,
    "Get help from our Support Center when you need it."
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
  const popularIdx = home.indexOf("<HomePopularDestinations");
  assert.ok(heroIdx >= 0 && trustIdx > heroIdx);
  assert.ok(popularIdx > trustIdx);
  assert.match(home, /Stay connected wherever you travel/);
  console.log("PASS homepage_renders_trust_below_hero");

  assert.match(section, /aria-labelledby="home-trust-heading"/);
  assert.match(section, /id="home-trust-heading"/);
  assert.match(section, /<ul/);
  assert.match(section, /aria-hidden="true"/);
  assert.match(section, /HOME_TRUST_SECTION_TITLE/);
  assert.match(section, /HOME_TRUST_ITEMS/);
  // Compact chip bar on all breakpoints (no tall desktop card grid).
  assert.match(section, /rounded-full/);
  assert.match(section, /aria-label="Trust highlights"/);
  assert.match(section, /flex flex-wrap/);
  assert.doesNotMatch(section, /lg:grid-cols-5/);
  assert.doesNotMatch(section, /<article/);
  // Support / Destinations trust chips link to existing routes.
  assert.match(section, /return "\/support"/);
  assert.match(section, /return "\/countries"/);
  assert.match(section, /href=\{href\}/);
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
