/**
 * Offline QA: temporary payment/provider debug trace markers removed.
 * Does not mutate DB or call providers.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function gitDiff(rel: string): string {
  try {
    return execFileSync("git", ["diff", "--", rel], {
      cwd: root,
      encoding: "utf8",
    });
  } catch {
    return "GIT_DIFF_UNAVAILABLE";
  }
}

const FORBIDDEN_MARKERS = [
  "PARTNER_BUY_TRACE",
  "RELEASE_STALE_TRACE",
  "simpaisa_sandbox_trace",
  "VERIFY_REQUEST",
  "VERIFY_START",
  "VERIFY_OK",
  "RESUME_WAITING_PAGE",
  "RESUME_SKIP_VERIFY",
  "CREATE_SESSION_START",
] as const;

const SCOPED_FILES = [
  "app/lib/partner/partnerPurchaseBuy.ts",
  "app/lib/partner/partnerEsimPurchase.ts",
  "app/lib/partner/partnerEsimPurchaseProvider.ts",
  "app/lib/partner/partnerEsimPurchaseGatewayCheckout.ts",
  "app/lib/admin/staleGatewayReservationRelease.ts",
  "app/lib/payments/simpaisaHttp.ts",
  "app/lib/payments/simpaisaAdapter.ts",
  "app/lib/esim/esimPurchaseGatewayCheckout.ts",
] as const;

function main() {
  console.log("1) Forbidden temporary trace markers absent from scoped files");
  for (const rel of SCOPED_FILES) {
    const src = read(rel);
    for (const marker of FORBIDDEN_MARKERS) {
      assert.doesNotMatch(
        src,
        new RegExp(marker),
        `${rel} still contains ${marker}`
      );
    }
  }
  console.log("   ok");

  console.log("2) Essential operational failure logging retained");
  assert.match(read("app/lib/partner/partnerPurchaseBuy.ts"), /partner_buy/);
  assert.match(
    read("app/lib/partner/partnerEsimPurchase.ts"),
    /partner_esim_reserve/
  );
  assert.match(
    read("app/lib/partner/partnerEsimPurchaseProvider.ts"),
    /partner_esim_finalize/
  );
  assert.match(
    read("app/lib/partner/partnerEsimPurchaseGatewayCheckout.ts"),
    /partner_esim_gateway/
  );
  assert.match(
    read("app/lib/admin/staleGatewayReservationRelease.ts"),
    /stale_gateway_release/
  );
  assert.match(
    read("app/lib/payments/simpaisaAdapter.ts"),
    /VERIFY_FAILED|CREATE_CHECKOUT_FAILED/
  );
  assert.match(
    read("app/lib/payments/simpaisaHttp.ts"),
    /NETWORK_ERROR|HTTP_ERROR|VERIFY_TIMEOUT|INVALID_JSON/
  );
  console.log("   ok");

  console.log("3) No payment/wallet/provider/schema logic files changed beyond logging");
  assert.equal(gitDiff("prisma/schema.prisma").trim(), "", "prisma schema");
  assert.equal(
    gitDiff("app/lib/partner/partnerWallet.ts").trim(),
    "",
    "partnerWallet.ts"
  );
  assert.equal(
    gitDiff("app/lib/partner/partnerPurchaseWallet.ts").trim(),
    "",
    "partnerPurchaseWallet.ts"
  );
  const recoveryQa = read("scripts/qa-admin-payment-recovery.ts");
  assert.doesNotMatch(recoveryQa, /assert\.match\(release,\s*\/RELEASE_STALE_TRACE\//);
  assert.match(recoveryQa, /assert\.doesNotMatch\(release,\s*\/RELEASE_STALE_TRACE\//);
  console.log("   ok");

  console.log("ALL_QA_PASSED=payment-trace-cleanup");
}

main();
