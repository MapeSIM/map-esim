/**
 * Customer Rewards V1 Slice 3 QA — full-refund restore/reversal primitives.
 * Isolated local PostgreSQL only. Refuses Production / Prisma Postgres.
 * Does not move cash, call gateways, or call VeSIM.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CustomerRewardRedemptionStatus,
  CustomerRewardTransactionType,
  PrismaClient,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { calculateRewardPointsToApply, isFullCustomerPurchaseRefundForRewards } from "../app/lib/rewards/rewardPoints";
import {
  pointsNeededToUnlockRewards,
  purchaseEarnReversalIdempotencyKey,
  purchaseRedemptionRestoreIdempotencyKey,
  purchaseRefundRedemptionRestoreIdempotencyKey,
  REWARDS_AUDIT,
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
  const refund = read("app/lib/rewards/rewardRefund.ts");
  const redeem = read("app/lib/rewards/rewardRedeem.ts");
  const constants = read("app/lib/rewards/rewardConstants.ts");
  const readUi = read("app/lib/rewards/rewardRead.ts");
  const refundRequest = read("app/lib/refunds/refundRequest.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const recon = read("app/lib/admin/reconciliationLocalFinalization.ts");
  const walletRefund = read("app/lib/admin/reconciliationWalletRefund.ts");
  const partnerExec = read("app/lib/partner/partnerRefundRequestExecution.ts");
  const partnerPricing = read("app/lib/partner/partnerPricing.ts");
  const safepay = read("app/lib/payments/safepayAdapter.ts");
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260817190000_allow_refund_redemption_restore_ledger/migration.sql"
  );

  const walletPurchase = read("app/lib/esim/walletPurchase.ts");
  const execution = read("app/lib/refunds/refundRequestExecution.ts");
  const sync = read("app/lib/refunds/refundRequestSync.ts");
  const points = read("app/lib/rewards/rewardPoints.ts");

  assert.match(refund, /restoreCustomerRewardRedemptionForRefundInTx/);
  assert.match(refund, /reverseCustomerPurchaseRewardEarnForRefundInTx/);
  assert.match(refund, /applyCustomerRewardFullRefundEffectsInTx/);
  assert.match(refund, /applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx/);
  assert.match(refund, /PARTIAL_REFUND_NOT_SUPPORTED/);
  assert.match(points, /isFullCustomerPurchaseRefundForRewards/);
  assert.match(refund, /Role\.CUSTOMER/);
  assert.match(refund, /PARTNER_EXCLUDED/);
  assert.match(refund, /CustomerRewardRedemptionStatus\.COMPLETED/);
  assert.doesNotMatch(refund, /await releaseRewardRedemptionInTx\(/);
  assert.doesNotMatch(
    refund,
    /executeCreditCheckout|createCheckoutSession|PURCHASE_DEBIT|REFUND_CREDIT|vesim|VeSIM|simpaisa|safepay/i
  );
  assert.match(
    constants,
    /customer_reward_refund_redemption_restore_/
  );
  assert.match(constants, /customer_reward_purchase_earn_reversal_/);
  assert.match(constants, /rewards\.redemption_restored_for_refund/);
  assert.match(constants, /rewards\.purchase_earn_reversed_for_refund/);
  assert.match(readUi, /Refund reward restore/);
  assert.match(readUi, /Refund earn reversal/);
  assert.match(refundRequest, /moneyMoved: false/);
  assert.match(refundRequest, /APPROVED_PENDING_EXECUTION/);
  assert.doesNotMatch(refundRequest, /applyCustomerRewardFullRefundEffectsInTx/);
  assert.doesNotMatch(refundRequest, /restoreCustomerRewardRedemptionForRefundInTx/);
  // Payment-apply / recon modules stay free of direct restore calls; post-funding
  // FULL reward finalization lives in refundReservedFundsInTx (!restoreReady).
  assert.doesNotMatch(apply, /restoreCustomerRewardRedemptionForRefundInTx/);
  assert.doesNotMatch(recon, /restoreCustomerRewardRedemptionForRefundInTx/);
  assert.match(recon, /completeRewardRedemptionInTx/);
  assert.doesNotMatch(walletRefund, /restoreCustomerRewardRedemptionForRefundInTx/);
  assert.match(
    walletRefund,
    /applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx/
  );
  assert.match(
    walletPurchase,
    /applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx/
  );
  assert.match(
    walletPurchase,
    /applyPostFundingFullRefundRewardsIfEligible/
  );
  assert.match(walletPurchase, /if \(restoreReady\) return/);
  assert.match(
    execution,
    /applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx/
  );
  assert.match(sync, /Status-only|authoritative money-finalization/);
  assert.doesNotMatch(sync, /applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx/);
  assert.doesNotMatch(partnerExec, /applyCustomerRewardFullRefundEffectsInTx/);
  assert.doesNotMatch(partnerPricing, /rewardRefund|rewardPointsRedeemed/);
  assert.doesNotMatch(safepay, /CustomerReward|rewardRefund/);
  assert.match(redeem, /releaseRewardRedemptionInTx/);
  assert.match(migration, /DROP INDEX IF EXISTS "CustomerRewardTransaction_purchaseId_type_key"/);
  assert.match(schema, /lifetimeRedeemedPoints/);
  assert.doesNotMatch(schema, /@@unique\(\[purchaseId, type\]\)/);
  void REWARDS_AUDIT;
  console.log("PASS O_P_R_source_post_funding_full_refund_rewards_wired");

  assert.equal(
    isFullCustomerPurchaseRefundForRewards({
      purchasePriceCents: 1000,
      refundedAmountCents: 1000,
    }),
    true
  );
  assert.equal(
    isFullCustomerPurchaseRefundForRewards({
      purchasePriceCents: 1000,
      refundedAmountCents: 400,
    }),
    false
  );
  console.log("PASS full_refund_amount_guard");

  assert.equal(pointsNeededToUnlockRewards(-5), 105);
  assert.equal(
    calculateRewardPointsToApply({
      afterPromoCents: 800,
      pointsBalance: -5,
      useRewards: true,
    }).pointsApplied,
    0
  );
  console.log("PASS L_negative_balance_ineligible_at_checkout");
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
    applyCustomerRewardFullRefundEffectsInTx,
    restoreCustomerRewardRedemptionForRefundInTx,
    reverseCustomerPurchaseRewardEarnForRefundInTx,
    RewardRefundError,
  } = await import("../app/lib/rewards/rewardRefund");
  const {
    claimRewardRedemptionInTx,
    completeRewardRedemptionInTx,
    releaseRewardRedemptionInTx,
  } = await import("../app/lib/rewards/rewardRedeem");
  const { awardCustomerPurchaseEarnInTx } = await import(
    "../app/lib/rewards/rewardEarn"
  );

  async function makeCustomer(role: Role, suffix: string) {
    return prisma.user.create({
      data: {
        name: "Rewards Refund QA",
        email: `rf-${tag}-${suffix}@example.test`,
        role,
        passwordHash: "x",
      },
      select: { id: true },
    });
  }

  async function seedAccount(
    customerId: string,
    points: number,
    extras?: { lifetimeRedeemedPoints?: number; lifetimeEarnedPoints?: number }
  ) {
    return prisma.customerRewardAccount.upsert({
      where: { customerUserId: customerId },
      update: {
        pointsBalance: points,
        lifetimeEarnedPoints: extras?.lifetimeEarnedPoints ?? points,
        lifetimeRedeemedPoints: extras?.lifetimeRedeemedPoints ?? 0,
        version: { increment: 1 },
      },
      create: {
        customerUserId: customerId,
        pointsBalance: points,
        lifetimeEarnedPoints: extras?.lifetimeEarnedPoints ?? points,
        lifetimeRedeemedPoints: extras?.lifetimeRedeemedPoints ?? 0,
      },
      select: { id: true, pointsBalance: true, lifetimeRedeemedPoints: true },
    });
  }

  async function makePurchase(options: {
    customerId: string;
    priceCents: number;
    promoDiscountCents?: number;
    rewardPointsRedeemed?: number;
    key: string;
    status?: WalletEsimPurchaseStatus;
  }) {
    const promo = options.promoDiscountCents ?? 0;
    const rewards = options.rewardPointsRedeemed ?? 0;
    const cash = options.priceCents - promo - rewards;
    return prisma.walletEsimPurchase.create({
      data: {
        customerUserId: options.customerId,
        offerId: "rf-offer",
        priceCents: options.priceCents,
        promoDiscountCents: promo,
        useRewards: rewards > 0,
        rewardPointsRedeemed: rewards,
        walletAppliedCents: 0,
        gatewayAmountCents: Math.max(0, cash),
        idempotencyKey: `rf_${options.key}_${tag}`,
        status: options.status ?? WalletEsimPurchaseStatus.READY,
      },
      select: { id: true },
    });
  }

  async function completeRedemption(options: {
    customerId: string;
    purchaseId: string;
    points: number;
    afterPromoCents: number;
  }) {
    await prisma.$transaction((tx) =>
      claimRewardRedemptionInTx(tx, {
        customerUserId: options.customerId,
        purchaseId: options.purchaseId,
        pointsToHold: options.points,
        afterPromoCents: options.afterPromoCents,
      })
    );
    const current = await prisma.walletEsimPurchase.findUnique({
      where: { id: options.purchaseId },
      select: {
        priceCents: true,
        promoDiscountCents: true,
        walletAppliedCents: true,
      },
    });
    if (!current) throw new Error("missing purchase");
    const cash =
      current.priceCents - current.promoDiscountCents - options.points;
    await prisma.walletEsimPurchase.update({
      where: { id: options.purchaseId },
      data: {
        useRewards: true,
        rewardPointsRedeemed: options.points,
        gatewayAmountCents: Math.max(0, cash - current.walletAppliedCents),
        status: WalletEsimPurchaseStatus.COMPLETED,
      },
    });
    await prisma.$transaction((tx) =>
      completeRewardRedemptionInTx(tx, {
        purchaseId: options.purchaseId,
        orderId: null,
      })
    );
  }

  try {
    const customer = await makeCustomer(Role.CUSTOMER, "c");
    const partner = await makeCustomer(Role.PARTNER, "p");

    await seedAccount(customer.id, 200);
    const p200 = await makePurchase({
      customerId: customer.id,
      priceCents: 2000,
      rewardPointsRedeemed: 200,
      key: "a200",
    });
    await completeRedemption({
      customerId: customer.id,
      purchaseId: p200.id,
      points: 200,
      afterPromoCents: 2000,
    });
    await prisma.customerRewardAccount.update({
      where: { customerUserId: customer.id },
      data: { pointsBalance: 45 },
    });
    const restoreA = await prisma.$transaction((tx) =>
      restoreCustomerRewardRedemptionForRefundInTx(tx, {
        customerUserId: customer.id,
        purchaseId: p200.id,
      })
    );
    assert.equal(restoreA.restoredPoints, 200);
    assert.equal(restoreA.duplicate, false);
    const afterA = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    assert.equal(afterA?.pointsBalance, 245);
    assert.equal(afterA?.lifetimeRedeemedPoints, 200);
    console.log("PASS A_restore_200_once_gross_lifetime_kept");

    const restoreB = await prisma.$transaction((tx) =>
      restoreCustomerRewardRedemptionForRefundInTx(tx, {
        customerUserId: customer.id,
        purchaseId: p200.id,
      })
    );
    assert.equal(restoreB.restoredPoints, 200);
    assert.equal(restoreB.duplicate, true);
    const afterB = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    assert.equal(afterB?.pointsBalance, 245);
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: p200.id,
          type: CustomerRewardTransactionType.REDEMPTION_RESTORE,
          idempotencyKey: purchaseRefundRedemptionRestoreIdempotencyKey(p200.id),
        },
      }),
      1
    );
    console.log("PASS B_duplicate_restore_no_second_credit");

    const concCustomer = await makeCustomer(Role.CUSTOMER, "conc");
    await seedAccount(concCustomer.id, 200);
    const pConc = await makePurchase({
      customerId: concCustomer.id,
      priceCents: 2000,
      rewardPointsRedeemed: 200,
      key: "conc",
    });
    await completeRedemption({
      customerId: concCustomer.id,
      purchaseId: pConc.id,
      points: 200,
      afterPromoCents: 2000,
    });
    const concurrentRestore = await Promise.allSettled([
      prisma.$transaction((tx) =>
        restoreCustomerRewardRedemptionForRefundInTx(tx, {
          customerUserId: concCustomer.id,
          purchaseId: pConc.id,
        })
      ),
      prisma.$transaction((tx) =>
        restoreCustomerRewardRedemptionForRefundInTx(tx, {
          customerUserId: concCustomer.id,
          purchaseId: pConc.id,
        })
      ),
    ]);
    assert.equal(
      concurrentRestore.filter((row) => row.status === "fulfilled").length,
      2
    );
    const concAcct = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: concCustomer.id },
    });
    assert.equal(concAcct?.pointsBalance, 200);
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: pConc.id,
          idempotencyKey: purchaseRefundRedemptionRestoreIdempotencyKey(
            pConc.id
          ),
        },
      }),
      1
    );
    console.log("PASS C_concurrent_restore_exactly_once");

    const earnCustomer = await makeCustomer(Role.CUSTOMER, "earn");
    await seedAccount(earnCustomer.id, 0, { lifetimeEarnedPoints: 0 });
    const pEarn = await makePurchase({
      customerId: earnCustomer.id,
      priceCents: 800,
      key: "earn8",
      status: WalletEsimPurchaseStatus.COMPLETED,
    });
    await prisma.$transaction((tx) =>
      awardCustomerPurchaseEarnInTx(tx, {
        customerUserId: earnCustomer.id,
        purchaseId: pEarn.id,
        orderId: null,
      })
    );
    const reverseD = await prisma.$transaction((tx) =>
      reverseCustomerPurchaseRewardEarnForRefundInTx(tx, {
        customerUserId: earnCustomer.id,
        purchaseId: pEarn.id,
      })
    );
    assert.equal(reverseD.reversedEarnPoints, 8);
    assert.equal(reverseD.duplicate, false);
    const afterD = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: earnCustomer.id },
    });
    assert.equal(afterD?.pointsBalance, 0);
    assert.equal(afterD?.lifetimeEarnedPoints, 8);
    console.log("PASS D_earn_reversal_8_once_gross_lifetime_kept");

    const reverseE = await prisma.$transaction((tx) =>
      reverseCustomerPurchaseRewardEarnForRefundInTx(tx, {
        customerUserId: earnCustomer.id,
        purchaseId: pEarn.id,
      })
    );
    assert.equal(reverseE.reversedEarnPoints, 8);
    assert.equal(reverseE.duplicate, true);
    const afterE = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: earnCustomer.id },
    });
    assert.equal(afterE?.pointsBalance, 0);
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: pEarn.id,
          type: CustomerRewardTransactionType.PURCHASE_EARN_REVERSAL,
          idempotencyKey: purchaseEarnReversalIdempotencyKey(pEarn.id),
        },
      }),
      1
    );
    console.log("PASS E_duplicate_reversal_no_second_debit");

    const concEarn = await makeCustomer(Role.CUSTOMER, "ce");
    await seedAccount(concEarn.id, 0, { lifetimeEarnedPoints: 0 });
    const pCe = await makePurchase({
      customerId: concEarn.id,
      priceCents: 800,
      key: "ce",
      status: WalletEsimPurchaseStatus.COMPLETED,
    });
    await prisma.$transaction((tx) =>
      awardCustomerPurchaseEarnInTx(tx, {
        customerUserId: concEarn.id,
        purchaseId: pCe.id,
        orderId: null,
      })
    );
    const concurrentRev = await Promise.allSettled([
      prisma.$transaction((tx) =>
        reverseCustomerPurchaseRewardEarnForRefundInTx(tx, {
          customerUserId: concEarn.id,
          purchaseId: pCe.id,
        })
      ),
      prisma.$transaction((tx) =>
        reverseCustomerPurchaseRewardEarnForRefundInTx(tx, {
          customerUserId: concEarn.id,
          purchaseId: pCe.id,
        })
      ),
    ]);
    const revWins = concurrentRev.filter((row) => row.status === "fulfilled").length;
    assert.ok(revWins >= 1);
    const ceAcct = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: concEarn.id },
    });
    assert.equal(ceAcct?.pointsBalance, 0);
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: pCe.id,
          type: CustomerRewardTransactionType.PURCHASE_EARN_REVERSAL,
        },
      }),
      1
    );
    console.log("PASS F_concurrent_reversal_exactly_once");

    const combo = await makeCustomer(Role.CUSTOMER, "combo");
    await seedAccount(combo.id, 200);
    const pCombo = await makePurchase({
      customerId: combo.id,
      priceCents: 800,
      promoDiscountCents: 0,
      rewardPointsRedeemed: 200,
      key: "combo",
    });
    await completeRedemption({
      customerId: combo.id,
      purchaseId: pCombo.id,
      points: 200,
      afterPromoCents: 800,
    });
    await prisma.$transaction((tx) =>
      awardCustomerPurchaseEarnInTx(tx, {
        customerUserId: combo.id,
        purchaseId: pCombo.id,
        orderId: null,
      })
    );
    await prisma.customerRewardAccount.update({
      where: { customerUserId: combo.id },
      data: { pointsBalance: 45 },
    });
    const beforeCombo = 45;
    const comboResult = await prisma.$transaction((tx) =>
      applyCustomerRewardFullRefundEffectsInTx(tx, {
        customerUserId: combo.id,
        purchaseId: pCombo.id,
        refundKind: "FULL",
      })
    );
    assert.equal(comboResult.restoredPoints, 200);
    assert.equal(comboResult.reversedEarnPoints, 8);
    assert.equal(comboResult.unsupported, null);
    const afterCombo = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: combo.id },
    });
    assert.equal(afterCombo?.pointsBalance, beforeCombo + 192);
    assert.equal(afterCombo?.pointsBalance, 237);
    assert.equal(afterCombo?.lifetimeRedeemedPoints, 200);
    assert.equal(afterCombo?.lifetimeEarnedPoints, 208);
    console.log("PASS G_H_composite_plus200_minus8_net_plus192");

    const earnOnly = await makeCustomer(Role.CUSTOMER, "eo");
    await seedAccount(earnOnly.id, 0, { lifetimeEarnedPoints: 0 });
    const pEo = await makePurchase({
      customerId: earnOnly.id,
      priceCents: 800,
      key: "eo",
      status: WalletEsimPurchaseStatus.COMPLETED,
    });
    await prisma.$transaction((tx) =>
      awardCustomerPurchaseEarnInTx(tx, {
        customerUserId: earnOnly.id,
        purchaseId: pEo.id,
        orderId: null,
      })
    );
    const eo = await prisma.$transaction((tx) =>
      applyCustomerRewardFullRefundEffectsInTx(tx, {
        customerUserId: earnOnly.id,
        purchaseId: pEo.id,
        refundKind: "FULL",
      })
    );
    assert.equal(eo.restoredPoints, 0);
    assert.equal(eo.reversedEarnPoints, 8);
    console.log("PASS I_no_redeemed_only_earn_reversal");

    const restoreOnly = await makeCustomer(Role.CUSTOMER, "ro");
    await seedAccount(restoreOnly.id, 200);
    const pRo = await makePurchase({
      customerId: restoreOnly.id,
      priceCents: 99,
      rewardPointsRedeemed: 99,
      key: "ro",
    });
    await completeRedemption({
      customerId: restoreOnly.id,
      purchaseId: pRo.id,
      points: 99,
      afterPromoCents: 99,
    });
    const ro = await prisma.$transaction((tx) =>
      applyCustomerRewardFullRefundEffectsInTx(tx, {
        customerUserId: restoreOnly.id,
        purchaseId: pRo.id,
        refundKind: "FULL",
      })
    );
    assert.equal(ro.restoredPoints, 99);
    assert.equal(ro.reversedEarnPoints, 0);
    console.log("PASS J_no_earned_only_redemption_restore");

    const neither = await makeCustomer(Role.CUSTOMER, "n");
    await seedAccount(neither.id, 10);
    const pN = await makePurchase({
      customerId: neither.id,
      priceCents: 50,
      key: "n",
      status: WalletEsimPurchaseStatus.COMPLETED,
    });
    const nRes = await prisma.$transaction((tx) =>
      applyCustomerRewardFullRefundEffectsInTx(tx, {
        customerUserId: neither.id,
        purchaseId: pN.id,
        refundKind: "FULL",
      })
    );
    assert.equal(nRes.restoredPoints, 0);
    assert.equal(nRes.reversedEarnPoints, 0);
    const nAcct = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: neither.id },
    });
    assert.equal(nAcct?.pointsBalance, 10);
    console.log("PASS K_neither_idempotent_noop");

    const neg = await makeCustomer(Role.CUSTOMER, "neg");
    await seedAccount(neg.id, 0, { lifetimeEarnedPoints: 0 });
    const pNeg = await makePurchase({
      customerId: neg.id,
      priceCents: 800,
      key: "neg",
      status: WalletEsimPurchaseStatus.COMPLETED,
    });
    await prisma.$transaction((tx) =>
      awardCustomerPurchaseEarnInTx(tx, {
        customerUserId: neg.id,
        purchaseId: pNeg.id,
        orderId: null,
      })
    );
    await prisma.customerRewardAccount.update({
      where: { customerUserId: neg.id },
      data: { pointsBalance: 3 },
    });
    await prisma.$transaction((tx) =>
      reverseCustomerPurchaseRewardEarnForRefundInTx(tx, {
        customerUserId: neg.id,
        purchaseId: pNeg.id,
      })
    );
    const afterNeg = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: neg.id },
    });
    assert.equal(afterNeg?.pointsBalance, -5);
    console.log("PASS L_reversal_allows_negative_balance");

    const pOffset = await makePurchase({
      customerId: neg.id,
      priceCents: 1000,
      key: "offset",
      status: WalletEsimPurchaseStatus.COMPLETED,
    });
    await prisma.$transaction((tx) =>
      awardCustomerPurchaseEarnInTx(tx, {
        customerUserId: neg.id,
        purchaseId: pOffset.id,
        orderId: null,
      })
    );
    const offset = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: neg.id },
    });
    assert.equal(offset?.pointsBalance, 5);
    console.log("PASS M_future_earn_offsets_negative_balance");

    const hold = await makeCustomer(Role.CUSTOMER, "hold");
    await seedAccount(hold.id, 200);
    const pHold = await makePurchase({
      customerId: hold.id,
      priceCents: 2000,
      key: "hold",
    });
    await prisma.$transaction((tx) =>
      claimRewardRedemptionInTx(tx, {
        customerUserId: hold.id,
        purchaseId: pHold.id,
        pointsToHold: 200,
        afterPromoCents: 2000,
      })
    );
    await prisma.$transaction((tx) => releaseRewardRedemptionInTx(tx, pHold.id));
    const afterHoldRelease = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: hold.id },
    });
    assert.equal(afterHoldRelease?.pointsBalance, 200);
    const holdRefund = await prisma.$transaction((tx) =>
      restoreCustomerRewardRedemptionForRefundInTx(tx, {
        customerUserId: hold.id,
        purchaseId: pHold.id,
      })
    );
    assert.equal(holdRefund.restoredPoints, 0);
    const holdStatus = await prisma.customerRewardRedemption.findUnique({
      where: { walletEsimPurchaseId: pHold.id },
    });
    assert.equal(holdStatus?.status, CustomerRewardRedemptionStatus.RELEASED);
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: pHold.id,
          idempotencyKey: purchaseRedemptionRestoreIdempotencyKey(pHold.id),
        },
      }),
      1
    );
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: pHold.id,
          idempotencyKey: purchaseRefundRedemptionRestoreIdempotencyKey(
            pHold.id
          ),
        },
      }),
      0
    );
    const afterHoldRefund = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: hold.id },
    });
    assert.equal(afterHoldRefund?.pointsBalance, 200);
    console.log("PASS N_released_hold_not_restored_again");

    const funded = await makeCustomer(Role.CUSTOMER, "funded");
    await seedAccount(funded.id, 200);
    const pFunded = await makePurchase({
      customerId: funded.id,
      priceCents: 2000,
      rewardPointsRedeemed: 200,
      key: "funded",
    });
    await completeRedemption({
      customerId: funded.id,
      purchaseId: pFunded.id,
      points: 200,
      afterPromoCents: 2000,
    });
    await prisma.walletEsimPurchase.update({
      where: { id: pFunded.id },
      data: {
        status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
      },
    });
    const fundedAcct = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: funded.id },
    });
    assert.equal(fundedAcct?.pointsBalance, 0);
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: pFunded.id,
          type: CustomerRewardTransactionType.REDEMPTION_RESTORE,
        },
      }),
      0
    );
    console.log("PASS O_funded_uncertain_does_not_auto_restore");

    await prisma.walletEsimPurchase.update({
      where: { id: pFunded.id },
      data: { status: WalletEsimPurchaseStatus.COMPLETED },
    });
    const stillConsumed = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: funded.id },
    });
    const fundedRedemption = await prisma.customerRewardRedemption.findUnique({
      where: { walletEsimPurchaseId: pFunded.id },
    });
    assert.equal(stillConsumed?.pointsBalance, 0);
    assert.equal(
      fundedRedemption?.status,
      CustomerRewardRedemptionStatus.COMPLETED
    );
    console.log("PASS P_reconciliation_fulfillment_leaves_redemption_consumed");

    await seedAccount(partner.id, 500);
    const pPartner = await makePurchase({
      customerId: partner.id,
      priceCents: 800,
      key: "partner",
    });
    await assert.rejects(
      () =>
        prisma.$transaction((tx) =>
          applyCustomerRewardFullRefundEffectsInTx(tx, {
            customerUserId: partner.id,
            purchaseId: pPartner.id,
            refundKind: "FULL",
          })
        ),
      (error: unknown) =>
        error instanceof RewardRefundError && error.code === "PARTNER_EXCLUDED"
    );
    const partnerAcct = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: partner.id },
    });
    assert.equal(partnerAcct?.pointsBalance, 500);
    console.log("PASS Q_partner_blocked");

    const partial = await prisma.$transaction((tx) =>
      applyCustomerRewardFullRefundEffectsInTx(tx, {
        customerUserId: customer.id,
        purchaseId: p200.id,
        refundKind: "PARTIAL",
      })
    );
    assert.equal(partial.unsupported, "PARTIAL_REFUND_NOT_SUPPORTED");
    assert.equal(partial.restoredPoints, 0);
    assert.equal(partial.reversedEarnPoints, 0);
    console.log("PASS partial_refund_unsupported");

    const retryHold = await makeCustomer(Role.CUSTOMER, "retry");
    await seedAccount(retryHold.id, 200);
    const pRetry = await makePurchase({
      customerId: retryHold.id,
      priceCents: 2000,
      rewardPointsRedeemed: 200,
      key: "retry",
    });
    await prisma.$transaction((tx) =>
      claimRewardRedemptionInTx(tx, {
        customerUserId: retryHold.id,
        purchaseId: pRetry.id,
        pointsToHold: 200,
        afterPromoCents: 2000,
      })
    );
    await prisma.$transaction((tx) =>
      releaseRewardRedemptionInTx(tx, pRetry.id)
    );
    await completeRedemption({
      customerId: retryHold.id,
      purchaseId: pRetry.id,
      points: 200,
      afterPromoCents: 2000,
    });
    await prisma.$transaction((tx) =>
      restoreCustomerRewardRedemptionForRefundInTx(tx, {
        customerUserId: retryHold.id,
        purchaseId: pRetry.id,
      })
    );
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: pRetry.id,
          type: CustomerRewardTransactionType.REDEMPTION_RESTORE,
        },
      }),
      2
    );
    const retryAcct = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: retryHold.id },
    });
    assert.equal(retryAcct?.pointsBalance, 200);
    console.log("PASS hold_release_then_completed_refund_restore_distinct_keys");
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  offlineChecks();
  await isolatedDbChecks(resolveIsolatedUrl());
  console.log("ALL_CUSTOMER_REWARDS_REFUND_CHECKS_PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
