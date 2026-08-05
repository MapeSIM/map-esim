/**
 * Safe static QA for the guest VeSIM checkout production safety gate.
 * Does not call VeSIM, create orders, or send email.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

/** Mirror of server gate predicate — exact "true" only. */
function isEnabled(value: string | undefined): boolean {
  return value === "true";
}

function main() {
  console.log("1) Fail-closed predicate");
  assert.equal(isEnabled(undefined), false);
  assert.equal(isEnabled(""), false);
  assert.equal(isEnabled("false"), false);
  assert.equal(isEnabled("TRUE"), false);
  assert.equal(isEnabled(" true"), false);
  assert.equal(isEnabled("true "), false);
  assert.equal(isEnabled("1"), false);
  assert.equal(isEnabled("true"), true);

  console.log("2) Gate module is server-only and exact-match");
  const gate = read("app/lib/vesim/guestCheckoutGate.ts");
  assert.match(gate, /import\s+"server-only"/);
  assert.match(
    gate,
    /process\.env\.ENABLE_GUEST_VESIM_CHECKOUT\s*===\s*"true"/
  );
  assert.doesNotMatch(gate, /NEXT_PUBLIC_ENABLE_GUEST/);

  console.log("3) API route fails closed before provider work");
  const route = read("app/api/vesim/checkout/route.ts");
  assert.match(route, /isGuestVesimCheckoutEnabled/);
  assert.match(route, /status:\s*503/);
  assert.match(route, /GUEST_CHECKOUT_UNAVAILABLE_MESSAGE/);

  const postFn = route.indexOf("export async function POST");
  assert.ok(postFn >= 0, "POST handler must exist");
  const handler = route.slice(postFn);
  const gateCall = handler.indexOf("isGuestVesimCheckoutEnabled()");
  const verifyCall = handler.indexOf("await verifyOfferAuthoritative");
  const tokenCall = handler.indexOf("await getBrokerToken");
  const creditCall = handler.indexOf("/api/checkout/credit");
  assert.ok(gateCall >= 0, "gate must be present in POST");
  assert.ok(gateCall < verifyCall, "gate before offer verification");
  assert.ok(gateCall < tokenCall, "gate before broker token");
  assert.ok(gateCall < creditCall, "gate before provider checkout");
  // Disabled path must return before any await of provider helpers.
  const earlyReturn = handler.indexOf("status: 503");
  assert.ok(earlyReturn >= 0 && earlyReturn < verifyCall, "503 before provider");

  console.log("4) Checkout UI uses server prop; no public override env");
  const page = read("app/checkout/page.tsx");
  assert.match(page, /isGuestVesimCheckoutEnabled/);
  assert.match(page, /CheckoutClient/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_ENABLE_GUEST/);

  const client = read("app/checkout/CheckoutClient.tsx");
  assert.match(client, /guestCheckoutEnabled/);
  assert.match(
    client,
    /Online checkout is temporarily unavailable\. Please contact support for assistance\./
  );
  assert.match(client, /href="\/contact"/);
  assert.doesNotMatch(client, /Testing mode/);
  assert.doesNotMatch(client, /staging order/i);
  assert.doesNotMatch(client, /NEXT_PUBLIC_ENABLE_GUEST/);

  console.log("5) Wallet/admin paths do not use the guest API route");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  assert.match(wallet, /executeCreditCheckout/);
  assert.doesNotMatch(wallet, /\/api\/vesim\/checkout/);
  assert.doesNotMatch(wallet, /isGuestVesimCheckoutEnabled/);

  const credit = read("app/lib/vesim/creditCheckout.ts");
  assert.doesNotMatch(credit, /isGuestVesimCheckoutEnabled/);
  assert.doesNotMatch(credit, /ENABLE_GUEST_VESIM_CHECKOUT/);

  console.log("6) Env documentation defaults to disabled");
  const envExample = read(".env.example");
  assert.match(envExample, /ENABLE_GUEST_VESIM_CHECKOUT=false/);
  assert.match(envExample, /fail closed|Keep false in production/i);

  const readme = read("README.md");
  assert.match(readme, /ENABLE_GUEST_VESIM_CHECKOUT/);
  assert.match(readme, /Keep `ENABLE_GUEST_VESIM_CHECKOUT=false` in production/);

  console.log("qa-guest-checkout-gate: OK");
}

main();
