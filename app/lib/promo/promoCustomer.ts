import "server-only";

import {
  OrderFundingSource,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import {
  calculateCustomerCheckoutFunding,
  type PurchaseFundingBreakdown,
} from "@/app/lib/esim/purchaseFunding";
import {
  assertPromoUsageAvailable,
  evaluateCustomerPromo,
  evaluateLoadedPromo,
  PromoEvaluateError,
  type EvaluatedPromo,
} from "@/app/lib/promo/promoEvaluate";
import { claimPromoRedemptionInTx } from "@/app/lib/promo/promoRedemption";
import { PROMO_AUDIT, PROMO_CUSTOMER_MESSAGES } from "@/app/lib/promo/promoMessages";
import { loadCustomerRewardPointsBalance } from "@/app/lib/rewards/rewardRedeem";

export type AppliedPromoSnapshot = {
  code: string;
  originalPriceCents: number;
  discountCents: number;
  finalPriceCents: number;
};

function fundingSourceOf(funding: PurchaseFundingBreakdown): OrderFundingSource {
  if (funding.gatewayAmountCents <= 0) return OrderFundingSource.CUSTOMER_WALLET;
  if (funding.walletAppliedCents > 0) return OrderFundingSource.CUSTOMER_SPLIT;
  return OrderFundingSource.DIRECT_PAYMENT;
}

async function loadReadyCustomerPurchase(
  customerUserId: string,
  purchaseId: string
) {
  const owner = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!owner || owner.deletedAt || owner.role !== Role.CUSTOMER) {
    throw new PromoEvaluateError("UNAVAILABLE");
  }

  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      customerUserId: true,
      adminUserId: true,
      offerId: true,
      destinationCode: true,
      priceCents: true,
      useWallet: true,
      useRewards: true,
      status: true,
      fundingSource: true,
      promoCodeId: true,
      promoDiscountCents: true,
    },
  });

  if (
    !purchase ||
    purchase.customerUserId !== customerUserId ||
    purchase.adminUserId
  ) {
    throw new PromoEvaluateError("UNAVAILABLE");
  }
  if (purchase.status !== WalletEsimPurchaseStatus.READY) {
    throw new PromoEvaluateError("UNAVAILABLE");
  }
  if (
    purchase.fundingSource !== OrderFundingSource.CUSTOMER_WALLET &&
    purchase.fundingSource !== OrderFundingSource.CUSTOMER_SPLIT &&
    purchase.fundingSource !== OrderFundingSource.DIRECT_PAYMENT
  ) {
    throw new PromoEvaluateError("UNAVAILABLE");
  }
  return purchase;
}

async function persistPromoOnReadyPurchase(options: {
  purchaseId: string;
  customerUserId: string;
  useWallet: boolean;
  evaluated: EvaluatedPromo | null;
}): Promise<void> {
  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: options.customerUserId },
    select: { balanceCents: true },
  });
  if (!wallet) {
    throw new PromoEvaluateError("UNAVAILABLE");
  }

  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: options.purchaseId },
    select: { priceCents: true, useRewards: true },
  });
  if (!purchase) {
    throw new PromoEvaluateError("UNAVAILABLE");
  }

  const pointsBalance = await loadCustomerRewardPointsBalance(
    prisma,
    options.customerUserId
  );
  const funding = calculateCustomerCheckoutFunding({
    priceCents: purchase.priceCents,
    promoDiscountCents: options.evaluated?.discountCents ?? 0,
    walletBalanceCents: wallet.balanceCents,
    useWallet: options.useWallet,
    pointsBalance,
    useRewards: purchase.useRewards,
  });

  const updated = await prisma.walletEsimPurchase.updateMany({
    where: {
      id: options.purchaseId,
      customerUserId: options.customerUserId,
      status: WalletEsimPurchaseStatus.READY,
    },
    data: {
      promoCodeId: options.evaluated?.promoCodeId ?? null,
      promoCodeNormalized: options.evaluated?.code ?? null,
      promoDiscountCents: options.evaluated?.discountCents ?? 0,
      useWallet: funding.useWallet,
      useRewards: funding.useRewards,
      rewardPointsRedeemed: funding.rewardPointsRedeemed,
      walletAppliedCents: funding.walletAppliedCents,
      gatewayAmountCents: funding.gatewayAmountCents,
      fundingSource: fundingSourceOf(funding),
    },
  });
  if (updated.count !== 1) {
    throw new PromoEvaluateError("UNAVAILABLE");
  }
}

export async function applyPromoToCustomerPurchase(options: {
  customerUserId: string;
  purchaseId: string;
  code: string;
}): Promise<AppliedPromoSnapshot> {
  const purchase = await loadReadyCustomerPurchase(
    options.customerUserId,
    options.purchaseId
  );

  const evaluated = await evaluateCustomerPromo({
    code: options.code,
    context: {
      customerUserId: options.customerUserId,
      purchaseId: purchase.id,
      offerId: purchase.offerId,
      destinationCode: purchase.destinationCode,
      priceCents: purchase.priceCents,
    },
  });

  const promo = await prisma.promoCode.findUnique({
    where: { id: evaluated.promoCodeId },
    select: {
      id: true,
      totalUsageLimit: true,
      perCustomerUsageLimit: true,
      firstOrderOnly: true,
    },
  });
  if (!promo) {
    throw new PromoEvaluateError("INVALID");
  }
  await assertPromoUsageAvailable({
    promo,
    customerUserId: options.customerUserId,
    purchaseId: purchase.id,
  });

  await persistPromoOnReadyPurchase({
    purchaseId: purchase.id,
    customerUserId: options.customerUserId,
    useWallet: purchase.useWallet,
    evaluated,
  });

  await writeAuditLog({
    actorUserId: options.customerUserId,
    action: PROMO_AUDIT.appliedToPurchase,
    targetType: "WalletEsimPurchase",
    targetId: purchase.id,
    metadata: {
      promoId: evaluated.promoCodeId,
      code: evaluated.code,
      purchaseId: purchase.id,
      originalCents: evaluated.originalPriceCents,
      discountCents: evaluated.discountCents,
      finalCents: evaluated.finalPriceCents,
      previewOnly: true,
    },
  });

  return {
    code: evaluated.code,
    originalPriceCents: evaluated.originalPriceCents,
    discountCents: evaluated.discountCents,
    finalPriceCents: evaluated.finalPriceCents,
  };
}

export async function removePromoFromCustomerPurchase(options: {
  customerUserId: string;
  purchaseId: string;
}): Promise<void> {
  const purchase = await loadReadyCustomerPurchase(
    options.customerUserId,
    options.purchaseId
  );
  await persistPromoOnReadyPurchase({
    purchaseId: purchase.id,
    customerUserId: options.customerUserId,
    useWallet: purchase.useWallet,
    evaluated: null,
  });
}

export async function revalidatePurchasePromo(options: {
  customerUserId: string;
  purchaseId: string;
  offerId: string;
  destinationCode: string | null;
  priceCents: number;
  promoCodeId: string | null;
}): Promise<EvaluatedPromo | null> {
  if (!options.promoCodeId) return null;

  const promo = await prisma.promoCode.findUnique({
    where: { id: options.promoCodeId },
    include: { destinations: true, offers: true },
  });
  if (!promo) {
    throw new PromoEvaluateError("INVALID");
  }

  const evaluated = evaluateLoadedPromo(promo, {
    customerUserId: options.customerUserId,
    purchaseId: options.purchaseId,
    offerId: options.offerId,
    destinationCode: options.destinationCode,
    priceCents: options.priceCents,
  });
  await assertPromoUsageAvailable({
    promo,
    customerUserId: options.customerUserId,
    purchaseId: options.purchaseId,
  });
  return evaluated;
}

export async function claimPurchasePromoInTx(
  tx: Parameters<typeof claimPromoRedemptionInTx>[0],
  options: {
    customerUserId: string;
    purchaseId: string;
    offerId: string;
    destinationCode: string | null;
    priceCents: number;
    promoCodeId: string | null;
    actorUserId?: string | null;
  }
): Promise<EvaluatedPromo | null> {
  if (!options.promoCodeId) return null;

  const promo = await tx.promoCode.findUnique({
    where: { id: options.promoCodeId },
    include: { destinations: true, offers: true },
  });
  if (!promo) {
    throw new PromoEvaluateError("INVALID");
  }

  const evaluated = evaluateLoadedPromo(promo, {
    customerUserId: options.customerUserId,
    purchaseId: options.purchaseId,
    offerId: options.offerId,
    destinationCode: options.destinationCode,
    priceCents: options.priceCents,
  });

  await claimPromoRedemptionInTx(tx, {
    customerUserId: options.customerUserId,
    purchaseId: options.purchaseId,
    evaluated,
    firstOrderOnly: promo.firstOrderOnly,
    totalUsageLimit: promo.totalUsageLimit,
    perCustomerUsageLimit: promo.perCustomerUsageLimit,
  });

  await tx.auditLog.create({
    data: {
      actorUserId: options.actorUserId || options.customerUserId,
      action: PROMO_AUDIT.appliedToPurchase,
      targetType: "WalletEsimPurchase",
      targetId: options.purchaseId,
      metadata: {
        promoId: evaluated.promoCodeId,
        code: evaluated.code,
        purchaseId: options.purchaseId,
        originalCents: evaluated.originalPriceCents,
        discountCents: evaluated.discountCents,
        finalCents: evaluated.finalPriceCents,
      },
    },
  });

  return evaluated;
}

export function customerPromoErrorMessage(error: unknown): string {
  if (error instanceof PromoEvaluateError) return error.message;
  return PROMO_CUSTOMER_MESSAGES.UNAVAILABLE;
}
