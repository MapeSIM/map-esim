/**
 * Offline QA: Home Screen eSIM Data Usage widget + Navbar Check Usage.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyHomeUsageQuery,
  formatHomeUsageExpiryCountdown,
  formatHomeUsageGb,
  homeUsageBarTone,
  homeUsageRemainingRatio,
  homeUsageStatusBadge,
  HOME_ESIM_USAGE_STORAGE_KEY,
} from "../app/lib/esim/homeUsageLookupShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(classifyHomeUsageQuery("8991234567890123456").kind, "iccid");
  assert.equal(classifyHomeUsageQuery("ord_abc123XYZ").kind, "orderId");
  assert.equal(classifyHomeUsageQuery("nope").kind, "invalid");
  assert.equal(homeUsageStatusBadge({ lifecycleStatus: "ACTIVE" }), "Active");
  assert.equal(
    homeUsageStatusBadge({ lifecycleStatus: "NOT_ACTIVE" }),
    "Ready to Install"
  );
  assert.equal(homeUsageStatusBadge({ lifecycleStatus: "EXPIRED" }), "Expired");
  assert.equal(homeUsageRemainingRatio(1, 5), 0.2);
  assert.equal(homeUsageBarTone(0.21), "emerald");
  assert.equal(homeUsageBarTone(0.2), "amber");
  assert.equal(formatHomeUsageGb(3.2), "3.2 GB");
  assert.match(
    formatHomeUsageExpiryCountdown({ daysRemaining: 3 }) || "",
    /Expires in 3 days/
  );
  assert.equal(HOME_ESIM_USAGE_STORAGE_KEY, "mapesim.homeEsimUsage.v1");
  console.log("PASS home_usage_shared_helpers");

  const page = read("app/page.tsx");
  const widget = read("app/components/home/HomeEsimUsageWidget.tsx");
  const navbar = read("app/components/Navbar.tsx");
  const lookup = read("app/lib/esim/homeUsageLookup.ts");
  const lookupApi = read("app/api/esim-usage/lookup/route.ts");
  const accountApi = read("app/api/account/esims/home-usage/route.ts");
  const checkout = read("app/checkout/CheckoutClient.tsx");
  const shared = read("app/lib/esim/homeUsageLookupShared.ts");

  assert.match(page, /HomeEsimUsageWidget/);
  assert.match(page, /id="esim-usage"|HomeEsimUsageWidget/);
  // Usage sits after Popular destinations (discovery first).
  assert.ok(
    page.indexOf("<HomePopularDestinations") <
      page.indexOf("<HomeEsimUsageWidget")
  );
  assert.match(widget, /id="esim-usage"/);
  assert.match(widget, /eSIM Data Usage/);
  assert.match(widget, /Check another eSIM/);
  assert.match(widget, /Where to find ICCID/);
  assert.match(widget, /Settings → General → About/);
  assert.match(widget, /Top Up \/ Buy Again|View QR \/ Details/);
  assert.match(widget, /p-4[\s\S]*?sm:p-6/);
  assert.match(widget, /min-w-0/);
  assert.match(widget, /overflow-x-hidden/);
  assert.match(widget, /writeHomeEsimUsageLookup|readHomeEsimUsageLookup/);
  assert.match(widget, /\/api\/account\/esims\/home-usage/);
  assert.match(widget, /\/api\/esim-usage\/lookup/);
  assert.match(navbar, /Check Usage/);
  assert.match(navbar, /\/#esim-usage/);
  assert.match(navbar, /onCheckUsageClick|scrollIntoView/);
  assert.match(lookup, /import "server-only"/);
  assert.match(lookup, /fetchProviderUsage/);
  assert.match(lookup, /hashIccid|resolveOrderIccidPlaintext/);
  assert.doesNotMatch(lookupApi, /\biccid\s*:/);
  assert.doesNotMatch(accountApi, /\biccid\s*:/);
  assert.match(lookupApi, /lookupHomeEsimUsage/);
  assert.match(accountApi, /getCustomerMobileEsimSnapshot/);
  assert.match(accountApi, /getCustomerOwnedOrderUsage/);
  assert.match(checkout, /writeHomeEsimUsageLookup/);
  assert.match(shared, /HOME_ESIM_USAGE_STORAGE_KEY/);
  console.log("PASS home_usage_wiring");
  console.log("ALL PASS qa-home-esim-usage");
}

main();
