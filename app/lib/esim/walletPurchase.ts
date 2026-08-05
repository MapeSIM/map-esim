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
import { formatUsdCents } from "@/app/lib/wallet/display";
import {
  sanitizeCountryHint,
  verifyOfferAuthoritative,
  type VerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";

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
  if (priceCents == null || priceCents <= 0) {
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
    providerCostCents: priceCents,
    currency: offer.currency || "USD",
  };
}

async function assertActiveCustomer(customerUserId: string) {
  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      email: true,
    },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    throw new WalletEsimPurchaseError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for wallet purchases."
    );
  }
  return customer;
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

  if (!customerUserId || customerUserId.length > 64) {
    throw new WalletEsimPurchaseError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for wallet purchases."
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

  await assertActiveCustomer(customerUserId);

  const existing = await prisma.walletEsimPurchase.findUnique({
    where: { idempotencyKey },
    select: { id: true, customerUserId: true },
  });
  if (existing) {
    if (existing.customerUserId !== customerUserId) {
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
      "A wallet is required before purchasing with wallet funds."
    );
  }
  if (wallet.balanceCents < snapshot.priceCents) {
    throw new WalletEsimPurchaseError(
      "INSUFFICIENT_FUNDS",
      "Your wallet balance is not enough for this package."
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const purchase = await tx.walletEsimPurchase.create({
        data: {
          customerUserId,
          offerId: snapshot.offerId,
          destinationCode: snapshot.destinationCode,
          destinationName: snapshot.destinationName,
          planName: snapshot.planName,
          dataAllowance: snapshot.dataAllowance,
          validity: snapshot.validity,
          priceCents: snapshot.priceCents,
          providerCostCents: snapshot.providerCostCents,
          currency: snapshot.currency,
          fundingSource: OrderFundingSource.CUSTOMER_WALLET,
          status: WalletEsimPurchaseStatus.READY,
          idempotencyKey,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: customerUserId,
          action: WALLET_PURCHASE_STARTED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: "customer_wallet_esim_purchase",
            fundingSource: OrderFundingSource.CUSTOMER_WALLET,
            purchaseId: purchase.id,
            offerId: snapshot.offerId,
            amountCents: snapshot.priceCents,
            currency: snapshot.currency,
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
        select: { id: true, customerUserId: true },
      });
      if (raced && raced.customerUserId === customerUserId) {
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

async function refundReservedFunds(options: {
  purchaseId: string;
  customerUserId: string;
  priceCents: number;
  debitTransactionId: string;
}): Promise<void> {
  const refundKey = `refund_${options.purchaseId}`.slice(0, 128);

  await prisma.$transaction(async (tx) => {
    const purchase = await tx.walletEsimPurchase.findUnique({
      where: { id: options.purchaseId },
      select: {
        id: true,
        status: true,
        refundTransactionId: true,
        debitTransactionId: true,
        priceCents: true,
      },
    });

    if (!purchase) {
      throw new WalletEsimPurchaseError(
        "INVALID_STATE",
        "This purchase is unavailable."
      );
    }

    if (
      purchase.status === WalletEsimPurchaseStatus.FAILED_REFUNDED &&
      purchase.refundTransactionId
    ) {
      return;
    }

    if (purchase.refundTransactionId) {
      await tx.walletEsimPurchase.update({
        where: { id: purchase.id },
        data: {
          status: WalletEsimPurchaseStatus.FAILED_REFUNDED,
          failureCategory: "provider_declined",
          failureCode: "refunded",
        },
      });
      return;
    }

    const existingRefund = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: refundKey },
      select: { id: true },
    });
    if (existingRefund) {
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
      return;
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
        balanceCents: { increment: options.priceCents },
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
        amountCents: options.priceCents,
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

    await tx.walletEsimPurchase.update({
      where: { id: purchase.id },
      data: {
        status: WalletEsimPurchaseStatus.FAILED_REFUNDED,
        refundTransactionId: refundTx.id,
        failureCategory: "provider_declined",
        failureCode: "refunded",
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: options.customerUserId,
        action: WALLET_PURCHASE_FAILED_REFUNDED,
        targetType: "WalletEsimPurchase",
        targetId: purchase.id,
        metadata: {
          method: "customer_wallet_esim_purchase",
          fundingSource: OrderFundingSource.CUSTOMER_WALLET,
          purchaseId: purchase.id,
          amountCents: options.priceCents,
          currency: "USD",
          failureCategory: "provider_declined",
          walletTransactionId: refundTx.id,
        } satisfies Prisma.InputJsonValue,
      },
    });
  });
}

async function markReconciliationRequired(options: {
  purchaseId: string;
  customerUserId: string;
  category: string;
  code: string;
}): Promise<never> {
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
        actorUserId: options.customerUserId,
        action: WALLET_PURCHASE_RECONCILIATION,
        targetType: "WalletEsimPurchase",
        targetId: options.purchaseId,
        metadata: {
          method: "customer_wallet_esim_purchase",
          fundingSource: OrderFundingSource.CUSTOMER_WALLET,
          purchaseId: options.purchaseId,
          failureCategory: options.category,
          failureCode: options.code,
        } satisfies Prisma.InputJsonValue,
      },
    });
  });

  throw new WalletEsimPurchaseError(
    "RECONCILIATION_REQUIRED",
    "Your purchase is under review. Do not buy again. Contact support for help."
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

  const customer = await assertActiveCustomer(customerUserId);

  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      customerUserId: true,
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
      "This purchase failed and the wallet amount was restored."
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
      "Your purchase is under review. Do not buy again. Contact support for help."
    );
  }

  if (purchase.status !== WalletEsimPurchaseStatus.READY) {
    throw new WalletEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is not ready for confirmation."
    );
  }

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
  if (!snapshot || snapshot.priceCents !== purchase.priceCents) {
    throw new WalletEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      "The selected package is no longer available at this price."
    );
  }

  const debitKey = `debit_${purchase.id}`.slice(0, 128);
  let reservedDebitTransactionId = "";

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

      const wallet = await tx.walletAccount.findUnique({
        where: { userId: customerUserId },
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
          balanceCents: { gte: snapshot.priceCents },
        },
        data: {
          balanceCents: { decrement: snapshot.priceCents },
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
          amountCents: snapshot.priceCents,
          balanceAfterCents: walletAfter.balanceCents,
          idempotencyKey: debitKey,
          referenceType: WALLET_PURCHASE_DEBIT_REF,
          referenceId: purchase.id,
        },
        select: { id: true },
      });

      await tx.walletEsimPurchase.update({
        where: { id: purchase.id },
        data: {
          status: WalletEsimPurchaseStatus.PROVIDER_PENDING,
          debitTransactionId: debitTx.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: customerUserId,
          action: WALLET_FUNDS_RESERVED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: "customer_wallet_esim_purchase",
            fundingSource: OrderFundingSource.CUSTOMER_WALLET,
            purchaseId: purchase.id,
            offerId: snapshot.offerId,
            amountCents: snapshot.priceCents,
            currency: snapshot.currency,
            walletTransactionId: debitTx.id,
          } satisfies Prisma.InputJsonValue,
        },
      });

      return debitTx.id;
    });
  } catch (error) {
    if (error instanceof WalletEsimPurchaseError) throw error;
    if (isUniqueViolation(error)) {
      throw new WalletEsimPurchaseError(
        "RECONCILIATION_REQUIRED",
        "Your purchase is under review. Do not buy again. Contact support for help."
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
      priceCents: snapshot.priceCents,
      debitTransactionId: reservedDebitTransactionId,
    });
    throw new WalletEsimPurchaseError(
      "PROVIDER_FAILED",
      "The provider could not complete this purchase. Your wallet amount was restored."
    );
  }

  if (checkout.kind !== "success") {
    await markReconciliationRequired({
      purchaseId: purchase.id,
      customerUserId,
      category: checkout.category,
      code: checkout.code,
    });
  }

  const successCheckout = checkout as Extract<
    typeof checkout,
    { kind: "success" }
  >;

  // Confirmed success — finalize local order + complete debit.
  let orderId: string | null = null;
  try {
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
      }

      await tx.walletEsimPurchase.update({
        where: { id: purchase.id },
        data: {
          status: WalletEsimPurchaseStatus.COMPLETED,
          orderId: order.id,
          providerOrderId: order.providerOrderId,
          completedAt: new Date(),
          failureCategory: null,
          failureCode: null,
          reconciliationState: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: customerUserId,
          action: WALLET_PURCHASE_COMPLETED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: "customer_wallet_esim_purchase",
            fundingSource: OrderFundingSource.CUSTOMER_WALLET,
            purchaseId: purchase.id,
            orderId: order.id,
            offerId: snapshot.offerId,
            amountCents: snapshot.priceCents,
            currency: snapshot.currency,
            walletTransactionId: current.debitTransactionId,
          } satisfies Prisma.InputJsonValue,
        },
      });

      return order;
    });
    orderId = finalized.id;
  } catch (error) {
    if (error instanceof WalletEsimPurchaseError) throw error;
    await markReconciliationRequired({
      purchaseId: purchase.id,
      customerUserId,
      category: "local_finalize_failed",
      code: "order_persist_error",
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
          actorUserId: customerUserId,
          action: WALLET_DELIVERY_EMAIL_FAILED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: "customer_wallet_esim_purchase",
            fundingSource: OrderFundingSource.CUSTOMER_WALLET,
            purchaseId: purchase.id,
            failureCategory: "email_delivery",
            failureCode: emailResult.emailDelivery,
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
          actorUserId: customerUserId,
          action: WALLET_DELIVERY_EMAIL_FAILED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: "customer_wallet_esim_purchase",
            fundingSource: OrderFundingSource.CUSTOMER_WALLET,
            purchaseId: purchase.id,
            failureCategory: "email_delivery",
            failureCode: "exception",
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
