import "server-only";

import {
  OrderFundingSource,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { calculatePayablePurchaseFunding } from "@/app/lib/esim/purchaseFunding";
import { payablePackageCents } from "@/app/lib/promo/promoDiscount";
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
  payableCents: number;
  promoApplied: boolean;
  promoCode: string | null;
  promoDiscountCents: number;
  promoOriginalLabel: string;
  promoDiscountLabel: string;
  promoTotalLabel: string;
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
      promoCodeNormalized: true,
      promoDiscountCents: true,
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

  const payableCents = payablePackageCents(
    row.priceCents,
    row.promoDiscountCents
  );
  const promoApplied =
    Boolean(row.promoCodeNormalized) && row.promoDiscountCents > 0;
  // Live preview from current balance + stored choice (server-side for initial render).
  const liveFunding = calculatePayablePurchaseFunding({
    priceCents: payableCents,
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
    priceLabel: formatWalletPurchasePriceLabel(payableCents),
    priceCents: row.priceCents,
    payableCents,
    promoApplied,
    promoCode: row.promoCodeNormalized,
    promoDiscountCents: row.promoDiscountCents,
    promoOriginalLabel: formatWalletPurchasePriceLabel(row.priceCents),
    promoDiscountLabel: formatWalletPurchasePriceLabel(row.promoDiscountCents),
    promoTotalLabel: formatWalletPurchasePriceLabel(payableCents),
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
  /** Total package price label (authoritative server cents). */
  amountChargedLabel: string;
  walletAppliedLabel: string | null;
  gatewayPaidLabel: string | null;
  balanceLabel: string | null;
  fundingSource:
    | typeof OrderFundingSource.CUSTOMER_WALLET
    | typeof OrderFundingSource.CUSTOMER_SPLIT
    | typeof OrderFundingSource.DIRECT_PAYMENT;
  orderId: string;
};

/** Completed self-service purchases that may land on /account/esim/buy/success. */
export function isCustomerCompletedPurchaseFundingSource(
  fundingSource: OrderFundingSource
): fundingSource is
  | typeof OrderFundingSource.CUSTOMER_WALLET
  | typeof OrderFundingSource.CUSTOMER_SPLIT
  | typeof OrderFundingSource.DIRECT_PAYMENT {
  return (
    fundingSource === OrderFundingSource.CUSTOMER_WALLET ||
    fundingSource === OrderFundingSource.CUSTOMER_SPLIT ||
    fundingSource === OrderFundingSource.DIRECT_PAYMENT
  );
}

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
      promoDiscountCents: true,
      promoCodeNormalized: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
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
    !isCustomerCompletedPurchaseFundingSource(row.fundingSource) ||
    !row.orderId
  ) {
    return null;
  }

  const walletApplied = Math.max(0, row.walletAppliedCents ?? 0);
  const gatewayPaid = Math.max(0, row.gatewayAmountCents ?? 0);
  const payableCents = payablePackageCents(
    row.priceCents,
    row.promoDiscountCents
  );
  const showWallet =
    row.fundingSource === OrderFundingSource.CUSTOMER_WALLET ||
    row.fundingSource === OrderFundingSource.CUSTOMER_SPLIT;

  return {
    purchaseId: row.id,
    customerId: row.customer.id,
    destination: displayOrUnavailable(
      row.destinationName || row.destinationCode
    ),
    planName: displayOrUnavailable(row.planName),
    dataAllowance: displayOrUnavailable(row.dataAllowance),
    validity: displayOrUnavailable(row.validity),
    amountChargedLabel: formatWalletPurchasePriceLabel(payableCents),
    walletAppliedLabel:
      showWallet && walletApplied > 0
        ? formatWalletPurchasePriceLabel(walletApplied)
        : row.fundingSource === OrderFundingSource.CUSTOMER_WALLET
          ? formatWalletPurchasePriceLabel(payableCents)
          : null,
    gatewayPaidLabel:
      gatewayPaid > 0 ? formatWalletPurchasePriceLabel(gatewayPaid) : null,
    balanceLabel: showWallet
      ? `${formatUsdCents(row.customer.walletAccount?.balanceCents ?? 0)} USD`
      : null,
    fundingSource: row.fundingSource,
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
