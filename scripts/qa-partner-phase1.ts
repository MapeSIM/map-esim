/**
 * Offline QA for Partner Portal Phase 1 (identity, wallet, admin, portal shell).
 * Does not mutate production DB or send email.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatDiscountBpsAsPercent,
  parseDiscountPercentToBps,
} from "../app/lib/partner/discount";
import { coerceAppRole } from "../app/lib/auth/appRole";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  // A/B/C — role allowlist
  assert.equal(coerceAppRole("CUSTOMER"), "CUSTOMER");
  assert.equal(coerceAppRole("ADMIN"), "ADMIN");
  assert.equal(coerceAppRole("PARTNER"), "PARTNER");
  assert.equal(coerceAppRole("OTHER"), null);
  assert.equal(coerceAppRole(undefined), null);
  console.log("PASS role_allowlist_preserves_customer_admin_partner");

  const authTs = read("auth.ts");
  assert.doesNotMatch(
    authTs,
    /role:\s*user\.role\s*===\s*["']ADMIN["']\s*\?\s*["']ADMIN["']\s*:\s*["']CUSTOMER["']/
  );
  assert.doesNotMatch(
    authTs,
    /token\.role\s*=\s*dbUser\.role\s*===\s*["']ADMIN["']\s*\?\s*["']ADMIN["']\s*:\s*["']CUSTOMER["']/
  );
  assert.match(authTs, /coerceAppRole/);
  assert.match(authTs, /GOOGLE_PARTNER_DENIED|category === ["']PARTNER["']/);
  assert.match(authTs, /partnerProfile\.findUnique/);
  console.log("PASS auth_no_binary_role_collapse");

  const authConfig = read("auth.config.ts");
  assert.match(authConfig, /\/partner/);
  assert.match(authConfig, /role !== ["']PARTNER["']|role === ["']PARTNER["']/);
  assert.match(authConfig, /coerceAppRole/);
  console.log("PASS auth_config_partner_gates");

  const middleware = read("middleware.ts");
  assert.match(middleware, /\/partner/);
  console.log("PASS middleware_matches_partner");

  const session = read("app/lib/auth/session.ts");
  assert.match(session, /PARTNER/);
  assert.match(session, /requireRole/);
  assert.match(session, /partnerProfile/);
  assert.doesNotMatch(
    session,
    /role:\s*\(session\.user\.role\s*===\s*["']ADMIN["']\s*\?\s*["']ADMIN["']\s*:\s*["']CUSTOMER["']\)/
  );
  console.log("PASS session_requireRole_partner");

  // H — discount conversion
  assert.deepEqual(parseDiscountPercentToBps("5"), { ok: true, discountBps: 500 });
  assert.deepEqual(parseDiscountPercentToBps("7.5"), { ok: true, discountBps: 750 });
  assert.deepEqual(parseDiscountPercentToBps("0"), { ok: true, discountBps: 0 });
  assert.deepEqual(parseDiscountPercentToBps("99"), { ok: true, discountBps: 9900 });
  assert.equal(parseDiscountPercentToBps("100").ok, false);
  assert.equal(parseDiscountPercentToBps("99.01").ok, false);
  assert.equal(parseDiscountPercentToBps("-1").ok, false);
  assert.equal(formatDiscountBpsAsPercent(500), "5");
  assert.equal(formatDiscountBpsAsPercent(750), "7.5");
  console.log("PASS discount_percent_to_bps");

  const schema = read("prisma/schema.prisma");
  assert.match(schema, /enum Role[\s\S]*PARTNER/);
  assert.match(schema, /model PartnerProfile/);
  assert.match(schema, /discountBps/);
  assert.match(schema, /discountVersion/);
  assert.match(schema, /statusVersion/);
  assert.match(schema, /model PartnerWalletAccount/);
  assert.match(schema, /model PartnerWalletTransaction/);
  assert.match(schema, /enum PartnerWalletTransactionType/);
  assert.match(schema, /ADMIN_CREDIT/);
  assert.match(schema, /ADMIN_DEBIT/);
  assert.match(schema, /ESIM_PURCHASE_DEBIT/);
  assert.match(schema, /ESIM_PURCHASE_REFUND/);
  assert.match(schema, /PARTNER_BALANCE/);
  assert.match(schema, /enum PartnerEsimPurchaseStatus/);
  assert.match(schema, /model PartnerEsimPurchase/);
  assert.match(schema, /retailPriceCents/);
  assert.match(schema, /partnerChargeCents/);
  assert.match(schema, /PARTNER_WALLET_PURCHASES/);
  const pepIdx = schema.indexOf("model PartnerEsimPurchase");
  assert.ok(pepIdx >= 0);
  const pepBody = schema.slice(pepIdx, pepIdx + 4000);
  assert.doesNotMatch(pepBody, /customerUserId/);
  assert.doesNotMatch(pepBody, /\bWalletAccount\b/);
  assert.doesNotMatch(pepBody, /WalletEsimPurchase/);
  console.log("PASS schema_partner_phase1");

  const migration = read(
    "prisma/migrations/20260815180000_add_partner_portal_phase1/migration.sql"
  );
  assert.match(migration, /ADD VALUE 'PARTNER'/);
  assert.match(migration, /PartnerProfile/);
  assert.match(migration, /PartnerWalletAccount/);
  assert.match(migration, /PartnerWalletTransaction/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  console.log("PASS migration_additive");

  const partners = read("app/lib/partner/partners.ts");
  assert.match(partners, /partner\.created/);
  assert.match(partners, /partner\.discount_changed/);
  assert.match(partners, /partner\.disabled/);
  assert.match(partners, /partner\.reactivated/);
  assert.match(partners, /partner\.management_action_blocked/);
  assert.match(partners, /Role\.PARTNER/);
  assert.match(partners, /mintPartnerInviteToken|sendPartnerInviteEmail/);
  assert.match(partners, /opaque_setup_link/);
  assert.doesNotMatch(partners, /kind:\s*["']partner_invite["']/);
  assert.doesNotMatch(partners, /OtpPurpose\.PASSWORD_RESET/);
  assert.match(partners, /session\.deleteMany/);
  assert.match(partners, /credentialsChangedAt/);
  assert.match(partners, /discountVersion:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(partners, /statusVersion:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(partners, /findUnique\(\s*\{\s*where:\s*\{\s*email/);
  assert.doesNotMatch(partners, /role:\s*Role\.ADMIN/);
  assert.doesNotMatch(partners, /temporaryPassword|plainTextPassword/);
  console.log("PASS partners_create_discount_disable_rules");

  const wallet = read("app/lib/partner/partnerWallet.ts");
  assert.match(wallet, /partner\.credit_added/);
  assert.match(wallet, /partner\.credit_deducted/);
  assert.match(wallet, /PARTNER_WALLET_CAS_MAX_ATTEMPTS/);
  assert.match(wallet, /PartnerWalletCasConflictError/);
  // Credit: version-checked updateMany (not plain update)
  assert.match(
    wallet,
    /partnerWalletAccount\.updateMany\(\s*\{[\s\S]*?version:\s*wallet\.version/
  );
  assert.match(wallet, /balanceCents:\s*balanceAfterCents/);
  assert.match(wallet, /cas\.count !== 1/);
  assert.match(wallet, /balanceCents:\s*\{\s*gte:\s*amountCents\s*\}/);
  assert.match(wallet, /idempotencyKey/);
  assert.match(wallet, /\$transaction/);
  assert.match(wallet, /PartnerWalletTransactionType\.ADMIN_CREDIT/);
  assert.match(wallet, /PartnerWalletTransactionType\.ADMIN_DEBIT/);
  assert.match(wallet, /balanceBeforeCents/);
  assert.match(wallet, /balanceAfterCents/);
  // Ledger/audit only after successful CAS (create follows updateMany conflict gate)
  const creditCasIdx = wallet.indexOf(
    "type: PartnerWalletTransactionType.ADMIN_CREDIT"
  );
  const creditUpdateManyIdx = wallet.lastIndexOf(
    "partnerWalletAccount.updateMany",
    creditCasIdx
  );
  assert.ok(creditUpdateManyIdx >= 0 && creditUpdateManyIdx < creditCasIdx);
  assert.doesNotMatch(wallet, /creditCustomerWalletByAdmin|tx\.walletAccount\.|model WalletAccount/);
  assert.match(wallet, /partnerWalletAccount/);
  // Must not use non-CAS wallet.update for balance mutation
  assert.doesNotMatch(
    wallet,
    /partnerWalletAccount\.update\(\s*\{\s*where:\s*\{\s*id:\s*wallet\.id/
  );
  console.log("PASS partner_wallet_cas_and_ledger");

  // Concurrency model: same observed version → only one writer commits; loser retries.
  type CasState = { balanceCents: number; version: number };
  type LedgerRow = {
    type: "ADMIN_CREDIT" | "ADMIN_DEBIT";
    amountCents: number;
    balanceBeforeCents: number;
    balanceAfterCents: number;
  };

  function casApply(
    state: CasState,
    observedVersion: number,
    op: { type: "ADMIN_CREDIT" | "ADMIN_DEBIT"; amountCents: number }
  ): { ok: true; ledger: LedgerRow } | { ok: false } {
    if (state.version !== observedVersion) return { ok: false };
    const before = state.balanceCents;
    const after =
      op.type === "ADMIN_CREDIT"
        ? before + op.amountCents
        : before - op.amountCents;
    if (after < 0 || !Number.isSafeInteger(after)) return { ok: false };
    state.balanceCents = after;
    state.version += 1;
    return {
      ok: true,
      ledger: {
        type: op.type,
        amountCents: op.amountCents,
        balanceBeforeCents: before,
        balanceAfterCents: after,
      },
    };
  }

  function runWithRetry(
    state: CasState,
    op: { type: "ADMIN_CREDIT" | "ADMIN_DEBIT"; amountCents: number },
    maxAttempts: number
  ): LedgerRow {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const observed = state.version;
      const result = casApply(state, observed, op);
      if (result.ok) return result.ledger;
    }
    throw new Error("CAS exhausted");
  }

  {
    const state: CasState = { balanceCents: 0, version: 0 };
    const ledger: LedgerRow[] = [];
    // Two concurrent credits both observe version 0; serialize via CAS+retry.
    const observedA = state.version;
    const observedB = state.version;
    const first = casApply(state, observedA, {
      type: "ADMIN_CREDIT",
      amountCents: 10_000,
    });
    assert.equal(first.ok, true);
    if (first.ok) ledger.push(first.ledger);
    const secondLost = casApply(state, observedB, {
      type: "ADMIN_CREDIT",
      amountCents: 5_000,
    });
    assert.equal(secondLost.ok, false);
    ledger.push(
      runWithRetry(
        state,
        { type: "ADMIN_CREDIT", amountCents: 5_000 },
        5
      )
    );
    assert.equal(state.balanceCents, 15_000);
    assert.equal(state.version, 2);
    assert.equal(ledger.length, 2);
    assert.equal(ledger[0].balanceAfterCents, 10_000);
    assert.equal(ledger[1].balanceBeforeCents, 10_000);
    assert.equal(ledger[1].balanceAfterCents, 15_000);
    assert.equal(
      ledger.reduce(
        (sum, row) =>
          sum +
          (row.type === "ADMIN_CREDIT" ? row.amountCents : -row.amountCents),
        0
      ),
      state.balanceCents
    );

    // Concurrent debit vs credit: debit must not go negative; final ledger matches balance.
    const creditObs = state.version;
    const debitObs = state.version;
    const creditWin = casApply(state, creditObs, {
      type: "ADMIN_CREDIT",
      amountCents: 1_000,
    });
    assert.equal(creditWin.ok, true);
    if (creditWin.ok) ledger.push(creditWin.ledger);
    const debitLost = casApply(state, debitObs, {
      type: "ADMIN_DEBIT",
      amountCents: 15_000,
    });
    assert.equal(debitLost.ok, false);
    ledger.push(
      runWithRetry(
        state,
        { type: "ADMIN_DEBIT", amountCents: 15_000 },
        5
      )
    );
    assert.equal(state.balanceCents, 1_000);
    const reconstructed = ledger.reduce(
      (sum, row) =>
        sum +
        (row.type === "ADMIN_CREDIT" ? row.amountCents : -row.amountCents),
      0
    );
    assert.equal(reconstructed, state.balanceCents);
    for (const row of ledger) {
      assert.ok(row.balanceAfterCents >= 0);
      assert.equal(
        row.balanceAfterCents,
        row.balanceBeforeCents +
          (row.type === "ADMIN_CREDIT" ? row.amountCents : -row.amountCents)
      );
    }
  }
  console.log("PASS partner_wallet_concurrent_cas_model");

  const amountLimits = read("app/lib/partner/partnerWalletAmount.ts");
  assert.match(amountLimits, /PARTNER_ADMIN_CREDIT_MAX_CENTS\s*=\s*5_000_000/);
  assert.match(amountLimits, /PARTNER_ADMIN_DEBIT_MAX_CENTS\s*=\s*5_000_000/);
  assert.doesNotMatch(amountLimits, /balanceCents\s*>\s*PARTNER_ADMIN|MAX_BALANCE|balanceCap/);
  assert.doesNotMatch(wallet, /balanceCents\s*>\s*PARTNER_ADMIN_CREDIT_MAX|MAX_BALANCE|wallet balance cap/i);
  console.log("PASS partner_wallet_50k_is_per_operation_only");

  const actions = read("app/lib/partner/partnersActions.ts");
  assert.match(actions, /requireRole\(["']ADMIN["']\)/);
  assert.match(actions, /createPartnerAction/);
  assert.match(actions, /changePartnerDiscountAction/);
  assert.match(actions, /creditPartner|debitPartner/);
  assert.match(actions, /^["']use server["']/m);
  // Next.js module "use server": only async Server Functions may be exported.
  assert.doesNotMatch(actions, /^export const\s+/m);
  assert.doesNotMatch(actions, /^export \{/m);
  assert.doesNotMatch(actions, /export \*/);
  const formState = read("app/lib/partner/partnersFormState.ts");
  // Form-state module must not be a Server Actions module (directive at file top).
  assert.doesNotMatch(formState, /^["']use server["']/m);
  assert.match(formState, /initialPartnerWalletActionState/);
  const walletPanel = read("app/components/admin/PartnerWalletPanel.tsx");
  assert.match(
    walletPanel,
    /initialPartnerWalletActionState[\s\S]*from ["']@\/app\/lib\/partner\/partnersFormState["']/
  );
  assert.doesNotMatch(
    walletPanel,
    /initialPartnerWalletActionState[\s\S]*from ["']@\/app\/lib\/partner\/partnersActions["']/
  );
  console.log("PASS partners_actions_admin_only");

  const access = read("app/lib/partner/partnerAccess.ts");
  assert.match(access, /Role\.PARTNER|PARTNER/);
  assert.match(access, /disabledAt/);
  console.log("PASS partner_portal_access_gate");

  const nav = read("app/components/admin/AdminNav.tsx");
  assert.match(nav, /\/admin\/partners/);
  assert.match(nav, /Admin Users/);
  console.log("PASS admin_nav_partners");

  const adminList = read("app/admin/partners/page.tsx");
  const adminDetail = read("app/admin/partners/[id]/page.tsx");
  assert.match(adminList, /PartnerCreateForm/);
  assert.match(adminDetail, /PartnerDiscountPanel/);
  assert.match(adminDetail, /PartnerWalletPanel/);
  assert.match(adminDetail, /PartnerStatusPanel/);
  assert.match(adminDetail, /PartnerInviteResendPanel/);
  console.log("PASS admin_partners_ui");

  const partnerLayout = read("app/partner/(portal)/layout.tsx");
  const partnerHome = read("app/partner/(portal)/page.tsx");
  assert.match(partnerLayout, /requireRole\(["']PARTNER["']\)/);
  assert.match(partnerHome, /Available Balance|balance|Total Added|discount/i);
  assert.doesNotMatch(partnerHome, /confirmWalletEsimPurchase|prepareWalletEsimPurchase/);
  console.log("PASS partner_portal_shell");

  const inviteEmail = read("app/lib/email/partnerInviteTemplate.ts");
  assert.match(inviteEmail, /Set up my password/);
  assert.match(inviteEmail, /expires in 30 minutes/);
  const otp = read("app/lib/email/otpTemplate.ts");
  assert.match(otp, /admin_invite/);
  assert.match(otp, /Password reset code/);
  console.log("PASS partner_invite_email_kind");

  // Existing surfaces untouched structurally
  const adminUsersQa = read("scripts/qa-admin-users.ts");
  assert.match(adminUsersQa, /qa-admin-users/);
  const customerWalletCredit = read("app/lib/wallet/adminCredit.ts");
  assert.match(customerWalletCredit, /creditCustomerWalletByAdmin/);
  assert.doesNotMatch(customerWalletCredit, /PartnerWallet/);
  console.log("PASS existing_customer_wallet_and_admin_users_untouched");

  const pkg = read("package.json");
  assert.match(pkg, /"qa:partner-phase1"/);
  console.log("PASS package_script");

  // Smoke stub role allowlist (test harness only)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const smokeStub = require("./smoke-stubs/register.cjs") as {
    coerceSmokeAppRole: (role: unknown) => "CUSTOMER" | "ADMIN" | "PARTNER" | null;
  };
  assert.equal(smokeStub.coerceSmokeAppRole("CUSTOMER"), "CUSTOMER");
  assert.equal(smokeStub.coerceSmokeAppRole("ADMIN"), "ADMIN");
  assert.equal(smokeStub.coerceSmokeAppRole("PARTNER"), "PARTNER");
  assert.equal(smokeStub.coerceSmokeAppRole("OTHER"), null);
  assert.equal(smokeStub.coerceSmokeAppRole(""), null);
  const stubSrc = read("scripts/smoke-stubs/register.cjs");
  assert.doesNotMatch(
    stubSrc,
    /sessionRole\s*===\s*["']ADMIN["']\s*\?\s*["']ADMIN["']\s*:\s*["']CUSTOMER["']/
  );
  assert.match(stubSrc, /coerceSmokeAppRole/);
  assert.match(stubSrc, /PARTNER/);
  console.log("PASS smoke_stub_role_allowlist_preserves_partner");

  console.log("ALL PASS qa-partner-phase1");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
