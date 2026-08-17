import "server-only";

import {
  CustomerRewardRedemptionStatus,
  CustomerRewardTransactionType,
  Prisma,
  Role,
} from "@prisma/client";
import {
  purchaseRedemptionIdempotencyKey,
  purchaseRedemptionRestoreIdempotencyKey,
  REWARD_MIN_REDEMPTION_POINTS,
  REWARDS_AUDIT,
  REWARDS_REFRESH_CHECKOUT_MESSAGE,
} from "@/app/lib/rewards/rewardConstants";
import { isRewardRedemptionEligible } from "@/app/lib/rewards/rewardPoints";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export class RewardRedemptionError extends Error {
  readonly code = "REWARDS_INVALID" as const;

  constructor(message = REWARDS_REFRESH_CHECKOUT_MESSAGE) {
    super(message);
    this.name = "RewardRedemptionError";
  }
}

type RewardAccountReader = {
  customerRewardAccount: {
    findUnique: Prisma.TransactionClient["customerRewardAccount"]["findUnique"];
  };
};

export async function loadCustomerRewardPointsBalance(
  db: RewardAccountReader,
  customerUserId: string
): Promise<number> {
  const account = await db.customerRewardAccount.findUnique({
    where: { customerUserId },
    select: { pointsBalance: true },
  });
  return account?.pointsBalance ?? 0;
}

/**
 * Reserve points at confirm / gateway start. Preview must never call this.
 * CAS: pre-redemption balance >= 100 and >= pointsToHold. No lifetime bump yet.
 */
export async function claimRewardRedemptionInTx(
  tx: Prisma.TransactionClient,
  options: {
    customerUserId: string;
    purchaseId: string;
    pointsToHold: number;
    afterPromoCents: number;
  }
): Promise<{ created: boolean; redemptionId: string | null }> {
  const pointsToHold = options.pointsToHold;
  if (!Number.isInteger(pointsToHold) || pointsToHold < 0) {
    throw new RewardRedemptionError();
  }
  if (!Number.isInteger(options.afterPromoCents) || options.afterPromoCents < 0) {
    throw new RewardRedemptionError();
  }

  const customer = await tx.user.findUnique({
    where: { id: options.customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    throw new RewardRedemptionError();
  }

  const existing = await tx.customerRewardRedemption.findUnique({
    where: { walletEsimPurchaseId: options.purchaseId },
    select: {
      id: true,
      status: true,
      pointsHeld: true,
      rewardAccountId: true,
    },
  });

  if (pointsToHold === 0) {
    if (existing?.status === CustomerRewardRedemptionStatus.HELD) {
      await releaseRewardRedemptionInTx(tx, options.purchaseId);
    }
    return { created: false, redemptionId: null };
  }

  if (existing?.status === CustomerRewardRedemptionStatus.COMPLETED) {
    return { created: false, redemptionId: existing.id };
  }
  if (existing?.status === CustomerRewardRedemptionStatus.HELD) {
    if (existing.pointsHeld !== pointsToHold) {
      throw new RewardRedemptionError();
    }
    return { created: false, redemptionId: existing.id };
  }

  const account = await tx.customerRewardAccount.findUnique({
    where: { customerUserId: customer.id },
    select: { id: true, pointsBalance: true },
  });
  if (!account || !isRewardRedemptionEligible(account.pointsBalance)) {
    throw new RewardRedemptionError();
  }
  if (account.pointsBalance < pointsToHold) {
    throw new RewardRedemptionError();
  }

  const claimed = await tx.customerRewardAccount.updateMany({
    where: {
      id: account.id,
      pointsBalance: {
        gte: Math.max(pointsToHold, REWARD_MIN_REDEMPTION_POINTS),
      },
    },
    data: {
      pointsBalance: { decrement: pointsToHold },
      version: { increment: 1 },
    },
  });
  if (claimed.count !== 1) {
    throw new RewardRedemptionError();
  }

  const after = await tx.customerRewardAccount.findUnique({
    where: { id: account.id },
    select: { pointsBalance: true },
  });
  if (!after || after.pointsBalance < 0) {
    throw new RewardRedemptionError();
  }

  if (existing && existing.status === CustomerRewardRedemptionStatus.RELEASED) {
    const reused = await tx.customerRewardRedemption.update({
      where: { id: existing.id },
      data: {
        status: CustomerRewardRedemptionStatus.HELD,
        pointsHeld: pointsToHold,
        afterPromoCents: options.afterPromoCents,
        completedAt: null,
        orderId: null,
      },
      select: { id: true },
    });
    return { created: true, redemptionId: reused.id };
  }

  const created = await tx.customerRewardRedemption.create({
    data: {
      customerUserId: customer.id,
      rewardAccountId: account.id,
      walletEsimPurchaseId: options.purchaseId,
      status: CustomerRewardRedemptionStatus.HELD,
      pointsHeld: pointsToHold,
      afterPromoCents: options.afterPromoCents,
    },
    select: { id: true },
  });
  return { created: true, redemptionId: created.id };
}

export async function releaseRewardRedemptionInTx(
  tx: Prisma.TransactionClient,
  purchaseId: string
): Promise<void> {
  const current = await tx.customerRewardRedemption.findUnique({
    where: { walletEsimPurchaseId: purchaseId },
    select: {
      id: true,
      status: true,
      pointsHeld: true,
      rewardAccountId: true,
      customerUserId: true,
    },
  });
  if (!current || current.status !== CustomerRewardRedemptionStatus.HELD) {
    return;
  }

  const released = await tx.customerRewardRedemption.updateMany({
    where: {
      id: current.id,
      status: CustomerRewardRedemptionStatus.HELD,
    },
    data: {
      status: CustomerRewardRedemptionStatus.RELEASED,
      completedAt: null,
    },
  });
  if (released.count !== 1) return;

  await tx.customerRewardAccount.update({
    where: { id: current.rewardAccountId },
    data: {
      pointsBalance: { increment: current.pointsHeld },
      version: { increment: 1 },
    },
  });

  const restored = await tx.customerRewardAccount.findUnique({
    where: { id: current.rewardAccountId },
    select: { pointsBalance: true },
  });

  try {
    await tx.customerRewardTransaction.create({
      data: {
        rewardAccountId: current.rewardAccountId,
        customerUserId: current.customerUserId,
        type: CustomerRewardTransactionType.REDEMPTION_RESTORE,
        pointsDelta: current.pointsHeld,
        balanceAfter: restored?.pointsBalance ?? 0,
        purchaseId,
        idempotencyKey: purchaseRedemptionRestoreIdempotencyKey(purchaseId),
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  await tx.auditLog.create({
    data: {
      actorUserId: current.customerUserId,
      action: REWARDS_AUDIT.redemptionRestored,
      targetType: "CustomerRewardRedemption",
      targetId: current.id,
      metadata: {
        purchaseId,
        pointsRestored: current.pointsHeld,
      },
    },
  });
}

export async function completeRewardRedemptionInTx(
  tx: Prisma.TransactionClient,
  options: {
    purchaseId: string;
    orderId: string | null;
    actorUserId?: string | null;
  }
): Promise<void> {
  const current = await tx.customerRewardRedemption.findUnique({
    where: { walletEsimPurchaseId: options.purchaseId },
    select: {
      id: true,
      status: true,
      pointsHeld: true,
      rewardAccountId: true,
      customerUserId: true,
      afterPromoCents: true,
    },
  });
  if (!current) return;
  if (current.status === CustomerRewardRedemptionStatus.RELEASED) return;

  if (current.status === CustomerRewardRedemptionStatus.HELD) {
    const updated = await tx.customerRewardRedemption.updateMany({
      where: {
        id: current.id,
        status: CustomerRewardRedemptionStatus.HELD,
      },
      data: {
        status: CustomerRewardRedemptionStatus.COMPLETED,
        orderId: options.orderId,
        completedAt: new Date(),
      },
    });
    if (updated.count !== 1) return;
  } else if (current.status !== CustomerRewardRedemptionStatus.COMPLETED) {
    return;
  }

  const idempotencyKey = purchaseRedemptionIdempotencyKey(options.purchaseId);
  const existingLedger = await tx.customerRewardTransaction.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existingLedger) return;

  const account = await tx.customerRewardAccount.findUnique({
    where: { id: current.rewardAccountId },
    select: { pointsBalance: true },
  });

  try {
    await tx.customerRewardTransaction.create({
      data: {
        rewardAccountId: current.rewardAccountId,
        customerUserId: current.customerUserId,
        type: CustomerRewardTransactionType.REDEMPTION,
        pointsDelta: -current.pointsHeld,
        balanceAfter: account?.pointsBalance ?? 0,
        eligibleSpendCents: current.afterPromoCents,
        purchaseId: options.purchaseId,
        orderId: options.orderId,
        idempotencyKey,
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return;
  }

  await tx.customerRewardAccount.update({
    where: { id: current.rewardAccountId },
    data: {
      lifetimeRedeemedPoints: { increment: current.pointsHeld },
      version: { increment: 1 },
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId: options.actorUserId ?? null,
      action: REWARDS_AUDIT.redemptionCompleted,
      targetType: "CustomerRewardRedemption",
      targetId: current.id,
      metadata: {
        purchaseId: options.purchaseId,
        orderId: options.orderId,
        pointsRedeemed: current.pointsHeld,
      },
    },
  });
}
