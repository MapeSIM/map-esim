/**
 * Admin stale gateway reservation release (customer + partner).
 * Releases unpaid wallet holds after stale threshold. Never funds / marks paid /
 * replays webhooks / calls VeSIM.
 */
import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  PartnerEsimPurchaseStatus,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import {
  PAYMENT_RECOVERY_STALE_RELEASE_AUDIT,
  PAYMENT_RECOVERY_STALE_RELEASE_BLOCKED_AUDIT,
  parsePaymentRecoveryStaleMs,
  type PaymentRecoveryOwnerKind,
} from "@/app/lib/admin/paymentRecoveryShared";
import { parsePendingPaymentVerifyReason } from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { prisma } from "@/app/lib/db";
import { maybeReleasePendingGatewayReservation } from "@/app/lib/esim/esimPurchasePaymentApply";
import { maybeReleasePendingPartnerGatewayReservation } from "@/app/lib/partner/partnerEsimPurchasePaymentApply";

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

async function writeAudit(options: {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
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
      if (
        customer.webhookEventId ||
        !ATTEMPT_OPEN.includes(customer.status) ||
        customer.purchase.status !==
          WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT
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

      if (
        !isStaleEnough({
          updatedAt: customer.updatedAt,
          expiresAt: customer.expiresAt,
          nowMs,
          staleMs,
        })
      ) {
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
          walletAppliedCents: customer.purchase.walletAppliedCents,
          reason: reasonParsed.reason.slice(0, 80),
        },
      });

      return {
        ok: true,
        released: release.released,
        ownerKind: "customer",
        purchaseId: customer.purchase.id,
        attemptId: customer.id,
        message: release.released
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

  if (
    partner.webhookEventId ||
    !ATTEMPT_OPEN.includes(partner.status) ||
    partner.purchase.status !==
      PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT
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

  if (
    !isStaleEnough({
      updatedAt: partner.updatedAt,
      expiresAt: partner.expiresAt,
      nowMs,
      staleMs,
    })
  ) {
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
      error:
        "This attempt is not past the stale threshold yet. Wait for expiry or a failure webhook.",
    };
  }

  const release = await maybeReleasePendingPartnerGatewayReservation({
    partnerUserId: partner.purchase.partner.userId,
    purchaseId: partner.purchase.id,
    attemptId: partner.id,
    attemptTerminalStatus: "EXPIRED",
  });

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
      walletAppliedCents: partner.purchase.walletAppliedCents,
      reason: reasonParsed.reason.slice(0, 80),
    },
  });

  return {
    ok: true,
    released: release.released,
    ownerKind: "partner",
    purchaseId: partner.purchase.id,
    attemptId: partner.id,
    message: release.released
      ? "Reserved Partner wallet amount released. Purchase restored to READY. Never marked paid."
      : "No releasable reservation remained (already clean or funded race).",
  };
}
