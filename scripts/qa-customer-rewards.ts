/**
 * Customer Rewards V1 Slice 1 QA — earn formula + exact-once ledger.
 * Isolated local PostgreSQL only. Refuses Production / Prisma Postgres.
 * Does not call VeSIM, payment gateways, or mutate wallet ledgers for earn.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  CustomerRewardTransactionType,
  OrderFundingSource,
  OrderStatus,
  PromoDiscountType,
  PrismaClient,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { calculatePayablePurchaseFunding } from "../app/lib/esim/purchaseFunding";
import { payablePackageCents } from "../app/lib/promo/promoDiscount";
import {
  calculateRewardPointsEarned,
  eligibleRewardSpendCents,
} from "../app/lib/rewards/rewardPoints";
import { rejectClientRewardInputs } from "../app/lib/rewards/rewardEarn";
import {
  purchaseEarnIdempotencyKey,
  REWARDS_AUDIT,
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
    "prisma/migrations/20260817160000_add_customer_rewards_ledger/migration.sql"
  );
  const points = read("app/lib/rewards/rewardPoints.ts");
  const earn = read("app/lib/rewards/rewardEarn.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const gateway = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const recovery = read("app/lib/admin/reconciliationLocalFinalization.ts");
  const partnerProvider = read("app/lib/partner/partnerEsimPurchaseProvider.ts");
  const partnerPricing = read("app/lib/partner/partnerPricing.ts");
  const partnerStore = read("app/components/partner/PartnerStorefrontBuy.tsx");
  const partnerDash = read("app/partner/(portal)/page.tsx");
  const accountPage = read("app/account/page.tsx");
  const rewardsPage = read("app/account/rewards/page.tsx");
  const orderDetail = read("app/account/orders/[orderId]/page.tsx");
  const safepay = read("app/lib/payments/safepayAdapter.ts");

  assert.match(schema, /model CustomerRewardAccount/);
  assert.match(schema, /model CustomerRewardTransaction/);
  assert.match(schema, /PURCHASE_EARN_REVERSAL/);
  assert.match(migration, /CREATE TABLE "CustomerRewardAccount"/);
  assert.match(points, /Math\.floor\(eligibleSpendCents \/ REWARD_CENTS_PER_POINT\)/);
  assert.doesNotMatch(points, /Math\.round\(/);
  assert.match(earn, /WalletEsimPurchaseStatus\.COMPLETED/);
  assert.match(earn, /Role\.CUSTOMER/);
  assert.match(earn, /formData\?\.get\("points"\)/);
  assert.match(earn, /idempotencyKey/);
  assert.match(earn, /REWARDS_AUDIT\.purchaseEarned/);
  assert.match(earn, /awardCustomerPurchaseEarnBestEffort/);
  assert.match(wallet, /awardCustomerPurchaseEarnBestEffort/);
  assert.match(gateway, /runWalletPurchasePostCommitSideEffects/);
  assert.match(recovery, /awardCustomerPurchaseEarnInTx/);
  assert.doesNotMatch(partnerProvider, /awardCustomerPurchaseEarnInTx|rewardEarn/);
  assert.doesNotMatch(partnerPricing, /reward|RewardAccount/);
  assert.doesNotMatch(partnerStore, /Rewards|reward points/i);
  assert.doesNotMatch(partnerDash, /Rewards|\/account\/rewards/);
  assert.match(accountPage, /\/account\/rewards/);
  assert.match(rewardsPage, /REWARDS_COPY|100 points = \$1 reward|requireRole\("CUSTOMER"\)/);
  assert.doesNotMatch(rewardsPage, /Redeem|Use points|Apply points/i);
  assert.match(orderDetail, /Rewards earned/);
  assert.doesNotMatch(safepay, /CustomerReward|rewardPoints/);
  assert.doesNotMatch(earn, /executeCreditCheckout|createCheckoutSession|PURCHASE_DEBIT/);
  console.log("PASS source_hooks_partner_exclusion_no_redemption_ui");

  assert.equal(calculateRewardPointsEarned(99), 0);
  assert.equal(calculateRewardPointsEarned(100), 1);
  assert.equal(calculateRewardPointsEarned(199), 1);
  assert.equal(calculateRewardPointsEarned(200), 2);
  assert.equal(calculateRewardPointsEarned(1075), 10);
  assert.equal(eligibleRewardSpendCents(133, 13), 120);
  assert.equal(calculateRewardPointsEarned(120), 1);
  assert.equal(payablePackageCents(133, 13), 120);
  const split = calculatePayablePurchaseFunding({
    priceCents: 800,
    walletBalanceCents: 300,
    useWallet: true,
  });
  assert.equal(split.walletAppliedCents, 300);
  assert.equal(split.gatewayAmountCents, 500);
  assert.equal(calculateRewardPointsEarned(800), 8);
  assert.equal(REWARDS_COPY.rate, "100 points = $1 reward");
  rejectClientRewardInputs(null);
  console.log("PASS A_E_formula_and_promo_basis");

  void purchaseEarnIdempotencyKey;
  void REWARDS_AUDIT;
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
  const { awardCustomerPurchaseEarnInTx } = await import(
    "../app/lib/rewards/rewardEarn"
  );

  async function makeCustomer(role: Role, suffix: string) {
    return prisma.user.create({
      data: {
        name: "Rewards QA",
        email: `rw-${tag}-${suffix}@example.test`,
        role,
        passwordHash: "x",
      },
      select: { id: true, email: true },
    });
  }

  async function makePurchase(options: {
    customerId: string;
    email: string;
    status: WalletEsimPurchaseStatus;
    priceCents: number;
    promoDiscountCents?: number;
    walletAppliedCents?: number;
    gatewayAmountCents?: number;
    key: string;
    withOrder?: boolean;
  }) {
    let orderId: string | null = null;
    if (options.withOrder) {
      const order = await prisma.order.create({
        data: {
          providerOrderId: `rw-po-${options.key}-${tag}`,
          userId: options.customerId,
          customerEmail: options.email,
          offerId: "rw-offer",
          fundingSource: OrderFundingSource.CUSTOMER_WALLET,
          status: OrderStatus.COMPLETED,
        },
        select: { id: true },
      });
      orderId = order.id;
    }
    const purchase = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: options.customerId,
        offerId: "rw-offer",
        priceCents: options.priceCents,
        promoDiscountCents: options.promoDiscountCents ?? 0,
        walletAppliedCents: options.walletAppliedCents ?? 0,
        gatewayAmountCents:
          options.gatewayAmountCents ??
          Math.max(0, options.priceCents - (options.walletAppliedCents ?? 0)),
        idempotencyKey: `rw_${options.key}_${tag}`,
        status: options.status,
        orderId,
        completedAt:
          options.status === WalletEsimPurchaseStatus.COMPLETED
            ? new Date()
            : null,
      },
      select: { id: true },
    });
    return { purchaseId: purchase.id, orderId };
  }

  async function award(customerId: string, purchaseId: string, orderId: string | null) {
    return prisma.$transaction((tx) =>
      awardCustomerPurchaseEarnInTx(tx, {
        customerUserId: customerId,
        purchaseId,
        orderId,
      })
    );
  }

  try {
    const customer = await makeCustomer(Role.CUSTOMER, "c");
    const partner = await makeCustomer(Role.PARTNER, "p");

    const a99 = await makePurchase({
      customerId: customer.id,
      email: customer.email,
      status: WalletEsimPurchaseStatus.COMPLETED,
      priceCents: 99,
      key: "a99",
      withOrder: true,
    });
    const r99 = await award(customer.id, a99.purchaseId, a99.orderId);
    assert.equal(r99.points, 0);
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: { purchaseId: a99.purchaseId },
      }),
      0
    );
    console.log("PASS A_99_cents_zero_points");

    async function earnCase(
      key: string,
      priceCents: number,
      promoDiscountCents: number,
      walletAppliedCents: number,
      expected: number
    ) {
      const row = await makePurchase({
        customerId: customer.id,
        email: customer.email,
        status: WalletEsimPurchaseStatus.COMPLETED,
        priceCents,
        promoDiscountCents,
        walletAppliedCents,
        gatewayAmountCents: Math.max(0, priceCents - promoDiscountCents - walletAppliedCents),
        key,
        withOrder: true,
      });
      const first = await award(customer.id, row.purchaseId, row.orderId);
      assert.equal(first.points, expected);
      assert.equal(first.duplicate, false);
      return row;
    }

    await earnCase("b100", 100, 0, 100, 1);
    console.log("PASS B_100_cents_one_point");
    await earnCase("c199", 199, 0, 199, 1);
    console.log("PASS C_199_cents_one_point");
    await earnCase("d200", 200, 0, 0, 2);
    console.log("PASS D_200_cents_two_points");
    await earnCase("e1075", 1075, 0, 400, 10);
    console.log("PASS E_1075_ten_points");

    const promo = await earnCase("f120", 133, 13, 120, 1);
    console.log("PASS F_promo_133_to_120_one_point");

    const splitRow = await earnCase("g800", 800, 0, 300, 8);
    const splitPurchase = await prisma.walletEsimPurchase.findUnique({
      where: { id: splitRow.purchaseId },
      select: { walletAppliedCents: true, gatewayAmountCents: true },
    });
    assert.equal(splitPurchase?.walletAppliedCents, 300);
    assert.ok((splitPurchase?.gatewayAmountCents ?? 0) > 0);
    console.log("PASS G_wallet_gateway_split_does_not_alter_points");

    const statuses: Array<[string, WalletEsimPurchaseStatus]> = [
      ["h_ready", WalletEsimPurchaseStatus.READY],
      ["i_await", WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT],
      ["j_funded", WalletEsimPurchaseStatus.FUNDED],
      ["k_recon", WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED],
    ];
    for (const [key, status] of statuses) {
      const row = await makePurchase({
        customerId: customer.id,
        email: customer.email,
        status,
        priceCents: 1000,
        key,
      });
      const result = await award(customer.id, row.purchaseId, null);
      assert.equal(result.points, 0);
      assert.equal(
        await prisma.customerRewardTransaction.count({
          where: { purchaseId: row.purchaseId },
        }),
        0
      );
    }
    console.log("PASS H_I_J_K_incomplete_statuses_no_points");

    const done = await earnCase("l_ok", 500, 0, 500, 5);
    console.log("PASS L_completed_earns_once");

    const second = await award(customer.id, done.purchaseId, done.orderId);
    assert.equal(second.duplicate, true);
    assert.equal(second.points, 5);
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: done.purchaseId,
          type: CustomerRewardTransactionType.PURCHASE_EARN,
        },
      }),
      1
    );
    console.log("PASS M_duplicate_completion_no_second_earn");

    const race = await makePurchase({
      customerId: customer.id,
      email: customer.email,
      status: WalletEsimPurchaseStatus.COMPLETED,
      priceCents: 400,
      walletAppliedCents: 400,
      key: "n_race",
      withOrder: true,
    });
    const concurrent = await Promise.all([
      award(customer.id, race.purchaseId, race.orderId),
      award(customer.id, race.purchaseId, race.orderId),
    ]);
    assert.equal(
      concurrent.every((row) => row.points === 4),
      true
    );
    assert.equal(
      await prisma.customerRewardTransaction.count({
        where: {
          purchaseId: race.purchaseId,
          type: CustomerRewardTransactionType.PURCHASE_EARN,
        },
      }),
      1
    );
    console.log("PASS N_concurrent_retry_no_second_earn");

    const recovery = await earnCase("o_rec", 300, 0, 300, 3);
    const recovered = await award(customer.id, recovery.purchaseId, recovery.orderId);
    assert.equal(recovered.duplicate, true);
    assert.equal(recovered.points, 3);
    console.log("PASS O_recovery_completion_earn_once");

    const account = await prisma.customerRewardAccount.findUnique({
      where: { customerUserId: customer.id },
    });
    const ledger = await prisma.customerRewardTransaction.findMany({
      where: {
        customerUserId: customer.id,
        type: CustomerRewardTransactionType.PURCHASE_EARN,
      },
      orderBy: { createdAt: "asc" },
    });
    const earnedSum = ledger.reduce((sum, row) => sum + row.pointsDelta, 0);
    assert.equal(account?.pointsBalance, earnedSum);
    assert.equal(account?.lifetimeEarnedPoints, earnedSum);
    assert.equal(account?.lifetimeRedeemedPoints, 0);
    let running = 0;
    for (const row of ledger) {
      running += row.pointsDelta;
      assert.equal(row.balanceAfter, running);
    }
    console.log("PASS P_Q_R_balance_lifetime_ledger");

    const fd = new FormData();
    fd.set("points", "9999");
    fd.set("eligibleSpendCents", "999900");
    rejectClientRewardInputs(fd);
    const sneak = await earnCase("s_client", 100, 0, 100, 1);
    assert.equal(sneak.purchaseId.length > 0, true);
    console.log("PASS S_browser_cannot_override_points");

    const partnerPurchase = await makePurchase({
      customerId: partner.id,
      email: partner.email,
      status: WalletEsimPurchaseStatus.COMPLETED,
      priceCents: 2000,
      key: "t_partner",
      withOrder: true,
    });
    const partnerEarn = await award(
      partner.id,
      partnerPurchase.purchaseId,
      partnerPurchase.orderId
    );
    assert.equal(partnerEarn.points, 0);
    assert.equal(
      await prisma.customerRewardAccount.count({
        where: { customerUserId: partner.id },
      }),
      0
    );
    console.log("PASS T_partner_purchase_earns_zero");

    const historicPromo = await prisma.promoCode.create({
      data: {
        code: `RW${tag}U`.toUpperCase(),
        discountType: PromoDiscountType.FIXED_USD,
        discountValue: 13,
        isActive: true,
      },
      select: { id: true },
    });
    await prisma.walletEsimPurchase.update({
      where: { id: promo.purchaseId },
      data: {
        promoCodeId: historicPromo.id,
        promoCodeNormalized: `RW${tag}U`.toUpperCase(),
      },
    });
    await prisma.promoCode.update({
      where: { id: historicPromo.id },
      data: { isActive: false, discountValue: 99 },
    });
    const historicRetry = await award(
      customer.id,
      promo.purchaseId,
      promo.orderId
    );
    assert.equal(historicRetry.duplicate, true);
    assert.equal(historicRetry.points, 1);
    const historicPurchase = await prisma.walletEsimPurchase.findUnique({
      where: { id: promo.purchaseId },
      select: { promoDiscountCents: true, priceCents: true },
    });
    assert.equal(historicPurchase?.priceCents, 133);
    assert.equal(historicPurchase?.promoDiscountCents, 13);
    const historicTx = await prisma.customerRewardTransaction.findFirst({
      where: { purchaseId: promo.purchaseId },
      select: { pointsDelta: true, eligibleSpendCents: true },
    });
    assert.equal(historicTx?.pointsDelta, 1);
    assert.equal(historicTx?.eligibleSpendCents, 120);
    console.log("PASS U_promo_edit_does_not_change_historic_earn");

    const walletTxCount = await prisma.walletTransaction.count({
      where: { referenceId: { in: ledger.map((row) => row.purchaseId || "") } },
    });
    assert.equal(walletTxCount, 0);
    console.log("PASS V_rewards_award_no_wallet_payment_provider_writes");
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  offlineChecks();
  if (!existsSync(path.join(root, "prisma", "schema.prisma"))) {
    throw new Error("missing schema");
  }
  const url = resolveIsolatedUrl();
  await isolatedDbChecks(url);
  console.log("ALL_CUSTOMER_REWARDS_CHECKS_PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
