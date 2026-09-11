/**
 * Day 9 Customer Referral — offline QA (tracking + admin-controlled rewards).
 * Does not require DB / SMTP / VeSIM. Does not mutate payment or order core paths.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildReferralSignupPath,
  buildReferralSignupUrl,
  generateReferralCodeCandidate,
  normalizeReferralCode,
} from "../app/lib/referrals/referralCode";
import {
  REFERRAL_COPY,
  REFERRAL_COOKIE_NAME,
  REFERRAL_REWARD_CENTS,
  REFERRAL_REWARD_REFERENCE_TYPE,
  referralRewardIdempotencyKey,
} from "../app/lib/referrals/referralConstants";
import {
  REFERRAL_PROGRAM_CONFIG_ID,
  REFERRAL_PROGRAM_DEFAULTS,
  calculateReferralRewardCents,
  formatReferralRewardCopy,
} from "../app/lib/referrals/referralProgramShared";

const root = path.join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function main() {
  console.log("1) Schema + migrations");
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260912120000_add_customer_referral_mvp/migration.sql"
  );
  const settingsMigration = read(
    "prisma/migrations/20260912140000_add_customer_referral_program_config/migration.sql"
  );
  assert.match(schema, /enum CustomerReferralStatus/);
  assert.match(schema, /enum ReferralRewardType/);
  assert.match(schema, /model CustomerReferral/);
  assert.match(schema, /model CustomerReferralProgramConfig/);
  assert.match(schema, /referralCode\s+String\?\s+@unique/);
  assert.match(migration, /CustomerReferral/);
  assert.match(settingsMigration, /CustomerReferralProgramConfig/);
  assert.match(settingsMigration, /FIXED_AMOUNT/);
  assert.match(settingsMigration, /'default'/);
  console.log("   ok");

  console.log("2) Code helpers + reward math");
  assert.equal(normalizeReferralCode(" ab-12cd "), "AB12CD");
  assert.equal(normalizeReferralCode("x"), null);
  assert.equal(normalizeReferralCode(null), null);
  const code = generateReferralCodeCandidate();
  assert.equal(code.length, 8);
  assert.match(code, /^[A-Z0-9]+$/);
  assert.equal(
    buildReferralSignupPath("ABC12345"),
    "/signup?ref=ABC12345"
  );
  assert.equal(
    buildReferralSignupUrl("https://mapesim.com", "ABC12345"),
    "https://mapesim.com/signup?ref=ABC12345"
  );
  assert.equal(REFERRAL_REWARD_CENTS, 500);
  assert.equal(REFERRAL_PROGRAM_DEFAULTS.rewardValue, 500);
  assert.equal(REFERRAL_PROGRAM_CONFIG_ID, "default");
  assert.equal(
    referralRewardIdempotencyKey("ref1"),
    "customer_referral_reward_ref1"
  );
  assert.equal(REFERRAL_REWARD_REFERENCE_TYPE, "REFERRAL_REWARD");
  assert.equal(REFERRAL_COOKIE_NAME, "map_esim_ref");
  assert.match(REFERRAL_COPY.cardTitle, /Invite/i);

  const fixed = calculateReferralRewardCents({
    settings: {
      enabled: true,
      rewardType: "FIXED_AMOUNT",
      rewardValue: 500,
      minPurchaseCents: 0,
      maxRewardCents: null,
    },
    purchasePriceCents: 1999,
  });
  assert.equal(fixed.ok, true);
  if (fixed.ok) assert.equal(fixed.amountCents, 500);

  const pct = calculateReferralRewardCents({
    settings: {
      enabled: true,
      rewardType: "PERCENTAGE",
      rewardValue: 1000, // 10%
      minPurchaseCents: 1000,
      maxRewardCents: 300,
    },
    purchasePriceCents: 5000,
  });
  assert.equal(pct.ok, true);
  if (pct.ok) assert.equal(pct.amountCents, 300); // capped

  const disabled = calculateReferralRewardCents({
    settings: {
      enabled: false,
      rewardType: "FIXED_AMOUNT",
      rewardValue: 500,
      minPurchaseCents: 0,
      maxRewardCents: null,
    },
    purchasePriceCents: 1999,
  });
  assert.equal(disabled.ok, false);

  const belowMin = calculateReferralRewardCents({
    settings: {
      enabled: true,
      rewardType: "FIXED_AMOUNT",
      rewardValue: 500,
      minPurchaseCents: 2000,
      maxRewardCents: null,
    },
    purchasePriceCents: 1999,
  });
  assert.equal(belowMin.ok, false);

  assert.match(
    formatReferralRewardCopy({
      enabled: true,
      rewardType: "FIXED_AMOUNT",
      rewardValue: 500,
      minPurchaseCents: 0,
      maxRewardCents: null,
    }),
    /\$5\.00/
  );
  console.log("   ok");

  console.log("3) Signup attribution wiring");
  const signupPage = read("app/signup/page.tsx");
  const signupActions = read("app/lib/auth/actions.ts");
  const oauthAdapter = read("app/lib/auth/prismaAdapter.ts");
  assert.match(signupPage, /ReferralRefCookieBootstrap/);
  assert.match(signupPage, /hiddenFields/);
  assert.match(signupPage, /referralCode/);
  assert.match(signupActions, /attachReferralOnSignupBestEffort/);
  assert.match(oauthAdapter, /attachReferralOnSignupBestEffort/);
  assert.match(oauthAdapter, /REFERRAL_COOKIE_NAME/);
  console.log("   ok");

  console.log("4) Post-purchase reward uses admin settings");
  const walletPurchase = read("app/lib/esim/walletPurchase.ts");
  const recon = read("app/lib/admin/reconciliationLocalFinalization.ts");
  const service = read("app/lib/referrals/referralService.ts");
  assert.match(walletPurchase, /awardReferralRewardBestEffort/);
  assert.match(
    walletPurchase,
    /runWalletPurchasePostCommitSideEffects[\s\S]*awardReferralRewardBestEffort/
  );
  assert.match(recon, /awardReferralRewardBestEffort/);
  assert.match(service, /ADJUSTMENT_CREDIT/);
  assert.match(service, /REFERRAL_REWARD/);
  assert.match(service, /completedCount !== 1/);
  assert.match(service, /getReferralProgramSettings/);
  assert.match(service, /calculateReferralRewardCents/);
  assert.match(service, /priceCents/);
  assert.doesNotMatch(service, /REFERRAL_REWARD_CENTS/);
  assert.doesNotMatch(service, /confirmWalletEsimPurchase|executeCreditCheckout/);
  console.log("   ok");

  console.log("5) Account referral card + admin settings UI");
  const account = read("app/account/page.tsx");
  const card = read("app/components/account/ReferralShareCard.tsx");
  const readLib = read("app/lib/referrals/referralRead.ts");
  const settingsPage = read("app/admin/settings/page.tsx");
  const panel = read("app/components/admin/ReferralProgramSettingsPanel.tsx");
  const adminLib = read("app/lib/admin/referralProgramAdmin.ts");
  assert.match(account, /ReferralShareCard/);
  assert.match(account, /getCustomerReferralSummary/);
  assert.match(card, /Copy link|copiedButton|copyButton/);
  assert.match(card, /navigator\.clipboard\.writeText/);
  assert.match(readLib, /getReferralProgramSettings/);
  assert.match(readLib, /formatReferralRewardCopy/);
  assert.match(settingsPage, /ReferralProgramSettingsPanel/);
  assert.match(panel, /saveReferralProgramConfigAction/);
  assert.match(adminLib, /updateReferralProgramConfig/);
  assert.match(adminLib, /ReferralRewardType/);
  console.log("   ok");

  console.log("\nOK qa-customer-referrals (admin-controlled settings)");
}

main();
