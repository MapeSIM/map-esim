/**
 * Promo Codes V1 QA — offline math/source checks + isolated local PostgreSQL.
 * Refuses Production / Prisma Postgres. Does not call VeSIM or payment gateways.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PromoDiscountType,
  PromoRedemptionStatus,
  PrismaClient,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { calculatePayablePurchaseFunding } from "../app/lib/esim/purchaseFunding";
import {
  isValidNormalizedPromoCode,
  normalizePromoCode,
  parseRequiredPromoCode,
  PromoValidationError,
} from "../app/lib/promo/promoCode";
import { calculatePromoDiscount } from "../app/lib/promo/promoDiscount";
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

function resolveIsolatedUrl(): string | null {
  const explicit = process.env.PROMO_QA_DATABASE_URL?.trim();
  if (explicit) {
    assertLocalIsolatedUrl(explicit);
    return explicit;
  }
  const fallback =
    "postgresql://map_esim_test@127.0.0.1:55440/map_esim_promo_v1_uat?schema=public";
  return fallback;
}

async function expectPromoMessage(
  fn: () => Promise<unknown>,
  message: string
): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${message}`);
  } catch (error) {
    assert.equal((error as Error).message, message);
  }
}

function offlineChecks(): void {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260817043000_add_customer_promo_codes/migration.sql"
  );
  const discount = read("app/lib/promo/promoDiscount.ts");
  const evaluate = read("app/lib/promo/promoEvaluate.ts");
  const redemption = read("app/lib/promo/promoRedemption.ts");
  const customer = read("app/lib/promo/promoCustomer.ts");
  const actions = read("app/lib/promo/promoCustomerActions.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const gateway = read("app/lib/esim/esimPurchaseGatewayCheckout.ts");
  const confirmForm = read(
    "app/components/account/WalletPurchaseConfirmForm.tsx"
  );
  const partnerBuy = read("app/lib/partner/partnerPurchaseActions.ts");
  const partnerStore = read("app/components/partner/PartnerStorefrontBuy.tsx");
  const partnerCatalog = read("app/components/partner/PartnerCatalogBuy.tsx");
  const partnerPricing = read("app/lib/partner/partnerPricing.ts");
  const safepay = read("app/lib/payments/safepayAdapter.ts");
  const simpaisaExists = existsSync(
    path.join(root, "app/lib/payments/simpaisaAdapter.ts")
  );

  assert.match(schema, /model PromoCode/);
  assert.match(schema, /model PromoCodeRedemption/);
  assert.match(schema, /promoDiscountCents/);
  assert.match(migration, /CREATE TABLE "PromoCode"/);
  assert.match(discount, /Math\.round\(\(priceCents \* input\.discountValue\) \/ 100\)/);
  console.log("PASS schema_and_migration");

  const percent = calculatePromoDiscount({
    priceCents: 1000,
    discountType: PromoDiscountType.PERCENT,
    discountValue: 20,
  });
  assert.equal(percent.discountCents, 200);
  assert.equal(percent.finalPriceCents, 800);
  console.log("PASS A_percent_10_to_8");

  const fixed = calculatePromoDiscount({
    priceCents: 1000,
    discountType: PromoDiscountType.FIXED_USD,
    discountValue: 300,
  });
  assert.equal(fixed.discountCents, 300);
  assert.equal(fixed.finalPriceCents, 700);
  console.log("PASS B_fixed_10_to_7");

  const rounded = calculatePromoDiscount({
    priceCents: 199,
    discountType: PromoDiscountType.PERCENT,
    discountValue: 33,
  });
  assert.equal(rounded.discountCents, 66);
  assert.equal(rounded.finalPriceCents, 133);
  console.log("PASS C_percent_nearest_cent");

  const capped = calculatePromoDiscount({
    priceCents: 100,
    discountType: PromoDiscountType.FIXED_USD,
    discountValue: 500,
  });
  assert.equal(capped.discountCents, 100);
  assert.equal(capped.finalPriceCents, 0);
  console.log("PASS D_discount_never_exceeds_price");

  assert.equal(normalizePromoCode(" summer20 "), "SUMMER20");
  assert.equal(isValidNormalizedPromoCode("SUMMER20"), true);
  assert.throws(() => parseRequiredPromoCode("ab"), PromoValidationError);
  console.log("PASS O_casing_normalized");

  const walletSplit = calculatePayablePurchaseFunding({
    priceCents: 800,
    walletBalanceCents: 300,
    useWallet: true,
  });
  assert.equal(walletSplit.walletAppliedCents, 300);
  assert.equal(walletSplit.gatewayAmountCents, 500);
  console.log("PASS S_T_wallet_after_promo");

  const walletOnly = calculatePayablePurchaseFunding({
    priceCents: 800,
    walletBalanceCents: 800,
    useWallet: true,
  });
  assert.equal(walletOnly.walletAppliedCents, 800);
  assert.equal(walletOnly.gatewayAmountCents, 0);
  console.log("PASS U_wallet_only_discounted");

  assert.match(actions, /requireRole\("CUSTOMER"\)/);
  assert.match(actions, /void formData\.get\("discountCents"\)/);
  assert.match(actions, /void formData\.get\("finalPriceCents"\)/);
  assert.match(wallet, /void formData\.get\("promoCode"\)|PROMO_INVALID/);
  assert.match(evaluate, /WalletEsimPurchaseStatus\.COMPLETED/);
  assert.match(redemption, /usageCount: \{ increment: 1 \}/);
  assert.match(redemption, /PromoRedemptionStatus\.HELD/);
  assert.match(customer, /previewOnly: true/);
  assert.match(wallet, /claimPurchasePromoInTx/);
  assert.match(wallet, /completePromoRedemptionInTx/);
  assert.match(wallet, /releasePromoRedemptionInTx/);
  assert.match(gateway, /calculatePayablePurchaseFunding/);
  assert.doesNotMatch(evaluate, /executeCreditCheckout|verifyOfferAuthoritative/);
  assert.doesNotMatch(customer, /executeCreditCheckout/);
  console.log("PASS Q_R_AC_server_authoritative_no_provider_on_validate");

  assert.match(partnerBuy, /void formData\.get\("promoCode"\)/);
  assert.doesNotMatch(partnerStore, /promoCode|Promo code/);
  assert.doesNotMatch(partnerCatalog, /promoCode|Promo code/);
  assert.doesNotMatch(partnerPricing, /promo|PromoCode/);
  console.log("PASS Y_Z_partner_excluded_pricing_unchanged");

  assert.match(confirmForm, /CheckoutPromoCodeSection/);
  assert.match(confirmForm, /payableCents/);
  assert.doesNotMatch(safepay, /PromoCode|promoDiscount/);
  if (simpaisaExists) {
    assert.doesNotMatch(
      read("app/lib/payments/simpaisaAdapter.ts"),
      /PromoCode|promoDiscount/
    );
  }
  console.log("PASS AD_checkout_wired_gateways_untouched");

  const promoSection = read(
    "app/components/account/CheckoutPromoCodeSection.tsx"
  );
  assert.match(promoSection, /CheckoutMoney cents=\{originalCents\}/);
  assert.match(promoSection, /CheckoutMoney cents=\{discountCents\} signed/);
  assert.match(promoSection, /CheckoutMoney cents=\{totalCents\}/);
  assert.doesNotMatch(promoSection, /formatUsdCents/);
  assert.doesNotMatch(promoSection, /<form[\s>]/);
  assert.equal((confirmForm.match(/<form[\s>]/g) || []).length, 1);
  assert.match(promoSection, /formAction=\{applyAction\}/);
  assert.match(promoSection, /formAction=\{removeAction\}/);
  assert.match(promoSection, /applyCustomerPromoAction/);
  assert.match(promoSection, /removeCustomerPromoAction/);
  assert.match(promoSection, /requestSubmit/);
  assert.doesNotMatch(promoSection, /confirmWalletEsimPurchaseAction/);
  assert.match(confirmForm, /confirmWalletEsimPurchaseAction/);
  assert.match(confirmForm, /<form action=\{formAction\}/);
  assert.doesNotMatch(confirmForm, /formAction=\{/);
  assert.match(confirmForm, /Buy eSIM with Wallet/);
  assert.doesNotMatch(actions, /confirmWalletEsimPurchaseAction/);
  assert.doesNotMatch(
    actions,
    /reserveWallet|PURCHASE_DEBIT|executeCreditCheckout|createCheckoutSession/
  );
  assert.doesNotMatch(partnerStore, /formAction=\{applyAction\}/);
  assert.doesNotMatch(partnerCatalog, /formAction=\{applyAction\}/);
  console.log("PASS AE_promo_formAction_not_nested_not_confirm");

  void PROMO_CUSTOMER_MESSAGES;
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
  const customerEmail = `promo-qa-${tag}@example.test`;
  try {
    const customer = await prisma.user.create({
      data: {
        name: "Promo QA",
        email: customerEmail,
        role: Role.CUSTOMER,
        passwordHash: "x",
      },
      select: { id: true },
    });
    await prisma.walletAccount.create({
      data: { userId: customer.id, balanceCents: 10_000 },
    });

    const summerCode = `SUM${tag}`.slice(0, 12);
    const first = await prisma.promoCode.create({
      data: {
        code: summerCode,
        discountType: PromoDiscountType.PERCENT,
        discountValue: 20,
      },
    });
    await assert.rejects(
      () =>
        prisma.promoCode.create({
          data: {
            code: summerCode,
            discountType: PromoDiscountType.PERCENT,
            discountValue: 10,
          },
        }),
      /Unique constraint|P2002/i
    );
    console.log("PASS P_duplicate_code_rejected");

    const expired = await prisma.promoCode.create({
      data: {
        code: `EXP${tag}`.slice(0, 12),
        discountType: PromoDiscountType.PERCENT,
        discountValue: 20,
        endsAt: new Date(Date.now() - 60_000),
      },
    });
    const future = await prisma.promoCode.create({
      data: {
        code: `FUT${tag}`.slice(0, 12),
        discountType: PromoDiscountType.PERCENT,
        discountValue: 20,
        startsAt: new Date(Date.now() + 86_400_000),
      },
    });
    const disabled = await prisma.promoCode.create({
      data: {
        code: `OFF${tag}`.slice(0, 12),
        discountType: PromoDiscountType.PERCENT,
        discountValue: 20,
        isActive: false,
      },
    });
    const minOrder = await prisma.promoCode.create({
      data: {
        code: `MIN${tag}`.slice(0, 12),
        discountType: PromoDiscountType.PERCENT,
        discountValue: 20,
        minimumOrderCents: 2000,
      },
    });
    const limited = await prisma.promoCode.create({
      data: {
        code: `LIM${tag}`.slice(0, 12),
        discountType: PromoDiscountType.PERCENT,
        discountValue: 10,
        totalUsageLimit: 1,
      },
    });
    const perCust = await prisma.promoCode.create({
      data: {
        code: `PCU${tag}`.slice(0, 12),
        discountType: PromoDiscountType.FIXED_USD,
        discountValue: 100,
        perCustomerUsageLimit: 1,
      },
    });
    const firstOnly = await prisma.promoCode.create({
      data: {
        code: `FST${tag}`.slice(0, 12),
        discountType: PromoDiscountType.PERCENT,
        discountValue: 15,
        firstOrderOnly: true,
      },
    });
    const destOnly = await prisma.promoCode.create({
      data: {
        code: `DST${tag}`.slice(0, 12),
        discountType: PromoDiscountType.PERCENT,
        discountValue: 10,
        destinations: { create: [{ destinationCode: "PK" }] },
      },
    });
    const offerOnly = await prisma.promoCode.create({
      data: {
        code: `OFR${tag}`.slice(0, 12),
        discountType: PromoDiscountType.PERCENT,
        discountValue: 10,
        offers: { create: [{ offerId: "offer-allowed" }] },
      },
    });

    const { evaluateLoadedPromo, PromoEvaluateError, assertPromoUsageAvailable } =
      await import("../app/lib/promo/promoEvaluate");
    const { claimPromoRedemptionInTx, completePromoRedemptionInTx, releasePromoRedemptionInTx } =
      await import("../app/lib/promo/promoRedemption");

    const ctx = {
      customerUserId: customer.id,
      purchaseId: "preview-only",
      offerId: "offer-allowed",
      destinationCode: "PK",
      priceCents: 1000,
    };

    async function loadPromo(code: string) {
      return prisma.promoCode.findUnique({
        where: { code },
        include: { destinations: true, offers: true },
      });
    }

    const missing = await loadPromo("NOPECODE");
    assert.equal(missing, null);
    console.log("PASS H_invalid_code");

    await expectPromoMessage(
      async () => evaluateLoadedPromo((await loadPromo(expired.code))!, ctx),
      PROMO_CUSTOMER_MESSAGES.EXPIRED
    );
    console.log("PASS E_expired");

    await expectPromoMessage(
      async () => evaluateLoadedPromo((await loadPromo(future.code))!, ctx),
      PROMO_CUSTOMER_MESSAGES.NOT_STARTED
    );
    console.log("PASS F_future");

    await expectPromoMessage(
      async () => evaluateLoadedPromo((await loadPromo(disabled.code))!, ctx),
      PROMO_CUSTOMER_MESSAGES.INACTIVE
    );
    console.log("PASS G_disabled");

    await expectPromoMessage(
      async () => evaluateLoadedPromo((await loadPromo(minOrder.code))!, ctx),
      PROMO_CUSTOMER_MESSAGES.MIN_ORDER
    );
    console.log("PASS I_min_order");

    await expectPromoMessage(
      async () =>
        evaluateLoadedPromo((await loadPromo(destOnly.code))!, {
          ...ctx,
          destinationCode: "US",
        }),
      PROMO_CUSTOMER_MESSAGES.NOT_APPLICABLE
    );
    console.log("PASS M_destination_restriction");

    await expectPromoMessage(
      async () =>
        evaluateLoadedPromo((await loadPromo(offerOnly.code))!, {
          ...ctx,
          offerId: "other-offer",
        }),
      PROMO_CUSTOMER_MESSAGES.NOT_APPLICABLE
    );
    console.log("PASS N_offer_restriction");

    const purchaseReady = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        offerId: "offer-allowed",
        destinationCode: "PK",
        priceCents: 1000,
        walletAppliedCents: 0,
        gatewayAmountCents: 1000,
        idempotencyKey: `promo_ready_${tag}`,
        status: WalletEsimPurchaseStatus.READY,
      },
      select: { id: true },
    });

    await prisma.walletEsimPurchase.update({
      where: { id: purchaseReady.id },
      data: {
        promoCodeId: first.id,
        promoCodeNormalized: first.code,
        promoDiscountCents: 200,
        walletAppliedCents: 0,
        gatewayAmountCents: 800,
      },
    });
    const afterApply = await prisma.promoCode.findUnique({
      where: { id: first.id },
      select: { usageCount: true },
    });
    const redemptionsAfterApply = await prisma.promoCodeRedemption.count({
      where: { walletEsimPurchaseId: purchaseReady.id },
    });
    assert.equal(afterApply?.usageCount, 0);
    assert.equal(redemptionsAfterApply, 0);
    console.log("PASS V_apply_does_not_consume");

    const completedPrior = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        offerId: "offer-allowed",
        destinationCode: "PK",
        priceCents: 1000,
        walletAppliedCents: 1000,
        gatewayAmountCents: 0,
        idempotencyKey: `promo_done_${tag}`,
        status: WalletEsimPurchaseStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await expectPromoMessage(
      () =>
        assertPromoUsageAvailable({
          promo: {
            id: firstOnly.id,
            totalUsageLimit: null,
            perCustomerUsageLimit: null,
            firstOrderOnly: true,
          },
          customerUserId: customer.id,
          purchaseId: "new-purchase",
          tx: prisma,
        }),
      PROMO_CUSTOMER_MESSAGES.FIRST_ORDER_ONLY
    );
    console.log("PASS L_first_order_only");
    void completedPrior;

    const holdPurchase = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        offerId: "offer-allowed",
        destinationCode: "PK",
        priceCents: 1000,
        promoCodeId: limited.id,
        promoCodeNormalized: limited.code,
        promoDiscountCents: 100,
        walletAppliedCents: 900,
        gatewayAmountCents: 0,
        idempotencyKey: `promo_hold_${tag}`,
        status: WalletEsimPurchaseStatus.READY,
      },
    });

    const evaluatedLimited = {
      promoCodeId: limited.id,
      code: limited.code,
      discountType: PromoDiscountType.PERCENT,
      discountValue: 10,
      originalPriceCents: 1000,
      discountCents: 100,
      finalPriceCents: 900,
    };

    await prisma.$transaction(async (tx) => {
      await claimPromoRedemptionInTx(tx, {
        customerUserId: customer.id,
        purchaseId: holdPurchase.id,
        evaluated: evaluatedLimited,
        firstOrderOnly: false,
        totalUsageLimit: 1,
        perCustomerUsageLimit: null,
      });
    });

    const secondHold = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        offerId: "offer-allowed",
        destinationCode: "PK",
        priceCents: 1000,
        promoCodeId: limited.id,
        promoDiscountCents: 100,
        walletAppliedCents: 900,
        gatewayAmountCents: 0,
        idempotencyKey: `promo_hold2_${tag}`,
        status: WalletEsimPurchaseStatus.READY,
      },
    });

    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await claimPromoRedemptionInTx(tx, {
            customerUserId: customer.id,
            purchaseId: secondHold.id,
            evaluated: evaluatedLimited,
            firstOrderOnly: false,
            totalUsageLimit: 1,
            perCustomerUsageLimit: null,
          });
        }),
      (error: unknown) =>
        error instanceof PromoEvaluateError &&
        error.message === PROMO_CUSTOMER_MESSAGES.USAGE_LIMIT
    );
    console.log("PASS J_total_limit");

    const per1 = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        offerId: "offer-allowed",
        destinationCode: "PK",
        priceCents: 1000,
        promoCodeId: perCust.id,
        promoDiscountCents: 100,
        walletAppliedCents: 900,
        gatewayAmountCents: 0,
        idempotencyKey: `promo_pc1_${tag}`,
        status: WalletEsimPurchaseStatus.READY,
      },
    });
    const evaluatedPer = {
      promoCodeId: perCust.id,
      code: perCust.code,
      discountType: PromoDiscountType.FIXED_USD,
      discountValue: 100,
      originalPriceCents: 1000,
      discountCents: 100,
      finalPriceCents: 900,
    };
    await prisma.$transaction(async (tx) => {
      await claimPromoRedemptionInTx(tx, {
        customerUserId: customer.id,
        purchaseId: per1.id,
        evaluated: evaluatedPer,
        firstOrderOnly: false,
        totalUsageLimit: null,
        perCustomerUsageLimit: 1,
      });
    });
    const per2 = await prisma.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        offerId: "offer-allowed",
        destinationCode: "PK",
        priceCents: 1000,
        promoCodeId: perCust.id,
        promoDiscountCents: 100,
        walletAppliedCents: 900,
        gatewayAmountCents: 0,
        idempotencyKey: `promo_pc2_${tag}`,
        status: WalletEsimPurchaseStatus.READY,
      },
    });
    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await claimPromoRedemptionInTx(tx, {
            customerUserId: customer.id,
            purchaseId: per2.id,
            evaluated: evaluatedPer,
            firstOrderOnly: false,
            totalUsageLimit: null,
            perCustomerUsageLimit: 1,
          });
        }),
      (error: unknown) =>
        error instanceof PromoEvaluateError &&
        error.message === PROMO_CUSTOMER_MESSAGES.CUSTOMER_LIMIT
    );
    console.log("PASS K_per_customer_limit");

    await prisma.$transaction(async (tx) => {
      await releasePromoRedemptionInTx(tx, holdPurchase.id);
    });
    const afterRelease = await prisma.promoCode.findUnique({
      where: { id: limited.id },
      select: { usageCount: true },
    });
    assert.equal(afterRelease?.usageCount, 0);
    console.log("PASS V_failed_unpaid_releases");

    await prisma.$transaction(async (tx) => {
      await claimPromoRedemptionInTx(tx, {
        customerUserId: customer.id,
        purchaseId: holdPurchase.id,
        evaluated: evaluatedLimited,
        firstOrderOnly: false,
        totalUsageLimit: 1,
        perCustomerUsageLimit: null,
      });
      await completePromoRedemptionInTx(tx, {
        purchaseId: holdPurchase.id,
        orderId: null,
      });
      await completePromoRedemptionInTx(tx, {
        purchaseId: holdPurchase.id,
        orderId: null,
      });
    });
    const completedCount = await prisma.promoCodeRedemption.count({
      where: {
        walletEsimPurchaseId: holdPurchase.id,
        status: PromoRedemptionStatus.COMPLETED,
      },
    });
    const limitedAfter = await prisma.promoCode.findUnique({
      where: { id: limited.id },
      select: { usageCount: true },
    });
    assert.equal(completedCount, 1);
    assert.equal(limitedAfter?.usageCount, 1);
    console.log("PASS W_X_one_redemption_idempotent_complete");

    const snap = await prisma.promoCodeRedemption.findUnique({
      where: { walletEsimPurchaseId: holdPurchase.id },
      select: { discountCents: true, originalPriceCents: true, finalPriceCents: true },
    });
    await prisma.promoCode.update({
      where: { id: limited.id },
      data: { discountValue: 5 },
    });
    const snapAfterEdit = await prisma.promoCodeRedemption.findUnique({
      where: { walletEsimPurchaseId: holdPurchase.id },
      select: { discountCents: true },
    });
    assert.equal(snap?.discountCents, 100);
    assert.equal(snapAfterEdit?.discountCents, 100);
    assert.equal(snap?.originalPriceCents, 1000);
    assert.equal(snap?.finalPriceCents, 900);
    console.log("PASS AA_AB_historic_snapshot_unchanged");

    const partner = await prisma.user.create({
      data: {
        name: "Partner QA",
        email: `promo-partner-${tag}@example.test`,
        role: Role.PARTNER,
        passwordHash: "x",
      },
    });
    assert.equal(partner.role, Role.PARTNER);
    console.log("PASS Y_partner_actor_exists_no_promo_apply");
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  offlineChecks();
  const url = resolveIsolatedUrl();
  if (!url) {
    throw new Error("Isolated PostgreSQL URL is required.");
  }
  try {
    await isolatedDbChecks(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ECONNREFUSED|connect|Refusing/.test(message)) {
      throw new Error(
        `Isolated PostgreSQL required for promo QA. ${message}`
      );
    }
    throw error;
  }
  console.log("ALL_PROMO_CODE_CHECKS_PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
