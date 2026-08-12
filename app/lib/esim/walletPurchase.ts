import "server-only";

import {
  OrderFundingSource,
  OrderStatus,
  Prisma,
  Role,
  WalletDirection,
  WalletEsimPurchaseStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { usdPriceToCents } from "@/app/lib/esim/assignmentValidation";
import { persistAssignedOrder } from "@/app/lib/orders/persistAssignedOrder";
import { deliverOrderEmailAfterCheckout } from "@/app/lib/email/deliverAfterCheckout";
import { createOrderAccessToken } from "@/app/lib/vesim/orderAccess";
import { executeCreditCheckout } from "@/app/lib/vesim/creditCheckout";
import { scheduleReconciliationRequiredNotification } from "@/app/lib/esim/reconciliationRequiredNotification";
import {
  persistWalletPurchaseProviderObservation,
  type ProviderResultKind,
} from "@/app/lib/esim/providerResultPersist";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";
import {
  sanitizeCountryHint,
  verifyOfferAuthoritative,
  type VerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";
import {
  assertNewRiskyTransactionAllowed,
  OperationalControlBlockedError,
  OperationalControlUnavailableError,
} from "@/app/lib/admin/operationalControlsPolicy";
import { OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE } from "@/app/lib/admin/operationalControlsShared";
import { walletOnlyPurchaseFunding, calculatePurchaseFunding } from "@/app/lib/esim/purchaseFunding";

export const WALLET_PURCHASE_STARTED = "esim.wallet_purchase_started";
export const WALLET_FUNDS_RESERVED = "esim.wallet_funds_reserved";
export const WALLET_PURCHASE_COMPLETED = "esim.wallet_purchase_completed";
export const WALLET_PURCHASE_FAILED_REFUNDED =
  "esim.wallet_purchase_failed_refunded";
export const WALLET_PURCHASE_RECONCILIATION =
  "esim.wallet_purchase_reconciliation_required";
export const WALLET_DELIVERY_EMAIL_FAILED = "esim.wallet_delivery_email_failed";

export const WALLET_PURCHASE_DEBIT_REF = "WALLET_ESIM_PURCHASE";
export const WALLET_PURCHASE_REFUND_REF = "WALLET_ESIM_PURCHASE_REFUND";

export type PrepareWalletPurchaseInput = {
  customerUserId: string;
  offerId: string;
  countryHint: string | null;
  idempotencyKey: string;
  /** When set, purchase is admin-assisted (CUSTOMER_WALLET still). */
  assistedBy?: {
    adminUserId: string;
    reason: string;
  };
};

export type PrepareWalletPurchaseResult = {
  purchaseId: string;
  customerUserId: string;
  duplicate: boolean;
};

export type ConfirmWalletPurchaseInput = {
  customerUserId: string;
  purchaseId: string;
  idempotencyKey: string;
  /** Required to confirm an admin-assisted attempt. */
  assistedByAdminUserId?: string;
};

export type ConfirmWalletPurchaseResult = {
  purchaseId: string;
  customerUserId: string;
  orderId: string | null;
  status: WalletEsimPurchaseStatus;
  duplicate: boolean;
};

export class WalletEsimPurchaseError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "CUSTOMER_UNAVAILABLE"
    | "WALLET_UNAVAILABLE"
    | "INSUFFICIENT_FUNDS"
    | "OFFER_UNAVAILABLE"
    | "INVALID_STATE"
    | "INVALID_IDEMPOTENCY"
    | "PROVIDER_FAILED"
    | "RECONCILIATION_REQUIRED"
    | "UNAVAILABLE";

  constructor(code: WalletEsimPurchaseError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "WalletEsimPurchaseError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function verifiedSnapshot(offer: VerifiedCheckoutOffer) {
  const priceCents = usdPriceToCents(offer.priceUSD);
  const providerCostCents = usdPriceToCents(offer.providerPriceUSD);
  if (
    priceCents == null ||
    priceCents <= 0 ||
    providerCostCents == null ||
    providerCostCents <= 0
  ) {
    return null;
  }
  const currency = (offer.currency || "USD").trim().toUpperCase() || "USD";
  // Wallet ledger is USD-only.
  if (currency !== "USD") {
    return null;
  }
  return {
    offerId: offer.offerId,
    destinationCode: offer.countryCode,
    destinationName: offer.countryName || offer.countryCode,
    planName: offer.name,
    dataAllowance: offer.dataFormatted || null,
    validity:
      offer.durationDays != null ? `${offer.durationDays} Days` : null,
    priceCents,
    providerCostCents,
    currency,
  };
}

function purchaseAuditMethod(assisted: boolean): string {
  return assisted
    ? "admin_assisted_customer_wallet_esim_purchase"
    : "customer_wallet_esim_purchase";
}

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN) {
    throw new WalletEsimPurchaseError("FORBIDDEN", "Not authorized.");
  }
  return admin;
}

async function assertActiveCustomer(
  customerUserId: string,
  options?: { requireEmailVerified?: boolean; assisted?: boolean }
) {
  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      email: true,
      emailVerifiedAt: true,
    },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    throw new WalletEsimPurchaseError(
      "CUSTOMER_UNAVAILABLE",
      options?.assisted
        ? "Customer is unavailable for wallet purchases."
        : "Your account is unavailable for wallet purchases."
    );
  }
  if (options?.requireEmailVerified && !customer.emailVerifiedAt) {
    throw new WalletEsimPurchaseError(
      "CUSTOMER_UNAVAILABLE",
      options?.assisted
        ? "Customer email must be verified before an assisted wallet purchase."
        : "Your account is unavailable for wallet purchases."
    );
  }
  return customer;
}

function throwIfOperationalControlBlocks(error: unknown): never {
  if (
    error instanceof OperationalControlBlockedError ||
    error instanceof OperationalControlUnavailableError
  ) {
    throw new WalletEsimPurchaseError(
      "UNAVAILABLE",
      OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE
    );
  }
  throw error;
}

async function assertWalletPurchaseInitiationAllowed(
  isAssisted: boolean,
  options?: { includeProviderOrder?: boolean }
) {
  try {
    await assertNewRiskyTransactionAllowed(
      isAssisted ? "admin_wallet_purchase" : "customer_wallet_purchase",
      { includeProviderOrder: options?.includeProviderOrder === true }
    );
  } catch (error) {
    throwIfOperationalControlBlocks(error);
  }
}

/**
 * Create or reuse a READY purchase snapshot. Never touches wallet or provider.
 */
export async function prepareWalletEsimPurchase(
  input: PrepareWalletPurchaseInput
): Promise<PrepareWalletPurchaseResult> {
  const customerUserId = input.customerUserId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const offerId = input.offerId.trim();
  const countryHint = sanitizeCountryHint(input.countryHint);
  const assistedAdminUserId = input.assistedBy?.adminUserId.trim() || null;
  const assistedReason = input.assistedBy?.reason.trim() || null;
  const isAssisted = Boolean(assistedAdminUserId);

  if (isAssisted) {
    if (!assistedAdminUserId || assistedAdminUserId.length > 64) {
      throw new WalletEsimPurchaseError("FORBIDDEN", "Not authorized.");
    }
    if (!assistedReason || assistedReason.length < 5) {
      throw new WalletEsimPurchaseError(
        "INVALID_STATE",
        "A reason is required for assisted wallet purchases."
      );
    }
  }

  if (!customerUserId || customerUserId.length > 64) {
    throw new WalletEsimPurchaseError(
      "CUSTOMER_UNAVAILABLE",
      isAssisted
        ? "Customer is unavailable for wallet purchases."
        : "Your account is unavailable for wallet purchases."
    );
  }
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new WalletEsimPurchaseError(
      "INVALID_IDEMPOTENCY",
      "This purchase request could not be processed. Please reload and try again."
    );
  }
  if (!offerId || offerId.length > 120) {
    throw new WalletEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      "The selected package is unavailable."
    );
  }

  if (isAssisted && assistedAdminUserId) {
    await assertActiveAdmin(assistedAdminUserId);
  }
  await assertActiveCustomer(customerUserId, {
    requireEmailVerified: isAssisted,
    assisted: isAssisted,
  });

  const existing = await prisma.walletEsimPurchase.findUnique({
    where: { idempotencyKey },
    select: { id: true, customerUserId: true, adminUserId: true },
  });
  if (existing) {
    if (existing.customerUserId !== customerUserId) {
      throw new WalletEsimPurchaseError(
        "INVALID_IDEMPOTENCY",
        "This purchase request could not be processed. Please reload and try again."
      );
    }
    if ((existing.adminUserId || null) !== (assistedAdminUserId || null)) {
      throw new WalletEsimPurchaseError(
        "INVALID_IDEMPOTENCY",
        "This purchase request could not be processed. Please reload and try again."
      );
    }
    return {
      purchaseId: existing.id,
      customerUserId,
      duplicate: true,
    };
  }

  // Pause switches — before offer network work and before purchase row create.
  await assertWalletPurchaseInitiationAllowed(isAssisted, {
    includeProviderOrder: false,
  });

  // Offer verification before any wallet mutation or provider call.
  const verifiedOffer = await verifyOfferAuthoritative({
    offerId,
    countryHint,
  });
  if (!verifiedOffer) {
    throw new WalletEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      "The selected package is unavailable."
    );
  }
  const snapshot = verifiedSnapshot(verifiedOffer);
  if (!snapshot) {
    throw new WalletEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      "The selected package is unavailable."
    );
  }

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: customerUserId },
    select: { balanceCents: true },
  });
  if (!wallet) {
    throw new WalletEsimPurchaseError(
      "WALLET_UNAVAILABLE",
      isAssisted
        ? "A customer wallet is required before an assisted purchase."
        : "A wallet is required before purchasing with wallet funds."
    );
  }
  // Assisted wallet buys remain full-wallet only. Self-service may prepare with
  // partial/zero balance (gateway remainder is fail-closed until PG3).
  if (isAssisted && wallet.balanceCents < snapshot.priceCents) {
    throw new WalletEsimPurchaseError(
      "INSUFFICIENT_FUNDS",
      "Customer wallet balance is not enough for this package."
    );
  }

  const funding = isAssisted
    ? walletOnlyPurchaseFunding(snapshot.priceCents)
    : calculatePurchaseFunding({
        priceCents: snapshot.priceCents,
        walletBalanceCents: wallet.balanceCents,
        useWallet: true,
      });

  try {
    const created = await prisma.$transaction(async (tx) => {
      const purchase = await tx.walletEsimPurchase.create({
        data: {
          customerUserId,
          adminUserId: assistedAdminUserId,
          assistedPurchaseReason: isAssisted ? assistedReason : null,
          offerId: snapshot.offerId,
          destinationCode: snapshot.destinationCode,
          destinationName: snapshot.destinationName,
          planName: snapshot.planName,
          dataAllowance: snapshot.dataAllowance,
          validity: snapshot.validity,
          priceCents: snapshot.priceCents,
          useWallet: funding.useWallet,
          walletAppliedCents: funding.walletAppliedCents,
          gatewayAmountCents: funding.gatewayAmountCents,
          providerCostCents: snapshot.providerCostCents,
          currency: snapshot.currency,
          fundingSource:
            funding.gatewayAmountCents > 0
              ? OrderFundingSource.CUSTOMER_SPLIT
              : OrderFundingSource.CUSTOMER_WALLET,
          status: WalletEsimPurchaseStatus.READY,
          idempotencyKey,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: assistedAdminUserId || customerUserId,
          action: WALLET_PURCHASE_STARTED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: purchaseAuditMethod(isAssisted),
            fundingSource:
              funding.gatewayAmountCents > 0
                ? OrderFundingSource.CUSTOMER_SPLIT
                : OrderFundingSource.CUSTOMER_WALLET,
            purchaseId: purchase.id,
            offerId: snapshot.offerId,
            amountCents: snapshot.priceCents,
            useWallet: funding.useWallet,
            walletAppliedCents: funding.walletAppliedCents,
            gatewayAmountCents: funding.gatewayAmountCents,
            currency: snapshot.currency,
            ...(isAssisted
              ? {
                  targetUserId: customerUserId,
                  adminUserId: assistedAdminUserId,
                  reason: assistedReason,
                }
              : {}),
          } satisfies Prisma.InputJsonValue,
        },
      });

      return purchase;
    });

    return {
      purchaseId: created.id,
      customerUserId,
      duplicate: false,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await prisma.walletEsimPurchase.findUnique({
        where: { idempotencyKey },
        select: { id: true, customerUserId: true, adminUserId: true },
      });
      if (
        raced &&
        raced.customerUserId === customerUserId &&
        (raced.adminUserId || null) === (assistedAdminUserId || null)
      ) {
        return {
          purchaseId: raced.id,
          customerUserId,
          duplicate: true,
        };
      }
    }
    throw new WalletEsimPurchaseError(
      "UNAVAILABLE",
      "Wallet purchase is temporarily unavailable. Please try again shortly."
    );
  }
}

export type SetWalletPurchaseFundingChoiceInput = {
  customerUserId: string;
  purchaseId: string;
  useWallet: boolean;
};

export type SetWalletPurchaseFundingChoiceResult = {
  purchaseId: string;
  useWallet: boolean;
  priceCents: number;
  walletAppliedCents: number;
  gatewayAmountCents: number;
  balanceCents: number;
};

/**
 * Persist customer wallet-funding choice on a READY purchase.
 * Accepts only useWallet — price and balance are re-read server-side.
 * Does not reserve wallet funds, create gateway sessions, or change status.
 */
export async function setWalletPurchaseFundingChoice(
  input: SetWalletPurchaseFundingChoiceInput
): Promise<SetWalletPurchaseFundingChoiceResult> {
  const customerUserId = input.customerUserId.trim();
  const purchaseId = input.purchaseId.trim();
  const useWallet = Boolean(input.useWallet);

  if (!customerUserId || customerUserId.length > 64) {
    throw new WalletEsimPurchaseError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for wallet purchases."
    );
  }
  if (!purchaseId || purchaseId.length > 64) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  await assertActiveCustomer(customerUserId, {
    requireEmailVerified: false,
    assisted: false,
  });

  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      customerUserId: true,
      adminUserId: true,
      priceCents: true,
      status: true,
      fundingSource: true,
    },
  });

  if (
    !purchase ||
    purchase.customerUserId !== customerUserId ||
    purchase.adminUserId
  ) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  if (
    purchase.fundingSource !== OrderFundingSource.CUSTOMER_WALLET &&
    purchase.fundingSource !== OrderFundingSource.CUSTOMER_SPLIT &&
    purchase.fundingSource !== OrderFundingSource.DIRECT_PAYMENT
  ) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  if (purchase.status !== WalletEsimPurchaseStatus.READY) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is not ready for funding updates."
    );
  }

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: customerUserId },
    select: { balanceCents: true },
  });
  if (!wallet) {
    throw new WalletEsimPurchaseError(
      "WALLET_UNAVAILABLE",
      "A wallet is required before purchasing with wallet funds."
    );
  }

  const funding = calculatePurchaseFunding({
    priceCents: purchase.priceCents,
    walletBalanceCents: wallet.balanceCents,
    useWallet,
  });

  // Keep fundingSource aligned with the authoritative breakdown:
  // full wallet → CUSTOMER_WALLET, split → CUSTOMER_SPLIT, card-only → DIRECT_PAYMENT.
  const fundingSource =
    funding.gatewayAmountCents <= 0
      ? OrderFundingSource.CUSTOMER_WALLET
      : funding.walletAppliedCents > 0
        ? OrderFundingSource.CUSTOMER_SPLIT
        : OrderFundingSource.DIRECT_PAYMENT;

  const updated = await prisma.walletEsimPurchase.updateMany({
    where: {
      id: purchase.id,
      customerUserId,
      status: WalletEsimPurchaseStatus.READY,
    },
    data: {
      useWallet: funding.useWallet,
      walletAppliedCents: funding.walletAppliedCents,
      gatewayAmountCents: funding.gatewayAmountCents,
      fundingSource,
    },
  });

  if (updated.count !== 1) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is not ready for funding updates."
    );
  }

  return {
    purchaseId: purchase.id,
    useWallet: funding.useWallet,
    priceCents: purchase.priceCents,
    walletAppliedCents: funding.walletAppliedCents,
    gatewayAmountCents: funding.gatewayAmountCents,
    balanceCents: wallet.balanceCents,
  };
}

/**
 * Atomic wallet reservation for a purchase contribution (full or partial).
 * Decrements only `amountCents` when balanceCents >= amountCents.
 * Does not change purchase status — caller owns the purchase state machine.
 * PG1 callers still pass the full package price for wallet-only purchases.
 */
export async function reserveWalletPurchaseFundsInTx(
  tx: Prisma.TransactionClient,
  options: {
    purchaseId: string;
    customerUserId: string;
    amountCents: number;
    debitIdempotencyKey: string;
  }
): Promise<{
  debitTransactionId: string;
  balanceBeforeCents: number;
  balanceAfterCents: number;
}> {
  const amountCents = options.amountCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  const wallet = await tx.walletAccount.findUnique({
    where: { userId: options.customerUserId },
    select: { id: true, balanceCents: true },
  });
  if (!wallet) {
    throw new WalletEsimPurchaseError(
      "WALLET_UNAVAILABLE",
      "A wallet is required before purchasing with wallet funds."
    );
  }

  const updated = await tx.walletAccount.updateMany({
    where: {
      id: wallet.id,
      balanceCents: { gte: amountCents },
    },
    data: {
      balanceCents: { decrement: amountCents },
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    throw new WalletEsimPurchaseError(
      "INSUFFICIENT_FUNDS",
      "Your wallet balance is not enough for this package."
    );
  }

  const walletAfter = await tx.walletAccount.findUnique({
    where: { id: wallet.id },
    select: { balanceCents: true },
  });
  if (
    !walletAfter ||
    !Number.isInteger(walletAfter.balanceCents) ||
    walletAfter.balanceCents < 0
  ) {
    throw new WalletEsimPurchaseError(
      "UNAVAILABLE",
      "Wallet purchase is temporarily unavailable. Please try again shortly."
    );
  }

  const debitTx = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: WalletTransactionType.PURCHASE_DEBIT,
      direction: WalletDirection.DEBIT,
      status: WalletTransactionStatus.PENDING,
      amountCents,
      balanceBeforeCents: wallet.balanceCents,
      balanceAfterCents: walletAfter.balanceCents,
      idempotencyKey: options.debitIdempotencyKey,
      referenceType: WALLET_PURCHASE_DEBIT_REF,
      referenceId: options.purchaseId,
    },
    select: { id: true },
  });

  return {
    debitTransactionId: debitTx.id,
    balanceBeforeCents: wallet.balanceCents,
    balanceAfterCents: walletAfter.balanceCents,
  };
}

/**
 * Exact-once refund of reserved wallet purchase funds.
 * Amount must come from durable purchase/debit records (never admin form).
 * Safe to call from recovery when eligibility is already verified.
 */
export async function refundReservedFundsInTx(
  tx: Prisma.TransactionClient,
  options: {
    purchaseId: string;
    customerUserId: string;
    actorUserId: string;
    assisted: boolean;
    /**
     * Expected reserved wallet contribution.
     * Wallet-only: equals full priceCents.
     * Split: equals walletAppliedCents (gateway remainder is separate).
     */
    priceCents: number;
    currency?: string;
    /** When true, restore purchase to READY after release (gateway fail before FUNDED). */
    restoreReady?: boolean;
  }
): Promise<{
  outcome: "created" | "already_refunded" | "linked_existing";
  refundTransactionId: string | null;
}> {
  const restoreReady = Boolean(options.restoreReady);
  const expectedReservedCents = options.priceCents;
  if (!Number.isInteger(expectedReservedCents) || expectedReservedCents <= 0) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  const purchase = await tx.walletEsimPurchase.findUnique({
    where: { id: options.purchaseId },
    select: {
      id: true,
      status: true,
      refundTransactionId: true,
      debitTransactionId: true,
      priceCents: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
      currency: true,
      adminUserId: true,
    },
  });

  if (!purchase) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  // Refund the reserved wallet contribution only (full or split share).
  const reservedWalletCents = purchase.walletAppliedCents;
  if (
    reservedWalletCents !== expectedReservedCents ||
    purchase.priceCents < reservedWalletCents ||
    reservedWalletCents <= 0
  ) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }
  const priceCents = reservedWalletCents;

  if (
    !restoreReady &&
    purchase.status === WalletEsimPurchaseStatus.FAILED_REFUNDED &&
    purchase.refundTransactionId
  ) {
    return {
      outcome: "already_refunded",
      refundTransactionId: purchase.refundTransactionId,
    };
  }

  if (
    restoreReady &&
    purchase.status === WalletEsimPurchaseStatus.READY &&
    !purchase.debitTransactionId
  ) {
    return { outcome: "already_refunded", refundTransactionId: null };
  }

  // Gateway reservation release is only valid before verified funding.
  // FUNDED / fulfilled / reconciliation purchases must never be credited here.
  if (restoreReady) {
    const releasable =
      purchase.status === WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT ||
      purchase.status === WalletEsimPurchaseStatus.FUNDS_RESERVED;
    if (!releasable) {
      return { outcome: "already_refunded", refundTransactionId: null };
    }
  }

  if (!restoreReady && purchase.refundTransactionId) {
    await tx.walletEsimPurchase.update({
      where: { id: purchase.id },
      data: {
        status: WalletEsimPurchaseStatus.FAILED_REFUNDED,
        failureCategory: "provider_declined",
        failureCode: "refunded",
      },
    });
    return {
      outcome: "linked_existing",
      refundTransactionId: purchase.refundTransactionId,
    };
  }

  // Gate release keys to the active debit so a later reserve→release cycle
  // after restoreReady can credit again (legacy key: release_gw_${purchaseId}).
  const refundKey = (
    restoreReady
      ? purchase.debitTransactionId
        ? `release_gw_${options.purchaseId}_${purchase.debitTransactionId}`
        : `release_gw_${options.purchaseId}`
      : `refund_${options.purchaseId}`
  ).slice(0, 128);

  const existingRefund = await tx.walletTransaction.findUnique({
    where: { idempotencyKey: refundKey },
    select: {
      id: true,
      amountCents: true,
      type: true,
      direction: true,
      status: true,
      walletId: true,
    },
  });
  if (existingRefund) {
    if (
      existingRefund.amountCents !== priceCents ||
      existingRefund.type !== WalletTransactionType.REFUND_CREDIT ||
      existingRefund.direction !== WalletDirection.CREDIT ||
      existingRefund.status !== WalletTransactionStatus.COMPLETED
    ) {
      throw new WalletEsimPurchaseError(
        "INVALID_STATE",
        "This purchase is unavailable."
      );
    }
    if (restoreReady) {
      // Never downgrade FUNDED/fulfilled; only re-link READY from pre-fund states.
      const relinked = await tx.walletEsimPurchase.updateMany({
        where: {
          id: purchase.id,
          status: {
            in: [
              WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
              WalletEsimPurchaseStatus.FUNDS_RESERVED,
            ],
          },
        },
        data: {
          status: WalletEsimPurchaseStatus.READY,
          refundTransactionId: null,
          debitTransactionId: null,
          failureCategory: null,
          failureCode: null,
        },
      });
      if (relinked.count === 1 && purchase.debitTransactionId) {
        await tx.walletTransaction.update({
          where: { id: purchase.debitTransactionId },
          data: { status: WalletTransactionStatus.REVERSED },
        });
      }
    } else {
      await tx.walletEsimPurchase.update({
        where: { id: purchase.id },
        data: {
          status: WalletEsimPurchaseStatus.FAILED_REFUNDED,
          refundTransactionId: existingRefund.id,
          failureCategory: "provider_declined",
          failureCode: "refunded",
        },
      });
      if (purchase.debitTransactionId) {
        await tx.walletTransaction.update({
          where: { id: purchase.debitTransactionId },
          data: { status: WalletTransactionStatus.REVERSED },
        });
      }
    }
    return {
      outcome: "linked_existing",
      refundTransactionId: existingRefund.id,
    };
  }

  // CAS claim before credit so a concurrent FUND cannot lose to a late release.
  if (restoreReady) {
    const claimedRelease = await tx.walletEsimPurchase.updateMany({
      where: {
        id: purchase.id,
        status: {
          in: [
            WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
            WalletEsimPurchaseStatus.FUNDS_RESERVED,
          ],
        },
      },
      data: {
        status: WalletEsimPurchaseStatus.READY,
        refundTransactionId: null,
        debitTransactionId: null,
        failureCategory: null,
        failureCode: null,
      },
    });
    if (claimedRelease.count !== 1) {
      return { outcome: "already_refunded", refundTransactionId: null };
    }
  }

  const wallet = await tx.walletAccount.findUnique({
    where: { userId: options.customerUserId },
    select: { id: true, balanceCents: true },
  });
  if (!wallet) {
    throw new WalletEsimPurchaseError(
      "WALLET_UNAVAILABLE",
      "Wallet purchase is temporarily unavailable. Please try again shortly."
    );
  }

  const updated = await tx.walletAccount.update({
    where: { id: wallet.id },
    data: {
      balanceCents: { increment: priceCents },
      version: { increment: 1 },
    },
    select: { balanceCents: true },
  });

  const refundTx = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: WalletTransactionType.REFUND_CREDIT,
      direction: WalletDirection.CREDIT,
      status: WalletTransactionStatus.COMPLETED,
      amountCents: priceCents,
      balanceBeforeCents: wallet.balanceCents,
      balanceAfterCents: updated.balanceCents,
      idempotencyKey: refundKey,
      referenceType: WALLET_PURCHASE_REFUND_REF,
      referenceId: purchase.id,
    },
    select: { id: true },
  });

  if (purchase.debitTransactionId) {
    await tx.walletTransaction.update({
      where: { id: purchase.debitTransactionId },
      data: { status: WalletTransactionStatus.REVERSED },
    });
  }

  if (!restoreReady) {
    await tx.walletEsimPurchase.update({
      where: { id: purchase.id },
      data: {
        status: WalletEsimPurchaseStatus.FAILED_REFUNDED,
        refundTransactionId: refundTx.id,
        failureCategory: "provider_declined",
        failureCode: "refunded",
      },
    });
  }

  await tx.auditLog.create({
    data: {
      actorUserId: options.actorUserId,
      action: restoreReady
        ? WALLET_FUNDS_RESERVED
        : WALLET_PURCHASE_FAILED_REFUNDED,
      targetType: "WalletEsimPurchase",
      targetId: purchase.id,
      metadata: {
        method: purchaseAuditMethod(options.assisted),
        fundingSource:
          purchase.gatewayAmountCents > 0
            ? OrderFundingSource.CUSTOMER_SPLIT
            : OrderFundingSource.CUSTOMER_WALLET,
        purchaseId: purchase.id,
        amountCents: priceCents,
        currency: (options.currency || purchase.currency || "USD").trim() || "USD",
        failureCategory: restoreReady
          ? "gateway_reservation_released"
          : "provider_declined",
        walletTransactionId: refundTx.id,
        ...(options.assisted
          ? { targetUserId: options.customerUserId }
          : {}),
      } satisfies Prisma.InputJsonValue,
    },
  });

  return { outcome: "created", refundTransactionId: refundTx.id };
}

async function refundReservedFunds(options: {
  purchaseId: string;
  customerUserId: string;
  actorUserId: string;
  assisted: boolean;
  priceCents: number;
  debitTransactionId: string;
}): Promise<string | null> {
  void options.debitTransactionId;
  let createdRefundTransactionId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const result = await refundReservedFundsInTx(tx, {
      purchaseId: options.purchaseId,
      customerUserId: options.customerUserId,
      actorUserId: options.actorUserId,
      assisted: options.assisted,
      priceCents: options.priceCents,
    });
    if (result.outcome === "created") {
      createdRefundTransactionId = result.refundTransactionId;
    }
  });

  if (createdRefundTransactionId) {
    scheduleWalletTransactionNotification(createdRefundTransactionId);
  }
  return createdRefundTransactionId;
}

async function markReconciliationRequired(options: {
  purchaseId: string;
  customerUserId: string;
  actorUserId: string;
  assisted: boolean;
  category: string;
  code: string;
  /** Persist observed provider reference before status flip when available. */
  providerObservation?: {
    providerOrderId?: string | null;
    providerResultKind: ProviderResultKind;
    safeProviderStatusCode?: string | null;
  };
}): Promise<never> {
  // Persist any observed providerOrderId before marking RECONCILIATION_REQUIRED.
  // Never overwrites a different stored id; never stores raw payloads.
  if (options.providerObservation) {
    await persistWalletPurchaseProviderObservation(options.purchaseId, {
      providerOrderId: options.providerObservation.providerOrderId,
      providerResultKind: options.providerObservation.providerResultKind,
      safeProviderStatusCode:
        options.providerObservation.safeProviderStatusCode,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.walletEsimPurchase.update({
      where: { id: options.purchaseId },
      data: {
        status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
        failureCategory: options.category,
        failureCode: options.code,
        reconciliationState: "awaiting_manual_review",
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: options.actorUserId,
        action: WALLET_PURCHASE_RECONCILIATION,
        targetType: "WalletEsimPurchase",
        targetId: options.purchaseId,
        metadata: {
          method: purchaseAuditMethod(options.assisted),
          fundingSource: OrderFundingSource.CUSTOMER_WALLET,
          purchaseId: options.purchaseId,
          failureCategory: options.category,
          failureCode: options.code,
          ...(options.assisted
            ? { targetUserId: options.customerUserId }
            : {}),
        } satisfies Prisma.InputJsonValue,
      },
    });
  });

  // Post-commit: customer "under review" email only when funds are still held.
  scheduleReconciliationRequiredNotification(options.purchaseId);

  throw new WalletEsimPurchaseError(
    "RECONCILIATION_REQUIRED",
    options.assisted
      ? "This purchase requires reconciliation. Do not retry. Review the attempt before taking further action."
      : "Your purchase is under review. Do not buy again. Contact support for help."
  );
}

/**
 * Confirm purchase: reserve wallet funds, then call provider once.
 * Never uses ADMIN debit helpers. Never mutates company-funded orders.
 */
export async function confirmWalletEsimPurchase(
  input: ConfirmWalletPurchaseInput
): Promise<ConfirmWalletPurchaseResult> {
  const customerUserId = input.customerUserId.trim();
  const purchaseId = input.purchaseId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const assistedAdminUserId = input.assistedByAdminUserId?.trim() || null;
  const confirmAsAssisted = Boolean(assistedAdminUserId);

  if (confirmAsAssisted && assistedAdminUserId) {
    await assertActiveAdmin(assistedAdminUserId);
  }

  const customer = await assertActiveCustomer(customerUserId, {
    requireEmailVerified: confirmAsAssisted,
    assisted: confirmAsAssisted,
  });

  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      customerUserId: true,
      adminUserId: true,
      assistedPurchaseReason: true,
      offerId: true,
      destinationCode: true,
      priceCents: true,
      status: true,
      idempotencyKey: true,
      orderId: true,
      debitTransactionId: true,
      refundTransactionId: true,
      fundingSource: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      destinationName: true,
      currency: true,
    },
  });

  if (
    !purchase ||
    purchase.customerUserId !== customerUserId ||
    purchase.idempotencyKey !== idempotencyKey
  ) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  const purchaseIsAssisted = Boolean(purchase.adminUserId);
  if (purchaseIsAssisted !== confirmAsAssisted) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }
  if (
    purchaseIsAssisted &&
    (purchase.adminUserId !== assistedAdminUserId ||
      !purchase.assistedPurchaseReason)
  ) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  const actorUserId = assistedAdminUserId || customerUserId;
  const isAssisted = purchaseIsAssisted;

  if (purchase.fundingSource !== OrderFundingSource.CUSTOMER_WALLET) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  if (purchase.status === WalletEsimPurchaseStatus.COMPLETED) {
    return {
      purchaseId: purchase.id,
      customerUserId,
      orderId: purchase.orderId,
      status: WalletEsimPurchaseStatus.COMPLETED,
      duplicate: true,
    };
  }

  if (purchase.status === WalletEsimPurchaseStatus.FAILED_REFUNDED) {
    throw new WalletEsimPurchaseError(
      "PROVIDER_FAILED",
      isAssisted
        ? "This purchase failed and the customer wallet amount was restored."
        : "This purchase failed and the wallet amount was restored."
    );
  }

  if (
    purchase.status === WalletEsimPurchaseStatus.PROVIDER_PENDING ||
    purchase.status === WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED ||
    purchase.status === WalletEsimPurchaseStatus.FUNDS_RESERVED
  ) {
    // Already reserved / in flight — never blind-retry provider.
    throw new WalletEsimPurchaseError(
      "RECONCILIATION_REQUIRED",
      isAssisted
        ? "This purchase requires reconciliation. Do not retry. Review the attempt before taking further action."
        : "Your purchase is under review. Do not buy again. Contact support for help."
    );
  }

  if (purchase.status !== WalletEsimPurchaseStatus.READY) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is not ready for confirmation."
    );
  }

  // New durable initiation (claim + debit + provider). Check before reservation.
  await assertWalletPurchaseInitiationAllowed(isAssisted, {
    includeProviderOrder: true,
  });

  // Re-validate offer and price before reserving funds.
  const verifiedOffer = await verifyOfferAuthoritative({
    offerId: purchase.offerId,
    countryHint: purchase.destinationCode,
  });
  if (!verifiedOffer) {
    throw new WalletEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      "The selected package is no longer available at this price."
    );
  }
  const snapshot = verifiedSnapshot(verifiedOffer);
  if (
    !snapshot ||
    snapshot.priceCents !== purchase.priceCents ||
    snapshot.currency !== (purchase.currency || "USD").toUpperCase()
  ) {
    throw new WalletEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      "The selected package is no longer available at this price."
    );
  }

  const debitKey = `debit_${purchase.id}`.slice(0, 128);
  let reservedDebitTransactionId = "";
  // PG1: wallet-only still reserves the full package price.
  const walletOnlyFunding = walletOnlyPurchaseFunding(snapshot.priceCents);

  // Atomic claim + wallet reservation (provider call stays outside).
  try {
    reservedDebitTransactionId = await prisma.$transaction(async (tx) => {
      const claimed = await tx.walletEsimPurchase.updateMany({
        where: {
          id: purchase.id,
          status: WalletEsimPurchaseStatus.READY,
          idempotencyKey,
        },
        data: {
          status: WalletEsimPurchaseStatus.FUNDS_RESERVED,
          offerId: snapshot.offerId,
          destinationCode: snapshot.destinationCode,
          destinationName: snapshot.destinationName,
          planName: snapshot.planName,
          dataAllowance: snapshot.dataAllowance,
          validity: snapshot.validity,
          priceCents: snapshot.priceCents,
          useWallet: walletOnlyFunding.useWallet,
          walletAppliedCents: walletOnlyFunding.walletAppliedCents,
          gatewayAmountCents: walletOnlyFunding.gatewayAmountCents,
          providerCostCents: snapshot.providerCostCents,
          currency: snapshot.currency,
        },
      });

      if (claimed.count !== 1) {
        throw new WalletEsimPurchaseError(
          "RECONCILIATION_REQUIRED",
          "Your purchase is under review. Do not buy again. Contact support for help."
        );
      }

      const reserved = await reserveWalletPurchaseFundsInTx(tx, {
        purchaseId: purchase.id,
        customerUserId,
        amountCents: snapshot.priceCents,
        debitIdempotencyKey: debitKey,
      });

      await tx.walletEsimPurchase.update({
        where: { id: purchase.id },
        data: {
          status: WalletEsimPurchaseStatus.PROVIDER_PENDING,
          debitTransactionId: reserved.debitTransactionId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: WALLET_FUNDS_RESERVED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: purchaseAuditMethod(isAssisted),
            fundingSource: OrderFundingSource.CUSTOMER_WALLET,
            purchaseId: purchase.id,
            offerId: snapshot.offerId,
            amountCents: snapshot.priceCents,
            walletAppliedCents: walletOnlyFunding.walletAppliedCents,
            gatewayAmountCents: walletOnlyFunding.gatewayAmountCents,
            currency: snapshot.currency,
            walletTransactionId: reserved.debitTransactionId,
            ...(isAssisted
              ? {
                  targetUserId: customerUserId,
                  adminUserId: assistedAdminUserId,
                  reason: purchase.assistedPurchaseReason,
                }
              : {}),
          } satisfies Prisma.InputJsonValue,
        },
      });

      return reserved.debitTransactionId;
    });
  } catch (error) {
    if (error instanceof WalletEsimPurchaseError) throw error;
    if (isUniqueViolation(error)) {
      throw new WalletEsimPurchaseError(
        "RECONCILIATION_REQUIRED",
        isAssisted
          ? "This purchase requires reconciliation. Do not retry. Review the attempt before taking further action."
          : "Your purchase is under review. Do not buy again. Contact support for help."
      );
    }
    throw new WalletEsimPurchaseError(
      "UNAVAILABLE",
      "Wallet purchase is temporarily unavailable. Please try again shortly."
    );
  }

  // External provider write — outside Prisma transaction.
  const checkout = await executeCreditCheckout({
    offerId: snapshot.offerId,
    customerEmail: customer.email,
  });

  if (checkout.kind === "declined") {
    await refundReservedFunds({
      purchaseId: purchase.id,
      customerUserId,
      actorUserId,
      assisted: isAssisted,
      priceCents: snapshot.priceCents,
      debitTransactionId: reservedDebitTransactionId,
    });
    throw new WalletEsimPurchaseError(
      "PROVIDER_FAILED",
      isAssisted
        ? "The provider could not complete this purchase. The customer wallet amount was restored."
        : "The provider could not complete this purchase. Your wallet amount was restored."
    );
  }

  if (checkout.kind !== "success") {
    await markReconciliationRequired({
      purchaseId: purchase.id,
      customerUserId,
      actorUserId,
      assisted: isAssisted,
      category: checkout.category,
      code: checkout.code,
      providerObservation: {
        providerOrderId: checkout.providerOrderId ?? null,
        providerResultKind: "uncertain",
        safeProviderStatusCode: checkout.code,
      },
    });
  }

  const successCheckout = checkout as Extract<
    typeof checkout,
    { kind: "success" }
  >;

  // Confirmed success — finalize local order + complete debit.
  let orderId: string | null = null;
  try {
    let completedDebitTransactionId: string | null = null;
    const finalized = await prisma.$transaction(async (tx) => {
      const current = await tx.walletEsimPurchase.findUnique({
        where: { id: purchase.id },
        select: {
          status: true,
          debitTransactionId: true,
          orderId: true,
        },
      });
      if (
        current?.status === WalletEsimPurchaseStatus.COMPLETED &&
        current.orderId
      ) {
        return { id: current.orderId };
      }
      if (current?.status !== WalletEsimPurchaseStatus.PROVIDER_PENDING) {
        throw new WalletEsimPurchaseError(
          "RECONCILIATION_REQUIRED",
          "Your purchase is under review. Do not buy again. Contact support for help."
        );
      }

      const order = await persistAssignedOrder(tx, {
        providerOrderId: successCheckout.providerOrderId,
        customerUserId: customer.id,
        customerEmail: customer.email,
        verifiedOffer,
        fundingSource: OrderFundingSource.CUSTOMER_WALLET,
        status: OrderStatus.COMPLETED,
        checkoutPayload: successCheckout.payload,
      });

      if (current.debitTransactionId) {
        await tx.walletTransaction.update({
          where: { id: current.debitTransactionId },
          data: { status: WalletTransactionStatus.COMPLETED },
        });
        completedDebitTransactionId = current.debitTransactionId;
      }

      await tx.walletEsimPurchase.update({
        where: { id: purchase.id },
        data: {
          status: WalletEsimPurchaseStatus.COMPLETED,
          orderId: order.id,
          providerOrderId: order.providerOrderId,
          providerResultKind: "success",
          providerObservedAt: new Date(),
          completedAt: new Date(),
          failureCategory: null,
          failureCode: null,
          reconciliationState: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: WALLET_PURCHASE_COMPLETED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: purchaseAuditMethod(isAssisted),
            fundingSource: OrderFundingSource.CUSTOMER_WALLET,
            purchaseId: purchase.id,
            orderId: order.id,
            offerId: snapshot.offerId,
            amountCents: snapshot.priceCents,
            currency: snapshot.currency,
            walletTransactionId: current.debitTransactionId,
            ...(isAssisted
              ? {
                  targetUserId: customerUserId,
                  adminUserId: assistedAdminUserId,
                  reason: purchase.assistedPurchaseReason,
                }
              : {}),
          } satisfies Prisma.InputJsonValue,
        },
      });

      return order;
    });
    orderId = finalized.id;
    if (completedDebitTransactionId) {
      scheduleWalletTransactionNotification(completedDebitTransactionId);
    }
  } catch (error) {
    if (error instanceof WalletEsimPurchaseError) throw error;
    await markReconciliationRequired({
      purchaseId: purchase.id,
      customerUserId,
      actorUserId,
      assisted: isAssisted,
      category: "local_finalize_failed",
      code: "order_persist_error",
      providerObservation: {
        providerOrderId: successCheckout.providerOrderId,
        providerResultKind: "success",
        safeProviderStatusCode: "local_finalize_failed",
      },
    });
  }

  // Best-effort email — never reverses purchase or retries provider.
  try {
    const accessToken = createOrderAccessToken(successCheckout.providerOrderId);
    const emailResult = await deliverOrderEmailAfterCheckout({
      orderId: successCheckout.providerOrderId,
      customerEmail: customer.email,
      verifiedOffer,
      checkoutPayload: successCheckout.payload,
      accessToken: accessToken || undefined,
      assistedWalletPurchaseNotice: isAssisted,
    });
    await prisma.walletEsimPurchase.update({
      where: { id: purchase.id },
      data: { emailDeliveryStatus: emailResult.emailDelivery },
    });
    if (
      emailResult.emailDelivery === "failed" ||
      emailResult.emailDelivery === "invalid_email"
    ) {
      await prisma.auditLog.create({
        data: {
          actorUserId,
          action: WALLET_DELIVERY_EMAIL_FAILED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: purchaseAuditMethod(isAssisted),
            fundingSource: OrderFundingSource.CUSTOMER_WALLET,
            purchaseId: purchase.id,
            failureCategory: "email_delivery",
            failureCode: emailResult.emailDelivery,
            ...(isAssisted ? { targetUserId: customerUserId } : {}),
          } satisfies Prisma.InputJsonValue,
        },
      });
    }
  } catch {
    try {
      await prisma.walletEsimPurchase.update({
        where: { id: purchase.id },
        data: { emailDeliveryStatus: "failed" },
      });
      await prisma.auditLog.create({
        data: {
          actorUserId,
          action: WALLET_DELIVERY_EMAIL_FAILED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: purchaseAuditMethod(isAssisted),
            fundingSource: OrderFundingSource.CUSTOMER_WALLET,
            purchaseId: purchase.id,
            failureCategory: "email_delivery",
            failureCode: "exception",
            ...(isAssisted ? { targetUserId: customerUserId } : {}),
          } satisfies Prisma.InputJsonValue,
        },
      });
    } catch {
      // ignore secondary audit failures
    }
  }

  return {
    purchaseId: purchase.id,
    customerUserId,
    orderId,
    status: WalletEsimPurchaseStatus.COMPLETED,
    duplicate: false,
  };
}

export function formatWalletPurchasePriceLabel(cents: number): string {
  return `${formatUsdCents(cents)} USD`;
}
