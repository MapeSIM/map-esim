import "server-only";

import {
  OrderFundingSource,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { calculatePurchaseFunding } from "@/app/lib/esim/purchaseFunding";
import { formatWalletPurchasePriceLabel } from "@/app/lib/esim/walletPurchase";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";
import { formatUsdCents } from "@/app/lib/wallet/display";

function displayOrUnavailable(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : "Not available";
}

export type WalletPurchaseReview = {
  purchaseId: string;
  customerId: string;
  customerEmail: string;
  destination: string;
  destinationCode: string | null;
  destinationName: string | null;
  planName: string;
  dataAllowance: string;
  validity: string;
  deliveryLabel: string;
  priceLabel: string;
  priceCents: number;
  balanceLabel: string;
  balanceCents: number;
  balanceAfterLabel: string;
  useWallet: boolean;
  walletAppliedCents: number;
  walletAppliedLabel: string;
  gatewayAmountCents: number;
  gatewayAmountLabel: string;
  fundingLabel: "Wallet" | "Wallet + card" | "Card";
  paymentGatewayConfigured: boolean;
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
    select: { id: true, email: true, role: true, deletedAt: true },
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
      useWallet: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
      fundingSource: true,
      status: true,
      idempotencyKey: true,
    },
  });

  if (
    !row ||
    row.customerUserId !== owner.id ||
    (row.fundingSource !== OrderFundingSource.CUSTOMER_WALLET &&
      row.fundingSource !== OrderFundingSource.CUSTOMER_SPLIT &&
      row.fundingSource !== OrderFundingSource.DIRECT_PAYMENT)
  ) {
    return null;
  }

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: owner.id },
    select: { balanceCents: true },
  });
  const balanceCents = wallet?.balanceCents ?? 0;

  // Live preview from current balance + stored choice (server-side for initial render).
  const liveFunding = calculatePurchaseFunding({
    priceCents: row.priceCents,
    walletBalanceCents: balanceCents,
    useWallet: row.useWallet,
  });

  const after =
    row.status === WalletEsimPurchaseStatus.READY
      ? Math.max(0, balanceCents - liveFunding.walletAppliedCents)
      : balanceCents;

  let fundingLabel: WalletPurchaseReview["fundingLabel"] = "Wallet";
  if (liveFunding.gatewayAmountCents > 0 && liveFunding.walletAppliedCents > 0) {
    fundingLabel = "Wallet + card";
  } else if (liveFunding.gatewayAmountCents > 0) {
    fundingLabel = "Card";
  }

  return {
    purchaseId: row.id,
    customerId: owner.id,
    customerEmail: displayOrUnavailable(owner.email),
    destination: displayOrUnavailable(
      row.destinationName || row.destinationCode
    ),
    destinationCode: (row.destinationCode ?? "").trim() || null,
    destinationName: (row.destinationName ?? "").trim() || null,
    planName: displayOrUnavailable(row.planName),
    dataAllowance: displayOrUnavailable(row.dataAllowance),
    validity: displayOrUnavailable(row.validity),
    deliveryLabel: "Instant eSIM delivery",
    priceLabel: formatWalletPurchasePriceLabel(row.priceCents),
    priceCents: row.priceCents,
    balanceLabel: formatUsdCents(balanceCents),
    balanceCents,
    balanceAfterLabel: formatUsdCents(after),
    useWallet: liveFunding.useWallet,
    walletAppliedCents: liveFunding.walletAppliedCents,
    walletAppliedLabel: formatUsdCents(liveFunding.walletAppliedCents),
    gatewayAmountCents: liveFunding.gatewayAmountCents,
    gatewayAmountLabel: formatUsdCents(liveFunding.gatewayAmountCents),
    fundingLabel,
    paymentGatewayConfigured: isPaymentGatewayConfigured(),
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    canConfirm:
      row.status === WalletEsimPurchaseStatus.READY ||
      row.status === WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
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
