import "server-only";

import {
  CustomerRewardTransactionType,
  Role,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  REWARD_MIN_REDEMPTION_POINTS,
  REWARDS_COPY,
} from "@/app/lib/rewards/rewardConstants";

export type CustomerRewardHistoryItem = {
  id: string;
  label: string;
  pointsLabel: string;
  dateLabel: string;
};

export type CustomerRewardSummary = {
  pointsBalance: number;
  pointsBalanceLabel: string;
  lifetimeEarnedPoints: number;
  rateCopy: string;
  statusCopy: string;
  history: CustomerRewardHistoryItem[];
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(value);
}

export async function getCustomerRewardSummary(
  customerUserId: string
): Promise<CustomerRewardSummary | null> {
  const ownerId = (customerUserId ?? "").trim();
  if (!ownerId || ownerId.length > 64) return null;

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!owner || owner.deletedAt || owner.role !== Role.CUSTOMER) {
    return null;
  }

  const account = await prisma.customerRewardAccount.findUnique({
    where: { customerUserId: owner.id },
    select: {
      pointsBalance: true,
      lifetimeEarnedPoints: true,
    },
  });
  const pointsBalance = account?.pointsBalance ?? 0;
  const lifetimeEarnedPoints = account?.lifetimeEarnedPoints ?? 0;

  const rows = await prisma.customerRewardTransaction.findMany({
    where: {
      customerUserId: owner.id,
      type: {
        in: [
          CustomerRewardTransactionType.PURCHASE_EARN,
          CustomerRewardTransactionType.REDEMPTION,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      pointsDelta: true,
      createdAt: true,
    },
  });

  return {
    pointsBalance,
    pointsBalanceLabel: String(pointsBalance),
    lifetimeEarnedPoints,
    rateCopy: REWARDS_COPY.rate,
    statusCopy:
      pointsBalance < REWARD_MIN_REDEMPTION_POINTS
        ? REWARDS_COPY.earnMore
        : REWARDS_COPY.useAtCheckout,
    history: rows
      .filter((row) => row.pointsDelta !== 0)
      .map((row) => ({
        id: row.id,
        label:
          row.type === CustomerRewardTransactionType.REDEMPTION
            ? "Rewards used"
            : "eSIM purchase",
        pointsLabel:
          row.pointsDelta < 0
            ? `−${Math.abs(row.pointsDelta)} points`
            : `+${row.pointsDelta} points`,
        dateLabel: formatDate(row.createdAt),
      })),
  };
}

export async function getCompletedPurchaseRewardPoints(
  customerUserId: string,
  purchaseId: string
): Promise<number> {
  const row = await prisma.customerRewardTransaction.findFirst({
    where: {
      customerUserId,
      purchaseId,
      type: CustomerRewardTransactionType.PURCHASE_EARN,
      pointsDelta: { gt: 0 },
    },
    select: { pointsDelta: true },
  });
  return row?.pointsDelta ?? 0;
}
