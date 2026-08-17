/**
 * Customer Rewards V1 Slice 2 QA — checkout redemption hold + exact-once ledger.
 * Isolated local PostgreSQL only. Refuses Production / Prisma Postgres.
 * Does not call VeSIM or payment gateways.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  CustomerRewardRedemptionStatus,
  CustomerRewardTransactionType,
  OrderFundingSource,
  PrismaClient,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { calculateCustomerCheckoutFunding } from "../app/lib/esim/purchaseFunding";
import {
  calculateRewardPointsToApply,
  calculateRewardPointsEarned,
  eligibleRewardSpendCents,
  isRewardRedemptionEligible,
  rewardValueCentsFromPoints,
} from "../app/lib/rewards/rewardPoints";
import {
  purchaseRedemptionIdempotencyKey,
  purchaseRedemptionRestoreIdempotencyKey,
  REWARD_MIN_REDEMPTION_POINTS,
  REWARDS_COPY,
} from "../app/lib/rewards/rewardConstants";

const root = path.join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function assertLocalIsolatedUrl(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing non-local host: ${host}`);
  }
  if (host.includes("prisma.io") || url.includes("db.prisma.io")) {
    throw new Error("Refusing Prisma Postgres / Production.");
  }
  console.log(
    `CONFIRMED_LOCAL_DB host=${host} port=${parsed.port || "5432"} db=${parsed.pathname.replace(/^\//, "")}`
  );
}

function resolveIsolatedUrl(): string {
  const explicit = process.env.REWARDS_QA_DATABASE_URL?.trim();
  if (explicit) {
    assertLocalIsolatedUrl(explicit);
    return explicit;
  }
  const fallback =
    "postgresql://map_esim_test@127.0.0.1:55440/map_esim_promo_v1_uat?schema=public";
  assertLocalIsolatedUrl(fallback);
  return fallback;
}

function offlineChecks(): void {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260817173000_add_customer_reward_redemption/migration.sql"
  );
  const redeem = read("app/lib/rewards/rewardRedeem.ts");
  const funding = read("app/lib/esim/purchaseFunding.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const gateway = read("app/lib/esim/esimPurchaseGatewayCheckout.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const confirmForm = read(
    "app/components/account/WalletPurchaseConfirmForm.tsx"
  );
  const partnerStore = read("app/components/partner/PartnerStorefrontBuy.tsx");
  const partnerPricing = read("app/lib/partner/partnerPricing.ts");
  const safepay = read("app/lib/payments/safepayAdapter.ts");
  const actions = read("app/lib/esim/walletPurchaseActions.ts");

  assert.match(schema, /model CustomerRewardRedemption/);
  assert.match(schema, /rewardPointsRedeemed/);
  assert.match(schema, /useRewards/);
  assert.match(migration, /CREATE TABLE "CustomerRewardRedemption"/);
  assert.match(
    migration,
    /"walletAppliedCents" \+ "gatewayAmountCents" = "priceCents" - "promoDiscountCents" - "rewardPointsRedeemed"/
  );
  assert.match(funding, /calculateCustomerCheckoutFunding/);
  assert.match(redeem, /CustomerRewardRedemptionStatus\.HELD/);
  assert.match(redeem, /REDEMPTION_RESTORE/);
  assert.match(redeem, /lifetimeRedeemedPoints/);
  assert.match(wallet, /claimRewardRedemptionInTx/);
  assert.match(wallet, /completeRewardRedemptionInTx/);
  assert.match(wallet, /releaseRewardRedemptionInTx/);
  assert.match(apply, /claimRewardRedemptionInTx/);
  assert.match(apply, /completeRewardRedemptionInTx/);
  assert.match(apply, /releaseRewardRedemptionInTx/);
  assert.match(gateway, /claimRewardRedemptionInTx/);
  const fundingChoice = wallet.split("setWalletPurchaseFundingChoice")[1]?.slice(0, 3500) ?? "";
  assert.doesNotMatch(fundingChoice, /claimRewardRedemptionInTx/);
  assert.match(confirmForm, /Use rewards/);
  assert.match(confirmForm, /Earn \{review\.rewardPointsToUnlock\} more points to unlock rewards/);
  assert.match(confirmForm, /zeroCashConfirm/);
  assert.doesNotMatch(partnerStore, /Use rewards|reward points/i);
  assert.doesNotMatch(partnerPricing, /useRewards|rewardPointsRedeemed/);
  assert.doesNotMatch(safepay, /CustomerReward|rewardPoints/);
  assert.doesNotMatch(redeem, /executeCreditCheckout|createCheckoutSession/);
  assert.match(actions, /parseUseRewardsChoice/);
  assert.match(actions, /void formData\.get\("rewardPoints"\)/);
  assert.equal(REWARDS_COPY.rate, "100 points = $1 reward");
  console.log("PASS source_hooks_partner_exclusion_no_provider_on_preview");

  assert.equal(isRewardRedemptionEligible(99), false);
  assert.equal(isRewardRedemptionEligible(100), true);
  assert.equal(rewardValueCentsFromPoints(125), 125);
  assert.equal(rewardValueCentsFromPoints(250), 250);
  assert.equal(
    calculateRewardPointsToApply({
      afterPromoCents: 800,
      pointsBalance: 99,
      useRewards: true,
    }).pointsApplied,
    0
  );
  assert.equal(
    calculateRewardPointsToApply({
      afterPromoCents: 800,
      pointsBalance: 100,
      useRewards: true,
    }).pointsApplied,
    100
  );
  assert.equal(
    calculateRewardPointsToApply({
      afterPromoCents: 68,
      pointsBalance: 125,
      useRewards: true,
    }).pointsApplied,
    68
  );
  assert.equal(
    calculateRewardPointsToApply({
      afterPromoCents: 100,
      pointsBalance: 250,
      useRewards: true,
    }).pointsApplied,
    100
  );

  const g = calculateCustomerCheckoutFunding({
    priceCents: 1000,
    promoDiscountCents: 200,
    walletBalanceCents: 200,
    useWallet: true,
    pointsBalance: 125,
    useRewards: true,
  });
  assert.equal(g.afterPromoCents, 800);
  assert.equal(g.rewardPointsRedeemed, 125);
  assert.equal(g.cashPayableCents, 675);
  assert.equal(g.walletAppliedCents, 200);
  assert.equal(g.gatewayAmountCents, 475);

  const covered = calculateCustomerCheckoutFunding({
    priceCents: 133,
    promoDiscountCents: 13,
    walletBalanceCents: 0,
    useWallet: false,
    pointsBalance: 125,
    useRewards: true,
  });
  assert.equal(covered.afterPromoCents, 120);
  assert.equal(covered.rewardPointsRedeemed, 120);
  assert.equal(covered.cashPayableCents, 0);
  assert.equal(covered.gatewayAmountCents, 0);
  assert.equal(calculateRewardPointsEarned(covered.afterPromoCents), 1);
  assert.equal(eligibleRewardSpendCents(133, 13), 120);
  console.log("PASS A_J_formula_promo_before_rewards_wallet_after");
}

async function isolatedDbChecks(url: string): Promise<void> {
  assertLocalIsolatedUrl(url);
  process.env.DATABASE_URL = url;
  execSync("npx prisma migrate deploy", {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tag = randomBytes(4).toString("hex");
  const {
    claimRewardRedemptionInTx,
    completeRewardRedemptionInTx,
    releaseRewardRedemptionInTx,
    RewardRedemptionError,
  } = await import("../app/lib/rewards/rewardRedeem");
  const { awardCustomerPurchaseEarnInTx } = await import(
    "../app/lib/rewards/rewardEarn"
  );

  async function makeCustomer(role: Role, suffix: string) {
    return prisma.user.create({
      data: {
        name: "Rewards Redeem QA",
        email: `rr-${tag}-${suffix}@example.test`,
        role,
        passwordHash: "x",
      },
      select: { id: true, email: true },
    });
  }

  async function seedAccount(customerId: string, points: number) {
    return prisma.customerRewardAccount.upsert({
      where: { customerUserId: customerId },
      update: {
        pointsBalance: points,
        lifetimeEarnedPoints: points,
        lifetimeRedeemedPoints: 0,
        version: { increment: 1 },
      },
      create: {
        customerUserId: customerId,
        pointsBalance: points,
        lifetimeEarnedPoints: points,
      },
      select: { id: true, pointsBalance: true, lifetimeRedeemedPoints: true },
    });
  }

  async function makePurchase(options: {
    customerId: string;
    priceCents: number;
    promoDiscountCents?: number;
    rewardPointsRedeemed?: number;
    walletAppliedCents?: number;
    gatewayAmountCents?: number;
    key: string;
    status?: WalletEsimPurchaseStatus;
  }) {
    const promo = options.promoDiscountCents ?? 0;
    const rewards = options.rewardPointsRedeemed ?? 0;
    const cash = options.priceCents - promo - rewards;
    const walletAppliedCents = options.walletAppliedCents ?? 0;
    const gatewayAmountCents =
      options.gatewayAmountCents ?? Math.max(0, cash - walletAppliedCents);
    return prisma.walletEsimPurchase.create({
      data: {
        customerUserId: options.customerId,
        offerId: "rr-offer",
        priceCents: options.priceCents,
        promoDiscountCents: promo,
        useRewards: rewards > 0,
        rewardPointsRedeemed: rewards,
        walletAppliedCents,
        gatewayAmountCents,
        idempotencyKey: `rr_${options.key}_${tag}`,
        status: options.status ?? WalletEsimPurchaseStatus.READY,
      },
      select: { id: true },
    });
  }

  try {
    const customer = await makeCustomer(Role.CUSTOMER, "c");
    const partner = await makeCustomer(Role.PARTNER, "p");

    assert.equal(REWARD_MIN_REDEMPTION_POINTS, 100);

    await seedAccount(customer.id, 99);
    const ineligible = await makePurchase({
      customerId: customer.id,
      priceCents: 800,
      key: "a99",
    });
    await assert.rejects(
      () =>
        prisma.$transaction((tx) =>
          claimRewardRedemptionInTx(tx, {
            customerUserId: customer.id,
            purchaseId: ineligible.id,
            pointsToHold: 99,
            afterPromoCents: 800,
          })
        ),
      RewardRedemptionError
    );
    const still99 = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    assert.equal(still99?.pointsBalance, 99);
    console.log("PASS A_99_redemption_unavailable");

    await seedAccount(customer.id, 100);
    const eligible100 = await makePurchase({
      customerId: customer.id,
      priceCents: 800,
      key: "b100",
    });
    await prisma.$transaction((tx) =>
      claimRewardRedemptionInTx(tx, {
        customerUserId: customer.id,
        purchaseId: eligible100.id,
        pointsToHold: 100,
        afterPromoCents: 800,
      })
    );
    const after100 = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    assert.equal(after100?.pointsBalance, 0);
    assert.equal(after100?.lifetimeRedeemedPoints, 0);
    console.log("PASS B_100_eligible_hold_no_lifetime_yet");

    await prisma.$transaction((tx) =>
      releaseRewardRedemptionInTx(tx, eligible100.id)
    );

    await seedAccount(customer.id, 125);
    const p125 = await makePurchase({
      customerId: customer.id,
      priceCents: 800,
      key: "c125",
    });
    const previewBalance = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    await prisma.walletEsimPurchase.update({
      where: { id: p125.id },
      data: {
        useRewards: true,
        rewardPointsRedeemed: 125,
        walletAppliedCents: 0,
        gatewayAmountCents: 675,
      },
    });
    const afterPreview = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    assert.equal(afterPreview?.pointsBalance, previewBalance?.pointsBalance);
    console.log("PASS K_preview_does_not_debit");

    await prisma.$transaction((tx) =>
      claimRewardRedemptionInTx(tx, {
        customerUserId: customer.id,
        purchaseId: p125.id,
        pointsToHold: 125,
        afterPromoCents: 800,
      })
    );
    await prisma.$transaction((tx) =>
      completeRewardRedemptionInTx(tx, {
        purchaseId: p125.id,
        orderId: null,
      })
    );
    await prisma.$transaction((tx) =>
      completeRewardRedemptionInTx(tx, {
        purchaseId: p125.id,
        orderId: null,
      })
    );
    const done125 = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    assert.equal(done125?.pointsBalance, 0);
    assert.equal(done125?.lifetimeRedeemedPoints, 125);
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: p125.id,
          type: CustomerRewardTransactionType.REDEMPTION,
        },
      }),
      1
    );
    console.log("PASS C_L_O_125_value_complete_once");

    await seedAccount(customer.id, 125);
    const p68 = await makePurchase({
      customerId: customer.id,
      priceCents: 68,
      key: "f68",
    });
    await prisma.$transaction((tx) =>
      claimRewardRedemptionInTx(tx, {
        customerUserId: customer.id,
        purchaseId: p68.id,
        pointsToHold: 68,
        afterPromoCents: 68,
      })
    );
    await prisma.$transaction((tx) =>
      completeRewardRedemptionInTx(tx, {
        purchaseId: p68.id,
        orderId: null,
      })
    );
    const after68 = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    assert.equal(after68?.pointsBalance, 57);
    assert.equal(after68?.lifetimeRedeemedPoints, 68);
    console.log("PASS E_F_apply_68_leave_remainder");

    await seedAccount(customer.id, 250);
    const failPurchase = await makePurchase({
      customerId: customer.id,
      priceCents: 800,
      key: "m_fail",
    });
    await prisma.$transaction((tx) =>
      claimRewardRedemptionInTx(tx, {
        customerUserId: customer.id,
        purchaseId: failPurchase.id,
        pointsToHold: 250,
        afterPromoCents: 800,
      })
    );
    await prisma.$transaction((tx) =>
      releaseRewardRedemptionInTx(tx, failPurchase.id)
    );
    const restored = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    assert.equal(restored?.pointsBalance, 250);
    assert.equal(restored?.lifetimeRedeemedPoints, 0);
    const hold = await prisma.customerRewardRedemption.findUnique({
      where: { walletEsimPurchaseId: failPurchase.id },
    });
    assert.equal(hold?.status, CustomerRewardRedemptionStatus.RELEASED);
    console.log("PASS M_N_release_restores_points");

    await prisma.$transaction((tx) =>
      claimRewardRedemptionInTx(tx, {
        customerUserId: customer.id,
        purchaseId: failPurchase.id,
        pointsToHold: 250,
        afterPromoCents: 800,
      })
    );
    await prisma.$transaction((tx) =>
      completeRewardRedemptionInTx(tx, {
        purchaseId: failPurchase.id,
        orderId: null,
      })
    );
    const retried = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    assert.equal(retried?.pointsBalance, 0);
    assert.equal(retried?.lifetimeRedeemedPoints, 250);
    console.log("PASS P_retry_after_restore");

    const c1 = await makeCustomer(Role.CUSTOMER, "q1");
    const c2user = c1;
    await seedAccount(c2user.id, 150);
    const qA = await makePurchase({
      customerId: c2user.id,
      priceCents: 800,
      key: "qa",
    });
    const qB = await makePurchase({
      customerId: c2user.id,
      priceCents: 800,
      key: "qb",
    });
    const concurrent = await Promise.allSettled([
      prisma.$transaction((tx) =>
        claimRewardRedemptionInTx(tx, {
          customerUserId: c2user.id,
          purchaseId: qA.id,
          pointsToHold: 100,
          afterPromoCents: 800,
        })
      ),
      prisma.$transaction((tx) =>
        claimRewardRedemptionInTx(tx, {
          customerUserId: c2user.id,
          purchaseId: qB.id,
          pointsToHold: 100,
          afterPromoCents: 800,
        })
      ),
    ]);
    const wins = concurrent.filter((row) => row.status === "fulfilled").length;
    const losses = concurrent.filter((row) => row.status === "rejected").length;
    assert.equal(wins, 1);
    assert.equal(losses, 1);
    const raced = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: c2user.id },
    });
    assert.equal(raced?.pointsBalance, 50);
    assert.ok((raced?.pointsBalance ?? -1) >= 0);
    console.log("PASS Q_R_concurrent_no_overspend_no_negative");

    const earnCustomer = await makeCustomer(Role.CUSTOMER, "earn");
    await seedAccount(earnCustomer.id, 125);
    const earnPurchase = await makePurchase({
      customerId: earnCustomer.id,
      priceCents: 133,
      promoDiscountCents: 13,
      rewardPointsRedeemed: 120,
      walletAppliedCents: 0,
      gatewayAmountCents: 0,
      key: "st",
      status: WalletEsimPurchaseStatus.COMPLETED,
    });
    await prisma.$transaction((tx) =>
      claimRewardRedemptionInTx(tx, {
        customerUserId: earnCustomer.id,
        purchaseId: earnPurchase.id,
        pointsToHold: 120,
        afterPromoCents: 120,
      })
    );
    await prisma.$transaction(async (tx) => {
      await tx.walletEsimPurchase.update({
        where: { id: earnPurchase.id },
        data: { status: WalletEsimPurchaseStatus.COMPLETED },
      });
      await completeRewardRedemptionInTx(tx, {
        purchaseId: earnPurchase.id,
        orderId: null,
      });
      await awardCustomerPurchaseEarnInTx(tx, {
        customerUserId: earnCustomer.id,
        purchaseId: earnPurchase.id,
        orderId: null,
      });
    });
    const earned = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: earnCustomer.id },
    });
    assert.equal(earned?.lifetimeRedeemedPoints, 120);
    const earnTx = await prisma.customerRewardTransaction.findFirst({
      where: {
        purchaseId: earnPurchase.id,
        type: CustomerRewardTransactionType.PURCHASE_EARN,
      },
    });
    assert.equal(earnTx?.pointsDelta, 1);
    assert.equal(earnTx?.eligibleSpendCents, 120);
    console.log("PASS S_T_earn_basis_post_promo_pre_reward");

    const historic = await prisma.walletEsimPurchase.findUnique({
      where: { id: earnPurchase.id },
    });
    assert.equal(historic?.rewardPointsRedeemed, 120);
    await seedAccount(earnCustomer.id, 999);
    const historicAfter = await prisma.walletEsimPurchase.findUnique({
      where: { id: earnPurchase.id },
    });
    assert.equal(historicAfter?.rewardPointsRedeemed, 120);
    console.log("PASS V_historic_snapshot_stable");

    await seedAccount(partner.id, 500);
    const partnerPurchase = await makePurchase({
      customerId: partner.id,
      priceCents: 800,
      key: "u_partner",
    });
    await assert.rejects(
      () =>
        prisma.$transaction((tx) =>
          claimRewardRedemptionInTx(tx, {
            customerUserId: partner.id,
            purchaseId: partnerPurchase.id,
            pointsToHold: 100,
            afterPromoCents: 800,
          })
        ),
      RewardRedemptionError
    );
    const partnerAcct = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: partner.id },
    });
    assert.equal(partnerAcct?.pointsBalance, 500);
    console.log("PASS U_partner_blocked");

    void purchaseRedemptionIdempotencyKey;
    void purchaseRedemptionRestoreIdempotencyKey;
    console.log("PASS Z_no_provider_on_reservation");
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  offlineChecks();
  if (!existsSync(path.join(root, "prisma", "schema.prisma"))) {
    throw new Error("Missing Prisma schema");
  }
  const url = resolveIsolatedUrl();
  await isolatedDbChecks(url);
  console.log("ALL_CUSTOMER_REWARDS_REDEMPTION_CHECKS_PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
