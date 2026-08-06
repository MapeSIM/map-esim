import "server-only";

import {
  PaymentGatewayProvider,
  Prisma,
  Role,
  WalletDirection,
  WalletTopupStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import type { NormalizedPaymentEvent } from "@/app/lib/payments/adapter";
import { getActivePaymentAdapter } from "@/app/lib/payments/disabledAdapter";
import {
  WALLET_TOPUP_MAX_CENTS,
  WALLET_TOPUP_MIN_CENTS,
} from "@/app/lib/wallet/amount";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";
import {
  TOPUP_CREDIT_REFERENCE_TYPE,
  TOPUP_CREDITED,
  TOPUP_DRAFT_CREATED,
  TOPUP_FAILED,
  TOPUP_PAYMENT_CONFIRMED,
  TOPUP_PAYMENT_PENDING,
  TOPUP_RECONCILIATION,
  TOPUP_WEBHOOK_DUPLICATE,
} from "@/app/lib/wallet/topupConstants";

export {
  TOPUP_CREDIT_REFERENCE_TYPE,
  TOPUP_CHECKOUT_CREATED,
  TOPUP_CREDITED,
  TOPUP_DRAFT_CREATED,
  TOPUP_FAILED,
  TOPUP_PAYMENT_CONFIRMED,
  TOPUP_PAYMENT_PENDING,
  TOPUP_RECONCILIATION,
  TOPUP_WEBHOOK_DUPLICATE,
  browserReturnMustNotCreditWallet,
} from "@/app/lib/wallet/topupConstants";

export type CreateWalletTopupDraftInput = {
  customerUserId: string;
  creditAmountCents: number;
  checkoutIdempotencyKey: string;
};

export type CreateWalletTopupDraftResult = {
  duplicate: boolean;
  topupId: string;
  creditAmountCents: number;
  creditAmountLabel: string;
  status: WalletTopupStatus;
};

export type ApplyVerifiedTopupPaymentResult = {
  duplicate: boolean;
  topupId: string;
  status: WalletTopupStatus;
  walletTransactionId: string | null;
  creditAmountCents: number | null;
};

export class WalletTopupError extends Error {
  readonly code:
    | "CUSTOMER_UNAVAILABLE"
    | "WALLET_UNAVAILABLE"
    | "INVALID_AMOUNT"
    | "INVALID_IDEMPOTENCY"
    | "GATEWAY_UNAVAILABLE"
    | "TOPUP_UNAVAILABLE"
    | "UNAVAILABLE";

  constructor(code: WalletTopupError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "WalletTopupError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function providerFromEvent(
  name: NormalizedPaymentEvent["provider"]
): PaymentGatewayProvider | null {
  switch (name) {
    case "SIMPAISA":
      return PaymentGatewayProvider.SIMPAISA;
    case "PAYFAST":
      return PaymentGatewayProvider.PAYFAST;
    case "SAFEPAY":
      return PaymentGatewayProvider.SAFEPAY;
    case "JAZZCASH":
      return PaymentGatewayProvider.JAZZCASH;
    case "EASYPAISA":
      return PaymentGatewayProvider.EASYPAISA;
    case "MANUAL_TEST":
      return PaymentGatewayProvider.MANUAL_TEST;
    default:
      return null;
  }
}

async function assertActiveCustomer(customerUserId: string) {
  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    throw new WalletTopupError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for wallet top-ups."
    );
  }
  return customer;
}

/**
 * Create a DRAFT top-up for an active CUSTOMER with an existing wallet.
 * Does not invent PKR amounts, call gateways, or credit the wallet.
 */
export async function createWalletTopupDraft(
  input: CreateWalletTopupDraftInput
): Promise<CreateWalletTopupDraftResult> {
  const customerUserId = input.customerUserId.trim();
  const idempotencyKey = input.checkoutIdempotencyKey.trim();
  const creditAmountCents = input.creditAmountCents;

  if (!customerUserId || customerUserId.length > 64) {
    throw new WalletTopupError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for wallet top-ups."
    );
  }
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new WalletTopupError(
      "INVALID_IDEMPOTENCY",
      "This top-up request could not be processed. Please reload and try again."
    );
  }
  if (
    !Number.isInteger(creditAmountCents) ||
    !Number.isSafeInteger(creditAmountCents) ||
    creditAmountCents < WALLET_TOPUP_MIN_CENTS ||
    creditAmountCents > WALLET_TOPUP_MAX_CENTS
  ) {
    throw new WalletTopupError(
      "INVALID_AMOUNT",
      "Enter a top-up amount between $10.00 and $500.00."
    );
  }

  const existing = await prisma.walletTopup.findUnique({
    where: { checkoutIdempotencyKey: idempotencyKey },
    select: {
      id: true,
      customerUserId: true,
      creditAmountCents: true,
      status: true,
    },
  });
  if (existing) {
    if (existing.customerUserId !== customerUserId) {
      throw new WalletTopupError(
        "INVALID_IDEMPOTENCY",
        "This top-up request could not be processed. Please reload and try again."
      );
    }
    return {
      duplicate: true,
      topupId: existing.id,
      creditAmountCents: existing.creditAmountCents,
      creditAmountLabel: formatUsdCents(existing.creditAmountCents),
      status: existing.status,
    };
  }

  await assertActiveCustomer(customerUserId);

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: customerUserId },
    select: { id: true },
  });
  if (!wallet) {
    throw new WalletTopupError(
      "WALLET_UNAVAILABLE",
      "A wallet is required before you can add funds."
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const topup = await tx.walletTopup.create({
        data: {
          customerUserId,
          creditAmountCents,
          chargeCurrency: null,
          chargeAmountMinor: null,
          fxRateSnapshot: null,
          gatewayProvider: null,
          status: WalletTopupStatus.DRAFT,
          checkoutIdempotencyKey: idempotencyKey,
        },
        select: {
          id: true,
          creditAmountCents: true,
          status: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: customerUserId,
          action: TOPUP_DRAFT_CREATED,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "customer_wallet_topup",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            failureCategory: null,
          },
        },
      });

      return topup;
    });

    return {
      duplicate: false,
      topupId: created.id,
      creditAmountCents: created.creditAmountCents,
      creditAmountLabel: formatUsdCents(created.creditAmountCents),
      status: created.status,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = await prisma.walletTopup.findUnique({
        where: { checkoutIdempotencyKey: idempotencyKey },
        select: {
          id: true,
          customerUserId: true,
          creditAmountCents: true,
          status: true,
        },
      });
      if (again && again.customerUserId === customerUserId) {
        return {
          duplicate: true,
          topupId: again.id,
          creditAmountCents: again.creditAmountCents,
          creditAmountLabel: formatUsdCents(again.creditAmountCents),
          status: again.status,
        };
      }
    }
    throw new WalletTopupError(
      "UNAVAILABLE",
      "Wallet top-up is temporarily unavailable. Please try again shortly."
    );
  }
}

/**
 * Mark an awaiting/draft top-up EXPIRED. Never credits the wallet.
 */
export async function expireWalletTopupCheckout(options: {
  topupId: string;
}): Promise<{ topupId: string; status: WalletTopupStatus }> {
  const topupId = options.topupId.trim();
  if (!topupId || topupId.length > 64) {
    throw new WalletTopupError("TOPUP_UNAVAILABLE", "This top-up is unavailable.");
  }

  const updated = await prisma.walletTopup.updateMany({
    where: {
      id: topupId,
      status: {
        in: [
          WalletTopupStatus.DRAFT,
          WalletTopupStatus.AWAITING_PAYMENT,
          WalletTopupStatus.PAYMENT_PENDING,
        ],
      },
      walletTransactionId: null,
    },
    data: {
      status: WalletTopupStatus.EXPIRED,
      failureCategory: "checkout_expired",
    },
  });

  if (updated.count !== 1) {
    const current = await prisma.walletTopup.findUnique({
      where: { id: topupId },
      select: { id: true, status: true },
    });
    if (!current) {
      throw new WalletTopupError("TOPUP_UNAVAILABLE", "This top-up is unavailable.");
    }
    return { topupId: current.id, status: current.status };
  }

  return { topupId, status: WalletTopupStatus.EXPIRED };
}

/**
 * Attempt gateway checkout for a DRAFT/AWAITING top-up.
 * Phase 6A always fails safely via the disabled adapter — no FX invention, no credit.
 */
export async function startWalletTopupCheckout(options: {
  customerUserId: string;
  topupId: string;
}): Promise<never> {
  const customerUserId = options.customerUserId.trim();
  const topupId = options.topupId.trim();
  await assertActiveCustomer(customerUserId);

  const topup = await prisma.walletTopup.findUnique({
    where: { id: topupId },
    select: {
      id: true,
      customerUserId: true,
      creditAmountCents: true,
      checkoutIdempotencyKey: true,
      status: true,
    },
  });
  if (!topup || topup.customerUserId !== customerUserId) {
    throw new WalletTopupError("TOPUP_UNAVAILABLE", "This top-up is unavailable.");
  }
  if (
    topup.status !== WalletTopupStatus.DRAFT &&
    topup.status !== WalletTopupStatus.AWAITING_PAYMENT
  ) {
    throw new WalletTopupError(
      "TOPUP_UNAVAILABLE",
      "This top-up cannot start checkout in its current state."
    );
  }

  const adapter = getActivePaymentAdapter();
  const result = await adapter.createCheckoutSession({
    localTopupId: topup.id,
    customerUserId,
    creditAmountCents: topup.creditAmountCents,
    checkoutIdempotencyKey: topup.checkoutIdempotencyKey,
    returnPath: `/account/wallet/top-up/${topup.id}`,
    cancelPath: `/account/wallet/top-up/${topup.id}`,
  });

  if (!result.ok) {
    throw new WalletTopupError("GATEWAY_UNAVAILABLE", result.message);
  }

  // Real adapters would persist quote + AWAITING_PAYMENT here in a later phase.
  throw new WalletTopupError(
    "GATEWAY_UNAVAILABLE",
    "Payment gateway is not available yet. Please try again after payment provider setup is complete."
  );
}

/**
 * Credit a wallet only from a normalized, signature-verified payment event.
 * Browser return URLs, query params, and client status must never call this.
 * MANUAL_TEST must never credit real customer wallets.
 */
export async function applyVerifiedTopupPaymentEvent(
  event: NormalizedPaymentEvent
): Promise<ApplyVerifiedTopupPaymentResult> {
  if (!event.signatureVerified) {
    throw new WalletTopupError(
      "UNAVAILABLE",
      "Payment event could not be verified."
    );
  }

  const provider = providerFromEvent(event.provider);
  if (!provider || provider === PaymentGatewayProvider.MANUAL_TEST) {
    throw new WalletTopupError(
      "UNAVAILABLE",
      "Payment provider is not approved for wallet credit."
    );
  }

  const eventId = event.eventId.trim();
  const localTopupId = event.localTopupId.trim();
  if (!eventId || eventId.length > 190 || !localTopupId || localTopupId.length > 64) {
    throw new WalletTopupError("TOPUP_UNAVAILABLE", "Payment event is invalid.");
  }

  if (
    !Number.isInteger(event.chargeAmountMinor) ||
    event.chargeAmountMinor < 0 ||
    !event.chargeCurrency.trim()
  ) {
    throw new WalletTopupError("TOPUP_UNAVAILABLE", "Payment event is invalid.");
  }

  const byEvent = await prisma.walletTopup.findUnique({
    where: { webhookEventId: eventId },
    select: {
      id: true,
      status: true,
      walletTransactionId: true,
      creditAmountCents: true,
    },
  });
  if (byEvent) {
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: TOPUP_WEBHOOK_DUPLICATE,
          targetType: "WalletTopup",
          targetId: byEvent.id,
          metadata: {
            method: "verified_webhook",
            amountCents: byEvent.creditAmountCents,
            currency: "USD",
            walletTransactionId: byEvent.walletTransactionId,
            failureCategory: "duplicate_event",
          },
        },
      })
      .catch(() => undefined);

    return {
      duplicate: true,
      topupId: byEvent.id,
      status: byEvent.status,
      walletTransactionId: byEvent.walletTransactionId,
      creditAmountCents: byEvent.creditAmountCents,
    };
  }

  const topup = await prisma.walletTopup.findUnique({
    where: { id: localTopupId },
    select: {
      id: true,
      customerUserId: true,
      creditAmountCents: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      status: true,
      walletTransactionId: true,
      webhookEventId: true,
    },
  });
  if (!topup) {
    throw new WalletTopupError("TOPUP_UNAVAILABLE", "Top-up was not found.");
  }

  if (topup.status === WalletTopupStatus.CREDITED) {
    return {
      duplicate: true,
      topupId: topup.id,
      status: topup.status,
      walletTransactionId: topup.walletTransactionId,
      creditAmountCents: topup.creditAmountCents,
    };
  }

  const customer = await prisma.user.findUnique({
    where: { id: topup.customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    throw new WalletTopupError(
      "CUSTOMER_UNAVAILABLE",
      "Customer is unavailable for wallet top-up credit."
    );
  }

  const pendingAllowed =
    topup.status === WalletTopupStatus.AWAITING_PAYMENT ||
    topup.status === WalletTopupStatus.PAYMENT_PENDING ||
    topup.status === WalletTopupStatus.PAYMENT_CONFIRMED;

  if (event.paymentStatus === "pending") {
    if (pendingAllowed || topup.status === WalletTopupStatus.DRAFT) {
      await prisma.walletTopup.update({
        where: { id: topup.id },
        data: {
          status: WalletTopupStatus.PAYMENT_PENDING,
          gatewayProvider: provider,
          gatewayPaymentRef: event.providerPaymentRef,
          webhookEventId: eventId,
          failureCategory: null,
        },
      });
      await prisma.auditLog
        .create({
          data: {
            actorUserId: null,
            action: TOPUP_PAYMENT_PENDING,
            targetType: "WalletTopup",
            targetId: topup.id,
            metadata: {
              method: "verified_webhook",
              amountCents: topup.creditAmountCents,
              currency: "USD",
              failureCategory: "payment_pending",
            },
          },
        })
        .catch(() => undefined);
    }
    return {
      duplicate: false,
      topupId: topup.id,
      status: WalletTopupStatus.PAYMENT_PENDING,
      walletTransactionId: null,
      creditAmountCents: null,
    };
  }

  if (event.paymentStatus === "failed") {
    await prisma.walletTopup.update({
      where: { id: topup.id },
      data: {
        status: WalletTopupStatus.FAILED,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        webhookEventId: eventId,
        failureCategory: event.failureCategory || "payment_failed",
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: TOPUP_FAILED,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            failureCategory: event.failureCategory || "payment_failed",
          },
        },
      })
      .catch(() => undefined);
    return {
      duplicate: false,
      topupId: topup.id,
      status: WalletTopupStatus.FAILED,
      walletTransactionId: null,
      creditAmountCents: null,
    };
  }

  if (event.paymentStatus === "uncertain") {
    await prisma.walletTopup.update({
      where: { id: topup.id },
      data: {
        status: WalletTopupStatus.RECONCILIATION_REQUIRED,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        webhookEventId: eventId,
        failureCategory: event.failureCategory || "uncertain_payment",
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: TOPUP_RECONCILIATION,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            failureCategory: event.failureCategory || "uncertain_payment",
          },
        },
      })
      .catch(() => undefined);
    return {
      duplicate: false,
      topupId: topup.id,
      status: WalletTopupStatus.RECONCILIATION_REQUIRED,
      walletTransactionId: null,
      creditAmountCents: null,
    };
  }

  // Confirmed payment path — exact charge snapshot match required.
  if (
    !pendingAllowed ||
    topup.chargeCurrency == null ||
    topup.chargeAmountMinor == null ||
    topup.gatewayProvider == null
  ) {
    await prisma.walletTopup.update({
      where: { id: topup.id },
      data: {
        status: WalletTopupStatus.RECONCILIATION_REQUIRED,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        webhookEventId: eventId,
        failureCategory: "missing_checkout_snapshot",
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: TOPUP_RECONCILIATION,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            failureCategory: "missing_checkout_snapshot",
          },
        },
      })
      .catch(() => undefined);
    return {
      duplicate: false,
      topupId: topup.id,
      status: WalletTopupStatus.RECONCILIATION_REQUIRED,
      walletTransactionId: null,
      creditAmountCents: null,
    };
  }

  if (
    topup.gatewayProvider !== provider ||
    topup.chargeCurrency !== event.chargeCurrency.trim().toUpperCase() ||
    topup.chargeAmountMinor !== event.chargeAmountMinor
  ) {
    await prisma.walletTopup.update({
      where: { id: topup.id },
      data: {
        status: WalletTopupStatus.RECONCILIATION_REQUIRED,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        webhookEventId: eventId,
        failureCategory: "charge_mismatch",
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: TOPUP_RECONCILIATION,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            failureCategory: "charge_mismatch",
          },
        },
      })
      .catch(() => undefined);
    return {
      duplicate: false,
      topupId: topup.id,
      status: WalletTopupStatus.RECONCILIATION_REQUIRED,
      walletTransactionId: null,
      creditAmountCents: null,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.walletTopup.updateMany({
        where: {
          id: topup.id,
          status: {
            in: [
              WalletTopupStatus.AWAITING_PAYMENT,
              WalletTopupStatus.PAYMENT_PENDING,
              WalletTopupStatus.PAYMENT_CONFIRMED,
            ],
          },
          walletTransactionId: null,
        },
        data: {
          status: WalletTopupStatus.PAYMENT_CONFIRMED,
          webhookEventId: eventId,
          gatewayPaymentRef: event.providerPaymentRef,
          paymentConfirmedAt: event.confirmedAt || new Date(),
        },
      });

      if (claimed.count !== 1) {
        const current = await tx.walletTopup.findUnique({
          where: { id: topup.id },
          select: {
            id: true,
            status: true,
            walletTransactionId: true,
            creditAmountCents: true,
          },
        });
        if (current?.status === WalletTopupStatus.CREDITED) {
          return {
            duplicate: true,
            topupId: current.id,
            status: current.status,
            walletTransactionId: current.walletTransactionId,
            creditAmountCents: current.creditAmountCents,
          };
        }
        throw new WalletTopupError(
          "TOPUP_UNAVAILABLE",
          "Top-up is not eligible for wallet credit."
        );
      }

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: TOPUP_PAYMENT_CONFIRMED,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
          },
        },
      });

      const wallet = await tx.walletAccount.findUnique({
        where: { userId: topup.customerUserId },
        select: { id: true, balanceCents: true },
      });
      if (!wallet) {
        throw new WalletTopupError(
          "WALLET_UNAVAILABLE",
          "A wallet is required before funds can be credited."
        );
      }

      const updated = await tx.walletAccount.update({
        where: { id: wallet.id },
        data: {
          balanceCents: { increment: topup.creditAmountCents },
          version: { increment: 1 },
        },
        select: { balanceCents: true },
      });

      if (
        !Number.isInteger(updated.balanceCents) ||
        updated.balanceCents < topup.creditAmountCents
      ) {
        throw new WalletTopupError(
          "UNAVAILABLE",
          "Wallet credit could not be completed."
        );
      }

      const ledger = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.TOPUP_CREDIT,
          direction: WalletDirection.CREDIT,
          status: WalletTransactionStatus.COMPLETED,
          amountCents: topup.creditAmountCents,
          balanceBeforeCents: wallet.balanceCents,
          balanceAfterCents: updated.balanceCents,
          idempotencyKey: `topup_${topup.id}`,
          referenceType: TOPUP_CREDIT_REFERENCE_TYPE,
          referenceId: topup.id,
        },
        select: { id: true },
      });

      await tx.walletTopup.update({
        where: { id: topup.id },
        data: {
          status: WalletTopupStatus.CREDITED,
          walletTransactionId: ledger.id,
          walletCreditedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: TOPUP_CREDITED,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            walletTransactionId: ledger.id,
          },
        },
      });

      return {
        duplicate: false,
        topupId: topup.id,
        status: WalletTopupStatus.CREDITED,
        walletTransactionId: ledger.id,
        creditAmountCents: topup.creditAmountCents,
      };
    });

    if (
      !result.duplicate &&
      result.status === WalletTopupStatus.CREDITED &&
      result.walletTransactionId
    ) {
      scheduleWalletTransactionNotification(result.walletTransactionId);
    }
    return result;
  } catch (error) {
    if (error instanceof WalletTopupError) throw error;
    if (isUniqueViolation(error)) {
      const credited = await prisma.walletTopup.findUnique({
        where: { id: topup.id },
        select: {
          id: true,
          status: true,
          walletTransactionId: true,
          creditAmountCents: true,
        },
      });
      if (credited) {
        return {
          duplicate: true,
          topupId: credited.id,
          status: credited.status,
          walletTransactionId: credited.walletTransactionId,
          creditAmountCents: credited.creditAmountCents,
        };
      }
    }
    throw new WalletTopupError(
      "UNAVAILABLE",
      "Wallet top-up credit is temporarily unavailable."
    );
  }
}
