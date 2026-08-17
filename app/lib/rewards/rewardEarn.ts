import "server-only";

import {
  CustomerRewardTransactionType,
  Prisma,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import {
  purchaseEarnIdempotencyKey,
  REWARDS_AUDIT,
} from "@/app/lib/rewards/rewardConstants";
import {
  calculateRewardPointsEarned,
  eligibleRewardSpendCents,
} from "@/app/lib/rewards/rewardPoints";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export type RewardEarnResult = {
  points: number;
  duplicate: boolean;
};

/**
 * Exact-once PURCHASE_EARN after local COMPLETED + provisioned order.
 * Ignores any client-supplied points/spend. Partner roles earn nothing.
 */
export function rejectClientRewardInputs(formData?: FormData | null): void {
  void formData?.get("points");
  void formData?.get("eligibleSpendCents");
  void formData?.get("rewardPoints");
}

export async function awardCustomerPurchaseEarnInTx(
  tx: Prisma.TransactionClient,
  options: {
    customerUserId: string;
    purchaseId: string;
    orderId: string | null;
    actorUserId?: string | null;
  }
): Promise<RewardEarnResult> {
  rejectClientRewardInputs(null);

  const customer = await tx.user.findUnique({
    where: { id: options.customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    return { points: 0, duplicate: false };
  }

  const purchase = await tx.walletEsimPurchase.findUnique({
    where: { id: options.purchaseId },
    select: {
      id: true,
      customerUserId: true,
      status: true,
      priceCents: true,
      promoDiscountCents: true,
    },
  });
  if (!purchase || purchase.customerUserId !== customer.id) {
    return { points: 0, duplicate: false };
  }

  const idempotencyKey = purchaseEarnIdempotencyKey(purchase.id);
  const existing = await tx.customerRewardTransaction.findUnique({
    where: { idempotencyKey },
    select: { pointsDelta: true },
  });
  if (existing) {
    return { points: existing.pointsDelta, duplicate: true };
  }

  if (purchase.status !== WalletEsimPurchaseStatus.COMPLETED) {
    return { points: 0, duplicate: false };
  }

  const eligible = eligibleRewardSpendCents(
    purchase.priceCents,
    purchase.promoDiscountCents
  );
  const points = calculateRewardPointsEarned(eligible);
  if (points <= 0) {
    return { points: 0, duplicate: false };
  }

  let account = await tx.customerRewardAccount.findUnique({
    where: { customerUserId: customer.id },
    select: { id: true },
  });
  if (!account) {
    try {
      account = await tx.customerRewardAccount.create({
        data: { customerUserId: customer.id },
        select: { id: true },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      account = await tx.customerRewardAccount.findUnique({
        where: { customerUserId: customer.id },
        select: { id: true },
      });
      if (!account) throw error;
    }
  }

  try {
    await tx.customerRewardTransaction.create({
      data: {
        rewardAccountId: account.id,
        customerUserId: customer.id,
        type: CustomerRewardTransactionType.PURCHASE_EARN,
        pointsDelta: points,
        balanceAfter: 0,
        eligibleSpendCents: eligible,
        purchaseId: purchase.id,
        orderId: options.orderId,
        idempotencyKey,
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await tx.customerRewardTransaction.findUnique({
      where: { idempotencyKey },
      select: { pointsDelta: true },
    });
    return { points: raced?.pointsDelta ?? points, duplicate: true };
  }

  const updated = await tx.customerRewardAccount.update({
    where: { id: account.id },
    data: {
      pointsBalance: { increment: points },
      lifetimeEarnedPoints: { increment: points },
      version: { increment: 1 },
    },
    select: { pointsBalance: true },
  });

  await tx.customerRewardTransaction.update({
    where: { idempotencyKey },
    data: { balanceAfter: updated.pointsBalance },
  });

  await tx.auditLog.create({
    data: {
      actorUserId: options.actorUserId ?? null,
      action: REWARDS_AUDIT.purchaseEarned,
      targetType: "WalletEsimPurchase",
      targetId: purchase.id,
      metadata: {
        customerId: customer.id,
        purchaseId: purchase.id,
        orderId: options.orderId,
        eligibleSpendCents: eligible,
        pointsEarned: points,
      },
    },
  });

  return { points, duplicate: false };
}
