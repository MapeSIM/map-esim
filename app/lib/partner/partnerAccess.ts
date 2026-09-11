/**
 * Partner portal access helpers — active PARTNER actor with profile ownership.
 */
import "server-only";

import {
  PartnerEsimPurchaseStatus,
  PartnerWalletTransactionType,
  Role,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { formatDiscountBpsAsPercent } from "@/app/lib/partner/discount";
import { formatUsdCents, formatWalletDateTime } from "@/app/lib/wallet/display";

export type ActivePartnerActor = {
  userId: string;
  partnerId: string;
  name: string;
  email: string;
};

export type PartnerPortalTxRow = {
  id: string;
  typeLabel: string;
  amountLabel: string;
  balanceAfterLabel: string;
  reason: string;
  createdAtLabel: string;
};

export type PartnerPortalSummary = {
  balanceCents: number;
  balanceLabel: string;
  discountPercentLabel: string;
  totalAddedLabel: string;
  totalDeductedLabel: string;
  /** Sum of ESIM_PURCHASE_DEBIT wallet transactions (purchase spend). */
  totalSpentLabel: string;
  /** Completed Partner eSIM purchases linked to an order. */
  totalEsimOrders: number;
  totalEsimOrdersLabel: string;
  /** Retail − partner charge on completed purchases (Partner discount savings). */
  totalSavingsCents: number;
  totalSavingsLabel: string;
  recentTransactions: PartnerPortalTxRow[];
};

/**
 * Load an active partner actor for portal reads/mutations.
 * Requires role PARTNER, not deleted, profile exists, not disabled.
 */
export async function requireActivePartnerActor(
  userId: string
): Promise<ActivePartnerActor | null> {
  const id = (userId ?? "").trim();
  if (!id || id.length > 64) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      deletedAt: true,
      partnerProfile: {
        select: {
          id: true,
          disabledAt: true,
        },
      },
    },
  });

  if (
    !user ||
    user.deletedAt ||
    user.role !== Role.PARTNER ||
    !user.partnerProfile ||
    user.partnerProfile.disabledAt
  ) {
    return null;
  }

  return {
    userId: user.id,
    partnerId: user.partnerProfile.id,
    name: user.name,
    email: user.email,
  };
}

function partnerTxTypeLabel(type: PartnerWalletTransactionType): string {
  switch (type) {
    case PartnerWalletTransactionType.ADMIN_CREDIT:
      return "Admin credit";
    case PartnerWalletTransactionType.ADMIN_DEBIT:
      return "Admin debit";
    case PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT:
      return "Purchase debit";
    case PartnerWalletTransactionType.ESIM_PURCHASE_REFUND:
      return "Purchase refund";
    case PartnerWalletTransactionType.TOPUP_CREDIT:
      return "Add Funds";
    default:
      return "Transaction";
  }
}

function formatPartnerTxAmount(
  amountCents: number,
  type: PartnerWalletTransactionType
): string {
  if (
    type === PartnerWalletTransactionType.ADMIN_DEBIT ||
    type === PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT
  ) {
    return formatUsdCents(-Math.abs(amountCents));
  }
  const body = formatUsdCents(Math.abs(amountCents));
  if (body === "$0.00") return body;
  return `+${body}`;
}

export async function getPartnerPortalSummary(
  userId: string
): Promise<PartnerPortalSummary | null> {
  const actor = await requireActivePartnerActor(userId);
  if (!actor) return null;

  const profile = await prisma.partnerProfile.findUnique({
    where: { id: actor.partnerId },
    select: {
      discountBps: true,
      walletAccount: {
        select: {
          balanceCents: true,
          transactions: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              type: true,
              amountCents: true,
              balanceAfterCents: true,
              reason: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!profile) return null;

  const wallet = profile.walletAccount;
  const balanceCents = wallet?.balanceCents ?? 0;

  const [
    adminCreditAgg,
    topupCreditAgg,
    adminDebitAgg,
    purchaseDebitAgg,
    completedPurchases,
  ] = await Promise.all([
    prisma.partnerWalletTransaction.aggregate({
      where: {
        type: PartnerWalletTransactionType.ADMIN_CREDIT,
        wallet: { partnerId: actor.partnerId },
      },
      _sum: { amountCents: true },
    }),
    prisma.partnerWalletTransaction.aggregate({
      where: {
        type: PartnerWalletTransactionType.TOPUP_CREDIT,
        wallet: { partnerId: actor.partnerId },
      },
      _sum: { amountCents: true },
    }),
    prisma.partnerWalletTransaction.aggregate({
      where: {
        type: PartnerWalletTransactionType.ADMIN_DEBIT,
        wallet: { partnerId: actor.partnerId },
      },
      _sum: { amountCents: true },
    }),
    prisma.partnerWalletTransaction.aggregate({
      where: {
        type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
        wallet: { partnerId: actor.partnerId },
      },
      _sum: { amountCents: true },
    }),
    prisma.partnerEsimPurchase.findMany({
      where: {
        partnerId: actor.partnerId,
        status: PartnerEsimPurchaseStatus.COMPLETED,
        orderId: { not: null },
      },
      select: {
        retailPriceCents: true,
        partnerChargeCents: true,
      },
    }),
  ]);

  const totalAddedCents =
    (adminCreditAgg._sum.amountCents ?? 0) +
    (topupCreditAgg._sum.amountCents ?? 0);
  const totalDeductedCents = adminDebitAgg._sum.amountCents ?? 0;
  const totalSpentCents = purchaseDebitAgg._sum.amountCents ?? 0;
  const totalEsimOrders = completedPurchases.length;
  let totalSavingsCents = 0;
  for (const row of completedPurchases) {
    const retail = row.retailPriceCents;
    const charge = row.partnerChargeCents;
    if (
      Number.isInteger(retail) &&
      Number.isInteger(charge) &&
      retail >= 0 &&
      charge >= 0 &&
      retail >= charge
    ) {
      totalSavingsCents += retail - charge;
    }
  }

  return {
    balanceCents,
    balanceLabel: formatUsdCents(balanceCents),
    discountPercentLabel: `${formatDiscountBpsAsPercent(profile.discountBps)}%`,
    totalAddedLabel: formatUsdCents(totalAddedCents),
    totalDeductedLabel: formatUsdCents(totalDeductedCents),
    totalSpentLabel: formatUsdCents(totalSpentCents),
    totalEsimOrders,
    totalEsimOrdersLabel: String(totalEsimOrders),
    totalSavingsCents,
    totalSavingsLabel: formatUsdCents(totalSavingsCents),
    recentTransactions: (wallet?.transactions ?? []).map((tx) => ({
      id: tx.id,
      typeLabel: partnerTxTypeLabel(tx.type),
      amountLabel: formatPartnerTxAmount(tx.amountCents, tx.type),
      balanceAfterLabel: formatUsdCents(tx.balanceAfterCents),
      reason: tx.reason,
      createdAtLabel: formatWalletDateTime(tx.createdAt),
    })),
  };
}
