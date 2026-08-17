/**
 * Promo hold lifecycle QA — prove HELD cannot permanently consume capacity.
 * Isolated local PostgreSQL only. Refuses Production / Prisma Postgres.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PromoDiscountType,
  PromoRedemptionStatus,
  PrismaClient,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { PROMO_CUSTOMER_MESSAGES } from "../app/lib/promo/promoMessages";

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
  const explicit = process.env.PROMO_QA_DATABASE_URL?.trim();
  if (explicit) {
    assertLocalIsolatedUrl(explicit);
    return explicit;
  }
  const fallback =
    "postgresql://map_esim_test@127.0.0.1:55440/map_esim_promo_v1_uat?schema=public";
  assertLocalIsolatedUrl(fallback);
  return fallback;
}

function offlineRecoveryHooks(): void {
  const redemption = read("app/lib/promo/promoRedemption.ts");
  const evaluate = read("app/lib/promo/promoEvaluate.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const verify = read("app/lib/admin/pendingPaymentVerify.ts");
  const cancelPage = read("app/account/esim/buy/payment/cancel/page.tsx");
  const cancelAttempt = read(
    "app/account/esim/buy/payment/cancel/[attemptId]/page.tsx"
  );

  assert.match(redemption, /usageCount: \{ increment: 1 \}/);
  assert.match(redemption, /usageCount: \{ decrement: 1 \}/);
  assert.match(
    evaluate,
    /status:\s*\{\s*in:\s*\[PromoRedemptionStatus\.HELD,\s*PromoRedemptionStatus\.COMPLETED\]/
  );
  assert.match(wallet, /refundReservedFundsInTx[\s\S]*releasePromoRedemptionInTx/);
  assert.match(
    apply,
    /releaseOnGatewayFailure[\s\S]*else \{[\s\S]*releasePromoRedemptionInTx/
  );
  assert.match(
    apply,
    /maybeReleasePendingGatewayReservation[\s\S]*walletAppliedCents <= 0[\s\S]*releasePromoRedemptionInTx/
  );
  assert.match(
    apply,
    /releaseSplitReservationAfterSessionFailure[\s\S]*walletAppliedCents <= 0[\s\S]*releasePromoRedemptionInTx/
  );
  assert.match(cancelPage, /maybeReleasePendingGatewayReservation/);
  assert.match(cancelAttempt, /maybeReleasePendingGatewayReservation/);
  assert.match(
    verify,
    /VERIFIED_FAILED[\s\S]*VERIFIED_CANCELLED_OR_EXPIRED[\s\S]*walletAppliedCents <= 0/
  );
  assert.match(verify, /releaseFn \?\? maybeReleasePendingGatewayReservation/);
  assert.doesNotMatch(apply, /setInterval|node-cron|cron\./);
  assert.doesNotMatch(redemption, /setInterval|node-cron|cron\./);
  console.log("PASS H_deterministic_recovery_hooks");
}

type Evaluated = {
  promoCodeId: string;
  code: string;
  discountType: typeof PromoDiscountType.FIXED_USD;
  discountValue: number;
  originalPriceCents: number;
  discountCents: number;
  finalPriceCents: number;
};

async function createCustomer(
  prisma: PrismaClient,
  tag: string,
  label: string
) {
  return prisma.user.create({
    data: {
      name: label,
      email: `promo-hold-${label}-${tag}@example.test`,
      role: Role.CUSTOMER,
      passwordHash: "x",
    },
    select: { id: true },
  });
}

async function createPurchase(
  prisma: PrismaClient,
  options: {
    customerUserId: string;
    promoCodeId: string;
    code: string;
    key: string;
    status?: WalletEsimPurchaseStatus;
  }
) {
  return prisma.walletEsimPurchase.create({
    data: {
      customerUserId: options.customerUserId,
      offerId: "offer-hold",
      destinationCode: "PK",
      priceCents: 1000,
      promoCodeId: options.promoCodeId,
      promoCodeNormalized: options.code,
      promoDiscountCents: 100,
      walletAppliedCents: 0,
      gatewayAmountCents: 900,
      idempotencyKey: options.key,
      status: options.status ?? WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
    },
    select: { id: true },
  });
}

async function isolatedHoldLifecycle(url: string): Promise<void> {
  assertLocalIsolatedUrl(url);
  process.env.DATABASE_URL = url;
  execSync("npx prisma migrate deploy", {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const { PromoEvaluateError } = await import("../app/lib/promo/promoEvaluate");
  const {
    claimPromoRedemptionInTx,
    completePromoRedemptionInTx,
    releasePromoRedemptionInTx,
  } = await import("../app/lib/promo/promoRedemption");
  const tag = randomBytes(4).toString("hex");

  try {
    const customerA = await createCustomer(prisma, tag, "a");
    const customerB = await createCustomer(prisma, tag, "b");

    const totalPromo = await prisma.promoCode.create({
      data: {
        code: `HTL${tag}`.slice(0, 12),
        discountType: PromoDiscountType.FIXED_USD,
        discountValue: 100,
        totalUsageLimit: 1,
      },
    });
    const perPromo = await prisma.promoCode.create({
      data: {
        code: `HPC${tag}`.slice(0, 12),
        discountType: PromoDiscountType.FIXED_USD,
        discountValue: 100,
        perCustomerUsageLimit: 1,
      },
    });

    const evaluatedTotal: Evaluated = {
      promoCodeId: totalPromo.id,
      code: totalPromo.code,
      discountType: PromoDiscountType.FIXED_USD,
      discountValue: 100,
      originalPriceCents: 1000,
      discountCents: 100,
      finalPriceCents: 900,
    };
    const evaluatedPer: Evaluated = {
      ...evaluatedTotal,
      promoCodeId: perPromo.id,
      code: perPromo.code,
    };

    const purchaseA = await createPurchase(prisma, {
      customerUserId: customerA.id,
      promoCodeId: totalPromo.id,
      code: totalPromo.code,
      key: `hold_a_${tag}`,
    });

    await prisma.$transaction(async (tx) => {
      await claimPromoRedemptionInTx(tx, {
        customerUserId: customerA.id,
        purchaseId: purchaseA.id,
        evaluated: evaluatedTotal,
        firstOrderOnly: false,
        totalUsageLimit: 1,
        perCustomerUsageLimit: null,
      });
    });

    const afterHold = await prisma.promoCode.findUnique({
      where: { id: totalPromo.id },
      select: { usageCount: true },
    });
    const heldRow = await prisma.promoCodeRedemption.findUnique({
      where: { walletEsimPurchaseId: purchaseA.id },
      select: { status: true },
    });
    assert.equal(afterHold?.usageCount, 1);
    assert.equal(heldRow?.status, PromoRedemptionStatus.HELD);
    console.log("PASS A_held_increments_usageCount");

    await prisma.$transaction(async (tx) => {
      await releasePromoRedemptionInTx(tx, purchaseA.id);
    });
    const afterRelease = await prisma.promoCode.findUnique({
      where: { id: totalPromo.id },
      select: { usageCount: true },
    });
    const releasedRow = await prisma.promoCodeRedemption.findUnique({
      where: { walletEsimPurchaseId: purchaseA.id },
      select: { status: true },
    });
    assert.equal(afterRelease?.usageCount, 0);
    assert.equal(releasedRow?.status, PromoRedemptionStatus.RELEASED);
    console.log("PASS B_released_recovers_usageCount");

    await prisma.$transaction(async (tx) => {
      await claimPromoRedemptionInTx(tx, {
        customerUserId: customerA.id,
        purchaseId: purchaseA.id,
        evaluated: evaluatedTotal,
        firstOrderOnly: false,
        totalUsageLimit: 1,
        perCustomerUsageLimit: null,
      });
    });
    const retryRows = await prisma.promoCodeRedemption.findMany({
      where: { promoCodeId: totalPromo.id, customerUserId: customerA.id },
    });
    const afterRetry = await prisma.promoCode.findUnique({
      where: { id: totalPromo.id },
      select: { usageCount: true },
    });
    assert.equal(retryRows.length, 1);
    assert.equal(retryRows[0]?.status, PromoRedemptionStatus.HELD);
    assert.equal(afterRetry?.usageCount, 1);
    console.log("PASS C_retry_after_release_reuses_row");

    await prisma.$transaction(async (tx) => {
      await releasePromoRedemptionInTx(tx, purchaseA.id);
    });
    assert.equal(
      (
        await prisma.promoCode.findUnique({
          where: { id: totalPromo.id },
          select: { usageCount: true },
        })
      )?.usageCount,
      0
    );

    const purchaseB = await createPurchase(prisma, {
      customerUserId: customerB.id,
      promoCodeId: totalPromo.id,
      code: totalPromo.code,
      key: `hold_b_${tag}`,
    });
    await prisma.$transaction(async (tx) => {
      await claimPromoRedemptionInTx(tx, {
        customerUserId: customerB.id,
        purchaseId: purchaseB.id,
        evaluated: evaluatedTotal,
        firstOrderOnly: false,
        totalUsageLimit: 1,
        perCustomerUsageLimit: null,
      });
      await completePromoRedemptionInTx(tx, {
        purchaseId: purchaseB.id,
        orderId: null,
      });
    });
    const afterB = await prisma.promoCode.findUnique({
      where: { id: totalPromo.id },
      select: { usageCount: true },
    });
    const completedB = await prisma.promoCodeRedemption.count({
      where: {
        promoCodeId: totalPromo.id,
        status: PromoRedemptionStatus.COMPLETED,
      },
    });
    const heldOpen = await prisma.promoCodeRedemption.count({
      where: {
        promoCodeId: totalPromo.id,
        status: PromoRedemptionStatus.HELD,
      },
    });
    assert.equal(afterB?.usageCount, 1);
    assert.equal(completedB, 1);
    assert.equal(heldOpen, 0);
    console.log("PASS D_total_limit_after_released_hold");

    const perPurchase = await createPurchase(prisma, {
      customerUserId: customerA.id,
      promoCodeId: perPromo.id,
      code: perPromo.code,
      key: `hold_per_${tag}`,
    });
    await prisma.$transaction(async (tx) => {
      await claimPromoRedemptionInTx(tx, {
        customerUserId: customerA.id,
        purchaseId: perPurchase.id,
        evaluated: evaluatedPer,
        firstOrderOnly: false,
        totalUsageLimit: null,
        perCustomerUsageLimit: 1,
      });
    });
    await prisma.$transaction(async (tx) => {
      await releasePromoRedemptionInTx(tx, perPurchase.id);
    });
    await prisma.$transaction(async (tx) => {
      await claimPromoRedemptionInTx(tx, {
        customerUserId: customerA.id,
        purchaseId: perPurchase.id,
        evaluated: evaluatedPer,
        firstOrderOnly: false,
        totalUsageLimit: null,
        perCustomerUsageLimit: 1,
      });
      await completePromoRedemptionInTx(tx, {
        purchaseId: perPurchase.id,
        orderId: null,
      });
    });
    const perCompleted = await prisma.promoCodeRedemption.count({
      where: {
        promoCodeId: perPromo.id,
        customerUserId: customerA.id,
        status: PromoRedemptionStatus.COMPLETED,
      },
    });
    const perHeld = await prisma.promoCodeRedemption.count({
      where: {
        promoCodeId: perPromo.id,
        customerUserId: customerA.id,
        status: PromoRedemptionStatus.HELD,
      },
    });
    assert.equal(perCompleted, 1);
    assert.equal(perHeld, 0);
    console.log("PASS E_per_customer_after_released_hold");

    assert.equal(completedB, 1);
    assert.equal(perCompleted, 1);
    console.log("PASS F_completed_counted_once");

    const usageBeforeDup = (
      await prisma.promoCode.findUnique({
        where: { id: totalPromo.id },
        select: { usageCount: true },
      })
    )?.usageCount;
    await prisma.$transaction(async (tx) => {
      await completePromoRedemptionInTx(tx, {
        purchaseId: purchaseB.id,
        orderId: null,
      });
      await completePromoRedemptionInTx(tx, {
        purchaseId: purchaseB.id,
        orderId: null,
      });
    });
    const usageAfterDup = (
      await prisma.promoCode.findUnique({
        where: { id: totalPromo.id },
        select: { usageCount: true },
      })
    )?.usageCount;
    const completedAfterDup = await prisma.promoCodeRedemption.count({
      where: {
        promoCodeId: totalPromo.id,
        status: PromoRedemptionStatus.COMPLETED,
      },
    });
    assert.equal(usageBeforeDup, 1);
    assert.equal(usageAfterDup, 1);
    assert.equal(completedAfterDup, 1);
    console.log("PASS G_duplicate_finalize_does_not_increment");

    const stalePromo = await prisma.promoCode.create({
      data: {
        code: `HST${tag}`.slice(0, 12),
        discountType: PromoDiscountType.FIXED_USD,
        discountValue: 100,
        totalUsageLimit: 1,
      },
    });
    const evaluatedStale: Evaluated = {
      ...evaluatedTotal,
      promoCodeId: stalePromo.id,
      code: stalePromo.code,
    };
    const stalePurchase = await createPurchase(prisma, {
      customerUserId: customerA.id,
      promoCodeId: stalePromo.id,
      code: stalePromo.code,
      key: `hold_stale_${tag}`,
    });
    await prisma.$transaction(async (tx) => {
      await claimPromoRedemptionInTx(tx, {
        customerUserId: customerA.id,
        purchaseId: stalePurchase.id,
        evaluated: evaluatedStale,
        firstOrderOnly: false,
        totalUsageLimit: 1,
        perCustomerUsageLimit: null,
      });
    });
    assert.equal(
      (
        await prisma.promoCode.findUnique({
          where: { id: stalePromo.id },
          select: { usageCount: true },
        })
      )?.usageCount,
      1
    );
    await prisma.$transaction(async (tx) => {
      await releasePromoRedemptionInTx(tx, stalePurchase.id);
    });
    assert.equal(
      (
        await prisma.promoCode.findUnique({
          where: { id: stalePromo.id },
          select: { usageCount: true },
        })
      )?.usageCount,
      0
    );
    const other = await createPurchase(prisma, {
      customerUserId: customerB.id,
      promoCodeId: stalePromo.id,
      code: stalePromo.code,
      key: `hold_stale_b_${tag}`,
    });
    await prisma.$transaction(async (tx) => {
      await claimPromoRedemptionInTx(tx, {
        customerUserId: customerB.id,
        purchaseId: other.id,
        evaluated: evaluatedStale,
        firstOrderOnly: false,
        totalUsageLimit: 1,
        perCustomerUsageLimit: null,
      });
    });
    assert.equal(
      (
        await prisma.promoCode.findUnique({
          where: { id: stalePromo.id },
          select: { usageCount: true },
        })
      )?.usageCount,
      1
    );
    console.log("PASS H_abandoned_hold_recovers_via_release_primitive");

    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await claimPromoRedemptionInTx(tx, {
            customerUserId: customerA.id,
            purchaseId: purchaseA.id,
            evaluated: evaluatedTotal,
            firstOrderOnly: false,
            totalUsageLimit: 1,
            perCustomerUsageLimit: null,
          });
        }),
      (error: unknown) =>
        error instanceof PromoEvaluateError &&
        error.message === PROMO_CUSTOMER_MESSAGES.USAGE_LIMIT
    );
    void PROMO_CUSTOMER_MESSAGES;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  offlineRecoveryHooks();
  const url = resolveIsolatedUrl();
  try {
    await isolatedHoldLifecycle(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ECONNREFUSED|connect|Refusing/.test(message)) {
      throw new Error(
        `Isolated PostgreSQL required for promo hold QA. ${message}`
      );
    }
    throw error;
  }
  console.log("ALL_PROMO_HOLD_LIFECYCLE_CHECKS_PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
