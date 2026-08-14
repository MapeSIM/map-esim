import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  OrderFundingSource,
  PaymentGatewayProvider,
  Prisma,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { calculatePurchaseFunding } from "@/app/lib/esim/purchaseFunding";
import {
  releaseSplitReservationAfterSessionFailure,
  reserveSplitWalletBeforeGatewayCheckout,
} from "@/app/lib/esim/esimPurchasePaymentApply";
import { CARD_PAYMENT_UNAVAILABLE_MESSAGE } from "@/app/lib/esim/walletPurchaseFormState";
import { WalletEsimPurchaseError } from "@/app/lib/esim/walletPurchase";
import {
  getActivePaymentAdapter,
  isPaymentGatewayConfigured,
} from "@/app/lib/payments/disabledAdapter";
import {
  esimPurchasePaymentCancelPath,
  esimPurchasePaymentReturnPath,
} from "@/app/lib/payments/safepayCheckoutPaths";
import { resumeSafepayHostedCheckout } from "@/app/lib/payments/safepayAdapter";
import {
  assertCustomerFinancialActivityAllowed,
  CustomerAccountRestrictedError,
} from "@/app/lib/auth/customerAccountStatus";

export class EsimPurchaseGatewayCheckoutError extends Error {
  readonly code:
    | "CUSTOMER_UNAVAILABLE"
    | "INVALID_STATE"
    | "INSUFFICIENT_FUNDS"
    | "GATEWAY_UNAVAILABLE"
    | "UNAVAILABLE";

  constructor(
    code: EsimPurchaseGatewayCheckoutError["code"],
    message: string
  ) {
    super(message);
    this.code = code;
    this.name = "EsimPurchaseGatewayCheckoutError";
  }
}

export type StartEsimPurchaseHostedCheckoutInput = {
  customerUserId: string;
  purchaseId: string;
  /** Server-parsed useWallet choice from the checkout form (never money fields). */
  useWallet: boolean;
};

export type StartEsimPurchaseHostedCheckoutResult = {
  purchaseId: string;
  paymentAttemptId: string;
  checkoutUrl: string;
  reusedAttempt: boolean;
  reusedTracker: boolean;
};

export type OwnedPaymentAttemptView = {
  attemptId: string;
  purchaseId: string;
  status: EsimPurchasePaymentAttemptStatus;
  purchaseStatus: WalletEsimPurchaseStatus;
};

/** Ownership-scoped attempt read for return/cancel informational pages only. */
export async function getOwnedEsimPurchasePaymentAttempt(
  customerUserId: string,
  attemptId: string
): Promise<OwnedPaymentAttemptView | null> {
  const ownerId = customerUserId.trim();
  const id = attemptId.trim();
  if (!ownerId || !id || ownerId.length > 64 || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;

  const row = await prisma.esimPurchasePaymentAttempt.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      purchase: {
        select: {
          id: true,
          customerUserId: true,
          adminUserId: true,
          status: true,
          customer: {
            select: { role: true, deletedAt: true },
          },
        },
      },
    },
  });

  if (
    !row ||
    row.purchase.customerUserId !== ownerId ||
    row.purchase.adminUserId ||
    row.purchase.customer.deletedAt ||
    row.purchase.customer.role !== Role.CUSTOMER
  ) {
    return null;
  }

  return {
    attemptId: row.id,
    purchaseId: row.purchase.id,
    status: row.status,
    purchaseStatus: row.purchase.status,
  };
}

function gatewayCheckoutIdempotencyKey(purchaseIdempotencyKey: string): string {
  return `${purchaseIdempotencyKey}:esim-gw`;
}

/**
 * Gateway-only Safepay Hosted Checkout for an eSIM purchase.
 *
 * - Recomputes funding server-side (never trusts browser money).
 * - Blocks partial-wallet split until PG4-B.
 * - Creates/reuses EsimPurchasePaymentAttempt via durable checkout idempotency.
 * - Does not reserve/debit wallet, create VeSIM orders, or treat browser return as paid.
 */
export async function startEsimPurchaseHostedCheckout(
  input: StartEsimPurchaseHostedCheckoutInput
): Promise<StartEsimPurchaseHostedCheckoutResult> {
  const customerUserId = input.customerUserId.trim();
  const purchaseId = input.purchaseId.trim();

  if (!customerUserId || customerUserId.length > 64) {
    throw new EsimPurchaseGatewayCheckoutError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for checkout."
    );
  }
  if (!purchaseId || purchaseId.length > 64) {
    throw new EsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  if (!isPaymentGatewayConfigured()) {
    throw new EsimPurchaseGatewayCheckoutError(
      "GATEWAY_UNAVAILABLE",
      CARD_PAYMENT_UNAVAILABLE_MESSAGE
    );
  }

  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    throw new EsimPurchaseGatewayCheckoutError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for checkout."
    );
  }
  try {
    await assertCustomerFinancialActivityAllowed(customerUserId);
  } catch (error) {
    if (error instanceof CustomerAccountRestrictedError) {
      throw new EsimPurchaseGatewayCheckoutError(
        "CUSTOMER_UNAVAILABLE",
        error.message
      );
    }
    throw error;
  }

  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      customerUserId: true,
      adminUserId: true,
      priceCents: true,
      currency: true,
      useWallet: true,
      status: true,
      fundingSource: true,
      idempotencyKey: true,
    },
  });

  if (
    !purchase ||
    purchase.customerUserId !== customerUserId ||
    purchase.adminUserId
  ) {
    throw new EsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  if (
    purchase.fundingSource !== OrderFundingSource.CUSTOMER_WALLET &&
    purchase.fundingSource !== OrderFundingSource.CUSTOMER_SPLIT &&
    purchase.fundingSource !== OrderFundingSource.DIRECT_PAYMENT
  ) {
    throw new EsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  if (
    purchase.status !== WalletEsimPurchaseStatus.READY &&
    purchase.status !== WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT
  ) {
    throw new EsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "This purchase cannot start card payment in its current state."
    );
  }

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: customerUserId },
    select: { balanceCents: true },
  });
  if (!wallet) {
    throw new EsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "A wallet is required before checkout."
    );
  }

  const funding = calculatePurchaseFunding({
    priceCents: purchase.priceCents,
    walletBalanceCents: wallet.balanceCents,
    useWallet: Boolean(input.useWallet),
  });

  if (funding.gatewayAmountCents <= 0) {
    throw new EsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "This purchase does not require card payment."
    );
  }

  const currency = (purchase.currency || "USD").trim().toUpperCase() || "USD";
  if (currency !== "USD") {
    throw new EsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "Card payment is only available in USD."
    );
  }

  const fundingSource =
    funding.walletAppliedCents > 0
      ? OrderFundingSource.CUSTOMER_SPLIT
      : OrderFundingSource.DIRECT_PAYMENT;

  // Split: reserve walletAppliedCents before Safepay redirect (exact-once).
  if (funding.walletAppliedCents > 0) {
    try {
      await reserveSplitWalletBeforeGatewayCheckout({
        purchaseId: purchase.id,
        customerUserId,
        walletAppliedCents: funding.walletAppliedCents,
        gatewayAmountCents: funding.gatewayAmountCents,
        useWallet: funding.useWallet,
      });
    } catch (error) {
      if (
        error instanceof WalletEsimPurchaseError &&
        error.code === "INSUFFICIENT_FUNDS"
      ) {
        throw new EsimPurchaseGatewayCheckoutError(
          "INSUFFICIENT_FUNDS",
          error.message
        );
      }
      throw new EsimPurchaseGatewayCheckoutError(
        "UNAVAILABLE",
        "Wallet reservation failed. Please try again."
      );
    }
  } else {
    await prisma.walletEsimPurchase.updateMany({
      where: {
        id: purchase.id,
        customerUserId,
        status: {
          in: [
            WalletEsimPurchaseStatus.READY,
            WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
          ],
        },
      },
      data: {
        useWallet: funding.useWallet,
        walletAppliedCents: funding.walletAppliedCents,
        gatewayAmountCents: funding.gatewayAmountCents,
        fundingSource,
      },
    });
  }

  const checkoutKey = gatewayCheckoutIdempotencyKey(purchase.idempotencyKey);
  let attempt = await prisma.esimPurchasePaymentAttempt.findUnique({
    where: { checkoutIdempotencyKey: checkoutKey },
    select: {
      id: true,
      purchaseId: true,
      gatewayAmountCents: true,
      currency: true,
      status: true,
      gatewayPaymentRef: true,
      gatewayProvider: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
      fxRateSnapshot: true,
    },
  });

  let reusedAttempt = false;
  if (attempt) {
    reusedAttempt = true;
    if (attempt.purchaseId !== purchase.id) {
      throw new EsimPurchaseGatewayCheckoutError(
        "INVALID_STATE",
        "This purchase is unavailable."
      );
    }
    if (
      attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED ||
      attempt.status === EsimPurchasePaymentAttemptStatus.REFUNDED
    ) {
      throw new EsimPurchaseGatewayCheckoutError(
        "INVALID_STATE",
        "This payment was already completed."
      );
    }
    if (
      attempt.gatewayAmountCents !== funding.gatewayAmountCents ||
      attempt.currency !== currency
    ) {
      // Amount changed — do not reuse a mismatched attempt.
      throw new EsimPurchaseGatewayCheckoutError(
        "INVALID_STATE",
        "Payment amount changed. Please reload checkout and try again."
      );
    }
  } else {
    try {
      attempt = await prisma.esimPurchasePaymentAttempt.create({
        data: {
          purchaseId: purchase.id,
          gatewayAmountCents: funding.gatewayAmountCents,
          currency,
          gatewayProvider: PaymentGatewayProvider.SAFEPAY,
          status: EsimPurchasePaymentAttemptStatus.DRAFT,
          checkoutIdempotencyKey: checkoutKey,
        },
        select: {
          id: true,
          purchaseId: true,
          gatewayAmountCents: true,
          currency: true,
          status: true,
          gatewayPaymentRef: true,
          gatewayProvider: true,
          chargeCurrency: true,
          chargeAmountMinor: true,
          fxRateSnapshot: true,
        },
      });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
      ) {
        throw error;
      }
      attempt = await prisma.esimPurchasePaymentAttempt.findUnique({
        where: { checkoutIdempotencyKey: checkoutKey },
        select: {
          id: true,
          purchaseId: true,
          gatewayAmountCents: true,
          currency: true,
          status: true,
          gatewayPaymentRef: true,
          gatewayProvider: true,
          chargeCurrency: true,
          chargeAmountMinor: true,
          fxRateSnapshot: true,
        },
      });
      if (!attempt || attempt.purchaseId !== purchase.id) {
        throw new EsimPurchaseGatewayCheckoutError(
          "UNAVAILABLE",
          "Payment checkout is temporarily unavailable. Please try again."
        );
      }
      reusedAttempt = true;
    }
  }

  const returnPath = esimPurchasePaymentReturnPath(attempt.id);
  const cancelPath = esimPurchasePaymentCancelPath(attempt.id);

  const existingRef = (attempt.gatewayPaymentRef ?? "").trim();
  const canResumeTracker =
    Boolean(existingRef) &&
    (attempt.status === EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT ||
      attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING ||
      attempt.status === EsimPurchasePaymentAttemptStatus.DRAFT);

  if (canResumeTracker && existingRef) {
    const resumed = await resumeSafepayHostedCheckout({
      trackerToken: existingRef,
      returnPath,
      cancelPath,
    });
    if (!resumed.ok) {
      throw new EsimPurchaseGatewayCheckoutError(
        resumed.code === "MISCONFIGURED" ||
          resumed.code === "GATEWAY_UNAVAILABLE"
          ? "GATEWAY_UNAVAILABLE"
          : "UNAVAILABLE",
        resumed.message
      );
    }

    await prisma.walletEsimPurchase.updateMany({
      where: {
        id: purchase.id,
        customerUserId,
        status: {
          in: [
            WalletEsimPurchaseStatus.READY,
            WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
          ],
        },
      },
      data: { status: WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT },
    });

    return {
      purchaseId: purchase.id,
      paymentAttemptId: attempt.id,
      checkoutUrl: resumed.checkoutUrl,
      reusedAttempt,
      reusedTracker: true,
    };
  }

  const adapter = getActivePaymentAdapter();
  let session;
  try {
    session = await adapter.createCheckoutSession({
      purpose: "ESIM_PURCHASE",
      customerUserId,
      purchaseId: purchase.id,
      paymentAttemptId: attempt.id,
      chargeAmountMinor: funding.gatewayAmountCents,
      chargeCurrency: currency,
      checkoutIdempotencyKey: checkoutKey,
      returnPath,
      cancelPath,
    });
  } catch {
    if (funding.walletAppliedCents > 0) {
      await releaseSplitReservationAfterSessionFailure({
        purchaseId: purchase.id,
        customerUserId,
        walletAppliedCents: funding.walletAppliedCents,
      }).catch(() => undefined);
    }
    throw new EsimPurchaseGatewayCheckoutError(
      "UNAVAILABLE",
      CARD_PAYMENT_UNAVAILABLE_MESSAGE
    );
  }

  if (!session.ok) {
    if (funding.walletAppliedCents > 0) {
      await releaseSplitReservationAfterSessionFailure({
        purchaseId: purchase.id,
        customerUserId,
        walletAppliedCents: funding.walletAppliedCents,
      }).catch(() => undefined);
    }
    throw new EsimPurchaseGatewayCheckoutError(
      session.code === "MISCONFIGURED" || session.code === "GATEWAY_UNAVAILABLE"
        ? "GATEWAY_UNAVAILABLE"
        : "UNAVAILABLE",
      session.message
    );
  }

  const providerRef = (session.providerPaymentRef ?? "").trim();
  if (!providerRef) {
    if (funding.walletAppliedCents > 0) {
      await releaseSplitReservationAfterSessionFailure({
        purchaseId: purchase.id,
        customerUserId,
        walletAppliedCents: funding.walletAppliedCents,
      }).catch(() => undefined);
    }
    throw new EsimPurchaseGatewayCheckoutError(
      "UNAVAILABLE",
      CARD_PAYMENT_UNAVAILABLE_MESSAGE
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.esimPurchasePaymentAttempt.update({
      where: { id: attempt!.id },
      data: {
        gatewayProvider: PaymentGatewayProvider.SAFEPAY,
        gatewayPaymentRef: providerRef,
        chargeCurrency: session.chargeCurrency,
        chargeAmountMinor: session.chargeAmountMinor,
        fxRateSnapshot: session.fxRateSnapshot,
        expiresAt: session.expiresAt,
        status: EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
        failureCategory: null,
        failureCode: null,
      },
    });

    await tx.walletEsimPurchase.updateMany({
      where: {
        id: purchase.id,
        customerUserId,
        status: {
          in: [
            WalletEsimPurchaseStatus.READY,
            WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
            WalletEsimPurchaseStatus.FUNDS_RESERVED,
          ],
        },
      },
      data: {
        status: WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
        gatewayAmountCents: funding.gatewayAmountCents,
        walletAppliedCents: funding.walletAppliedCents,
        useWallet: funding.useWallet,
        fundingSource,
      },
    });
  });

  return {
    purchaseId: purchase.id,
    paymentAttemptId: attempt.id,
    checkoutUrl: session.checkoutUrl,
    reusedAttempt,
    reusedTracker: false,
  };
}
