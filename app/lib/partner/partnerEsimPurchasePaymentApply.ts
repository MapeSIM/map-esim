/**
 * Partner eSIM purchase payment apply (Phase 3).
 * Verified webhook only — never trust browser return.
 * Confirms PartnerEsimPurchasePaymentAttempt → FUNDED → VeSIM fulfill.
 * Never calls VeSIM before FUNDED. Idempotent on duplicate events.
 */
import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  PartnerEsimPurchaseStatus,
  PaymentGatewayProvider,
  Prisma,
  Role,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  PARTNER_ESIM_PAYMENT_EXPIRED,
  PARTNER_ESIM_PAYMENT_FAILED,
  PARTNER_ESIM_PAYMENT_RECONCILIATION,
  PARTNER_ESIM_PAYMENT_RESERVATION_RELEASED,
  PARTNER_ESIM_PAYMENT_WEBHOOK_DUPLICATE,
  PARTNER_ESIM_PURCHASE_FUNDED,
  parsePartnerEsimPurchaseAttemptIdFromMerchantUserKey,
} from "@/app/lib/partner/partnerEsimPurchasePaymentConstants";
import {
  executePartnerEsimProviderPurchase,
} from "@/app/lib/partner/partnerEsimPurchaseProvider";
import {
  releasePartnerGatewayReservationInTx,
} from "@/app/lib/partner/partnerPurchaseWallet";
import type { NormalizedPaymentEvent } from "@/app/lib/payments/types";

export type ApplyVerifiedPartnerEsimPaymentResult = {
  duplicate: boolean;
  purchaseId: string | null;
  paymentAttemptId: string | null;
  purchaseStatus: PartnerEsimPurchaseStatus | null;
  attemptStatus: EsimPurchasePaymentAttemptStatus | null;
  outcome:
    | "funded"
    | "duplicate"
    | "failed_refunded"
    | "reconciliation"
    | "ignored";
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

function isPurchaseSuccessTerminal(status: PartnerEsimPurchaseStatus): boolean {
  return (
    status === PartnerEsimPurchaseStatus.FUNDED ||
    status === PartnerEsimPurchaseStatus.PROVIDER_PENDING ||
    status === PartnerEsimPurchaseStatus.COMPLETED
  );
}

const ATTEMPT_OPEN: EsimPurchasePaymentAttemptStatus[] = [
  EsimPurchasePaymentAttemptStatus.DRAFT,
  EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
  EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
];

/**
 * Exact-once VeSIM after Partner purchase is FUNDED.
 * Duplicate webhooks/retries are safe; never creates provider order before FUNDED.
 */
export async function fulfillFundedPartnerEsimPurchase(
  purchaseId: string
): Promise<{ ok: boolean; duplicate?: boolean; orderId?: string | null }> {
  const id = purchaseId.trim();
  if (!id) return { ok: false };

  const purchase = await prisma.partnerEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      partnerId: true,
      status: true,
      orderId: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
      debitTransactionId: true,
      partner: {
        select: {
          userId: true,
          disabledAt: true,
          user: { select: { role: true, deletedAt: true } },
        },
      },
    },
  });
  if (!purchase?.partner?.userId) return { ok: false };
  if (
    purchase.partner.disabledAt ||
    purchase.partner.user.deletedAt ||
    purchase.partner.user.role !== Role.PARTNER
  ) {
    return { ok: false };
  }

  if (
    purchase.status === PartnerEsimPurchaseStatus.COMPLETED &&
    purchase.orderId
  ) {
    return { ok: true, duplicate: true, orderId: purchase.orderId };
  }

  if (purchase.status === PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED) {
    return { ok: false };
  }

  if (purchase.status === PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
    // In-flight — do not blind-retry from webhook.
    return { ok: false };
  }

  if (purchase.status !== PartnerEsimPurchaseStatus.FUNDED) {
    return { ok: false };
  }

  const claimed = await prisma.partnerEsimPurchase.updateMany({
    where: {
      id: purchase.id,
      status: PartnerEsimPurchaseStatus.FUNDED,
      orderId: null,
      refundTransactionId: null,
    },
    data: {
      status: PartnerEsimPurchaseStatus.PROVIDER_PENDING,
    },
  });
  if (claimed.count !== 1) {
    const again = await prisma.partnerEsimPurchase.findUnique({
      where: { id: purchase.id },
      select: { status: true, orderId: true },
    });
    if (
      again?.status === PartnerEsimPurchaseStatus.COMPLETED &&
      again.orderId
    ) {
      return { ok: true, duplicate: true, orderId: again.orderId };
    }
    if (again?.status === PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
      return { ok: false };
    }
    return { ok: false };
  }

  try {
    const executed = await executePartnerEsimProviderPurchase({
      partnerUserId: purchase.partner.userId,
      purchaseId: purchase.id,
    });
    return {
      ok: executed.status === PartnerEsimPurchaseStatus.COMPLETED,
      duplicate: executed.duplicate,
      orderId: executed.orderId,
    };
  } catch {
    return { ok: false };
  }
}

async function releaseOnGatewayFailure(options: {
  attemptId: string;
  purchaseId: string;
  partnerId: string;
  walletAppliedCents: number;
  eventId: string;
  failureCategory: string;
}): Promise<ApplyVerifiedPartnerEsimPaymentResult> {
  let claimed = false;
  let finalPurchaseStatus: PartnerEsimPurchaseStatus | null = null;
  let finalAttemptStatus: EsimPurchasePaymentAttemptStatus | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const attemptClaim = await tx.partnerEsimPurchasePaymentAttempt.updateMany({
        where: {
          id: options.attemptId,
          webhookEventId: null,
          status: { in: ATTEMPT_OPEN },
        },
        data: {
          status: EsimPurchasePaymentAttemptStatus.FAILED,
          webhookEventId: options.eventId,
          failedAt: new Date(),
          failureCategory: options.failureCategory,
          failureCode: "payment_failed",
        },
      });
      if (attemptClaim.count !== 1) {
        const current = await tx.partnerEsimPurchasePaymentAttempt.findUnique({
          where: { id: options.attemptId },
          select: {
            status: true,
            purchase: { select: { status: true } },
          },
        });
        finalAttemptStatus = current?.status ?? null;
        finalPurchaseStatus = current?.purchase.status ?? null;
        return;
      }
      claimed = true;

      // Restore READY (customer parity) so Partner can retry checkout.
      // Debit-scoped release keys allow a later reserve→release cycle.
      await releasePartnerGatewayReservationInTx(tx, {
        partnerId: options.partnerId,
        partnerEsimPurchaseId: options.purchaseId,
        amountCents: Math.max(0, options.walletAppliedCents),
      });

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: PARTNER_ESIM_PAYMENT_FAILED,
          targetType: "PartnerEsimPurchasePaymentAttempt",
          targetId: options.attemptId,
          metadata: {
            method: "verified_webhook",
            purchaseId: options.purchaseId,
            walletAppliedCents: options.walletAppliedCents,
            failureCategory: options.failureCategory,
            restoreReady: true,
          } satisfies Prisma.InputJsonValue,
        },
      });

      const after = await tx.partnerEsimPurchasePaymentAttempt.findUnique({
        where: { id: options.attemptId },
        select: {
          status: true,
          purchase: { select: { status: true } },
        },
      });
      finalAttemptStatus =
        after?.status ?? EsimPurchasePaymentAttemptStatus.FAILED;
      finalPurchaseStatus =
        after?.purchase.status ?? PartnerEsimPurchaseStatus.READY;
    });
  } catch {
    return {
      duplicate: false,
      purchaseId: options.purchaseId,
      paymentAttemptId: options.attemptId,
      purchaseStatus: null,
      attemptStatus: null,
      outcome: "reconciliation",
    };
  }

  if (!claimed) {
    return {
      duplicate:
        finalAttemptStatus === EsimPurchasePaymentAttemptStatus.FAILED ||
        finalAttemptStatus ===
          EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED,
      purchaseId: options.purchaseId,
      paymentAttemptId: options.attemptId,
      purchaseStatus: finalPurchaseStatus,
      attemptStatus: finalAttemptStatus,
      outcome:
        finalAttemptStatus ===
          EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED ||
        finalPurchaseStatus === PartnerEsimPurchaseStatus.FUNDED ||
        finalPurchaseStatus === PartnerEsimPurchaseStatus.PROVIDER_PENDING ||
        finalPurchaseStatus === PartnerEsimPurchaseStatus.COMPLETED
          ? "ignored"
          : "duplicate",
    };
  }

  return {
    duplicate: false,
    purchaseId: options.purchaseId,
    paymentAttemptId: options.attemptId,
    purchaseStatus: finalPurchaseStatus,
    attemptStatus: finalAttemptStatus,
    outcome: "failed_refunded",
  };
}

/**
 * Idempotent release of a still-pending Partner split reservation (cancel/abandon).
 * Never marks gateway payment confirmed and never funds from browser return.
 */
export async function maybeReleasePendingPartnerGatewayReservation(options: {
  partnerUserId: string;
  purchaseId: string;
  attemptId: string;
  /** When set, marks the open attempt CANCELLED / EXPIRED after release. */
  attemptTerminalStatus?:
    | "CANCELLED"
    | "EXPIRED";
}): Promise<{ released: boolean }> {
  const partnerUserId = options.partnerUserId.trim();
  const purchaseId = options.purchaseId.trim();
  const attemptId = options.attemptId.trim();
  if (!partnerUserId || !purchaseId || !attemptId) {
    return { released: false };
  }

  let released = false;

  await prisma.$transaction(async (tx) => {
    const attempt = await tx.partnerEsimPurchasePaymentAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        purchaseId: true,
        purchase: {
          select: {
            id: true,
            partnerId: true,
            status: true,
            walletAppliedCents: true,
            debitTransactionId: true,
            partner: {
              select: {
                userId: true,
                disabledAt: true,
                user: { select: { role: true, deletedAt: true } },
              },
            },
          },
        },
      },
    });

    if (
      !attempt ||
      attempt.purchaseId !== purchaseId ||
      attempt.purchase.partner.userId !== partnerUserId ||
      attempt.purchase.partner.user.deletedAt ||
      attempt.purchase.partner.user.role !== Role.PARTNER
    ) {
      return;
    }

    if (
      attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED ||
      attempt.purchase.status === PartnerEsimPurchaseStatus.FUNDED ||
      attempt.purchase.status === PartnerEsimPurchaseStatus.COMPLETED ||
      attempt.purchase.status === PartnerEsimPurchaseStatus.PROVIDER_PENDING ||
      attempt.purchase.status ===
        PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED
    ) {
      return;
    }

    const canRelease =
      attempt.purchase.status ===
        PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT ||
      attempt.purchase.status === PartnerEsimPurchaseStatus.FUNDS_RESERVED;

    if (canRelease) {
      const release = await releasePartnerGatewayReservationInTx(tx, {
        partnerId: attempt.purchase.partnerId,
        partnerEsimPurchaseId: purchaseId,
        amountCents: Math.max(0, attempt.purchase.walletAppliedCents),
      });

      if (
        release.outcome === "created" ||
        release.outcome === "linked_existing"
      ) {
        released = true;
      }
    }

    const purchaseAfter = await tx.partnerEsimPurchase.findUnique({
      where: { id: purchaseId },
      select: { status: true, debitTransactionId: true },
    });
    const purchaseReadyClean =
      purchaseAfter?.status === PartnerEsimPurchaseStatus.READY &&
      !purchaseAfter.debitTransactionId;

    // Never CANCELLED/EXPIRED an attempt if funding won the race.
    const terminal = options.attemptTerminalStatus;
    if (
      purchaseReadyClean &&
      (terminal === "CANCELLED" || terminal === "EXPIRED")
    ) {
      const attemptData =
        terminal === "CANCELLED"
          ? {
              status: EsimPurchasePaymentAttemptStatus.CANCELLED,
              cancelledAt: new Date(),
              failureCategory: "checkout_cancelled",
              failureCode: "cancelled",
            }
          : {
              status: EsimPurchasePaymentAttemptStatus.EXPIRED,
              failureCategory: "checkout_expired",
              failureCode: "expired",
            };
      const marked = await tx.partnerEsimPurchasePaymentAttempt.updateMany({
        where: {
          id: attemptId,
          webhookEventId: null,
          status: { in: ATTEMPT_OPEN },
        },
        data: attemptData,
      });
      if (marked.count === 1) {
        released = true;
      }
    }

    if (released) {
      await tx.auditLog.create({
        data: {
          actorUserId: partnerUserId,
          action: PARTNER_ESIM_PAYMENT_RESERVATION_RELEASED,
          targetType: "PartnerEsimPurchasePaymentAttempt",
          targetId: attemptId,
          metadata: {
            purchaseId,
            walletAppliedCents: attempt.purchase.walletAppliedCents,
            attemptTerminalStatus: options.attemptTerminalStatus ?? null,
          } satisfies Prisma.InputJsonValue,
        },
      });
    }
  });

  return { released };
}

/**
 * Expire/stale recovery for one Partner payment attempt.
 * Releases reserved wallet and restores purchase READY. Never funds.
 */
export async function expireStalePartnerGatewayPaymentAttempt(options: {
  attemptId: string;
}): Promise<{ released: boolean; purchaseId: string | null }> {
  const attemptId = options.attemptId.trim();
  if (!attemptId || attemptId.length > 64) {
    return { released: false, purchaseId: null };
  }

  const row = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      updatedAt: true,
      purchase: {
        select: {
          id: true,
          status: true,
          partner: { select: { userId: true } },
        },
      },
    },
  });

  if (!row) {
    return { released: false, purchaseId: null };
  }

  const result = await maybeReleasePendingPartnerGatewayReservation({
    partnerUserId: row.purchase.partner.userId,
    purchaseId: row.purchase.id,
    attemptId: row.id,
    attemptTerminalStatus: "EXPIRED",
  });

  if (result.released) {
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: PARTNER_ESIM_PAYMENT_EXPIRED,
          targetType: "PartnerEsimPurchasePaymentAttempt",
          targetId: row.id,
          metadata: {
            purchaseId: row.purchase.id,
            method: "stale_recovery",
          },
        },
      })
      .catch(() => undefined);
  }

  return { released: result.released, purchaseId: row.purchase.id };
}

export async function applyVerifiedPartnerEsimPurchasePaymentEvent(
  event: NormalizedPaymentEvent
): Promise<ApplyVerifiedPartnerEsimPaymentResult> {
  if (!event.signatureVerified || event.provider !== "SIMPAISA") {
    return {
      duplicate: false,
      purchaseId: null,
      paymentAttemptId: null,
      purchaseStatus: null,
      attemptStatus: null,
      outcome: "ignored",
    };
  }
  if (event.purpose !== "PARTNER_ESIM_PURCHASE") {
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

  const byEvent = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
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
          action: PARTNER_ESIM_PAYMENT_WEBHOOK_DUPLICATE,
          targetType: "PartnerEsimPurchasePaymentAttempt",
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
      byEvent.purchase.status === PartnerEsimPurchaseStatus.FUNDED
    ) {
      await fulfillFundedPartnerEsimPurchase(byEvent.purchaseId).catch(
        () => undefined
      );
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

  const attemptIdFromEvent =
    parsePartnerEsimPurchaseAttemptIdFromMerchantUserKey(
      event.paymentAttemptId
    ) ||
    (event.paymentAttemptId && event.paymentAttemptId.length <= 64
      ? event.paymentAttemptId.trim()
      : null);

  let attempt = await prisma.partnerEsimPurchasePaymentAttempt.findFirst({
    where: {
      gatewayPaymentRef: tracker,
      gatewayProvider: PaymentGatewayProvider.SIMPAISA,
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
          partnerId: true,
          status: true,
          walletAppliedCents: true,
          gatewayAmountCents: true,
          debitTransactionId: true,
          partnerChargeCents: true,
          fundingSource: true,
          orderId: true,
        },
      },
    },
  });

  if (!attempt && attemptIdFromEvent) {
    attempt = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
      where: { id: attemptIdFromEvent },
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
            partnerId: true,
            status: true,
            walletAppliedCents: true,
            gatewayAmountCents: true,
            debitTransactionId: true,
            partnerChargeCents: true,
            fundingSource: true,
            orderId: true,
          },
        },
      },
    });
  }

  if (
    !attempt ||
    attempt.gatewayProvider !== PaymentGatewayProvider.SIMPAISA
  ) {
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

  const paymentAlreadyConfirmed =
    attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED;
  const purchaseAlreadyFunded = isPurchaseSuccessTerminal(
    attempt.purchase.status
  );

  if (paymentAlreadyConfirmed || purchaseAlreadyFunded) {
    if (
      event.paymentStatus === "confirmed" &&
      attempt.purchase.status === PartnerEsimPurchaseStatus.FUNDED
    ) {
      await fulfillFundedPartnerEsimPurchase(attempt.purchaseId).catch(
        () => undefined
      );
    }
    return {
      duplicate: true,
      purchaseId: attempt.purchaseId,
      paymentAttemptId: attempt.id,
      purchaseStatus: attempt.purchase.status,
      attemptStatus: attempt.status,
      outcome: event.paymentStatus === "failed" ? "ignored" : "duplicate",
    };
  }

  if (!match) {
    await prisma.$transaction(async (tx) => {
      await tx.partnerEsimPurchasePaymentAttempt.updateMany({
        where: {
          id: attempt!.id,
          status: { in: ATTEMPT_OPEN },
          webhookEventId: null,
        },
        data: {
          status: EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
          webhookEventId: eventId,
          failureCategory: "amount_currency_mismatch",
          failureCode: "webhook_mismatch",
        },
      });
      await tx.partnerEsimPurchase.updateMany({
        where: {
          id: attempt!.purchaseId,
          status: PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
        },
        data: {
          status: PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
          failureCategory: "amount_currency_mismatch",
          failureCode: "webhook_mismatch",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: PARTNER_ESIM_PAYMENT_RECONCILIATION,
          targetType: "PartnerEsimPurchasePaymentAttempt",
          targetId: attempt!.id,
          metadata: {
            method: "verified_webhook",
            failureCategory: "amount_currency_mismatch",
          } satisfies Prisma.InputJsonValue,
        },
      });
    });

    const fresh = await prisma.partnerEsimPurchase.findUnique({
      where: { id: attempt.purchaseId },
      select: { status: true },
    });
    const freshAttempt = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
      where: { id: attempt.id },
      select: { status: true },
    });
    return {
      duplicate: false,
      purchaseId: attempt.purchaseId,
      paymentAttemptId: attempt.id,
      purchaseStatus: fresh?.status ?? attempt.purchase.status,
      attemptStatus: freshAttempt?.status ?? attempt.status,
      outcome: "reconciliation",
    };
  }

  if (event.paymentStatus === "failed") {
    return releaseOnGatewayFailure({
      attemptId: attempt.id,
      purchaseId: attempt.purchaseId,
      partnerId: attempt.purchase.partnerId,
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

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.partnerEsimPurchasePaymentAttempt.updateMany({
        where: {
          id: attempt!.id,
          webhookEventId: null,
          status: { in: ATTEMPT_OPEN },
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

      const purchaseNow = await tx.partnerEsimPurchase.findUnique({
        where: { id: attempt!.purchaseId },
        select: {
          status: true,
          walletAppliedCents: true,
          debitTransactionId: true,
          gatewayAmountCents: true,
        },
      });
      if (!purchaseNow) {
        throw new Error("PURCHASE_FUND_CLAIM_FAILED");
      }

      if (purchaseNow.walletAppliedCents > 0) {
        if (
          !purchaseNow.debitTransactionId ||
          purchaseNow.status !==
            PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT
        ) {
          throw new Error("PURCHASE_FUND_CLAIM_FAILED");
        }
      } else if (
        purchaseNow.status !==
        PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT
      ) {
        throw new Error("PURCHASE_FUND_CLAIM_FAILED");
      }

      const funded = await tx.partnerEsimPurchase.updateMany({
        where:
          purchaseNow.walletAppliedCents > 0
            ? {
                id: attempt!.purchaseId,
                debitTransactionId: purchaseNow.debitTransactionId,
                status: PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
              }
            : {
                id: attempt!.purchaseId,
                status: PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
              },
        data: {
          status: PartnerEsimPurchaseStatus.FUNDED,
          failureCategory: null,
          failureCode: null,
        },
      });
      if (funded.count !== 1) {
        const current = await tx.partnerEsimPurchase.findUnique({
          where: { id: attempt!.purchaseId },
          select: { status: true },
        });
        if (current?.status !== PartnerEsimPurchaseStatus.FUNDED) {
          throw new Error("PURCHASE_FUND_CLAIM_FAILED");
        }
      }

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: PARTNER_ESIM_PURCHASE_FUNDED,
          targetType: "PartnerEsimPurchase",
          targetId: attempt!.purchaseId,
          metadata: {
            method: "verified_webhook",
            paymentAttemptId: attempt!.id,
            gatewayAmountCents: attempt!.gatewayAmountCents,
            walletAppliedCents: purchaseNow.walletAppliedCents,
            currency: attempt!.currency,
          } satisfies Prisma.InputJsonValue,
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Concurrent duplicate webhookEventId — treat as duplicate.
      const raced = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
        where: { webhookEventId: eventId },
        select: {
          id: true,
          purchaseId: true,
          status: true,
          purchase: { select: { status: true } },
        },
      });
      if (raced) {
        if (raced.purchase.status === PartnerEsimPurchaseStatus.FUNDED) {
          await fulfillFundedPartnerEsimPurchase(raced.purchaseId).catch(
            () => undefined
          );
        }
        return {
          duplicate: true,
          purchaseId: raced.purchaseId,
          paymentAttemptId: raced.id,
          purchaseStatus: raced.purchase.status,
          attemptStatus: raced.status,
          outcome: "duplicate",
        };
      }
    }
    return {
      duplicate: false,
      purchaseId: attempt.purchaseId,
      paymentAttemptId: attempt.id,
      purchaseStatus: null,
      attemptStatus: null,
      outcome: "reconciliation",
    };
  }

  await fulfillFundedPartnerEsimPurchase(attempt.purchaseId).catch(
    () => undefined
  );

  const fundedPurchase = await prisma.partnerEsimPurchase.findUnique({
    where: { id: attempt.purchaseId },
    select: { status: true },
  });
  const fundedAttempt = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
    where: { id: attempt.id },
    select: { status: true },
  });

  return {
    duplicate: false,
    purchaseId: attempt.purchaseId,
    paymentAttemptId: attempt.id,
    purchaseStatus: fundedPurchase?.status ?? null,
    attemptStatus: fundedAttempt?.status ?? null,
    outcome: "funded",
  };
}
