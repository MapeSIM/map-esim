/**
 * Offline QA for admin on-demand eSIM live usage + provider wallet soft-fail.
 * Does not call VeSIM or mutate the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const adminLib = read("app/lib/orders/adminEsimUsage.ts");
  const adminApi = read("app/api/admin/orders/[orderId]/usage/route.ts");
  const adminPanel = read("app/components/orders/AdminEsimUsagePanel.tsx");
  const adminPage = read("app/admin/orders/[id]/page.tsx");
  const customerLib = read("app/lib/orders/customerEsimUsage.ts");
  const walletLib = read("app/lib/vesim/providerWallet.ts");
  const walletApi = read("app/api/admin/provider-wallet/route.ts");
  const walletPanel = read("app/components/admin/ProviderWalletPanel.tsx");
  const opsPage = read("app/admin/operations/page.tsx");
  const alerts = read("app/lib/admin/monitoringAlerts.ts");
  const alertShared = read("app/lib/admin/monitoringAlertShared.ts");
  const pkg = read("package.json");

  assert.match(adminLib, /import "server-only"/);
  assert.match(adminLib, /normalizeProviderUsagePayload/);
  assert.match(adminLib, /readUsageCapability/);
  assert.match(adminLib, /fetchProviderUsage/);
  assert.match(adminLib, /USAGE_UNAVAILABLE/);
  assert.match(adminLib, /BAD_ICCID/);
  assert.match(adminLib, /NO_ICCID/);
  assert.match(adminLib, /TEMPORARY_ERROR/);
  assert.match(adminLib, /RATE_LIMITED/);
  assert.match(adminLib, /consumeRateLimit/);
  assert.match(adminLib, /30_000/);
  assert.doesNotMatch(adminApi, /iccid:\s/);
  assert.doesNotMatch(adminApi, /accessToken|refresh_token|VESIM_PASSWORD/i);
  assert.match(adminApi, /role !== Role\.ADMIN/);
  assert.match(adminPanel, /Check live usage|Refresh live usage/);
  assert.doesNotMatch(adminPanel, /setInterval/);
  assert.match(adminPanel, /Full ICCID is\s+never shown/);
  assert.doesNotMatch(adminApi, /\biccid\s*:/);
  assert.match(adminPage, /AdminEsimUsagePanel/);
  assert.match(customerLib, /export async function fetchProviderUsage/);
  assert.match(customerLib, /getBrokerToken/);
  assert.match(
    customerLib,
    /Authorization: `\$\{token\.tokenType\} \$\{token\.accessToken\}`/
  );
  assert.doesNotMatch(customerLib, /vesimAuthorizedFetch/);
  console.log("PASS admin_usage_surface");

  assert.match(walletLib, /\/api\/wallet\/balance/);
  assert.match(walletLib, /\/api\/wallet\/transactions/);
  assert.match(walletLib, /WALLET_TIMEOUT_MS/);
  assert.doesNotMatch(walletLib, /\b(creditBalance|debitBalance|topUpWallet)\b/i);
  assert.doesNotMatch(walletPanel, /Top up|Credit wallet|Debit wallet/i);
  assert.match(walletApi, /Role\.ADMIN/);
  assert.match(walletApi, /TEMPORARILY UNAVAILABLE|VERIFIED/);
  assert.doesNotMatch(walletApi, /access_token|refresh_token/);
  assert.match(walletPanel, /Refresh provider wallet/);
  assert.match(walletPanel, /NOT CHECKED \/ ON-DEMAND/);
  assert.match(walletPanel, /TEMPORARILY UNAVAILABLE/);
  assert.match(walletPanel, /VERIFIED/);
  assert.doesNotMatch(walletPanel, /setInterval/);
  assert.match(opsPage, /ProviderWalletPanel/);
  assert.doesNotMatch(opsPage, /fetchProviderWalletSnapshot/);
  console.log("PASS provider_wallet_on_demand_soft_fail");

  assert.doesNotMatch(alerts, /PROVIDER_BALANCE_NOT_VERIFIED/);
  assert.doesNotMatch(alertShared, /PROVIDER_BALANCE_NOT_VERIFIED/);
  console.log("PASS balance_not_verified_alert_retired");

  assert.match(pkg, /qa:vesim-broker-auth/);
  assert.match(pkg, /qa:admin-esim-usage/);
  console.log("PASS package_scripts");

  console.log("ALL PASS qa-admin-esim-usage");
}

main();
