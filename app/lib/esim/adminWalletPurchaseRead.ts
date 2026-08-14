import "server-only";

import {
  OrderFundingSource,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { maskAdminEmail } from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";
import { formatWalletPurchasePriceLabel } from "@/app/lib/esim/walletPurchase";
import {
  listAdminAssignmentDestinations,
  listAdminAssignmentOffers,
  type AdminDestinationOption,
  type AdminOfferOption,
} from "@/app/lib/esim/adminPackageAssignmentRead";
import { formatUsdCents } from "@/app/lib/wallet/display";

const WALLET_PURCHASE_COMPLETED_ACTION = "esim.wallet_purchase_completed";

function formatDateTime(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

export type AdminWalletBuyCustomer = {
  id: string;
  name: string;
  emailMasked: string;
  accountActive: boolean;
  emailVerified: boolean;
  hasWallet: boolean;
  balanceCents: number;
  balanceLabel: string;
  canPurchase: boolean;
  blockedReason: string | null;
};

export async function getAdminWalletBuyCustomer(
  customerUserId: string
): Promise<AdminWalletBuyCustomer | null> {
  const id = (customerUserId ?? "").trim();
  if (!id || id.length > 64) return null;

  const customer = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      deletedAt: true,
      blockedAt: true,
      emailVerifiedAt: true,
      walletAccount: { select: { balanceCents: true } },
    },
  });

  if (!customer || customer.role !== Role.CUSTOMER) {
    return null;
  }

  const accountActive = !customer.deletedAt && !customer.blockedAt;
  const emailVerified = Boolean(customer.emailVerifiedAt);
  const hasWallet = Boolean(customer.walletAccount);
  const balanceCents = customer.walletAccount?.balanceCents ?? 0;

  let blockedReason: string | null = null;
  if (customer.deletedAt) {
    blockedReason = "Packages cannot be purchased for deleted customer accounts.";
  } else if (customer.blockedAt) {
    blockedReason =
      "This customer account is currently restricted and cannot receive assisted wallet purchases.";
  } else if (!emailVerified) {
    blockedReason =
      "Customer email must be verified before an assisted wallet purchase.";
  } else if (!hasWallet) {
    blockedReason =
      "A customer wallet is required before an assisted wallet purchase.";
  }

  return {
    id: customer.id,
    name: customer.name,
    emailMasked: maskAdminEmail(customer.email),
    accountActive,
    emailVerified,
    hasWallet,
    balanceCents,
    balanceLabel: formatUsdCents(balanceCents),
    canPurchase: accountActive && emailVerified && hasWallet,
    blockedReason,
  };
}

export {
  listAdminAssignmentDestinations as listAdminWalletBuyDestinations,
  listAdminAssignmentOffers as listAdminWalletBuyOffers,
};
export type { AdminDestinationOption, AdminOfferOption };

export type AdminWalletPurchaseReview = {
  purchaseId: string;
  customerId: string;
  customerName: string;
  customerEmailMasked: string;
  accountStatusLabel: string;
  destination: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  offerId: string;
  priceLabel: string;
  priceCents: number;
  balanceBeforeLabel: string;
  balanceAfterLabel: string;
  fundingLabel: "Customer wallet";
  reason: string;
  idempotencyKey: string;
  status: WalletEsimPurchaseStatus;
  canConfirm: boolean;
};

export async function getAdminWalletPurchaseReview(
  adminUserId: string,
  customerUserId: string,
  purchaseId: string
): Promise<AdminWalletPurchaseReview | null> {
  const adminId = (adminUserId ?? "").trim();
  const customerId = (customerUserId ?? "").trim();
  const id = (purchaseId ?? "").trim();
  if (
    !adminId ||
    !customerId ||
    !id ||
    adminId.length > 64 ||
    customerId.length > 64 ||
    id.length > 64
  ) {
    return null;
  }

  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN) return null;

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      adminUserId: true,
      assistedPurchaseReason: true,
      destinationName: true,
      destinationCode: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      offerId: true,
      priceCents: true,
      fundingSource: true,
      status: true,
      idempotencyKey: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          deletedAt: true,
          emailVerifiedAt: true,
          walletAccount: { select: { balanceCents: true } },
        },
      },
    },
  });

  if (
    !row ||
    row.customerUserId !== customerId ||
    row.adminUserId !== adminId ||
    !row.assistedPurchaseReason ||
    row.customer.role !== Role.CUSTOMER ||
    row.fundingSource !== OrderFundingSource.CUSTOMER_WALLET
  ) {
    return null;
  }

  const balanceCents = row.customer.walletAccount?.balanceCents ?? 0;
  const after =
    row.status === WalletEsimPurchaseStatus.READY
      ? Math.max(0, balanceCents - row.priceCents)
      : balanceCents;

  return {
    purchaseId: row.id,
    customerId: row.customer.id,
    customerName: row.customer.name,
    customerEmailMasked: maskAdminEmail(row.customer.email),
    accountStatusLabel: row.customer.deletedAt
      ? "Deleted"
      : row.customer.emailVerifiedAt
        ? "Active"
        : "Unverified email",
    destination: row.destinationName || row.destinationCode || "Not available",
    planName: row.planName || "Not available",
    dataAllowance: row.dataAllowance || "Not available",
    validity: row.validity || "Not available",
    offerId: row.offerId,
    priceLabel: formatWalletPurchasePriceLabel(row.priceCents),
    priceCents: row.priceCents,
    balanceBeforeLabel: formatUsdCents(balanceCents),
    balanceAfterLabel: formatUsdCents(after),
    fundingLabel: "Customer wallet",
    reason: row.assistedPurchaseReason,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    canConfirm: row.status === WalletEsimPurchaseStatus.READY,
  };
}

export type AdminWalletPurchaseSuccess = {
  purchaseId: string;
  customerId: string;
  customerName: string;
  customerEmailMasked: string;
  destination: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  priceLabel: string;
  fundingLabel: "Customer wallet";
  orderId: string;
  auditLogId: string;
  emailDeliveryStatus: string;
  completedAtLabel: string;
};

export async function getAdminCompletedWalletPurchase(
  adminUserId: string,
  customerUserId: string,
  purchaseId: string
): Promise<AdminWalletPurchaseSuccess | null> {
  const adminId = (adminUserId ?? "").trim();
  const customerId = (customerUserId ?? "").trim();
  const id = (purchaseId ?? "").trim();
  if (
    !adminId ||
    !customerId ||
    !id ||
    adminId.length > 64 ||
    customerId.length > 64 ||
    id.length > 64
  ) {
    return null;
  }

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      adminUserId: true,
      destinationName: true,
      destinationCode: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      priceCents: true,
      fundingSource: true,
      status: true,
      orderId: true,
      emailDeliveryStatus: true,
      completedAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  if (
    !row ||
    row.customerUserId !== customerId ||
    row.adminUserId !== adminId ||
    row.customer.role !== Role.CUSTOMER ||
    row.status !== WalletEsimPurchaseStatus.COMPLETED ||
    row.fundingSource !== OrderFundingSource.CUSTOMER_WALLET ||
    !row.orderId
  ) {
    return null;
  }

  const audit = await prisma.auditLog.findFirst({
    where: {
      targetType: "WalletEsimPurchase",
      targetId: row.id,
      action: WALLET_PURCHASE_COMPLETED_ACTION,
      actorUserId: adminId,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return {
    purchaseId: row.id,
    customerId: row.customer.id,
    customerName: row.customer.name,
    customerEmailMasked: maskAdminEmail(row.customer.email),
    destination: row.destinationName || row.destinationCode || "Not available",
    planName: row.planName || "Not available",
    dataAllowance: row.dataAllowance || "Not available",
    validity: row.validity || "Not available",
    priceLabel: formatWalletPurchasePriceLabel(row.priceCents),
    fundingLabel: "Customer wallet",
    orderId: row.orderId,
    auditLogId: audit?.id || "Not available",
    emailDeliveryStatus: row.emailDeliveryStatus || "Not available",
    completedAtLabel: row.completedAt
      ? formatDateTime(row.completedAt)
      : "Not available",
  };
}

export type AdminWalletPurchaseFailed = {
  purchaseId: string;
  customerId: string;
  customerName: string;
  customerEmailMasked: string;
  priceLabel: string;
  statusLabel: string;
};

export async function getAdminFailedRefundedWalletPurchase(
  adminUserId: string,
  customerUserId: string,
  purchaseId: string
): Promise<AdminWalletPurchaseFailed | null> {
  const adminId = (adminUserId ?? "").trim();
  const customerId = (customerUserId ?? "").trim();
  const id = (purchaseId ?? "").trim();
  if (!adminId || !customerId || !id) return null;

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      adminUserId: true,
      priceCents: true,
      status: true,
      customer: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  if (
    !row ||
    row.customerUserId !== customerId ||
    row.adminUserId !== adminId ||
    row.customer.role !== Role.CUSTOMER ||
    row.status !== WalletEsimPurchaseStatus.FAILED_REFUNDED
  ) {
    return null;
  }

  return {
    purchaseId: row.id,
    customerId: row.customer.id,
    customerName: row.customer.name,
    customerEmailMasked: maskAdminEmail(row.customer.email),
    priceLabel: formatWalletPurchasePriceLabel(row.priceCents),
    statusLabel: "Failed — wallet refunded",
  };
}

export async function getAdminReconciliationWalletPurchase(
  adminUserId: string,
  customerUserId: string,
  purchaseId: string
): Promise<AdminWalletPurchaseFailed | null> {
  const adminId = (adminUserId ?? "").trim();
  const customerId = (customerUserId ?? "").trim();
  const id = (purchaseId ?? "").trim();
  if (!adminId || !customerId || !id) return null;

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      adminUserId: true,
      priceCents: true,
      status: true,
      customer: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  if (
    !row ||
    row.customerUserId !== customerId ||
    row.adminUserId !== adminId ||
    row.customer.role !== Role.CUSTOMER ||
    row.status !== WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED
  ) {
    return null;
  }

  return {
    purchaseId: row.id,
    customerId: row.customer.id,
    customerName: row.customer.name,
    customerEmailMasked: maskAdminEmail(row.customer.email),
    priceLabel: formatWalletPurchasePriceLabel(row.priceCents),
    statusLabel: "Reconciliation required",
  };
}
