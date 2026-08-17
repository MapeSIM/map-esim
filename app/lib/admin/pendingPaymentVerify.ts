import "server-only";

import { EsimPurchasePaymentAttemptStatus, Role } from "@prisma/client";
import {
  buildPendingPaymentEvidenceView,
  decidePendingPaymentVerify,
  parsePendingPaymentVerifyReason,
  PENDING_PAYMENT_RELEASE_AUDIT,
  PENDING_PAYMENT_VERIFY_AUDIT,
  PENDING_PAYMENT_VERIFY_BLOCKED_AUDIT,
  shouldReleaseSplitReservationOnDecision,
  type PendingPaymentVerifyEvidenceView,
} from "@/app/lib/admin/pendingPaymentVerifyShared";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { prisma } from "@/app/lib/db";
import { maybeReleasePendingGatewayReservation } from "@/app/lib/esim/esimPurchasePaymentApply";
import { schedulePaymentFailureNotification } from "@/app/lib/esim/paymentFailureNotification";
import {
  SafepayHttpClient,
  SafepayHttpError,
} from "@/app/lib/payments/safepayHttp";
import { validateSafepayAdapterConfig } from "@/app/lib/payments/safepayPolicy";
import {
  maskSafepayTrackerRef,
  type SafepayReporterEvidence,
} from "@/app/lib/payments/safepayReporterParse";

export type PendingPaymentVerifyActionResult =
  | {
      ok: true;
      evidence: PendingPaymentVerifyEvidenceView;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: { reason?: string };
    };

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) {
    return null;
  }
  return admin;
}

function resolveReporterClient(): SafepayHttpClient | null {
  // Read-only recovery may run while new checkouts stay disabled.
  // Credentials still come from env; enable flag is not flipped in files.
  const validated = validateSafepayAdapterConfig({
    enabledRaw: "true",
    environmentRaw: process.env.SAFEPAY_ENVIRONMENT,
    apiKeyRaw: process.env.SAFEPAY_API_KEY,
    secretKeyRaw: process.env.SAFEPAY_SECRET_KEY,
    intentRaw: process.env.SAFEPAY_INTENT,
    allowProduction: false,
  });
  if (!validated.ok) return null;
  return new SafepayHttpClient(validated.config);
}

async function defaultLookupEvidence(
  trackerToken: string
): Promise<SafepayReporterEvidence> {
  const client = resolveReporterClient();
  if (!client) {
    throw new SafepayHttpError("UNAVAILABLE", "Payment provider unavailable.");
  }
  return client.fetchTrackerEvidence(trackerToken);
}

/**
 * Admin-only authenticated Safepay reporter verify for a payment attempt.
 * Never funds purchases, never creates VeSIM orders, never trusts browser money/tracker.
 */
export async function verifyPendingGatewayPayment(options: {
  adminUserId: string;
  paymentAttemptId: string;
  reason: string;
  /** Injectable reporter lookup for offline QA. */
  lookupFn?: (trackerToken: string) => Promise<SafepayReporterEvidence>;
  /** Injectable release for offline QA. */
  releaseFn?: typeof maybeReleasePendingGatewayReservation;
}): Promise<PendingPaymentVerifyActionResult> {
  const publicError =
    "Payment verification is unavailable. Please try again shortly.";

  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: publicError };
  }

  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) {
    return { ok: false, error: "Not authorized." };
  }

  const attemptId = (options.paymentAttemptId ?? "").trim();
  if (!attemptId || attemptId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(attemptId)) {
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

  const adminRate = consumeRateLimit({
    key: `pending-payment-verify:admin:${admin.id}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: PENDING_PAYMENT_VERIFY_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_payment_verify",
        failureCode: "rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many payment verifications. Please wait and try again.",
    };
  }

  const attemptRate = consumeRateLimit({
    key: `pending-payment-verify:attempt:${attemptId}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!attemptRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: PENDING_PAYMENT_VERIFY_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_payment_verify",
        failureCode: "rate_limited_attempt",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "This payment was verified recently. Please wait and try again.",
    };
  }

  const attempt = await prisma.esimPurchasePaymentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      gatewayPaymentRef: true,
      gatewayAmountCents: true,
      currency: true,
      chargeAmountMinor: true,
      chargeCurrency: true,
      webhookEventId: true,
      purchaseId: true,
      purchase: {
        select: {
          id: true,
          status: true,
          customerUserId: true,
          walletAppliedCents: true,
          orderId: true,
        },
      },
    },
  });

  if (!attempt || !attempt.gatewayPaymentRef) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: PENDING_PAYMENT_VERIFY_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_payment_verify",
        failureCode: "attempt_not_found",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: publicError };
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

  const lookup = options.lookupFn ?? defaultLookupEvidence;
  let evidence: SafepayReporterEvidence | null = null;
  let providerUnavailable = false;
  try {
    evidence = await lookup(attempt.gatewayPaymentRef);
  } catch {
    providerUnavailable = true;
    evidence = null;
  }

  const decided = decidePendingPaymentVerify({
    localAttemptId: attempt.id,
    localGatewayPaymentRef: attempt.gatewayPaymentRef,
    localExpectedAmountMinor: expectedAmount,
    localExpectedCurrency: expectedCurrency,
    providerUnavailable,
    evidence,
  });

  let reservationReleased = false;
  const releaseCandidate =
    shouldReleaseSplitReservationOnDecision(
      decided.decision,
      attempt.purchase.walletAppliedCents
    ) ||
    ((decided.decision === "VERIFIED_FAILED" ||
      decided.decision === "VERIFIED_CANCELLED_OR_EXPIRED") &&
      attempt.purchase.walletAppliedCents <= 0);

  if (releaseCandidate) {
    const releaseFn =
      options.releaseFn ?? maybeReleasePendingGatewayReservation;
    try {
      const release = await releaseFn({
        customerUserId: attempt.purchase.customerUserId,
        purchaseId: attempt.purchaseId,
        attemptId: attempt.id,
      });
      reservationReleased = Boolean(release.released);
      await writeAuditLog({
        actorUserId: admin.id,
        action: PENDING_PAYMENT_RELEASE_AUDIT,
        targetType: "EsimPurchasePaymentAttempt",
        targetId: attempt.id,
        metadata: {
          method: "pending_payment_verify",
          decision: decided.decision,
          released: reservationReleased,
          reason: reasonParsed.reason.slice(0, 80),
          purchaseId: attempt.purchaseId,
        },
      });
    } catch {
      reservationReleased = false;
    }
  }

  // Mark durable terminal attempt status from authenticated reporter evidence,
  // then schedule once-only customer failure email (never funds / never VeSIM).
  const terminalFailure =
    decided.decision === "VERIFIED_FAILED" ||
    decided.decision === "VERIFIED_CANCELLED_OR_EXPIRED";
  if (terminalFailure) {
    const terminalStatus =
      decided.decision === "VERIFIED_CANCELLED_OR_EXPIRED"
        ? EsimPurchasePaymentAttemptStatus.CANCELLED
        : EsimPurchasePaymentAttemptStatus.FAILED;
    await prisma.esimPurchasePaymentAttempt
      .updateMany({
        where: {
          id: attempt.id,
          status: {
            in: [
              EsimPurchasePaymentAttemptStatus.DRAFT,
              EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
              EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
              EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
            ],
          },
        },
        data: {
          status: terminalStatus,
          failedAt:
            terminalStatus === EsimPurchasePaymentAttemptStatus.FAILED
              ? new Date()
              : undefined,
          cancelledAt:
            terminalStatus === EsimPurchasePaymentAttemptStatus.CANCELLED
              ? new Date()
              : undefined,
          failureCategory:
            decided.decision === "VERIFIED_CANCELLED_OR_EXPIRED"
              ? "payment_cancelled_or_expired"
              : "payment_failed",
          failureCode: "admin_reporter_verified",
        },
      })
      .catch(() => undefined);

    schedulePaymentFailureNotification(attempt.id, {
      // Prefer this-call release; otherwise infer from durable REFUND_CREDIT ledger.
      walletFundsReturned:
        attempt.purchase.walletAppliedCents <= 0
          ? false
          : reservationReleased
            ? true
            : null,
    });
  }

  const view = buildPendingPaymentEvidenceView({
    attemptId: attempt.id,
    purchaseId: attempt.purchaseId,
    localAttemptStatus: attempt.status,
    localPurchaseStatus: attempt.purchase.status,
    localExpectedAmountMinor: expectedAmount,
    localExpectedCurrency: expectedCurrency,
    localGatewayPaymentRef: attempt.gatewayPaymentRef,
    evidence,
    decision: decided.decision,
    message: decided.message,
    trackerTokenMatch: decided.trackerTokenMatch,
    metadataOrderIdMatch: decided.metadataOrderIdMatch,
    reservationReleased,
  });

  await writeAuditLog({
    actorUserId: admin.id,
    action: PENDING_PAYMENT_VERIFY_AUDIT,
    targetType: "EsimPurchasePaymentAttempt",
    targetId: attempt.id,
    metadata: {
      method: "pending_payment_verify",
      decision: view.decision,
      purchaseId: attempt.purchaseId,
      reason: reasonParsed.reason.slice(0, 80),
      trackerTokenMatch: view.trackerTokenMatch,
      metadataOrderIdMatch: view.metadataOrderIdMatch,
      hasCaptureEvidence: view.hasCaptureEvidence,
      reservationReleased: view.reservationReleased,
      fundingApplied: false,
      localAmountMinor: view.localExpectedAmountMinor,
      observedAmountMinor: view.observedAmountMinor,
      // Never store full tracker tokens.
      trackerRefMasked: view.trackerRefMasked,
    },
  });

  return { ok: true, evidence: view };
}

/** List recent awaiting gateway payment attempts for admin inspection. */
export async function listPendingGatewayPaymentAttempts(limit = 30): Promise<
  Array<{
    attemptId: string;
    purchaseId: string;
    attemptStatus: string;
    purchaseStatus: string;
    gatewayAmountCents: number;
    currency: string;
    walletAppliedCents: number;
    createdAt: Date;
    trackerRefMasked: string;
  }>
> {
  const take = Math.min(Math.max(limit, 1), 50);
  const rows = await prisma.esimPurchasePaymentAttempt.findMany({
    where: {
      status: {
        in: [
          EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
          EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
          EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      gatewayAmountCents: true,
      currency: true,
      gatewayPaymentRef: true,
      createdAt: true,
      purchaseId: true,
      purchase: {
        select: {
          status: true,
          walletAppliedCents: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    attemptId: row.id,
    purchaseId: row.purchaseId,
    attemptStatus: row.status,
    purchaseStatus: row.purchase.status,
    gatewayAmountCents: row.gatewayAmountCents,
    currency: row.currency,
    walletAppliedCents: row.purchase.walletAppliedCents,
    createdAt: row.createdAt,
    trackerRefMasked: maskSafepayTrackerRef(row.gatewayPaymentRef),
  }));
}

export async function getPendingGatewayPaymentAttemptDetail(
  paymentAttemptId: string
): Promise<{
  attemptId: string;
  purchaseId: string;
  attemptStatus: string;
  purchaseStatus: string;
  gatewayAmountCents: number;
  currency: string;
  chargeAmountMinor: number | null;
  chargeCurrency: string | null;
  walletAppliedCents: number;
  orderId: string | null;
  webhookEventIdPresent: boolean;
  trackerRefMasked: string;
  createdAt: Date;
} | null> {
  const id = paymentAttemptId.trim();
  if (!id || id.length > 64) return null;
  const row = await prisma.esimPurchasePaymentAttempt.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      gatewayAmountCents: true,
      currency: true,
      chargeAmountMinor: true,
      chargeCurrency: true,
      gatewayPaymentRef: true,
      webhookEventId: true,
      createdAt: true,
      purchaseId: true,
      purchase: {
        select: {
          status: true,
          walletAppliedCents: true,
          orderId: true,
        },
      },
    },
  });
  if (!row) return null;
  return {
    attemptId: row.id,
    purchaseId: row.purchaseId,
    attemptStatus: row.status,
    purchaseStatus: row.purchase.status,
    gatewayAmountCents: row.gatewayAmountCents,
    currency: row.currency,
    chargeAmountMinor: row.chargeAmountMinor,
    chargeCurrency: row.chargeCurrency,
    walletAppliedCents: row.purchase.walletAppliedCents,
    orderId: row.purchase.orderId,
    webhookEventIdPresent: Boolean(row.webhookEventId),
    trackerRefMasked: maskSafepayTrackerRef(row.gatewayPaymentRef),
    createdAt: row.createdAt,
  };
}
