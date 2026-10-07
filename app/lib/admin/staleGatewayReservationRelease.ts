/**
 * Admin stale gateway reservation release (customer + partner).
 * Releases unpaid wallet holds after stale threshold. Never funds / marks paid /
 * replays webhooks / calls VeSIM.
 */
import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  PartnerEsimPurchaseStatus,
  Prisma,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { reportServerError } from "@/app/lib/monitoring/serverErrorMonitoring";
import {
  GATEWAY_ONLY_DISMISS_MIN_AGE_MS,
  PAYMENT_RECOVERY_STALE_RELEASE_AUDIT,
  PAYMENT_RECOVERY_STALE_RELEASE_BLOCKED_AUDIT,
  isGatewayOnlyDismissEligible,
  parsePaymentRecoveryStaleMs,
  type PaymentRecoveryOwnerKind,
} from "@/app/lib/admin/paymentRecoveryShared";
import { parsePendingPaymentVerifyReason } from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { prisma } from "@/app/lib/db";
import { maybeReleasePendingGatewayReservation } from "@/app/lib/esim/esimPurchasePaymentApply";
import { PARTNER_ESIM_PAYMENT_RESERVATION_RELEASED } from "@/app/lib/partner/partnerEsimPurchasePaymentConstants";
import { releasePartnerGatewayReservationInTx } from "@/app/lib/partner/partnerPurchaseWallet";

export type StaleGatewayReleaseResult =
  | {
      ok: true;
      released: boolean;
      ownerKind: PaymentRecoveryOwnerKind;
      purchaseId: string;
      attemptId: string;
      message: string;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: { reason?: string };
    };

const ATTEMPT_OPEN: EsimPurchasePaymentAttemptStatus[] = [
  EsimPurchasePaymentAttemptStatus.DRAFT,
  EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
  EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
];

/** Interactive tx budget for admin Partner release (prod P2028 at default 5s). */
const ADMIN_PARTNER_RELEASE_TX = {
  maxWait: 5_000,
  timeout: 20_000,
} as const;

async function writeAudit(options: {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        actorUserId: options.actorUserId,
        action: options.action,
        targetType: options.targetType,
        targetId: options.targetId,
        metadata: options.metadata,
      },
    })
    .catch(() => undefined);
}

function publicUnavailableError(): string {
  return "This payment attempt is unavailable for reservation release.";
}

function isStaleEnough(input: {
  updatedAt: Date;
  expiresAt: Date | null;
  nowMs: number;
  staleMs: number;
}): boolean {
  if (input.expiresAt && input.expiresAt.getTime() <= input.nowMs) {
    return true;
  }
  return input.updatedAt.getTime() <= input.nowMs - input.staleMs;
}

function prismaErrorFields(error: unknown): {
  prismaCode?: string;
  prismaMeta?: unknown;
  errorMessage?: string;
} {
  const prismaCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const prismaMeta =
    error && typeof error === "object" && "meta" in error
      ? (error as { meta?: unknown }).meta
      : undefined;
  return {
    prismaCode: prismaCode || undefined,
    prismaMeta: prismaMeta ?? undefined,
    errorMessage:
      error instanceof Error
        ? error.message.slice(0, 500)
        : String(error).slice(0, 500),
  };
}

/**
 * Admin Partner path: same unpaid-hold release as webhook cancel/expire, but with
 * a longer interactive-transaction timeout so serverless DB latency does not P2028.
 * Reuses releasePartnerGatewayReservationInTx — never marks paid / never invents refunds.
 */
async function releasePartnerUnpaidHoldForAdmin(options: {
  partnerUserId: string;
  purchaseId: string;
  attemptId: string;
  /** Snapshot from outer admin eligibility load (failure context only). */
  attemptStatus: string;
  purchaseStatus: string;
  debitTransactionId: string | null;
}): Promise<{ released: boolean }> {
  const partnerUserId = options.partnerUserId.trim();
  const purchaseId = options.purchaseId.trim();
  const attemptId = options.attemptId.trim();
  if (!partnerUserId || !purchaseId || !attemptId) {
    return { released: false };
  }

  const failureContext = {
    attemptId,
    purchaseId,
    debitTransactionId: options.debitTransactionId,
    purchaseStatus: options.purchaseStatus,
    attemptStatus: options.attemptStatus,
  };

  let released = false;

  try {
    await prisma.$transaction(
      async (tx) => {
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
          !attempt.purchase?.partner ||
          attempt.purchase.partner.userId !== partnerUserId ||
          attempt.purchase.partner.user?.deletedAt ||
          attempt.purchase.partner.user?.role !== Role.PARTNER
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

        if (purchaseReadyClean) {
          const marked = await tx.partnerEsimPurchasePaymentAttempt.updateMany({
            where: {
              id: attemptId,
              webhookEventId: null,
              status: { in: ATTEMPT_OPEN },
            },
            data: {
              status: EsimPurchasePaymentAttemptStatus.EXPIRED,
              failureCategory: "checkout_expired",
              failureCode: "expired",
            },
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
                attemptTerminalStatus: "EXPIRED",
                method: "admin_stale_release",
              } satisfies Prisma.InputJsonValue,
            },
          });
        }
      },
      ADMIN_PARTNER_RELEASE_TX
    );
  } catch (error) {
    console.error("stale_gateway_release", {
      step: "partner_tx_failed",
      ...failureContext,
      ...prismaErrorFields(error),
    });
    reportServerError(error, {
      operation: "stale_gateway_release",
      purchaseType: "partner",
      purchaseId,
      paymentAttemptId: attemptId,
      errorCode: prismaErrorFields(error).prismaCode ?? "partner_tx_failed",
    });
    throw error;
  }

  return { released };
}

/**
 * Release a still-unpaid customer or partner gateway wallet reservation.
 * Eligible only when webhook is missing, attempt is open, purchase is
 * AWAITING_GATEWAY_PAYMENT, and the attempt is stale / expired.
 */
export async function releaseStaleGatewayReservation(options: {
  adminUserId: string;
  paymentAttemptId: string;
  reason: string;
  ownerKind?: PaymentRecoveryOwnerKind | null;
}): Promise<StaleGatewayReleaseResult> {
  const publicError = publicUnavailableError();

  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: publicError };
  }

  const adminId = options.adminUserId.trim();
  if (!adminId || adminId.length > 64) {
    return { ok: false, error: "Not authorized." };
  }

  const attemptId = (options.paymentAttemptId ?? "").trim();
  if (
    !attemptId ||
    attemptId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(attemptId)
  ) {
    return { ok: false, error: publicError };
  }

  const reasonParsed = parsePendingPaymentVerifyReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const rate = consumeRateLimit({
    key: `stale-gateway-release:admin:${adminId}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.ok) {
    await writeAudit({
      actorUserId: adminId,
      action: PAYMENT_RECOVERY_STALE_RELEASE_BLOCKED_AUDIT,
      targetType: "PaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "admin_stale_release",
        failureCode: "rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many reservation releases. Please wait and try again.",
    };
  }

  const preferredKind = options.ownerKind ?? null;
  const nowMs = Date.now();
  const staleMs = parsePaymentRecoveryStaleMs();

  // Prefer explicit kind; otherwise resolve customer then partner.
  if (preferredKind !== "partner") {
    const customer = await prisma.esimPurchasePaymentAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        webhookEventId: true,
        expiresAt: true,
        updatedAt: true,
        purchaseId: true,
        purchase: {
          select: {
            id: true,
            status: true,
            customerUserId: true,
            walletAppliedCents: true,
            debitTransactionId: true,
          },
        },
      },
    });

    if (customer) {
      const walletAppliedCents = customer.purchase.walletAppliedCents ?? 0;
      const gatewayOnlyDismiss = isGatewayOnlyDismissEligible({
        status: customer.status,
        purchaseStatus: customer.purchase.status,
        webhookEventId: customer.webhookEventId,
        updatedAt: customer.updatedAt,
        expiresAt: customer.expiresAt,
        walletAppliedCents,
        nowMs,
        minAgeMs: GATEWAY_ONLY_DISMISS_MIN_AGE_MS,
      });
      const purchaseAwaiting =
        customer.purchase.status ===
        WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT;
      const purchaseReadyGatewayOnly =
        gatewayOnlyDismiss &&
        customer.purchase.status === WalletEsimPurchaseStatus.READY;

      if (
        customer.webhookEventId ||
        !ATTEMPT_OPEN.includes(customer.status) ||
        (!purchaseAwaiting && !purchaseReadyGatewayOnly)
      ) {
        await writeAudit({
          actorUserId: adminId,
          action: PAYMENT_RECOVERY_STALE_RELEASE_BLOCKED_AUDIT,
          targetType: "EsimPurchasePaymentAttempt",
          targetId: customer.id,
          metadata: {
            method: "admin_stale_release",
            ownerKind: "customer",
            failureCode: "not_eligible",
            reason: reasonParsed.reason.slice(0, 80),
            purchaseStatus: customer.purchase.status,
            attemptStatus: customer.status,
          },
        });
        return { ok: false, error: publicError };
      }

      const staleOk = isStaleEnough({
        updatedAt: customer.updatedAt,
        expiresAt: customer.expiresAt,
        nowMs,
        staleMs: gatewayOnlyDismiss ? GATEWAY_ONLY_DISMISS_MIN_AGE_MS : staleMs,
      });
      if (!staleOk && !gatewayOnlyDismiss) {
        await writeAudit({
          actorUserId: adminId,
          action: PAYMENT_RECOVERY_STALE_RELEASE_BLOCKED_AUDIT,
          targetType: "EsimPurchasePaymentAttempt",
          targetId: customer.id,
          metadata: {
            method: "admin_stale_release",
            ownerKind: "customer",
            failureCode: "not_stale",
            reason: reasonParsed.reason.slice(0, 80),
          },
        });
        return {
          ok: false,
          error:
            "This attempt is not past the stale threshold yet. Wait or use Pending verify tools.",
        };
      }
      if (!staleOk && gatewayOnlyDismiss) {
        await writeAudit({
          actorUserId: adminId,
          action: PAYMENT_RECOVERY_STALE_RELEASE_BLOCKED_AUDIT,
          targetType: "EsimPurchasePaymentAttempt",
          targetId: customer.id,
          metadata: {
            method: "admin_stale_release",
            ownerKind: "customer",
            failureCode: "not_stale",
            reason: reasonParsed.reason.slice(0, 80),
          },
        });
        return {
          ok: false,
          error:
            "Gateway-only dismiss requires the attempt to be older than 30 minutes (or past expiry).",
        };
      }

      const release = await maybeReleasePendingGatewayReservation({
        customerUserId: customer.purchase.customerUserId,
        purchaseId: customer.purchase.id,
        attemptId: customer.id,
        attemptTerminalStatus: "EXPIRED",
      });

      await writeAudit({
        actorUserId: adminId,
        action: PAYMENT_RECOVERY_STALE_RELEASE_AUDIT,
        targetType: "EsimPurchasePaymentAttempt",
        targetId: customer.id,
        metadata: {
          method: "admin_stale_release",
          ownerKind: "customer",
          released: release.released,
          purchaseId: customer.purchase.id,
          walletAppliedCents,
          gatewayOnlyDismiss,
          reason: reasonParsed.reason.slice(0, 80),
        },
      });

      const gatewayOnlyMessage = release.released
        ? "Attempt marked expired and cleared from pending lists. Never marked paid."
        : "Could not expire this attempt (already closed or funded race).";

      return {
        ok: true,
        released: release.released,
        ownerKind: "customer",
        purchaseId: customer.purchase.id,
        attemptId: customer.id,
        message:
          walletAppliedCents <= 0
            ? gatewayOnlyMessage
            : release.released
              ? "Reserved wallet amount released. Purchase restored to READY. Never marked paid."
              : "No releasable reservation remained (already clean or funded race).",
      };
    }

    if (preferredKind === "customer") {
      return { ok: false, error: publicError };
    }
  }

  const partner = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      webhookEventId: true,
      expiresAt: true,
      updatedAt: true,
      purchaseId: true,
      purchase: {
        select: {
          id: true,
          status: true,
          walletAppliedCents: true,
          debitTransactionId: true,
          partner: { select: { userId: true } },
        },
      },
    },
  });

  if (!partner) {
    return { ok: false, error: publicError };
  }

  const partnerUserId = (partner.purchase?.partner?.userId ?? "").trim();
  if (!partner.purchase || !partnerUserId) {
    await writeAudit({
      actorUserId: adminId,
      action: PAYMENT_RECOVERY_STALE_RELEASE_BLOCKED_AUDIT,
      targetType: "PartnerEsimPurchasePaymentAttempt",
      targetId: partner.id,
      metadata: {
        method: "admin_stale_release",
        ownerKind: "partner",
        failureCode: "partner_unavailable",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: publicError };
  }

  const walletAppliedCents = partner.purchase.walletAppliedCents ?? 0;
  const gatewayOnlyDismiss = isGatewayOnlyDismissEligible({
    status: partner.status,
    purchaseStatus: partner.purchase.status,
    webhookEventId: partner.webhookEventId,
    updatedAt: partner.updatedAt,
    expiresAt: partner.expiresAt,
    walletAppliedCents,
    nowMs,
    minAgeMs: GATEWAY_ONLY_DISMISS_MIN_AGE_MS,
  });
  const purchaseAwaiting =
    partner.purchase.status ===
    PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT;
  const purchaseReadyGatewayOnly =
    gatewayOnlyDismiss &&
    partner.purchase.status === PartnerEsimPurchaseStatus.READY;

  if (
    partner.webhookEventId ||
    !ATTEMPT_OPEN.includes(partner.status) ||
    (!purchaseAwaiting && !purchaseReadyGatewayOnly)
  ) {
    await writeAudit({
      actorUserId: adminId,
      action: PAYMENT_RECOVERY_STALE_RELEASE_BLOCKED_AUDIT,
      targetType: "PartnerEsimPurchasePaymentAttempt",
      targetId: partner.id,
      metadata: {
        method: "admin_stale_release",
        ownerKind: "partner",
        failureCode: "not_eligible",
        reason: reasonParsed.reason.slice(0, 80),
        purchaseStatus: partner.purchase.status,
        attemptStatus: partner.status,
      },
    });
    return { ok: false, error: publicError };
  }

  const partnerStaleOk = isStaleEnough({
    updatedAt: partner.updatedAt,
    expiresAt: partner.expiresAt,
    nowMs,
    staleMs: gatewayOnlyDismiss ? GATEWAY_ONLY_DISMISS_MIN_AGE_MS : staleMs,
  });
  if (!partnerStaleOk) {
    await writeAudit({
      actorUserId: adminId,
      action: PAYMENT_RECOVERY_STALE_RELEASE_BLOCKED_AUDIT,
      targetType: "PartnerEsimPurchasePaymentAttempt",
      targetId: partner.id,
      metadata: {
        method: "admin_stale_release",
        ownerKind: "partner",
        failureCode: "not_stale",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: gatewayOnlyDismiss
        ? "Gateway-only dismiss requires the attempt to be older than 30 minutes (or past expiry)."
        : "This attempt is not past the stale threshold yet. Wait for expiry or a failure webhook.",
    };
  }

  let release: { released: boolean };
  try {
    release = await releasePartnerUnpaidHoldForAdmin({
      partnerUserId,
      purchaseId: partner.purchase.id,
      attemptId: partner.id,
      attemptStatus: partner.status,
      purchaseStatus: partner.purchase.status,
      debitTransactionId: partner.purchase.debitTransactionId ?? null,
    });
  } catch (error) {
    const fields = prismaErrorFields(error);
    return {
      ok: false,
      error:
        fields.prismaCode === "P2028"
          ? "Reservation release timed out talking to the database. Please try again."
          : "Could not release this Partner reservation right now. Refresh and try again shortly.",
    };
  }

  await writeAudit({
    actorUserId: adminId,
    action: PAYMENT_RECOVERY_STALE_RELEASE_AUDIT,
    targetType: "PartnerEsimPurchasePaymentAttempt",
    targetId: partner.id,
    metadata: {
      method: "admin_stale_release",
      ownerKind: "partner",
      released: release.released,
      purchaseId: partner.purchase.id,
      walletAppliedCents,
      gatewayOnlyDismiss,
      reason: reasonParsed.reason.slice(0, 80),
    },
  });

  const gatewayOnlyMessage = release.released
    ? "Attempt marked expired and cleared from pending lists. Never marked paid."
    : "Could not expire this attempt (already closed or funded race).";

  return {
    ok: true,
    released: release.released,
    ownerKind: "partner",
    purchaseId: partner.purchase.id,
    attemptId: partner.id,
    message:
      walletAppliedCents <= 0
        ? gatewayOnlyMessage
        : release.released
          ? "Reserved wallet amount released. Purchase restored to READY. Never marked paid."
          : "No releasable reservation remained (already clean or funded race).",
  };
}
