import "server-only";

import {
  OrderFundingSource,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { formatWalletPurchasePriceLabel } from "@/app/lib/esim/walletPurchase";
import { formatUsdCents } from "@/app/lib/wallet/display";

function displayOrUnavailable(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : "Not available";
}

export type WalletPurchaseReview = {
  purchaseId: string;
  customerId: string;
  destination: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  priceLabel: string;
  priceCents: number;
  balanceLabel: string;
  balanceAfterLabel: string;
  fundingLabel: "Wallet";
  idempotencyKey: string;
  status: WalletEsimPurchaseStatus;
  canConfirm: boolean;
};

export async function getWalletPurchaseReview(
  customerUserId: string,
  purchaseId: string
): Promise<WalletPurchaseReview | null> {
  const ownerId = (customerUserId ?? "").trim();
  const id = (purchaseId ?? "").trim();
  if (!ownerId || !id || ownerId.length > 64 || id.length > 64) return null;

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!owner || owner.deletedAt || owner.role !== Role.CUSTOMER) return null;

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      destinationName: true,
      destinationCode: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      priceCents: true,
      fundingSource: true,
      status: true,
      idempotencyKey: true,
    },
  });

  if (
    !row ||
    row.customerUserId !== owner.id ||
    row.fundingSource !== OrderFundingSource.CUSTOMER_WALLET
  ) {
    return null;
  }

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: owner.id },
    select: { balanceCents: true },
  });
  const balanceCents = wallet?.balanceCents ?? 0;
  const after =
    row.status === WalletEsimPurchaseStatus.READY
      ? Math.max(0, balanceCents - row.priceCents)
      : balanceCents;

  return {
    purchaseId: row.id,
    customerId: owner.id,
    destination: displayOrUnavailable(
      row.destinationName || row.destinationCode
    ),
    planName: displayOrUnavailable(row.planName),
    dataAllowance: displayOrUnavailable(row.dataAllowance),
    validity: displayOrUnavailable(row.validity),
    priceLabel: formatWalletPurchasePriceLabel(row.priceCents),
    priceCents: row.priceCents,
    balanceLabel: formatUsdCents(balanceCents),
    balanceAfterLabel: formatUsdCents(after),
    fundingLabel: "Wallet",
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    canConfirm: row.status === WalletEsimPurchaseStatus.READY,
  };
}

export type WalletPurchaseSuccess = {
  purchaseId: string;
  customerId: string;
  destination: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  amountChargedLabel: string;
  balanceLabel: string;
  orderId: string;
};

export async function getCompletedWalletPurchase(
  customerUserId: string,
  purchaseId: string
): Promise<WalletPurchaseSuccess | null> {
  const ownerId = (customerUserId ?? "").trim();
  const id = (purchaseId ?? "").trim();
  if (!ownerId || !id || ownerId.length > 64 || id.length > 64) return null;

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      destinationName: true,
      destinationCode: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      priceCents: true,
      status: true,
      orderId: true,
      fundingSource: true,
      customer: {
        select: {
          id: true,
          role: true,
          deletedAt: true,
          walletAccount: { select: { balanceCents: true } },
        },
      },
    },
  });

  if (
    !row ||
    row.customerUserId !== ownerId ||
    row.customer.role !== Role.CUSTOMER ||
    row.customer.deletedAt ||
    row.status !== WalletEsimPurchaseStatus.COMPLETED ||
    row.fundingSource !== OrderFundingSource.CUSTOMER_WALLET ||
    !row.orderId
  ) {
    return null;
  }

  return {
    purchaseId: row.id,
    customerId: row.customer.id,
    destination: displayOrUnavailable(
      row.destinationName || row.destinationCode
    ),
    planName: displayOrUnavailable(row.planName),
    dataAllowance: displayOrUnavailable(row.dataAllowance),
    validity: displayOrUnavailable(row.validity),
    amountChargedLabel: formatWalletPurchasePriceLabel(row.priceCents),
    balanceLabel: `${formatUsdCents(row.customer.walletAccount?.balanceCents ?? 0)} USD`,
    orderId: row.orderId,
  };
}

export type WalletPurchaseFailed = {
  purchaseId: string;
  amountRestoredLabel: string;
  balanceLabel: string;
};

export async function getFailedRefundedWalletPurchase(
  customerUserId: string,
  purchaseId: string
): Promise<WalletPurchaseFailed | null> {
  const ownerId = (customerUserId ?? "").trim();
  const id = (purchaseId ?? "").trim();
  if (!ownerId || !id || ownerId.length > 64 || id.length > 64) return null;

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      priceCents: true,
      status: true,
      fundingSource: true,
      customer: {
        select: {
          role: true,
          deletedAt: true,
          walletAccount: { select: { balanceCents: true } },
        },
      },
    },
  });

  if (
    !row ||
    row.customerUserId !== ownerId ||
    row.customer.role !== Role.CUSTOMER ||
    row.customer.deletedAt ||
    row.status !== WalletEsimPurchaseStatus.FAILED_REFUNDED ||
    row.fundingSource !== OrderFundingSource.CUSTOMER_WALLET
  ) {
    return null;
  }

  return {
    purchaseId: row.id,
    amountRestoredLabel: formatWalletPurchasePriceLabel(row.priceCents),
    balanceLabel: `${formatUsdCents(row.customer.walletAccount?.balanceCents ?? 0)} USD`,
  };
}

export type WalletPurchaseReconciliation = {
  purchaseId: string;
  amountReservedLabel: string;
};

export async function getReconciliationWalletPurchase(
  customerUserId: string,
  purchaseId: string
): Promise<WalletPurchaseReconciliation | null> {
  const ownerId = (customerUserId ?? "").trim();
  const id = (purchaseId ?? "").trim();
  if (!ownerId || !id || ownerId.length > 64 || id.length > 64) return null;

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      priceCents: true,
      status: true,
      fundingSource: true,
      customer: {
        select: { role: true, deletedAt: true },
      },
    },
  });

  if (
    !row ||
    row.customerUserId !== ownerId ||
    row.customer.role !== Role.CUSTOMER ||
    row.customer.deletedAt ||
    row.fundingSource !== OrderFundingSource.CUSTOMER_WALLET ||
    (row.status !== WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED &&
      row.status !== WalletEsimPurchaseStatus.PROVIDER_PENDING &&
      row.status !== WalletEsimPurchaseStatus.FUNDS_RESERVED)
  ) {
    return null;
  }

  return {
    purchaseId: row.id,
    amountReservedLabel: formatWalletPurchasePriceLabel(row.priceCents),
  };
}
