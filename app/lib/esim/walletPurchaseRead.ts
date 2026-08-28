import "server-only";

import {
  OrderFundingSource,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { calculateCustomerCheckoutFunding } from "@/app/lib/esim/purchaseFunding";
import { payablePackageCents } from "@/app/lib/promo/promoDiscount";
import {
  CUSTOMER_PENDING_PURCHASES_MAX_AGE_MS,
  CUSTOMER_STALE_CHECKOUT_MESSAGE,
  customerPendingPurchaseHref,
  isCustomerPendingPurchaseVisibleInUi,
  isCustomerStaleCheckoutDisplay,
  resolveCustomerPendingPurchaseVisibility,
} from "@/app/lib/esim/customerPurchaseStatusMessaging";
import { formatWalletPurchasePriceLabel } from "@/app/lib/esim/walletPurchase";
import {
  canEditPurchaseDeliveryEmail,
  snapshotOrderAlternateDeliveryEmail,
} from "@/app/lib/esim/esimDeliveryEmail";
import { isPurchaseDeliveryEmailLocked } from "@/app/lib/esim/esimDeliveryEmailState";
import {
  getActivePaymentAdapter,
  isPaymentGatewayConfigured,
} from "@/app/lib/payments/disabledAdapter";
import type { PaymentGatewayProviderName } from "@/app/lib/payments/types";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { pointsNeededToUnlockRewards } from "@/app/lib/rewards/rewardConstants";
import { isRewardRedemptionEligible } from "@/app/lib/rewards/rewardPoints";

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
  rewardPointsBalance: number;
  rewardPointsBalanceLabel: string;
  rewardValueLabel: string;
  rewardEligible: boolean;
  rewardPointsToUnlock: number;
  useRewards: boolean;
  rewardPointsRedeemed: number;
  rewardAppliedLabel: string;
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
  paymentGatewayProvider: PaymentGatewayProviderName;
  idempotencyKey: string;
  status: WalletEsimPurchaseStatus;
  canConfirm: boolean;
  alternateDeliveryEmail: string | null;
  deliveryEmailLocked: boolean;
  deliveryEmailEditable: boolean;
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
      useRewards: true,
      rewardPointsRedeemed: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
      fundingSource: true,
      status: true,
      idempotencyKey: true,
      adminUserId: true,
      alternateDeliveryEmail: true,
      alternateDeliveryEmailConfirmedAt: true,
      alternateDeliveryEmailLockedAt: true,
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
  const rewardAccount = await prisma.customerRewardAccount.findUnique({
    where: { customerUserId: owner.id },
    select: { pointsBalance: true },
  });
  const rewardPointsBalance = rewardAccount?.pointsBalance ?? 0;

  const payableCents = payablePackageCents(
    row.priceCents,
    row.promoDiscountCents
  );
  const promoApplied =
    Boolean(row.promoCodeNormalized) && row.promoDiscountCents > 0;
  const liveFunding = calculateCustomerCheckoutFunding({
    priceCents: row.priceCents,
    promoDiscountCents: row.promoDiscountCents,
    walletBalanceCents: balanceCents,
    useWallet: row.useWallet,
    pointsBalance: rewardPointsBalance,
    useRewards: row.useRewards,
  });
  const snapshotLocked =
    row.status !== WalletEsimPurchaseStatus.READY;
  const displayFunding = snapshotLocked
    ? {
        ...liveFunding,
        useWallet: row.useWallet,
        useRewards: row.useRewards,
        rewardPointsRedeemed: row.rewardPointsRedeemed,
        walletAppliedCents: row.walletAppliedCents,
        gatewayAmountCents: row.gatewayAmountCents,
      }
    : liveFunding;
  const rewardEligible = snapshotLocked
    ? row.useRewards || isRewardRedemptionEligible(rewardPointsBalance)
    : isRewardRedemptionEligible(rewardPointsBalance);

  const after =
    row.status === WalletEsimPurchaseStatus.READY
      ? Math.max(0, balanceCents - displayFunding.walletAppliedCents)
      : balanceCents;

  let fundingLabel: WalletPurchaseReview["fundingLabel"] = "Wallet";
  if (displayFunding.gatewayAmountCents > 0 && displayFunding.walletAppliedCents > 0) {
    fundingLabel = "Wallet + card";
  } else if (displayFunding.gatewayAmountCents > 0) {
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
    // USD labels remain authoritative for emails/success views.
    // Checkout review presents these integer cents via CheckoutMoney.
    priceLabel: formatWalletPurchasePriceLabel(payableCents),
    priceCents: row.priceCents,
    payableCents,
    promoApplied,
    promoCode: row.promoCodeNormalized,
    promoDiscountCents: row.promoDiscountCents,
    promoOriginalLabel: formatWalletPurchasePriceLabel(row.priceCents),
    promoDiscountLabel: formatWalletPurchasePriceLabel(row.promoDiscountCents),
    promoTotalLabel: formatWalletPurchasePriceLabel(payableCents),
    rewardPointsBalance,
    rewardPointsBalanceLabel: String(rewardPointsBalance),
    rewardValueLabel: formatUsdCents(rewardPointsBalance),
    rewardEligible,
    rewardPointsToUnlock: pointsNeededToUnlockRewards(rewardPointsBalance),
    useRewards: displayFunding.useRewards,
    rewardPointsRedeemed: displayFunding.rewardPointsRedeemed,
    rewardAppliedLabel: formatUsdCents(displayFunding.rewardPointsRedeemed),
    balanceLabel: formatUsdCents(balanceCents),
    balanceCents,
    balanceAfterLabel: formatUsdCents(after),
    useWallet: displayFunding.useWallet,
    walletAppliedCents: displayFunding.walletAppliedCents,
    walletAppliedLabel: formatUsdCents(displayFunding.walletAppliedCents),
    gatewayAmountCents: displayFunding.gatewayAmountCents,
    gatewayAmountLabel: formatUsdCents(displayFunding.gatewayAmountCents),
    fundingLabel,
    paymentGatewayConfigured: isPaymentGatewayConfigured(),
    paymentGatewayProvider: isPaymentGatewayConfigured()
      ? getActivePaymentAdapter().provider
      : "UNCONFIGURED",
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    canConfirm:
      row.status === WalletEsimPurchaseStatus.READY ||
      row.status === WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
    alternateDeliveryEmail: snapshotOrderAlternateDeliveryEmail(row),
    deliveryEmailLocked: isPurchaseDeliveryEmailLocked(
      row.alternateDeliveryEmailLockedAt
    ),
    deliveryEmailEditable: canEditPurchaseDeliveryEmail({
      status: row.status,
      alternateDeliveryEmailLockedAt: row.alternateDeliveryEmailLockedAt,
      adminUserId: row.adminUserId,
    }),
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
  walletRestored: boolean;
  amountRestoredLabel: string | null;
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
      walletAppliedCents: true,
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
    !isCustomerCompletedPurchaseFundingSource(row.fundingSource)
  ) {
    return null;
  }

  const restoredCents = Math.max(0, row.walletAppliedCents ?? 0);
  const walletRestored = restoredCents > 0;

  return {
    purchaseId: row.id,
    walletRestored,
    amountRestoredLabel: walletRestored
      ? formatWalletPurchasePriceLabel(restoredCents)
      : null,
    balanceLabel: `${formatUsdCents(row.customer.walletAccount?.balanceCents ?? 0)} USD`,
  };
}

export type WalletPurchaseReconciliation = {
  purchaseId: string;
  status: WalletEsimPurchaseStatus;
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
    !isCustomerCompletedPurchaseFundingSource(row.fundingSource) ||
    (row.status !== WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED &&
      row.status !== WalletEsimPurchaseStatus.PROVIDER_PENDING &&
      row.status !== WalletEsimPurchaseStatus.FUNDED &&
      row.status !== WalletEsimPurchaseStatus.FUNDS_RESERVED)
  ) {
    return null;
  }

  return {
    purchaseId: row.id,
    status: row.status,
    amountReservedLabel: formatWalletPurchasePriceLabel(row.priceCents),
  };
}

export const CUSTOMER_PENDING_PURCHASES_LIMIT = 3;

const PENDING_PURCHASE_STATUSES: WalletEsimPurchaseStatus[] = [
  WalletEsimPurchaseStatus.READY,
  WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
  WalletEsimPurchaseStatus.FUNDS_RESERVED,
  WalletEsimPurchaseStatus.FUNDED,
  WalletEsimPurchaseStatus.PROVIDER_PENDING,
  WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
];

export type CustomerPendingWalletPurchase = {
  purchaseId: string;
  destination: string;
  planName: string;
  priceLabel: string;
  status: WalletEsimPurchaseStatus;
  statusLabel: string;
  ctaLabel: string;
  href: string;
  summary: string;
  staleGuidance: string | null;
};

/** Read-only inbox of unfinished self-service purchases. Never prepares, funds, or fulfills. */
export async function listCustomerPendingWalletPurchases(
  customerUserId: string
): Promise<CustomerPendingWalletPurchase[]> {
  const ownerId = (customerUserId ?? "").trim();
  if (!ownerId || ownerId.length > 64) return [];

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!owner || owner.deletedAt || owner.role !== Role.CUSTOMER) return [];

  const now = new Date();
  const visibleAfter = new Date(
    now.getTime() - CUSTOMER_PENDING_PURCHASES_MAX_AGE_MS
  );
  const rows = await prisma.walletEsimPurchase.findMany({
    where: {
      customerUserId: owner.id,
      adminUserId: null,
      fundingSource: {
        in: [
          OrderFundingSource.CUSTOMER_WALLET,
          OrderFundingSource.CUSTOMER_SPLIT,
          OrderFundingSource.DIRECT_PAYMENT,
        ],
      },
      status: { in: PENDING_PURCHASE_STATUSES },
      updatedAt: { gte: visibleAfter },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: CUSTOMER_PENDING_PURCHASES_LIMIT,
    select: {
      id: true,
      destinationName: true,
      destinationCode: true,
      planName: true,
      priceCents: true,
      status: true,
      updatedAt: true,
    },
  });

  const items: CustomerPendingWalletPurchase[] = [];
  for (const row of rows) {
    if (
      !isCustomerPendingPurchaseVisibleInUi({
        updatedAt: row.updatedAt,
        now,
      })
    ) {
      continue;
    }
    const vis = resolveCustomerPendingPurchaseVisibility(row.status);
    const href = customerPendingPurchaseHref(row.status, row.id);
    if (!vis || !href) continue;
    items.push({
      purchaseId: row.id,
      destination: displayOrUnavailable(
        row.destinationName || row.destinationCode
      ),
      planName: displayOrUnavailable(row.planName),
      priceLabel: formatWalletPurchasePriceLabel(row.priceCents),
      status: row.status,
      statusLabel: vis.statusLabel,
      ctaLabel: vis.ctaLabel,
      href,
      summary: vis.body,
      staleGuidance: isCustomerStaleCheckoutDisplay({
        status: row.status,
        updatedAt: row.updatedAt,
      })
        ? CUSTOMER_STALE_CHECKOUT_MESSAGE
        : null,
    });
  }
  return items;
}
