/**
 * Day 9 Customer Referral MVP — offline QA (source wiring + pure helpers).
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

const root = path.join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function main() {
  console.log("1) Schema + migration");
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260912120000_add_customer_referral_mvp/migration.sql"
  );
  assert.match(schema, /enum CustomerReferralStatus/);
  assert.match(schema, /model CustomerReferral/);
  assert.match(schema, /referralCode\s+String\?\s+@unique/);
  assert.match(migration, /CustomerReferral/);
  assert.match(migration, /referralCode/);
  console.log("   ok");

  console.log("2) Code helpers");
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
  assert.equal(
    referralRewardIdempotencyKey("ref1"),
    "customer_referral_reward_ref1"
  );
  assert.equal(REFERRAL_REWARD_REFERENCE_TYPE, "REFERRAL_REWARD");
  assert.equal(REFERRAL_COOKIE_NAME, "map_esim_ref");
  assert.match(REFERRAL_COPY.cardTitle, /Invite/i);
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

  console.log("4) Post-purchase reward wiring (side-effect only)");
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
  assert.doesNotMatch(service, /confirmWalletEsimPurchase|executeCreditCheckout/);
  console.log("   ok");

  console.log("5) Account referral card");
  const account = read("app/account/page.tsx");
  const card = read("app/components/account/ReferralShareCard.tsx");
  assert.match(account, /ReferralShareCard/);
  assert.match(account, /getCustomerReferralSummary/);
  assert.match(card, /Copy link|copiedButton|copyButton/);
  assert.match(card, /navigator\.clipboard\.writeText/);
  console.log("   ok");

  console.log("\nOK qa-customer-referrals (offline MVP checks)");
}

main();
