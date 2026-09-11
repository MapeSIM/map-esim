import "server-only";

import {
  CustomerReferralStatus,
  Prisma,
  Role,
  WalletCurrency,
  WalletDirection,
  WalletEsimPurchaseStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  generateReferralCodeCandidate,
  normalizeReferralCode,
} from "@/app/lib/referrals/referralCode";
import {
  REFERRAL_AUDIT,
  REFERRAL_REWARD_REFERENCE_TYPE,
  referralRewardIdempotencyKey,
} from "@/app/lib/referrals/referralConstants";
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Ensure a CUSTOMER has a public referral code (lazy mint). Idempotent.
 */
export async function ensureUserReferralCode(
  userId: string
): Promise<string | null> {
  const id = userId.trim();
  if (!id) return null;

  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      referralCode: true,
    },
  });
  if (
    !existing ||
    existing.deletedAt ||
    existing.role !== Role.CUSTOMER
  ) {
    return null;
  }
  if (existing.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateReferralCodeCandidate();
    try {
      const updated = await prisma.user.updateMany({
        where: {
          id: existing.id,
          role: Role.CUSTOMER,
          deletedAt: null,
          referralCode: null,
        },
        data: { referralCode: code },
      });
      if (updated.count === 1) return code;

      const raced = await prisma.user.findUnique({
        where: { id: existing.id },
        select: { referralCode: true },
      });
      if (raced?.referralCode) return raced.referralCode;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return null;
}

/**
 * Attribute a new signup to a referrer code. Best-effort; never fails signup.
 * First attributed referrer wins (unique referredUserId).
 */
export async function attachReferralOnSignupBestEffort(options: {
  referredUserId: string;
  code: unknown;
}): Promise<void> {
  try {
    const referredUserId = options.referredUserId.trim();
    const code = normalizeReferralCode(options.code);
    if (!referredUserId || !code) return;

    const referred = await prisma.user.findUnique({
      where: { id: referredUserId },
      select: { id: true, role: true, deletedAt: true },
    });
    if (
      !referred ||
      referred.deletedAt ||
      referred.role !== Role.CUSTOMER
    ) {
      return;
    }

    const existing = await prisma.customerReferral.findUnique({
      where: { referredUserId: referred.id },
      select: { id: true },
    });
    if (existing) return;

    const referrer = await prisma.user.findFirst({
      where: {
        referralCode: code,
        role: Role.CUSTOMER,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!referrer || referrer.id === referred.id) return;

    try {
      await prisma.customerReferral.create({
        data: {
          referrerUserId: referrer.id,
          referredUserId: referred.id,
          codeUsed: code,
          status: CustomerReferralStatus.PENDING,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return;
    }

    try {
      await prisma.auditLog.create({
        data: {
          actorUserId: referred.id,
          action: REFERRAL_AUDIT.attached,
          targetType: "CustomerReferral",
          targetId: referred.id,
          metadata: {
            referrerUserId: referrer.id,
            codeUsed: code,
          },
        },
      });
    } catch {
      // Audit must never fail attribution.
    }
  } catch (error) {
    console.error("REFERRAL_ATTACH_BEST_EFFORT_FAILED", {
      code:
        error instanceof Error
          ? error.name.slice(0, 64)
          : "unknown_error",
    });
  }
}

export type ReferralRewardResult = {
  credited: boolean;
  duplicate: boolean;
  skipped: boolean;
  walletTransactionId: string | null;
};

/**
 * Exact-once referrer wallet credit after referred user's first COMPLETED purchase.
 * Safe inside purchase post-commit / recon transactions. Never rolls back order/debit.
 */
export async function awardReferralRewardInTx(
  tx: Prisma.TransactionClient,
  options: {
    customerUserId: string;
    purchaseId: string;
    orderId: string | null;
    actorUserId?: string | null;
  }
): Promise<ReferralRewardResult> {
  const customerUserId = options.customerUserId.trim();
  const purchaseId = options.purchaseId.trim();
  if (!customerUserId || !purchaseId) {
    return {
      credited: false,
      duplicate: false,
      skipped: true,
      walletTransactionId: null,
    };
  }

  const referral = await tx.customerReferral.findUnique({
    where: { referredUserId: customerUserId },
    select: {
      id: true,
      referrerUserId: true,
      status: true,
      rewardWalletTxId: true,
    },
  });
  if (!referral) {
    return {
      credited: false,
      duplicate: false,
      skipped: true,
      walletTransactionId: null,
    };
  }
  if (referral.status === CustomerReferralStatus.REWARDED) {
    return {
      credited: false,
      duplicate: true,
      skipped: false,
      walletTransactionId: referral.rewardWalletTxId,
    };
  }
  if (referral.status === CustomerReferralStatus.INELIGIBLE) {
    return {
      credited: false,
      duplicate: false,
      skipped: true,
      walletTransactionId: null,
    };
  }

  const purchase = await tx.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      customerUserId: true,
      status: true,
      priceCents: true,
    },
  });
  if (
    !purchase ||
    purchase.customerUserId !== customerUserId ||
    purchase.status !== WalletEsimPurchaseStatus.COMPLETED
  ) {
    return {
      credited: false,
      duplicate: false,
      skipped: true,
      walletTransactionId: null,
    };
  }

  const completedCount = await tx.walletEsimPurchase.count({
    where: {
      customerUserId,
      status: WalletEsimPurchaseStatus.COMPLETED,
    },
  });
  if (completedCount !== 1) {
    await tx.customerReferral.updateMany({
      where: {
        id: referral.id,
        status: CustomerReferralStatus.PENDING,
      },
      data: { status: CustomerReferralStatus.INELIGIBLE },
    });
    try {
      await tx.auditLog.create({
        data: {
          actorUserId: options.actorUserId ?? null,
          action: REFERRAL_AUDIT.markedIneligible,
          targetType: "CustomerReferral",
          targetId: referral.id,
          metadata: {
            purchaseId,
            completedCount,
            reason: "not_first_completed_purchase",
          },
        },
      });
    } catch {
      // ignore
    }
    return {
      credited: false,
      duplicate: false,
      skipped: true,
      walletTransactionId: null,
    };
  }

  if (referral.referrerUserId === customerUserId) {
    await tx.customerReferral.updateMany({
      where: {
        id: referral.id,
        status: CustomerReferralStatus.PENDING,
      },
      data: { status: CustomerReferralStatus.INELIGIBLE },
    });
    return {
      credited: false,
      duplicate: false,
      skipped: true,
      walletTransactionId: null,
    };
  }

  const referrer = await tx.user.findUnique({
    where: { id: referral.referrerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (
    !referrer ||
    referrer.deletedAt ||
    referrer.role !== Role.CUSTOMER
  ) {
    await tx.customerReferral.updateMany({
      where: {
        id: referral.id,
        status: CustomerReferralStatus.PENDING,
      },
      data: { status: CustomerReferralStatus.INELIGIBLE },
    });
    return {
      credited: false,
      duplicate: false,
      skipped: true,
      walletTransactionId: null,
    };
  }

  const { getReferralProgramSettings } = await import(
    "@/app/lib/referrals/referralProgramConfig"
  );
  const { calculateReferralRewardCents } = await import(
    "@/app/lib/referrals/referralProgramShared"
  );
  const settings = await getReferralProgramSettings(tx);
  const calc = calculateReferralRewardCents({
    settings,
    purchasePriceCents: purchase.priceCents,
  });
  if (!calc.ok) {
    if (
      calc.reason === "disabled" ||
      calc.reason === "below_min_purchase" ||
      calc.reason === "zero_reward"
    ) {
      await tx.customerReferral.updateMany({
        where: {
          id: referral.id,
          status: CustomerReferralStatus.PENDING,
        },
        data: { status: CustomerReferralStatus.INELIGIBLE },
      });
      try {
        await tx.auditLog.create({
          data: {
            actorUserId: options.actorUserId ?? null,
            action: REFERRAL_AUDIT.markedIneligible,
            targetType: "CustomerReferral",
            targetId: referral.id,
            metadata: {
              purchaseId,
              reason: calc.reason,
              purchasePriceCents: purchase.priceCents,
              rewardType: settings.rewardType,
              rewardValue: settings.rewardValue,
              minPurchaseCents: settings.minPurchaseCents,
            },
          },
        });
      } catch {
        // ignore
      }
    }
    return {
      credited: false,
      duplicate: false,
      skipped: true,
      walletTransactionId: null,
    };
  }

  const amountCents = calc.amountCents;
  const idempotencyKey = referralRewardIdempotencyKey(referral.id);

  const existingTx = await tx.walletTransaction.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existingTx) {
    await tx.customerReferral.updateMany({
      where: {
        id: referral.id,
        status: CustomerReferralStatus.PENDING,
      },
      data: {
        status: CustomerReferralStatus.REWARDED,
        rewardedPurchaseId: purchaseId,
        rewardWalletTxId: existingTx.id,
        rewardedAt: new Date(),
      },
    });
    return {
      credited: false,
      duplicate: true,
      skipped: false,
      walletTransactionId: existingTx.id,
    };
  }

  let wallet = await tx.walletAccount.findUnique({
    where: { userId: referrer.id },
    select: { id: true, balanceCents: true, version: true },
  });
  if (!wallet) {
    try {
      wallet = await tx.walletAccount.create({
        data: {
          userId: referrer.id,
          currency: WalletCurrency.USD,
          balanceCents: 0,
          version: 0,
        },
        select: { id: true, balanceCents: true, version: true },
      });
    } catch (createError) {
      if (!isUniqueViolation(createError)) throw createError;
      wallet = await tx.walletAccount.findUnique({
        where: { userId: referrer.id },
        select: { id: true, balanceCents: true, version: true },
      });
      if (!wallet) throw createError;
    }
  }

  const nextBalance = wallet.balanceCents + amountCents;
  if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
    return {
      credited: false,
      duplicate: false,
      skipped: true,
      walletTransactionId: null,
    };
  }

  const updatedWallet = await tx.walletAccount.update({
    where: { id: wallet.id },
    data: {
      balanceCents: nextBalance,
      version: { increment: 1 },
    },
    select: { balanceCents: true },
  });

  let transactionId: string;
  try {
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.ADJUSTMENT_CREDIT,
        direction: WalletDirection.CREDIT,
        status: WalletTransactionStatus.COMPLETED,
        amountCents,
        balanceBeforeCents: wallet.balanceCents,
        balanceAfterCents: updatedWallet.balanceCents,
        idempotencyKey,
        referenceType: REFERRAL_REWARD_REFERENCE_TYPE,
        referenceId: referral.id,
      },
      select: { id: true },
    });
    transactionId = transaction.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await tx.walletTransaction.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (!raced) throw error;
    await tx.customerReferral.updateMany({
      where: {
        id: referral.id,
        status: CustomerReferralStatus.PENDING,
      },
      data: {
        status: CustomerReferralStatus.REWARDED,
        rewardedPurchaseId: purchaseId,
        rewardWalletTxId: raced.id,
        rewardedAt: new Date(),
      },
    });
    return {
      credited: false,
      duplicate: true,
      skipped: false,
      walletTransactionId: raced.id,
    };
  }

  const claimed = await tx.customerReferral.updateMany({
    where: {
      id: referral.id,
      status: CustomerReferralStatus.PENDING,
    },
    data: {
      status: CustomerReferralStatus.REWARDED,
      rewardedPurchaseId: purchaseId,
      rewardWalletTxId: transactionId,
      rewardedAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    // Another worker rewarded; leave ledger row (idempotent key) as source of truth.
    return {
      credited: false,
      duplicate: true,
      skipped: false,
      walletTransactionId: transactionId,
    };
  }

  await tx.auditLog.create({
    data: {
      actorUserId: options.actorUserId ?? null,
      action: REFERRAL_AUDIT.rewarded,
      targetType: "CustomerReferral",
      targetId: referral.id,
      metadata: {
        referrerUserId: referrer.id,
        referredUserId: customerUserId,
        purchaseId,
        orderId: options.orderId,
        amountCents,
        purchasePriceCents: purchase.priceCents,
        rewardType: settings.rewardType,
        rewardValue: settings.rewardValue,
        walletTransactionId: transactionId,
      },
    },
  });

  return {
    credited: true,
    duplicate: false,
    skipped: false,
    walletTransactionId: transactionId,
  };
}

/**
 * Post-commit referral reward. Never rolls back Order / wallet debit.
 */
export async function awardReferralRewardBestEffort(options: {
  customerUserId: string;
  purchaseId: string;
  orderId: string | null;
  actorUserId?: string | null;
}): Promise<void> {
  let walletTransactionId: string | null = null;
  try {
    const result = await prisma.$transaction(async (tx) => {
      return awardReferralRewardInTx(tx, options);
    });
    walletTransactionId = result.walletTransactionId;
    if (result.credited && walletTransactionId) {
      scheduleWalletTransactionNotification(walletTransactionId);
    }
  } catch (error) {
    console.error("REFERRAL_REWARD_BEST_EFFORT_FAILED", {
      purchaseId: options.purchaseId,
      orderId: options.orderId,
      code:
        error instanceof Error
          ? error.name.slice(0, 64)
          : "unknown_error",
    });
    try {
      await prisma.auditLog.create({
        data: {
          actorUserId: options.actorUserId ?? null,
          action: REFERRAL_AUDIT.rewardFailed,
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
      // ignore
    }
  }
}
