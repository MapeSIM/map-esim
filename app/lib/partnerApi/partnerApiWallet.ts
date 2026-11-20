/**
 * Partner Public API wallet balance + recent ledger.
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";
import type { PartnerApiActor } from "@/app/lib/partnerApiAuth";

export type PartnerApiWalletTx = {
  id: string;
  type: string;
  amountCents: number;
  amountLabel: string;
  balanceBeforeCents: number;
  balanceAfterCents: number;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
};

export type PartnerApiWalletSnapshot = {
  balanceCents: number;
  balanceUsd: number;
  balanceLabel: string;
  currency: "USD";
  transactions: PartnerApiWalletTx[];
};

export async function getPartnerApiWallet(options: {
  actor: PartnerApiActor;
  limit?: number;
}): Promise<PartnerApiWalletSnapshot> {
  const take = Math.min(50, Math.max(1, options.limit ?? 20));
  const wallet = await prisma.partnerWalletAccount.findUnique({
    where: { partnerId: options.actor.partnerId },
    select: {
      balanceCents: true,
      transactions: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: {
          id: true,
          type: true,
          amountCents: true,
          balanceBeforeCents: true,
          balanceAfterCents: true,
          reason: true,
          referenceType: true,
          referenceId: true,
          createdAt: true,
        },
      },
    },
  });

  const balanceCents = wallet?.balanceCents ?? 0;
  return {
    balanceCents,
    balanceUsd: Number((balanceCents / 100).toFixed(2)),
    balanceLabel: `${formatUsdCents(balanceCents)} USD`,
    currency: "USD",
    transactions: (wallet?.transactions ?? []).map((tx) => ({
      id: tx.id,
      type: tx.type,
      amountCents: tx.amountCents,
      amountLabel: `${formatUsdCents(tx.amountCents)} USD`,
      balanceBeforeCents: tx.balanceBeforeCents,
      balanceAfterCents: tx.balanceAfterCents,
      reason: tx.reason,
      referenceType: tx.referenceType,
      referenceId: tx.referenceId,
      createdAt: tx.createdAt.toISOString(),
    })),
  };
}
