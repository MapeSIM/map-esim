/**
 * Offline QA for Phase 8D-A VeSIM staging/live environment safety guard.
 * Mocks/static verification only — never calls VeSIM or mutates wallets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VESIM_APPROVED_HOSTS,
  VESIM_ENV_ERROR_CODE,
  VESIM_ENV_PUBLIC_ERROR,
  VESIM_LIVE_HOST_UNCONFIRMED_CODE,
  VESIM_STAGING_BROKER_HOSTS,
  validateVesimEnvironmentConfig,
} from "../app/lib/vesim/environmentPolicy";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.deepEqual(
    [...VESIM_STAGING_BROKER_HOSTS].sort(),
    ["vesim.xyz", "www.vesim.xyz"].sort()
  );
  assert.deepEqual(VESIM_APPROVED_HOSTS.live, []);
  console.log("PASS confirmed_staging_hosts");

  assert.equal(
    validateVesimEnvironmentConfig({
      environment: undefined,
      baseUrl: "https://www.vesim.xyz",
    }).ok,
    false
  );
  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "",
      baseUrl: "https://www.vesim.xyz",
    }).ok,
    false
  );
  console.log("PASS missing_environment_blocks");

  // "production" aliases to live; staging host must still fail live allowlist.
  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "production",
      baseUrl: "https://www.vesim.xyz",
      liveBrokerHosts: ["www.vesim.world"],
    }).ok,
    false
  );
  console.log("PASS invalid_environment_host_pairing_blocks");

  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "staging",
      baseUrl: "not-a-url",
    }).ok,
    false
  );
  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "staging",
      baseUrl: "http://www.vesim.xyz",
    }).ok,
    false
  );
  console.log("PASS malformed_base_url_blocks");

  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "staging",
      baseUrl: "https://evil.example",
    }).ok,
    false
  );
  console.log("PASS unknown_host_blocks");

  const stagingOk = validateVesimEnvironmentConfig({
    environment: "staging",
    baseUrl: "https://www.vesim.xyz/",
  });
  assert.equal(stagingOk.ok, true);
  if (stagingOk.ok) {
    assert.equal(stagingOk.mode, "staging");
    assert.equal(stagingOk.baseUrl, "https://www.vesim.xyz");
    assert.equal(stagingOk.host, "www.vesim.xyz");
  }
  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "staging",
      baseUrl: "https://vesim.xyz",
    }).ok,
    true
  );
  console.log("PASS valid_staging_configuration");

  const liveEmpty = validateVesimEnvironmentConfig({
    environment: "live",
    baseUrl: "https://www.vesim.xyz",
    liveBrokerHosts: [],
  });
  assert.equal(liveEmpty.ok, false);
  if (!liveEmpty.ok) {
    assert.equal(liveEmpty.code, VESIM_LIVE_HOST_UNCONFIRMED_CODE);
  }

  const liveCom = validateVesimEnvironmentConfig({
    environment: "live",
    baseUrl: "https://www.vesim.com",
    liveBrokerHosts: [],
  });
  assert.equal(liveCom.ok, false);
  if (!liveCom.ok) {
    assert.equal(liveCom.code, VESIM_LIVE_HOST_UNCONFIRMED_CODE);
  }

  const liveWorld = validateVesimEnvironmentConfig({
    environment: "live",
    baseUrl: "https://vesim.world",
    liveBrokerHosts: [],
  });
  assert.equal(liveWorld.ok, false);
  if (!liveWorld.ok) {
    assert.equal(liveWorld.code, VESIM_LIVE_HOST_UNCONFIRMED_CODE);
  }

  // Even if someone passes a guessed host into validation without updating
  // the server-only allowlist, empty allowlist still fails closed.
  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "live",
      baseUrl: "https://vesim.com",
      liveBrokerHosts: [],
    }).ok,
    false
  );
  console.log("PASS live_mode_fails_closed");

  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "staging",
      baseUrl: "https://www.vesim.com",
    }).ok,
    false
  );
  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "staging",
      baseUrl: "https://vesim.world",
    }).ok,
    false
  );
  // Unconfirmed guesses must not pass. Official live host is www.vesim.world only.
  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "live",
      baseUrl: "https://vesim.com",
      liveBrokerHosts: ["www.vesim.world"],
    }).ok,
    false
  );
  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "live",
      baseUrl: "https://www.vesim.com",
      liveBrokerHosts: ["www.vesim.world"],
    }).ok,
    false
  );
  assert.equal(
    validateVesimEnvironmentConfig({
      environment: "live",
      baseUrl: "https://vesim.world",
      liveBrokerHosts: ["www.vesim.world"],
    }).ok,
    false
  );
  const liveOfficial = validateVesimEnvironmentConfig({
    environment: "production",
    baseUrl: "https://www.vesim.world",
    liveBrokerHosts: ["www.vesim.world"],
  });
  assert.equal(liveOfficial.ok, true);
  if (liveOfficial.ok) {
    assert.equal(liveOfficial.mode, "live");
    assert.equal(liveOfficial.host, "www.vesim.world");
  }
  console.log("PASS official_www_vesim_world_live_accepted");

  assert.ok(!JSON.stringify(liveEmpty).includes("vesim.com"));
  assert.ok(!JSON.stringify(liveEmpty).includes("vesim.world"));
  assert.ok(!VESIM_ENV_PUBLIC_ERROR.toLowerCase().includes("staging"));
  assert.ok(!VESIM_ENV_PUBLIC_ERROR.toLowerCase().includes("sandbox"));
  assert.equal(VESIM_ENV_ERROR_CODE, "VESIM_ENV_INVALID");
  assert.equal(
    VESIM_LIVE_HOST_UNCONFIRMED_CODE,
    "VESIM_LIVE_HOST_UNCONFIRMED"
  );
  console.log("PASS failures_opaque_no_network");

  const server = read("app/lib/vesim/server.ts");
  const envMod = read("app/lib/vesim/environment.ts");
  const activation = read("app/lib/email/activation.ts");
  const credit = read("app/lib/vesim/creditCheckout.ts");
  const destinations = read("app/api/vesim/destinations/route.ts");
  const offers = read("app/api/vesim/offers/route.ts");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const checkoutPage = read("app/checkout/CheckoutClient.tsx");
  const walletPurchase = read("app/lib/esim/walletPurchase.ts");
  const adminAssign = read("app/lib/esim/adminPackageAssignment.ts");
  const envExample = read(".env.example");
  const readme = read("README.md");
  const pkg = read("package.json");

  assert.match(envMod, /VESIM_LIVE_BROKER_HOSTS/);
  assert.match(envMod, /resolveLiveBrokerHosts/);
  assert.match(envMod, /"www\.vesim\.world"/);
  assert.match(envMod, /VESIM_LIVE_HOST_UNCONFIRMED/);
  assert.match(envMod, /liveBrokerHosts:\s*resolveLiveBrokerHosts\(env\)/);
  assert.doesNotMatch(
    envMod,
    /VESIM_LIVE_BROKER_HOSTS[^=]*=\s*\[[^\]]*vesim\.com/
  );
  assert.match(activation, /vesim\.com/);
  assert.match(activation, /vesim\.xyz/);
  assert.doesNotMatch(activation, /VESIM_LIVE_BROKER_HOSTS|getVesimBaseUrl/);
  console.log("PASS live_allowlist_official_host_activation_separate");

  assert.match(server, /resolveValidatedVesimBaseUrl/);
  assert.match(envMod, /import "server-only"/);
  assert.match(credit, /VesimEnvironmentError/);
  assert.match(destinations, /fetchPublicDestinationCatalog|fetchDestinations/);
  assert.doesNotMatch(destinations, /process\.env\.VESIM_PASSWORD/);
  assert.match(offers, /fetchOffersForCountry/);
  console.log("PASS shared_boundary_wired");

  assert.match(guestGate, /ENABLE_GUEST_VESIM_CHECKOUT/);
  assert.match(walletPurchase, /executeCreditCheckout/);
  assert.match(adminAssign, /getBrokerToken/);
  console.log("PASS existing_flows_structurally_unchanged");

  assert.doesNotMatch(checkoutPage, /staging|sandbox|testing/i);
  assert.match(checkoutPage, /\/contact/);
  console.log("PASS public_ui_no_environment_copy");

  assert.match(envExample, /VESIM_ENVIRONMENT=staging/);
  assert.match(envExample, /www\.vesim\.world/);
  assert.match(readme, /www\.vesim\.xyz/);
  assert.match(readme, /www\.vesim\.world/);
  assert.match(readme, /Keep `ENABLE_GUEST_VESIM_CHECKOUT=false` in production/);
  assert.match(pkg, /"qa:vesim-environment"/);
  console.log("PASS docs_and_package_script");

  console.log("ALL_QA_PASSED=vesim-environment");
}

main();
