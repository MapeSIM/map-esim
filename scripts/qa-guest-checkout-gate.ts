/**
 * Safe static QA for the guest checkout admin toggle + API gate.
 * Does not call VeSIM, create orders, or send email.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function main() {
  console.log("1) Gate module is server-only and DB-backed");
  const gate = read("app/lib/vesim/guestCheckoutGate.ts");
  assert.match(gate, /import\s+"server-only"/);
  assert.match(gate, /guestCheckoutConfig/);
  assert.match(gate, /ENABLE_GUEST_VESIM_CHECKOUT\s*===\s*"false"/);
  assert.match(gate, /isGuestVesimCheckoutEnabled/);
  assert.doesNotMatch(gate, /NEXT_PUBLIC_ENABLE_GUEST/);

  console.log("2) Prisma model + migration present");
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model GuestCheckoutConfig/);
  assert.match(schema, /enabled\s+Boolean\s+@default\(true\)/);
  const migration = read(
    "prisma/migrations/20261114150000_add_guest_checkout_config/migration.sql"
  );
  assert.match(migration, /CREATE TABLE "GuestCheckoutConfig"/);
  assert.match(migration, /'default'/);

  console.log("3) API route fails closed before provider work");
  const route = read("app/api/vesim/checkout/route.ts");
  assert.match(route, /isGuestVesimCheckoutEnabled/);
  assert.match(route, /status:\s*503/);
  assert.match(route, /GUEST_CHECKOUT_UNAVAILABLE_MESSAGE/);

  const postFn = route.indexOf("export async function POST");
  assert.ok(postFn >= 0, "POST handler must exist");
  const handler = route.slice(postFn);
  const gateCall = handler.indexOf("await isGuestVesimCheckoutEnabled()");
  const verifyCall = handler.indexOf("await verifyOfferAuthoritative");
  const tokenCall = handler.indexOf("await getBrokerToken");
  const creditCall = handler.indexOf("/api/checkout/credit");
  assert.ok(gateCall >= 0, "gate must be present in POST");
  assert.ok(gateCall < verifyCall, "gate before offer verification");
  assert.ok(gateCall < tokenCall, "gate before broker token");
  assert.ok(gateCall < creditCall, "gate before provider checkout");
  const earlyReturn = handler.indexOf("status: 503");
  assert.ok(earlyReturn >= 0 && earlyReturn < verifyCall, "503 before provider");

  console.log("4) Guest manual payment also gated");
  const manual = read("app/api/checkout/manual-payment/route.ts");
  assert.match(manual, /isGuestVesimCheckoutEnabled/);
  assert.match(manual, /createManualPendingOrderFromGuest/);

  console.log("5) Checkout UI uses server prop; sign-in CTA when disabled");
  const page = read("app/checkout/page.tsx");
  assert.match(page, /await isGuestVesimCheckoutEnabled/);
  assert.match(page, /CheckoutClient/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_ENABLE_GUEST/);

  const client = read("app/checkout/CheckoutClient.tsx");
  assert.match(client, /guestCheckoutEnabled/);
  assert.match(client, /Sign in to checkout|sign in or create an account/i);
  assert.match(client, /href="\/signin/);
  assert.match(client, /href="\/signup/);
  assert.doesNotMatch(client, /NEXT_PUBLIC_ENABLE_GUEST/);

  console.log("6) Admin panel + API toggle");
  const panel = read("app/components/admin/GuestCheckoutConfigPanel.tsx");
  assert.match(panel, /Guest Checkout/);
  assert.match(panel, /\/api\/admin\/operations\/guest-checkout/);
  const adminApi = read("app/api/admin/operations/guest-checkout/route.ts");
  assert.match(adminApi, /guestCheckoutConfig\.upsert/);
  assert.match(adminApi, /requireActiveAdminForOperations/);
  const opsPage = read("app/admin/operations/page.tsx");
  assert.match(opsPage, /GuestCheckoutConfigPanel/);

  console.log("7) Wallet/admin paths do not use the guest API route");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  assert.match(wallet, /executeCreditCheckout/);
  assert.doesNotMatch(wallet, /\/api\/vesim\/checkout/);
  assert.doesNotMatch(wallet, /isGuestVesimCheckoutEnabled/);

  const credit = read("app/lib/vesim/creditCheckout.ts");
  assert.doesNotMatch(credit, /isGuestVesimCheckoutEnabled/);
  assert.doesNotMatch(credit, /ENABLE_GUEST_VESIM_CHECKOUT/);

  console.log("8) Env docs — emergency kill switch only");
  const envExample = read(".env.example");
  assert.match(envExample, /ENABLE_GUEST_VESIM_CHECKOUT/);
  assert.match(envExample, /emergency|kill switch|Admin ON\/OFF/i);

  const readme = read("README.md");
  assert.match(readme, /GuestCheckoutConfig|Guest Checkout/);
  assert.match(readme, /ENABLE_GUEST_VESIM_CHECKOUT=false/);

  console.log("qa-guest-checkout-gate: OK");
}

main();
