/**
 * Offline QA for secure ADMIN + owning-CUSTOMER ICCID reveal.
 * Does not call VeSIM, decrypt production data, or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const reveal = read("app/lib/orders/iccidReveal.ts");
  const adminApi = read("app/api/admin/orders/[orderId]/iccid/route.ts");
  const customerApi = read("app/api/account/orders/[orderId]/iccid/route.ts");
  const panel = read("app/components/orders/IccidRevealPanel.tsx");
  const adminDetail = read("app/admin/orders/[id]/page.tsx");
  const adminOrders = read("app/lib/admin/orders.ts");
  const adminList = read("app/admin/orders/page.tsx");
  const customerDetail = read("app/account/orders/[orderId]/page.tsx");
  const customerOrders = read("app/lib/orders/customerOrders.ts");
  const customerList = read("app/account/orders/page.tsx");
  const pkg = read("package.json");

  assert.match(reveal, /import "server-only"/);
  assert.match(reveal, /decryptIccid/);
  assert.match(reveal, /role !== Role\.ADMIN/);
  assert.match(reveal, /role !== Role\.CUSTOMER/);
  assert.match(reveal, /userId:\s*customer\.id/);
  assert.match(reveal, /order\.iccid_revealed_admin/);
  assert.match(reveal, /order\.iccid_revealed_customer/);
  assert.doesNotMatch(reveal, /console\.(log|info|warn|error)\([^\n]*iccid/i);
  assert.match(reveal, /Never.*ICCID|never ICCID/i);
  console.log("PASS reveal_helpers_authorize_and_audit");

  assert.match(adminApi, /auth\(\)/);
  assert.match(adminApi, /revealIccidForAdmin/);
  assert.match(adminApi, /Role\.ADMIN/);
  assert.match(adminApi, /Cache-Control": "private, no-store"/);
  assert.match(adminApi, /,\s*404\)/);
  assert.doesNotMatch(adminApi, /formData\.get\("userId"\)|searchParams\.get\("userId"\)/);
  console.log("PASS admin_api_auth");

  assert.match(customerApi, /auth\(\)/);
  assert.match(customerApi, /revealIccidForCustomer/);
  assert.match(customerApi, /sessionRole !== "CUSTOMER"/);
  assert.match(customerApi, /Cache-Control": "private, no-store"/);
  assert.match(customerApi, /,\s*404\)/);
  assert.doesNotMatch(
    customerApi,
    /formData\.get\("userId"\)|searchParams\.get\("userId"\)|body\.userId/
  );
  console.log("PASS customer_api_owner_only");

  assert.match(panel, /"use client"/);
  assert.match(panel, /Show full ICCID/);
  assert.match(panel, /Copy ICCID/);
  assert.match(panel, /Hide ICCID/);
  assert.match(panel, /AUTO_HIDE_MS\s*=\s*60_000/);
  assert.match(panel, /method:\s*"POST"/);
  assert.match(panel, /cache:\s*"no-store"/);
  assert.match(panel, /disabled=\{!revealable/);
  console.log("PASS reveal_copy_hide_ui");

  assert.match(adminDetail, /IccidRevealPanel/);
  assert.match(adminDetail, /iccidRevealable/);
  assert.match(adminDetail, /\/api\/admin\/orders\//);
  assert.doesNotMatch(adminDetail, /decryptIccid/);
  assert.match(adminOrders, /iccidRevealable/);
  assert.match(adminOrders, /Boolean\(row\.iccidEncrypted/);
  assert.doesNotMatch(adminOrders, /decryptIccid/);
  assert.doesNotMatch(adminList, /IccidRevealPanel|Show full ICCID/);
  assert.match(adminList, /iccidMasked/);
  console.log("PASS admin_detail_list_rules");

  assert.match(customerDetail, /IccidRevealPanel/);
  assert.match(customerDetail, /iccidRevealable/);
  assert.match(customerDetail, /\/api\/account\/orders\//);
  assert.match(customerOrders, /iccidMasked/);
  assert.match(customerOrders, /userId:\s*owner\.id/);
  assert.match(customerList, /iccidMasked/);
  assert.doesNotMatch(customerList, /IccidRevealPanel|Show full ICCID|decryptIccid/);
  assert.doesNotMatch(customerOrders, /fetchBrokerOrderPayload|decryptIccid/);
  console.log("PASS customer_detail_list_rules");

  assert.match(pkg, /qa:iccid-reveal/);
  console.log("PASS package_script");

  console.log("ALL_QA_PASSED=iccid-reveal");
}

main();
