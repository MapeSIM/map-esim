import "server-only";

import {
  PromoRedemptionStatus,
  type Prisma,
} from "@prisma/client";
import {
  assertPromoUsageAvailable,
  PromoEvaluateError,
  type EvaluatedPromo,
} from "@/app/lib/promo/promoEvaluate";
import { PROMO_AUDIT } from "@/app/lib/promo/promoMessages";

/**
 * Claim usage at the durable funded/reserved stage.
 * Idempotent per purchase. CAS on PromoCode.usageCount.
 */
export async function claimPromoRedemptionInTx(
  tx: Prisma.TransactionClient,
  options: {
    customerUserId: string;
    purchaseId: string;
    evaluated: EvaluatedPromo;
    firstOrderOnly: boolean;
    totalUsageLimit: number | null;
    perCustomerUsageLimit: number | null;
  }
): Promise<{ created: boolean; redemptionId: string }> {
  const existing = await tx.promoCodeRedemption.findUnique({
    where: { walletEsimPurchaseId: options.purchaseId },
    select: { id: true, status: true, promoCodeId: true },
  });

  if (existing) {
    if (
      existing.status === PromoRedemptionStatus.HELD ||
      existing.status === PromoRedemptionStatus.COMPLETED
    ) {
      if (existing.promoCodeId !== options.evaluated.promoCodeId) {
        throw new PromoEvaluateError("UNAVAILABLE");
      }
      return { created: false, redemptionId: existing.id };
    }
    // RELEASED: reuse the row and re-increment usage.
  }

  await assertPromoUsageAvailable({
    promo: {
      id: options.evaluated.promoCodeId,
      totalUsageLimit: options.totalUsageLimit,
      perCustomerUsageLimit: options.perCustomerUsageLimit,
      firstOrderOnly: options.firstOrderOnly,
    },
    customerUserId: options.customerUserId,
    purchaseId: options.purchaseId,
    tx,
  });

  const claimed = await tx.promoCode.updateMany({
    where: {
      id: options.evaluated.promoCodeId,
      ...(options.totalUsageLimit != null
        ? { usageCount: { lt: options.totalUsageLimit } }
        : {}),
    },
    data: { usageCount: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    throw new PromoEvaluateError("USAGE_LIMIT");
  }

  if (existing && existing.status === PromoRedemptionStatus.RELEASED) {
    const reused = await tx.promoCodeRedemption.update({
      where: { id: existing.id },
      data: {
        promoCodeId: options.evaluated.promoCodeId,
        status: PromoRedemptionStatus.HELD,
        promoCodeNormalized: options.evaluated.code,
        discountType: options.evaluated.discountType,
        discountValue: options.evaluated.discountValue,
        originalPriceCents: options.evaluated.originalPriceCents,
        discountCents: options.evaluated.discountCents,
        finalPriceCents: options.evaluated.finalPriceCents,
        completedAt: null,
        orderId: null,
      },
      select: { id: true },
    });
    return { created: true, redemptionId: reused.id };
  }

  const created = await tx.promoCodeRedemption.create({
    data: {
      promoCodeId: options.evaluated.promoCodeId,
      customerUserId: options.customerUserId,
      walletEsimPurchaseId: options.purchaseId,
      status: PromoRedemptionStatus.HELD,
      promoCodeNormalized: options.evaluated.code,
      discountType: options.evaluated.discountType,
      discountValue: options.evaluated.discountValue,
      originalPriceCents: options.evaluated.originalPriceCents,
      discountCents: options.evaluated.discountCents,
      finalPriceCents: options.evaluated.finalPriceCents,
    },
    select: { id: true },
  });

  return { created: true, redemptionId: created.id };
}

export async function releasePromoRedemptionInTx(
  tx: Prisma.TransactionClient,
  purchaseId: string
): Promise<void> {
  const current = await tx.promoCodeRedemption.findUnique({
    where: { walletEsimPurchaseId: purchaseId },
    select: { id: true, status: true, promoCodeId: true },
  });
  if (!current || current.status !== PromoRedemptionStatus.HELD) {
    return;
  }

  const released = await tx.promoCodeRedemption.updateMany({
    where: {
      id: current.id,
      status: PromoRedemptionStatus.HELD,
    },
    data: {
      status: PromoRedemptionStatus.RELEASED,
      completedAt: null,
    },
  });
  if (released.count !== 1) return;

  await tx.promoCode.updateMany({
    where: {
      id: current.promoCodeId,
      usageCount: { gt: 0 },
    },
    data: { usageCount: { decrement: 1 } },
  });
}

export async function completePromoRedemptionInTx(
  tx: Prisma.TransactionClient,
  options: {
    purchaseId: string;
    orderId: string | null;
    actorUserId?: string | null;
  }
): Promise<void> {
  const current = await tx.promoCodeRedemption.findUnique({
    where: { walletEsimPurchaseId: options.purchaseId },
    select: {
      id: true,
      status: true,
      promoCodeId: true,
      promoCodeNormalized: true,
      originalPriceCents: true,
      discountCents: true,
      finalPriceCents: true,
    },
  });
  if (!current) return;
  if (current.status === PromoRedemptionStatus.COMPLETED) return;
  if (current.status !== PromoRedemptionStatus.HELD) return;

  const updated = await tx.promoCodeRedemption.updateMany({
    where: {
      id: current.id,
      status: PromoRedemptionStatus.HELD,
    },
    data: {
      status: PromoRedemptionStatus.COMPLETED,
      orderId: options.orderId,
      completedAt: new Date(),
    },
  });
  if (updated.count !== 1) return;

  await tx.auditLog.create({
    data: {
      actorUserId: options.actorUserId || null,
      action: PROMO_AUDIT.redemptionCompleted,
      targetType: "PromoCodeRedemption",
      targetId: current.id,
      metadata: {
        promoId: current.promoCodeId,
        code: current.promoCodeNormalized,
        purchaseId: options.purchaseId,
        orderId: options.orderId,
        originalCents: current.originalPriceCents,
        discountCents: current.discountCents,
        finalCents: current.finalPriceCents,
      },
    },
  });
}

export async function completePromoRedemptionBestEffort(options: {
  purchaseId: string;
  orderId: string | null;
  actorUserId?: string | null;
}): Promise<void> {
  try {
    const { prisma } = await import("@/app/lib/db");
    await prisma.$transaction(async (tx) => {
      await completePromoRedemptionInTx(tx, options);
    });
  } catch (error) {
    // Never fail purchase finalization because of promo completion.
    console.error("PROMO_REDEMPTION_COMPLETION_BEST_EFFORT_FAILED", {
      purchaseId: options.purchaseId,
      orderId: options.orderId,
      code:
        error instanceof Error
          ? error.name.slice(0, 64)
          : "unknown_error",
    });
    try {
      const { prisma } = await import("@/app/lib/db");
      await prisma.auditLog.create({
        data: {
          actorUserId: options.actorUserId ?? null,
          action: "promo.redemption_completion_failed",
          targetType: "WalletEsimPurchase",
          targetId: options.purchaseId,
          metadata: {
            purchaseId: options.purchaseId,
            orderId: options.orderId,
            retryable: true,
          },
        },
      });
    } catch {
      // Audit must never escalate a best-effort failure.
    }
  }
}
