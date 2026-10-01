/**
 * Offline QA: Admin partner wallet credit/debit request-security hardening.
 * Does not mutate DB, call providers, or move funds.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `missing export async function ${name}`);
  const nextExport = source.indexOf("\nexport async function ", start + 1);
  const end = nextExport >= 0 ? nextExport : source.length;
  return source.slice(start, end);
}

function main() {
  const actionsPath = "app/lib/partner/partnersActions.ts";
  const servicePath = "app/lib/partner/partnerWallet.ts";
  assert.ok(existsSync(join(root, actionsPath)));
  assert.ok(existsSync(join(root, servicePath)));

  const actions = read(actionsPath);
  const service = read(servicePath);
  const pkg = read("package.json");
  const credit = extractFunction(actions, "creditPartnerWalletAction");
  const debit = extractFunction(actions, "debitPartnerWalletAction");

  console.log("1) Same-origin on both credit and debit actions");
  assert.match(actions, /assertSameOriginAdminRequest/);
  assert.match(credit, /assertSameOriginAdminRequest/);
  assert.match(debit, /assertSameOriginAdminRequest/);
  // Gate before wallet service mutation.
  assert.ok(
    credit.indexOf("assertSameOriginAdminRequest") <
      credit.indexOf("creditPartnerWalletByAdmin")
  );
  assert.ok(
    debit.indexOf("assertSameOriginAdminRequest") <
      debit.indexOf("debitPartnerWalletByAdmin")
  );
  console.log("   ok");

  console.log("2) Dual rate limits (per-admin + per-partner)");
  assert.match(actions, /consumeRateLimit/);
  assert.match(actions, /PARTNER_WALLET_ADJUST_ADMIN_LIMIT\s*=\s*20/);
  assert.match(actions, /PARTNER_WALLET_ADJUST_PARTNER_LIMIT\s*=\s*8/);
  assert.match(
    actions,
    /PARTNER_WALLET_ADJUST_WINDOW_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/
  );
  assert.match(
    actions,
    /key:\s*`partner-wallet-adjust:admin:\$\{options\.adminUserId\}`/
  );
  assert.match(
    actions,
    /key:\s*`partner-wallet-adjust:partner:\$\{options\.partnerId\}`/
  );
  assert.match(actions, /limit:\s*PARTNER_WALLET_ADJUST_ADMIN_LIMIT/);
  assert.match(actions, /limit:\s*PARTNER_WALLET_ADJUST_PARTNER_LIMIT/);
  assert.match(credit, /enforcePartnerWalletAdjustRateLimits/);
  assert.match(debit, /enforcePartnerWalletAdjustRateLimits/);
  assert.ok(
    credit.indexOf("enforcePartnerWalletAdjustRateLimits") <
      credit.indexOf("creditPartnerWalletByAdmin")
  );
  assert.ok(
    debit.indexOf("enforcePartnerWalletAdjustRateLimits") <
      debit.indexOf("debitPartnerWalletByAdmin")
  );
  console.log("   ok");

  console.log("3) Authorization unchanged (ADMIN + PARTNERS_MANAGE)");
  assert.match(credit, /requireRole\(\s*["']ADMIN["']\s*\)/);
  assert.match(debit, /requireRole\(\s*["']ADMIN["']\s*\)/);
  assert.match(credit, /assertAdminPermission\(\s*admin\.id,\s*["']PARTNERS_MANAGE["']\s*\)/);
  assert.match(debit, /assertAdminPermission\(\s*admin\.id,\s*["']PARTNERS_MANAGE["']\s*\)/);
  assert.doesNotMatch(credit, /WALLET_ADJUST/);
  assert.doesNotMatch(debit, /WALLET_ADJUST/);
  assert.doesNotMatch(actions, /creditPartnerWalletAction[\s\S]*WALLET_ADJUST/);
  console.log("   ok");

  console.log("4) Still delegates to existing accounting services");
  assert.match(credit, /creditPartnerWalletByAdmin\s*\(/);
  assert.match(debit, /debitPartnerWalletByAdmin\s*\(/);
  assert.match(service, /PartnerWalletTransactionType\.ADMIN_CREDIT/);
  assert.match(service, /PartnerWalletTransactionType\.ADMIN_DEBIT/);
  assert.match(service, /updateMany/);
  assert.match(service, /idempotencyKey/);
  assert.match(service, /createdByAdminId/);
  console.log("   ok");

  console.log("5) partnerWallet.ts not modified in this change set");
  let serviceDiff = "";
  try {
    serviceDiff = execFileSync(
      "git",
      ["diff", "--", servicePath],
      { cwd: root, encoding: "utf8" }
    );
  } catch {
    serviceDiff = "GIT_DIFF_UNAVAILABLE";
  }
  assert.equal(
    serviceDiff.trim(),
    "",
    "partnerWallet.ts must remain unmodified"
  );
  console.log("   ok");

  console.log("6) Package script + no Prisma/payment/provider edits in actions");
  assert.match(pkg, /qa:admin-partner-wallet-security/);
  assert.doesNotMatch(actions, /prisma\.\$executeRaw|migrate|simpaisa|vesim/i);
  assert.doesNotMatch(actions, /discountBps|PARTNER_ESIM_SPLIT/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=admin-partner-wallet-security");
}

main();
