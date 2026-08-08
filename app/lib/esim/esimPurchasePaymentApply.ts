import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  OrderFundingSource,
  OrderStatus,
  PaymentGatewayProvider,
  Prisma,
  Role,
  WalletEsimPurchaseStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  refundReservedFundsInTx,
  reserveWalletPurchaseFundsInTx,
  WALLET_PURCHASE_COMPLETED,
  WALLET_PURCHASE_DEBIT_REF,
  WALLET_PURCHASE_RECONCILIATION,
} from "@/app/lib/esim/walletPurchase";
import { persistWalletPurchaseProviderObservation } from "@/app/lib/esim/providerResultPersist";
import { persistAssignedOrder } from "@/app/lib/orders/persistAssignedOrder";
import type { NormalizedPaymentEvent } from "@/app/lib/payments/types";
import { executeCreditCheckout } from "@/app/lib/vesim/creditCheckout";
import {
  sanitizeCountryHint,
  verifyOfferAuthoritative,
} from "@/app/lib/vesim/server";
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";

export const ESIM_PAYMENT_WEBHOOK_DUPLICATE = "esim.payment_webhook_duplicate";
export const ESIM_PAYMENT_CONFIRMED = "esim.payment_confirmed";
export const ESIM_PAYMENT_FAILED = "esim.payment_failed";
export const ESIM_PURCHASE_FUNDED = "esim.purchase_funded";

export type ApplyVerifiedEsimPaymentResult = {
  duplicate: boolean;
  purchaseId: string | null;
  paymentAttemptId: string | null;
  purchaseStatus: WalletEsimPurchaseStatus | null;
  attemptStatus: EsimPurchasePaymentAttemptStatus | null;
  outcome:
    | "funded"
    | "failed_released"
    | "reconciliation"
    | "ignored"
    | "duplicate";
};

function amountsMatch(input: {
  expectedAmount: number;
  expectedCurrency: string;
  eventAmount: number;
  eventCurrency: string;
}): boolean {
  return (
    input.expectedAmount === input.eventAmount &&
    input.expectedCurrency === input.eventCurrency.toUpperCase()
  );
}

/**
 * Apply a signature-verified Safepay event to an eSIM payment attempt.
 * Never call from browser return URLs.
 */
export async function applyVerifiedEsimPurchasePaymentEvent(
  event: NormalizedPaymentEvent
): Promise<ApplyVerifiedEsimPaymentResult> {
  if (!event.signatureVerified || event.provider !== "SAFEPAY") {
    return {
      duplicate: false,
      purchaseId: null,
      paymentAttemptId: null,
      purchaseStatus: null,
      attemptStatus: null,
      outcome: "ignored",
    };
  }
  if (event.purpose !== "ESIM_PURCHASE") {
    return {
      duplicate: false,
      purchaseId: null,
      paymentAttemptId: null,
      purchaseStatus: null,
      attemptStatus: null,
      outcome: "ignored",
    };
  }

  const eventId = event.eventId.trim();
  const tracker = (event.providerPaymentRef ?? "").trim();
  if (!eventId || !tracker) {
    return {
      duplicate: false,
      purchaseId: null,
      paymentAttemptId: null,
      purchaseStatus: null,
      attemptStatus: null,
      outcome: "ignored",
    };
  }

  const byEvent = await prisma.esimPurchasePaymentAttempt.findUnique({
    where: { webhookEventId: eventId },
    select: {
      id: true,
      purchaseId: true,
      status: true,
      purchase: { select: { status: true } },
    },
  });
  if (byEvent) {
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: ESIM_PAYMENT_WEBHOOK_DUPLICATE,
          targetType: "EsimPurchasePaymentAttempt",
          targetId: byEvent.id,
          metadata: {
            method: "verified_webhook",
            failureCategory: "duplicate_event",
          },
        },
      })
      .catch(() => undefined);

    if (
      event.paymentStatus === "confirmed" &&
      byEvent.purchase.status === WalletEsimPurchaseStatus.FUNDED
    ) {
      await fulfillFundedEsimPurchase(byEvent.purchaseId).catch(() => undefined);
    }

    return {
      duplicate: true,
      purchaseId: byEvent.purchaseId,
      paymentAttemptId: byEvent.id,
      purchaseStatus: byEvent.purchase.status,
      attemptStatus: byEvent.status,
      outcome: "duplicate",
    };
  }

  let attempt = await prisma.esimPurchasePaymentAttempt.findFirst({
    where: {
      gatewayPaymentRef: tracker,
      gatewayProvider: PaymentGatewayProvider.SAFEPAY,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      purchaseId: true,
      gatewayAmountCents: true,
      currency: true,
      chargeAmountMinor: true,
      chargeCurrency: true,
      status: true,
      webhookEventId: true,
      gatewayProvider: true,
      purchase: {
        select: {
          id: true,
          customerUserId: true,
          status: true,
          walletAppliedCents: true,
          gatewayAmountCents: true,
          debitTransactionId: true,
          priceCents: true,
          currency: true,
          offerId: true,
          destinationCode: true,
          fundingSource: true,
          orderId: true,
          providerOrderId: true,
          idempotencyKey: true,
        },
      },
    },
  });

  if (
    !attempt &&
    event.paymentAttemptId &&
    event.paymentAttemptId.length <= 64
  ) {
    attempt = await prisma.esimPurchasePaymentAttempt.findUnique({
      where: { id: event.paymentAttemptId },
      select: {
        id: true,
        purchaseId: true,
        gatewayAmountCents: true,
        currency: true,
        chargeAmountMinor: true,
        chargeCurrency: true,
        status: true,
        webhookEventId: true,
        gatewayProvider: true,
        purchase: {
          select: {
            id: true,
            customerUserId: true,
            status: true,
            walletAppliedCents: true,
            gatewayAmountCents: true,
            debitTransactionId: true,
            priceCents: true,
            currency: true,
            offerId: true,
            destinationCode: true,
            fundingSource: true,
            orderId: true,
            providerOrderId: true,
            idempotencyKey: true,
          },
        },
      },
    });
  }

  if (!attempt || attempt.gatewayProvider !== PaymentGatewayProvider.SAFEPAY) {
    return {
      duplicate: false,
      purchaseId: null,
      paymentAttemptId: null,
      purchaseStatus: null,
      attemptStatus: null,
      outcome: "ignored",
    };
  }

  const expectedAmount =
    attempt.chargeAmountMinor ?? attempt.gatewayAmountCents;
  const expectedCurrency = (
    attempt.chargeCurrency ??
    attempt.currency ??
    "USD"
  )
    .trim()
    .toUpperCase();

  const match = amountsMatch({
    expectedAmount,
    expectedCurrency,
    eventAmount: event.chargeAmountMinor,
    eventCurrency: event.chargeCurrency,
  });

  // Also accept authoritative USD gateway amount when quote snapshot differs.
  const usdMatch = amountsMatch({
    expectedAmount: attempt.gatewayAmountCents,
    expectedCurrency: (attempt.currency || "USD").trim().toUpperCase(),
    eventAmount: event.chargeAmountMinor,
    eventCurrency: event.chargeCurrency,
  });

  if (!match && !usdMatch) {
    await prisma.$transaction(async (tx) => {
      await tx.esimPurchasePaymentAttempt.update({
        where: { id: attempt!.id },
        data: {
          status: EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
          webhookEventId: eventId,
          failureCategory: "amount_currency_mismatch",
          failureCode: "webhook_mismatch",
          reconciliationState: "awaiting_manual_review",
        },
      });
      await tx.walletEsimPurchase.update({
        where: { id: attempt!.purchaseId },
        data: {
          status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
          failureCategory: "amount_currency_mismatch",
          failureCode: "webhook_mismatch",
          reconciliationState: "awaiting_manual_review",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: WALLET_PURCHASE_RECONCILIATION,
          targetType: "EsimPurchasePaymentAttempt",
          targetId: attempt!.id,
          metadata: {
            method: "verified_webhook",
            failureCategory: "amount_currency_mismatch",
          },
        },
      });
    });
    return {
      duplicate: false,
      purchaseId: attempt.purchaseId,
      paymentAttemptId: attempt.id,
      purchaseStatus: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
      attemptStatus: EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
      outcome: "reconciliation",
    };
  }

  if (event.paymentStatus === "failed") {
    return releaseOnGatewayFailure({
      attemptId: attempt.id,
      purchaseId: attempt.purchaseId,
      customerUserId: attempt.purchase.customerUserId,
      walletAppliedCents: attempt.purchase.walletAppliedCents,
      eventId,
      failureCategory: event.failureCategory || "payment_failed",
    });
  }

  if (event.paymentStatus !== "confirmed") {
    return {
      duplicate: false,
      purchaseId: attempt.purchaseId,
      paymentAttemptId: attempt.id,
      purchaseStatus: attempt.purchase.status,
      attemptStatus: attempt.status,
      outcome: "ignored",
    };
  }

  if (attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED) {
    if (attempt.purchase.status === WalletEsimPurchaseStatus.FUNDED) {
      await fulfillFundedEsimPurchase(attempt.purchaseId).catch(() => undefined);
    }
    return {
      duplicate: true,
      purchaseId: attempt.purchaseId,
      paymentAttemptId: attempt.id,
      purchaseStatus: attempt.purchase.status,
      attemptStatus: attempt.status,
      outcome: "duplicate",
    };
  }

  if (
    attempt.status === EsimPurchasePaymentAttemptStatus.REFUNDED ||
    attempt.status === EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED
  ) {
    return {
      duplicate: false,
      purchaseId: attempt.purchaseId,
      paymentAttemptId: attempt.id,
      purchaseStatus: attempt.purchase.status,
      attemptStatus: attempt.status,
      outcome: "reconciliation",
    };
  }

  const completedDebitTransactionId =
    attempt.purchase.debitTransactionId?.trim() || null;

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.esimPurchasePaymentAttempt.updateMany({
        where: {
          id: attempt!.id,
          webhookEventId: null,
          status: {
            in: [
              EsimPurchasePaymentAttemptStatus.DRAFT,
              EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
              EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
            ],
          },
        },
        data: {
          status: EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED,
          webhookEventId: eventId,
          paymentConfirmedAt: event.confirmedAt ?? new Date(),
          failureCategory: null,
          failureCode: null,
        },
      });
      if (claimed.count !== 1) {
        throw new Error("ATTEMPT_CLAIM_FAILED");
      }

      if (attempt!.purchase.debitTransactionId) {
        await tx.walletTransaction.updateMany({
          where: {
            id: attempt!.purchase.debitTransactionId,
            status: WalletTransactionStatus.PENDING,
          },
          data: { status: WalletTransactionStatus.COMPLETED },
        });
      }

      const funded = await tx.walletEsimPurchase.updateMany({
        where: {
          id: attempt!.purchaseId,
          status: {
            in: [
              WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
              WalletEsimPurchaseStatus.FUNDS_RESERVED,
              WalletEsimPurchaseStatus.READY,
            ],
          },
        },
        data: {
          status: WalletEsimPurchaseStatus.FUNDED,
          failureCategory: null,
          failureCode: null,
        },
      });
      if (funded.count !== 1) {
        const current = await tx.walletEsimPurchase.findUnique({
          where: { id: attempt!.purchaseId },
          select: { status: true },
        });
        if (current?.status !== WalletEsimPurchaseStatus.FUNDED) {
          throw new Error("PURCHASE_FUND_CLAIM_FAILED");
        }
      }

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: ESIM_PURCHASE_FUNDED,
          targetType: "WalletEsimPurchase",
          targetId: attempt!.purchaseId,
          metadata: {
            method: "verified_webhook",
            paymentAttemptId: attempt!.id,
            amountCents: attempt!.gatewayAmountCents,
            currency: attempt!.currency,
          },
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        duplicate: true,
        purchaseId: attempt.purchaseId,
        paymentAttemptId: attempt.id,
        purchaseStatus: attempt.purchase.status,
        attemptStatus: attempt.status,
        outcome: "duplicate",
      };
    }
    await prisma.walletEsimPurchase
      .update({
        where: { id: attempt.purchaseId },
        data: {
          status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
          failureCategory: "funding_finalize_failed",
          failureCode: "claim_failed",
          reconciliationState: "awaiting_manual_review",
        },
      })
      .catch(() => undefined);
    return {
      duplicate: false,
      purchaseId: attempt.purchaseId,
      paymentAttemptId: attempt.id,
      purchaseStatus: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
      attemptStatus: attempt.status,
      outcome: "reconciliation",
    };
  }

  // Post-commit only: notify completed split debit (never on PENDING reservation).
  // Exact-once is enforced by WalletTransaction.emailNotificationStatus claim.
  if (completedDebitTransactionId) {
    scheduleWalletTransactionNotification(completedDebitTransactionId);
  }

  await fulfillFundedEsimPurchase(attempt.purchaseId).catch(() => undefined);

  return {
    duplicate: false,
    purchaseId: attempt.purchaseId,
    paymentAttemptId: attempt.id,
    purchaseStatus: WalletEsimPurchaseStatus.FUNDED,
    attemptStatus: EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED,
    outcome: "funded",
  };
}

async function releaseOnGatewayFailure(options: {
  attemptId: string;
  purchaseId: string;
  customerUserId: string;
  walletAppliedCents: number;
  eventId: string;
  failureCategory: string;
}): Promise<ApplyVerifiedEsimPaymentResult> {
  let releasedRefundId: string | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.esimPurchasePaymentAttempt.updateMany({
      where: {
        id: options.attemptId,
        status: {
          in: [
            EsimPurchasePaymentAttemptStatus.DRAFT,
            EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
            EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
          ],
        },
      },
      data: {
        status: EsimPurchasePaymentAttemptStatus.FAILED,
        webhookEventId: options.eventId,
        failedAt: new Date(),
        failureCategory: options.failureCategory,
        failureCode: "payment_failed",
      },
    });

    if (options.walletAppliedCents > 0) {
      const release = await refundReservedFundsInTx(tx, {
        purchaseId: options.purchaseId,
        customerUserId: options.customerUserId,
        actorUserId: options.customerUserId,
        assisted: false,
        priceCents: options.walletAppliedCents,
        restoreReady: true,
      });
      if (release.outcome === "created") {
        releasedRefundId = release.refundTransactionId;
      }
    } else {
      await tx.walletEsimPurchase.updateMany({
        where: {
          id: options.purchaseId,
          status: WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
        },
        data: {
          status: WalletEsimPurchaseStatus.READY,
          failureCategory: null,
          failureCode: null,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: ESIM_PAYMENT_FAILED,
        targetType: "EsimPurchasePaymentAttempt",
        targetId: options.attemptId,
        metadata: {
          method: "verified_webhook",
          failureCategory: options.failureCategory,
        },
      },
    });
  });

  if (releasedRefundId) {
    scheduleWalletTransactionNotification(releasedRefundId);
  }

  return {
    duplicate: false,
    purchaseId: options.purchaseId,
    paymentAttemptId: options.attemptId,
    purchaseStatus: WalletEsimPurchaseStatus.READY,
    attemptStatus: EsimPurchasePaymentAttemptStatus.FAILED,
    outcome: "failed_released",
  };
}

/**
 * Exact-once VeSIM order after purchase is FUNDED.
 * Duplicate webhooks/retries are safe; never creates provider order before FUNDED.
 */
export async function fulfillFundedEsimPurchase(
  purchaseId: string
): Promise<{ ok: boolean; duplicate?: boolean; orderId?: string | null }> {
  const id = purchaseId.trim();
  if (!id) return { ok: false };

  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      status: true,
      orderId: true,
      providerOrderId: true,
      offerId: true,
      destinationCode: true,
      priceCents: true,
      currency: true,
      fundingSource: true,
      debitTransactionId: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
      customer: {
        select: { id: true, email: true, role: true, deletedAt: true },
      },
    },
  });

  if (!purchase || !purchase.customer) return { ok: false };
  if (
    purchase.customer.deletedAt ||
    purchase.customer.role !== Role.CUSTOMER ||
    !purchase.customer.email
  ) {
    return { ok: false };
  }

  if (
    purchase.status === WalletEsimPurchaseStatus.COMPLETED &&
    purchase.orderId
  ) {
    return { ok: true, duplicate: true, orderId: purchase.orderId };
  }

  if (purchase.status === WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED) {
    return { ok: false };
  }

  if (purchase.status === WalletEsimPurchaseStatus.PROVIDER_PENDING) {
    // In-flight or crash after claim — do not blind-retry provider.
    return { ok: false };
  }

  if (purchase.status !== WalletEsimPurchaseStatus.FUNDED) {
    return { ok: false };
  }

  const claimed = await prisma.walletEsimPurchase.updateMany({
    where: {
      id: purchase.id,
      status: WalletEsimPurchaseStatus.FUNDED,
    },
    data: { status: WalletEsimPurchaseStatus.PROVIDER_PENDING },
  });
  if (claimed.count !== 1) {
    const again = await prisma.walletEsimPurchase.findUnique({
      where: { id: purchase.id },
      select: { status: true, orderId: true },
    });
    if (
      again?.status === WalletEsimPurchaseStatus.COMPLETED &&
      again.orderId
    ) {
      return { ok: true, duplicate: true, orderId: again.orderId };
    }
    return { ok: false };
  }

  const verifiedOffer = await verifyOfferAuthoritative({
    offerId: purchase.offerId,
    countryHint: sanitizeCountryHint(purchase.destinationCode),
  });
  if (!verifiedOffer) {
    await prisma.walletEsimPurchase.update({
      where: { id: purchase.id },
      data: {
        status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
        failureCategory: "offer_unavailable_after_funding",
        failureCode: "offer_missing",
        reconciliationState: "awaiting_manual_review",
      },
    });
    return { ok: false };
  }

  const checkout = await executeCreditCheckout({
    offerId: verifiedOffer.offerId,
    customerEmail: purchase.customer.email,
  });

  if (checkout.kind !== "success") {
    if (checkout.kind === "uncertain" || checkout.kind === "declined") {
      await persistWalletPurchaseProviderObservation(purchase.id, {
        providerOrderId:
          checkout.kind === "uncertain"
            ? checkout.providerOrderId ?? null
            : null,
        providerResultKind:
          checkout.kind === "declined" ? "declined" : "uncertain",
        safeProviderStatusCode:
          checkout.kind === "declined"
            ? `http_${checkout.httpStatus}`
            : checkout.code,
      }).catch(() => undefined);
    }
    await prisma.walletEsimPurchase.update({
      where: { id: purchase.id },
      data: {
        status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
        failureCategory:
          checkout.kind === "declined"
            ? "provider_declined_after_funding"
            : checkout.category,
        failureCode:
          checkout.kind === "declined"
            ? `http_${checkout.httpStatus}`
            : checkout.code,
        reconciliationState: "awaiting_manual_review",
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: WALLET_PURCHASE_RECONCILIATION,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: "verified_webhook",
            failureCategory: "provider_after_funding",
          },
        },
      })
      .catch(() => undefined);
    return { ok: false };
  }

  try {
    const orderId = await prisma.$transaction(async (tx) => {
      const current = await tx.walletEsimPurchase.findUnique({
        where: { id: purchase.id },
        select: { status: true, orderId: true },
      });
      if (
        current?.status === WalletEsimPurchaseStatus.COMPLETED &&
        current.orderId
      ) {
        return current.orderId;
      }
      if (current?.status !== WalletEsimPurchaseStatus.PROVIDER_PENDING) {
        throw new Error("INVALID_FINALIZE_STATE");
      }

      const order = await persistAssignedOrder(tx, {
        providerOrderId: checkout.providerOrderId,
        customerUserId: purchase.customerUserId,
        customerEmail: purchase.customer.email,
        verifiedOffer,
        fundingSource: purchase.fundingSource,
        status: OrderStatus.COMPLETED,
        checkoutPayload: checkout.payload,
      });

      if (purchase.debitTransactionId) {
        await tx.walletTransaction.updateMany({
          where: { id: purchase.debitTransactionId },
          data: { status: WalletTransactionStatus.COMPLETED },
        });
      }

      await tx.walletEsimPurchase.update({
        where: { id: purchase.id },
        data: {
          status: WalletEsimPurchaseStatus.COMPLETED,
          orderId: order.id,
          providerOrderId: order.providerOrderId,
          providerResultKind: "success",
          completedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: WALLET_PURCHASE_COMPLETED,
          targetType: "WalletEsimPurchase",
          targetId: purchase.id,
          metadata: {
            method: "verified_webhook",
            orderId: order.id,
            fundingSource: purchase.fundingSource,
          },
        },
      });

      return order.id;
    });

    return { ok: true, orderId };
  } catch {
    await prisma.walletEsimPurchase
      .update({
        where: { id: purchase.id },
        data: {
          status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
          failureCategory: "local_finalize_failed",
          failureCode: "after_provider_success",
          reconciliationState: "awaiting_manual_review",
          providerOrderId: checkout.providerOrderId,
        },
      })
      .catch(() => undefined);
    return { ok: false };
  }
}

/**
 * Idempotent release of a still-pending split reservation when cancel is authenticated.
 * Never marks gateway payment failed if a success webhook may still arrive —
 * only releases wallet when attempt is not payment-confirmed.
 */
export async function maybeReleasePendingGatewayReservation(options: {
  customerUserId: string;
  purchaseId: string;
  attemptId: string;
}): Promise<{ released: boolean }> {
  const customerUserId = options.customerUserId.trim();
  const purchaseId = options.purchaseId.trim();
  const attemptId = options.attemptId.trim();
  if (!customerUserId || !purchaseId || !attemptId) {
    return { released: false };
  }

  const attempt = await prisma.esimPurchasePaymentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      purchaseId: true,
      purchase: {
        select: {
          id: true,
          customerUserId: true,
          status: true,
          walletAppliedCents: true,
          debitTransactionId: true,
        },
      },
    },
  });

  if (
    !attempt ||
    attempt.purchaseId !== purchaseId ||
    attempt.purchase.customerUserId !== customerUserId
  ) {
    return { released: false };
  }

  if (
    attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED ||
    attempt.purchase.status === WalletEsimPurchaseStatus.FUNDED ||
    attempt.purchase.status === WalletEsimPurchaseStatus.COMPLETED ||
    attempt.purchase.status === WalletEsimPurchaseStatus.PROVIDER_PENDING
  ) {
    return { released: false };
  }

  if (
    attempt.purchase.walletAppliedCents <= 0 ||
    !attempt.purchase.debitTransactionId ||
    attempt.purchase.status !== WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT
  ) {
    return { released: false };
  }

  let releasedRefundId: string | null = null;
  await prisma.$transaction(async (tx) => {
    const release = await refundReservedFundsInTx(tx, {
      purchaseId,
      customerUserId,
      actorUserId: customerUserId,
      assisted: false,
      priceCents: attempt.purchase.walletAppliedCents,
      restoreReady: true,
    });
    if (release.outcome === "created") {
      releasedRefundId = release.refundTransactionId;
    }
  });
  if (releasedRefundId) {
    scheduleWalletTransactionNotification(releasedRefundId);
  }
  return { released: true };
}

/**
 * Exact-once debit key for a split reservation.
 * After a prior release, `debit_${purchaseId}` remains on the REVERSED row —
 * allocate `debit_${purchaseId}:N` so READY retries can reserve again once.
 */
async function splitReservationDebitIdempotencyKey(
  tx: Prisma.TransactionClient,
  purchaseId: string
): Promise<
  | { kind: "create"; debitKey: string }
  | { kind: "reuse_pending"; debitTransactionId: string }
> {
  const baseKey = `debit_${purchaseId}`.slice(0, 128);
  const existing = await tx.walletTransaction.findUnique({
    where: { idempotencyKey: baseKey },
    select: { id: true, status: true },
  });
  if (!existing) {
    return { kind: "create", debitKey: baseKey };
  }
  if (existing.status === WalletTransactionStatus.PENDING) {
    return { kind: "reuse_pending", debitTransactionId: existing.id };
  }
  const priorCount = await tx.walletTransaction.count({
    where: {
      referenceType: WALLET_PURCHASE_DEBIT_REF,
      referenceId: purchaseId,
      type: WalletTransactionType.PURCHASE_DEBIT,
    },
  });
  return {
    kind: "create",
    debitKey: `debit_${purchaseId}:${priorCount + 1}`.slice(0, 128),
  };
}

/** Used by gateway checkout to reserve split wallet funds before redirect. */
export async function reserveSplitWalletBeforeGatewayCheckout(options: {
  purchaseId: string;
  customerUserId: string;
  walletAppliedCents: number;
  gatewayAmountCents: number;
  useWallet: boolean;
}): Promise<{ debitTransactionId: string | null; alreadyReserved: boolean }> {
  const walletAppliedCents = options.walletAppliedCents;
  if (!Number.isInteger(walletAppliedCents) || walletAppliedCents < 0) {
    throw new Error("INVALID_WALLET_AMOUNT");
  }
  if (walletAppliedCents === 0) {
    return { debitTransactionId: null, alreadyReserved: false };
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.walletEsimPurchase.findUnique({
      where: { id: options.purchaseId },
      select: {
        id: true,
        customerUserId: true,
        status: true,
        debitTransactionId: true,
        walletAppliedCents: true,
      },
    });
    if (!current || current.customerUserId !== options.customerUserId) {
      throw new Error("PURCHASE_UNAVAILABLE");
    }

    if (
      current.debitTransactionId &&
      (current.status === WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT ||
        current.status === WalletEsimPurchaseStatus.FUNDS_RESERVED)
    ) {
      return {
        debitTransactionId: current.debitTransactionId,
        alreadyReserved: true,
      };
    }

    if (
      current.status !== WalletEsimPurchaseStatus.READY &&
      current.status !== WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT
    ) {
      throw new Error("INVALID_PURCHASE_STATE");
    }

    const debitKeyPlan = await splitReservationDebitIdempotencyKey(
      tx,
      options.purchaseId
    );
    if (debitKeyPlan.kind === "reuse_pending") {
      await tx.walletEsimPurchase.update({
        where: { id: options.purchaseId },
        data: {
          status: WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
          debitTransactionId: debitKeyPlan.debitTransactionId,
          useWallet: options.useWallet,
          walletAppliedCents,
          gatewayAmountCents: options.gatewayAmountCents,
          fundingSource: OrderFundingSource.CUSTOMER_SPLIT,
        },
      });
      return {
        debitTransactionId: debitKeyPlan.debitTransactionId,
        alreadyReserved: true,
      };
    }

    const claimed = await tx.walletEsimPurchase.updateMany({
      where: {
        id: options.purchaseId,
        customerUserId: options.customerUserId,
        status: {
          in: [
            WalletEsimPurchaseStatus.READY,
            WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
          ],
        },
        debitTransactionId: null,
      },
      data: {
        status: WalletEsimPurchaseStatus.FUNDS_RESERVED,
        useWallet: options.useWallet,
        walletAppliedCents,
        gatewayAmountCents: options.gatewayAmountCents,
        fundingSource: OrderFundingSource.CUSTOMER_SPLIT,
      },
    });

    if (claimed.count !== 1) {
      const again = await tx.walletEsimPurchase.findUnique({
        where: { id: options.purchaseId },
        select: { debitTransactionId: true, status: true },
      });
      if (again?.debitTransactionId) {
        return {
          debitTransactionId: again.debitTransactionId,
          alreadyReserved: true,
        };
      }
      throw new Error("RESERVE_CLAIM_FAILED");
    }

    const reserved = await reserveWalletPurchaseFundsInTx(tx, {
      purchaseId: options.purchaseId,
      customerUserId: options.customerUserId,
      amountCents: walletAppliedCents,
      debitIdempotencyKey: debitKeyPlan.debitKey,
    });

    await tx.walletEsimPurchase.update({
      where: { id: options.purchaseId },
      data: {
        status: WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
        debitTransactionId: reserved.debitTransactionId,
      },
    });

    return {
      debitTransactionId: reserved.debitTransactionId,
      alreadyReserved: false,
    };
  });
}

export async function releaseSplitReservationAfterSessionFailure(options: {
  purchaseId: string;
  customerUserId: string;
  walletAppliedCents: number;
}): Promise<void> {
  if (options.walletAppliedCents <= 0) return;
  let releasedRefundId: string | null = null;
  await prisma.$transaction(async (tx) => {
    const release = await refundReservedFundsInTx(tx, {
      purchaseId: options.purchaseId,
      customerUserId: options.customerUserId,
      actorUserId: options.customerUserId,
      assisted: false,
      priceCents: options.walletAppliedCents,
      restoreReady: true,
    });
    if (release.outcome === "created") {
      releasedRefundId = release.refundTransactionId;
    }
  });
  if (releasedRefundId) {
    scheduleWalletTransactionNotification(releasedRefundId);
  }
}
