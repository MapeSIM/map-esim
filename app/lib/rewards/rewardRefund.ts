import "server-only";

import {
  CustomerRewardRedemptionStatus,
  CustomerRewardTransactionType,
  Prisma,
  Role,
} from "@prisma/client";
import {
  purchaseEarnReversalIdempotencyKey,
  purchaseRefundRedemptionRestoreIdempotencyKey,
  REWARDS_AUDIT,
} from "@/app/lib/rewards/rewardConstants";
import { isFullCustomerPurchaseRefundForRewards } from "@/app/lib/rewards/rewardPoints";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export class RewardRefundError extends Error {
  readonly code: "PARTNER_EXCLUDED" | "PURCHASE_UNAVAILABLE";

  constructor(
    code: RewardRefundError["code"],
    message: string
  ) {
    super(message);
    this.code = code;
    this.name = "RewardRefundError";
  }
}

export type CustomerRewardFullRefundEffectsResult = {
  restoredPoints: number;
  reversedEarnPoints: number;
  redemptionRestoreDuplicate: boolean;
  earnReversalDuplicate: boolean;
  unsupported: "PARTIAL_REFUND_NOT_SUPPORTED" | null;
};

/**
 * Post-funding full-refund reward effects.
 *
 * Call from durable FULL customer refund finalization in the SAME DB transaction
 * as money movement (or after money already moved, with purchase-scoped idempotency).
 * Prefer `applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx` so partial
 * amounts never mutate. Do not expose as a public/admin action.
 *
 * lifetimeRedeemedPoints / lifetimeEarnedPoints are GROSS completed totals.
 * Refund restore/reversal changes pointsBalance only.
 *
 * PURCHASE_EARN_REVERSAL may drive pointsBalance negative (points owed back).
 * Future earns increment the same balance and therefore offset the debt first.
 * Do not take cash to compensate. Checkout treats a negative balance as ineligible.
 *
 * Pre-funding cancel HELD → RELEASED uses the existing hold-release primitive and a
 * different restore idempotency key.
 *
 * Post-funding FULL refund also restores HELD redemptions that never completed
 * after Order/debit commit (post-commit side-effect failure). Those are marked
 * RELEASED after restore so a later best-effort complete cannot double-apply.
 */

async function requireCustomerPurchase(
  tx: Prisma.TransactionClient,
  options: { customerUserId: string; purchaseId: string }
): Promise<{ customerId: string; purchaseId: string; orderId: string | null }> {
  const customer = await tx.user.findUnique({
    where: { id: options.customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!customer || customer.deletedAt) {
    throw new RewardRefundError(
      "PURCHASE_UNAVAILABLE",
      "This purchase is unavailable for reward refund effects."
    );
  }
  if (customer.role !== Role.CUSTOMER) {
    throw new RewardRefundError(
      "PARTNER_EXCLUDED",
      "Partner purchases cannot use customer reward refund effects."
    );
  }

  const purchase = await tx.walletEsimPurchase.findUnique({
    where: { id: options.purchaseId },
    select: { id: true, customerUserId: true, orderId: true },
  });
  if (!purchase || purchase.customerUserId !== customer.id) {
    throw new RewardRefundError(
      "PURCHASE_UNAVAILABLE",
      "This purchase is unavailable for reward refund effects."
    );
  }

  return {
    customerId: customer.id,
    purchaseId: purchase.id,
    orderId: purchase.orderId,
  };
}

/**
 * Restore snapshotted COMPLETED (or stuck HELD) redemption points after a full refund.
 * Does not use hold-release. Does not decrement lifetimeRedeemedPoints (gross).
 */
export async function restoreCustomerRewardRedemptionForRefundInTx(
  tx: Prisma.TransactionClient,
  options: {
    customerUserId: string;
    purchaseId: string;
    refundRequestId?: string | null;
    actorUserId?: string | null;
  }
): Promise<{ restoredPoints: number; duplicate: boolean }> {
  const owned = await requireCustomerPurchase(tx, options);
  const idempotencyKey = purchaseRefundRedemptionRestoreIdempotencyKey(
    owned.purchaseId
  );

  const existing = await tx.customerRewardTransaction.findUnique({
    where: { idempotencyKey },
    select: { pointsDelta: true },
  });
  if (existing) {
    return { restoredPoints: existing.pointsDelta, duplicate: true };
  }

  const redemption = await tx.customerRewardRedemption.findUnique({
    where: { walletEsimPurchaseId: owned.purchaseId },
    select: {
      id: true,
      status: true,
      pointsHeld: true,
      rewardAccountId: true,
      customerUserId: true,
    },
  });
  const restorable =
    redemption?.status === CustomerRewardRedemptionStatus.COMPLETED ||
    redemption?.status === CustomerRewardRedemptionStatus.HELD;
  if (
    !redemption ||
    !restorable ||
    redemption.customerUserId !== owned.customerId ||
    redemption.pointsHeld <= 0
  ) {
    return { restoredPoints: 0, duplicate: false };
  }

  try {
    await tx.customerRewardTransaction.create({
      data: {
        rewardAccountId: redemption.rewardAccountId,
        customerUserId: owned.customerId,
        type: CustomerRewardTransactionType.REDEMPTION_RESTORE,
        pointsDelta: redemption.pointsHeld,
        balanceAfter: 0,
        purchaseId: owned.purchaseId,
        orderId: owned.orderId,
        refundRequestId: options.refundRequestId ?? null,
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
    return { restoredPoints: raced?.pointsDelta ?? redemption.pointsHeld, duplicate: true };
  }

  const updated = await tx.customerRewardAccount.update({
    where: { id: redemption.rewardAccountId },
    data: {
      pointsBalance: { increment: redemption.pointsHeld },
      version: { increment: 1 },
    },
    select: { pointsBalance: true },
  });

  await tx.customerRewardTransaction.update({
    where: { idempotencyKey },
    data: { balanceAfter: updated.pointsBalance },
  });

  // Stuck HELD after successful purchase must not remain redeemable/completable.
  if (redemption.status === CustomerRewardRedemptionStatus.HELD) {
    await tx.customerRewardRedemption.updateMany({
      where: {
        id: redemption.id,
        status: CustomerRewardRedemptionStatus.HELD,
      },
      data: {
        status: CustomerRewardRedemptionStatus.RELEASED,
        completedAt: null,
      },
    });
  }

  await tx.auditLog.create({
    data: {
      actorUserId: options.actorUserId ?? null,
      action: REWARDS_AUDIT.redemptionRestoredForRefund,
      targetType: "WalletEsimPurchase",
      targetId: owned.purchaseId,
      metadata: {
        customerId: owned.customerId,
        purchaseId: owned.purchaseId,
        refundRequestId: options.refundRequestId ?? null,
        pointsRestored: redemption.pointsHeld,
        priorRedemptionStatus: redemption.status,
      },
    },
  });

  return { restoredPoints: redemption.pointsHeld, duplicate: false };
}

/**
 * Reverse the original PURCHASE_EARN ledger row. May make pointsBalance negative.
 * Does not recompute from current catalog/promo. Does not decrement lifetimeEarnedPoints (gross).
 */
export async function reverseCustomerPurchaseRewardEarnForRefundInTx(
  tx: Prisma.TransactionClient,
  options: {
    customerUserId: string;
    purchaseId: string;
    refundRequestId?: string | null;
    actorUserId?: string | null;
  }
): Promise<{ reversedEarnPoints: number; duplicate: boolean }> {
  const owned = await requireCustomerPurchase(tx, options);
  const idempotencyKey = purchaseEarnReversalIdempotencyKey(owned.purchaseId);

  const existing = await tx.customerRewardTransaction.findUnique({
    where: { idempotencyKey },
    select: { pointsDelta: true },
  });
  if (existing) {
    return { reversedEarnPoints: Math.abs(existing.pointsDelta), duplicate: true };
  }

  const earn = await tx.customerRewardTransaction.findFirst({
    where: {
      customerUserId: owned.customerId,
      purchaseId: owned.purchaseId,
      type: CustomerRewardTransactionType.PURCHASE_EARN,
      pointsDelta: { gt: 0 },
    },
    select: {
      pointsDelta: true,
      eligibleSpendCents: true,
      rewardAccountId: true,
      orderId: true,
    },
  });
  if (!earn) {
    return { reversedEarnPoints: 0, duplicate: false };
  }

  const points = earn.pointsDelta;
  try {
    await tx.customerRewardTransaction.create({
      data: {
        rewardAccountId: earn.rewardAccountId,
        customerUserId: owned.customerId,
        type: CustomerRewardTransactionType.PURCHASE_EARN_REVERSAL,
        pointsDelta: -points,
        balanceAfter: 0,
        eligibleSpendCents: earn.eligibleSpendCents,
        purchaseId: owned.purchaseId,
        orderId: earn.orderId ?? owned.orderId,
        refundRequestId: options.refundRequestId ?? null,
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
    return { reversedEarnPoints: Math.abs(raced?.pointsDelta ?? points), duplicate: true };
  }

  const updated = await tx.customerRewardAccount.update({
    where: { id: earn.rewardAccountId },
    data: {
      pointsBalance: { decrement: points },
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
      action: REWARDS_AUDIT.purchaseEarnReversedForRefund,
      targetType: "WalletEsimPurchase",
      targetId: owned.purchaseId,
      metadata: {
        customerId: owned.customerId,
        purchaseId: owned.purchaseId,
        refundRequestId: options.refundRequestId ?? null,
        pointsReversed: points,
      },
    },
  });

  return { reversedEarnPoints: points, duplicate: false };
}

/**
 * Full-refund reward effects: restore completed redemption, then reverse earn.
 * Partial refunds are flagged and do not mutate. Not a public action.
 */
export async function applyCustomerRewardFullRefundEffectsInTx(
  tx: Prisma.TransactionClient,
  options: {
    customerUserId: string;
    purchaseId: string;
    refundKind: "FULL" | "PARTIAL";
    refundRequestId?: string | null;
    actorUserId?: string | null;
  }
): Promise<CustomerRewardFullRefundEffectsResult> {
  if (options.refundKind !== "FULL") {
    return {
      restoredPoints: 0,
      reversedEarnPoints: 0,
      redemptionRestoreDuplicate: false,
      earnReversalDuplicate: false,
      unsupported: "PARTIAL_REFUND_NOT_SUPPORTED",
    };
  }

  await requireCustomerPurchase(tx, options);

  const restored = await restoreCustomerRewardRedemptionForRefundInTx(tx, options);
  const reversed = await reverseCustomerPurchaseRewardEarnForRefundInTx(
    tx,
    options
  );

  return {
    restoredPoints: restored.restoredPoints,
    reversedEarnPoints: reversed.reversedEarnPoints,
    redemptionRestoreDuplicate: restored.duplicate,
    earnReversalDuplicate: reversed.duplicate,
    unsupported: null,
  };
}

/**
 * Apply post-funding reward effects only when refundedAmountCents exactly equals
 * purchasePriceCents (FULL). Partial amounts never mutate rewards.
 * Idempotent via purchase-scoped restore/reversal keys.
 */
export async function applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx(
  tx: Prisma.TransactionClient,
  options: {
    customerUserId: string;
    purchaseId: string;
    purchasePriceCents: number;
    refundedAmountCents: number;
    refundRequestId?: string | null;
    actorUserId?: string | null;
  }
): Promise<CustomerRewardFullRefundEffectsResult> {
  if (
    !isFullCustomerPurchaseRefundForRewards({
      purchasePriceCents: options.purchasePriceCents,
      refundedAmountCents: options.refundedAmountCents,
    })
  ) {
    return {
      restoredPoints: 0,
      reversedEarnPoints: 0,
      redemptionRestoreDuplicate: false,
      earnReversalDuplicate: false,
      unsupported: "PARTIAL_REFUND_NOT_SUPPORTED",
    };
  }

  return applyCustomerRewardFullRefundEffectsInTx(tx, {
    customerUserId: options.customerUserId,
    purchaseId: options.purchaseId,
    refundKind: "FULL",
    refundRequestId: options.refundRequestId,
    actorUserId: options.actorUserId,
  });
}

export { isFullCustomerPurchaseRefundForRewards };
