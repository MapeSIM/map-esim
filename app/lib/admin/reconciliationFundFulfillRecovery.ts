/**
 * Admin recovery: Simpaisa payment confirmed but claim_failed left purchase in
 * RECONCILIATION_REQUIRED with no VeSIM order.
 *
 * Flow: lock + live Inquire → CAS purchase to FUNDED → reuse fulfillFundedEsimPurchase.
 * Does not call applyVerified* / webhook authority paths.
 */
import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  PaymentGatewayProvider,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import {
  assertSameOriginAdminRequest,
  type CaseActionResult,
} from "@/app/lib/admin/reconciliationCaseManagement";
import {
  evaluateFundFulfillRecoveryEligibility,
  fundFulfillRecoveryBlockerLabel,
  isFundFulfillRecoverySourceType,
  RECOVER_PAYMENT_CREATE_ESIM_PHRASE,
  type FundFulfillRecoverySourceType,
} from "@/app/lib/admin/reconciliationFundFulfillRecoveryShared";
import {
  normalizeCaseManagementSourceType,
  parseCaseReason,
  parseConfirmPhrase,
  type CaseManagementSourceType,
} from "@/app/lib/admin/reconciliationCaseShared";
import { PROVIDER_REFRESH_STALE_CLAIM_MS } from "@/app/lib/admin/providerRefreshShared";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { prisma } from "@/app/lib/db";
import { fulfillFundedEsimPurchase } from "@/app/lib/esim/esimPurchasePaymentApply";
import { resolveSimpaisaInquiryConfig } from "@/app/lib/payments/simpaisaConfig";
import {
  SimpaisaHttpClient,
  SimpaisaHttpError,
  type SimpaisaInquiryResult,
} from "@/app/lib/payments/simpaisaHttp";
import { validateSimpaisaAuthoritativeInquiry } from "@/app/lib/payments/simpaisaInquiryValidate";

export const FUND_FULFILL_RECOVERED =
  "reconciliation.fund_fulfill_recovered";
export const FUND_FULFILL_BLOCKED = "reconciliation.case_action_blocked";

const PUBLIC_ERROR =
  "Unable to recover payment and create eSIM for this case right now.";

type InquireFn = (input: {
  userKey: string;
  transactionId: string;
}) => Promise<SimpaisaInquiryResult>;

type ResolvedIds = {
  sourceType: FundFulfillRecoverySourceType;
  attemptId: string;
  recordId: string;
  targetType: "WalletEsimPurchase";
};

type PurchaseAttemptBundle = {
  purchase: {
    id: string;
    status: WalletEsimPurchaseStatus;
    failureCategory: string | null;
    failureCode: string | null;
    orderId: string | null;
    providerOrderId: string | null;
    refundTransactionId: string | null;
    walletAppliedCents: number;
    debitTransactionId: string | null;
    debitStatus: string | null;
    caseResolved: boolean;
    caseLocked: boolean;
    lockedByAdminId: string | null;
    providerRefreshInProgress: boolean;
  };
  attempt: {
    id: string;
    status: EsimPurchasePaymentAttemptStatus;
    gatewayProvider: PaymentGatewayProvider | null;
    gatewayPaymentRef: string;
    gatewayAmountCents: number;
    currency: string;
    chargeAmountMinor: number | null;
    chargeCurrency: string | null;
    webhookEventId: string | null;
  };
};

function resolveIds(
  sourceType: CaseManagementSourceType,
  attemptIdRaw: string
): ResolvedIds | null {
  if (!isFundFulfillRecoverySourceType(sourceType)) return null;
  const attemptId = (attemptIdRaw ?? "").trim();
  if (!attemptId || attemptId.length > 64) return null;
  return {
    sourceType,
    attemptId,
    recordId: attemptId,
    targetType: "WalletEsimPurchase",
  };
}

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (
    !admin ||
    admin.deletedAt ||
    admin.role !== Role.ADMIN ||
    admin.adminDisabledAt
  ) {
    return null;
  }
  return admin;
}

function isRefreshInProgress(row: {
  providerRefreshClaimedAt?: Date | null;
  providerRefreshCompletedAt?: Date | null;
  providerRefreshResult?: string | null;
}): boolean {
  const claimedAt = row.providerRefreshClaimedAt;
  if (!claimedAt) return false;
  const completedAt = row.providerRefreshCompletedAt;
  if (completedAt && completedAt.getTime() >= claimedAt.getTime()) return false;
  const age = Date.now() - claimedAt.getTime();
  if ((row.providerRefreshResult ?? "").trim().toUpperCase() === "IN_PROGRESS") {
    return age < PROVIDER_REFRESH_STALE_CLAIM_MS;
  }
  return age < PROVIDER_REFRESH_STALE_CLAIM_MS && !completedAt;
}

async function defaultInquire(input: {
  userKey: string;
  transactionId: string;
}): Promise<SimpaisaInquiryResult> {
  const resolved = resolveSimpaisaInquiryConfig();
  if (!resolved.ok) {
    throw new SimpaisaHttpError("UNAVAILABLE", "Payment provider unavailable.");
  }
  const client = new SimpaisaHttpClient(resolved.config);
  return client.inquireTransaction({
    userKey: input.userKey,
    transactionId: input.transactionId,
  });
}

async function loadPurchaseAttemptBundle(
  purchaseId: string
): Promise<PurchaseAttemptBundle | null> {
  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      status: true,
      failureCategory: true,
      failureCode: true,
      orderId: true,
      providerOrderId: true,
      refundTransactionId: true,
      walletAppliedCents: true,
      debitTransactionId: true,
      reconciliationResolvedAt: true,
      reconciliationLockedAt: true,
      reconciliationLockedByAdminId: true,
      providerRefreshClaimedAt: true,
      providerRefreshCompletedAt: true,
      providerRefreshResult: true,
      debitTransaction: { select: { status: true } },
      paymentAttempts: {
        where: {
          gatewayProvider: PaymentGatewayProvider.SIMPAISA,
          gatewayPaymentRef: { not: null },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          gatewayProvider: true,
          gatewayPaymentRef: true,
          gatewayAmountCents: true,
          currency: true,
          chargeAmountMinor: true,
          chargeCurrency: true,
          webhookEventId: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!purchase) return null;

  const attempt =
    purchase.paymentAttempts.find(
      (row) => (row.gatewayPaymentRef ?? "").trim().length > 0
    ) ?? null;
  if (!attempt || !(attempt.gatewayPaymentRef ?? "").trim()) return null;

  return {
    purchase: {
      id: purchase.id,
      status: purchase.status,
      failureCategory: purchase.failureCategory,
      failureCode: purchase.failureCode,
      orderId: purchase.orderId,
      providerOrderId: purchase.providerOrderId,
      refundTransactionId: purchase.refundTransactionId,
      walletAppliedCents: purchase.walletAppliedCents,
      debitTransactionId: purchase.debitTransactionId,
      debitStatus: purchase.debitTransaction?.status ?? null,
      caseResolved: Boolean(purchase.reconciliationResolvedAt),
      caseLocked: Boolean(purchase.reconciliationLockedAt),
      lockedByAdminId: purchase.reconciliationLockedByAdminId,
      providerRefreshInProgress: isRefreshInProgress(purchase),
    },
    attempt: {
      id: attempt.id,
      status: attempt.status,
      gatewayProvider: attempt.gatewayProvider,
      gatewayPaymentRef: attempt.gatewayPaymentRef!.trim(),
      gatewayAmountCents: attempt.gatewayAmountCents,
      currency: attempt.currency,
      chargeAmountMinor: attempt.chargeAmountMinor,
      chargeCurrency: attempt.chargeCurrency,
      webhookEventId: attempt.webhookEventId,
    },
  };
}

function eligibilityFromBundle(
  bundle: PurchaseAttemptBundle,
  currentAdminId: string
) {
  return evaluateFundFulfillRecoveryEligibility({
    sourceType: "wallet_purchase",
    alreadyResolved: bundle.purchase.caseResolved,
    locked: bundle.purchase.caseLocked,
    lockedByAdminId: bundle.purchase.lockedByAdminId,
    currentAdminId,
    status: bundle.purchase.status,
    failureCategory: bundle.purchase.failureCategory,
    failureCode: bundle.purchase.failureCode,
    orderId: bundle.purchase.orderId,
    providerOrderId: bundle.purchase.providerOrderId,
    refundTransactionId: bundle.purchase.refundTransactionId,
    walletAppliedCents: bundle.purchase.walletAppliedCents,
    debitTransactionId: bundle.purchase.debitTransactionId,
    debitStatus: bundle.purchase.debitStatus,
    gatewayProvider: bundle.attempt.gatewayProvider,
    gatewayPaymentRef: bundle.attempt.gatewayPaymentRef,
    chargeAmountMinor: bundle.attempt.chargeAmountMinor,
    gatewayAmountCents: bundle.attempt.gatewayAmountCents,
    providerRefreshInProgress: bundle.purchase.providerRefreshInProgress,
  });
}

function expectedCharge(attempt: PurchaseAttemptBundle["attempt"]) {
  const expectedAmount =
    attempt.chargeAmountMinor ?? attempt.gatewayAmountCents;
  const expectedCurrency = (
    attempt.chargeCurrency ??
    attempt.currency ??
    "PKR"
  )
    .trim()
    .toUpperCase();
  return { expectedAmount, expectedCurrency };
}

async function confirmLiveSimpaisaPayment(options: {
  attempt: PurchaseAttemptBundle["attempt"];
  inquireFn: InquireFn;
}): Promise<
  | { ok: true; inquiry: SimpaisaInquiryResult }
  | { ok: false; blocker: string; detail?: string }
> {
  const resolved = resolveSimpaisaInquiryConfig();
  if (!resolved.ok) {
    return { ok: false, blocker: "inquiry_unavailable" };
  }

  let inquiry: SimpaisaInquiryResult;
  try {
    inquiry = await options.inquireFn({
      userKey: options.attempt.id,
      transactionId: options.attempt.gatewayPaymentRef,
    });
  } catch {
    return { ok: false, blocker: "inquiry_unavailable" };
  }

  if (inquiry.status !== "confirmed") {
    return { ok: false, blocker: "inquiry_not_confirmed" };
  }

  const { expectedAmount, expectedCurrency } = expectedCharge(options.attempt);
  const validation = validateSimpaisaAuthoritativeInquiry({
    inquiry: {
      status: inquiry.status,
      merchantId: inquiry.merchantId,
      operatorId: inquiry.operatorId,
      userKey: inquiry.userKey,
      providerTransactionId: inquiry.providerTransactionId,
      chargeAmountMinor: inquiry.chargeAmountMinor,
      chargeCurrency: inquiry.chargeCurrency,
      transactionType: inquiry.transactionType,
    },
    expected: {
      merchantId: resolved.config.merchantId,
      // operatorId is not stored on eSIM attempts; use Inquire-returned operator
      // so validation still enforces presence + wallet operator allow-list.
      operatorId: (inquiry.operatorId ?? "").trim(),
      userKey: options.attempt.id,
      transactionId: options.attempt.gatewayPaymentRef,
      chargeAmountMinor: expectedAmount,
      chargeCurrency: expectedCurrency,
    },
  });

  if (!validation.ok) {
    return {
      ok: false,
      blocker: "inquiry_validation_failed",
      detail: validation.reason,
    };
  }

  return { ok: true, inquiry };
}

/**
 * Recover Simpaisa claim_failed purchases into FUNDED + existing fulfill path.
 */
export async function recoverReconciliationFundAndFulfill(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  confirmPhrase: string;
  /** Test seam only. */
  inquireFn?: InquireFn;
  /** Test seam only. */
  fulfillFn?: typeof fulfillFundedEsimPurchase;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType || !isFundFulfillRecoverySourceType(sourceType)) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const ids = resolveIds(sourceType, options.attemptId);
  if (!ids) return { ok: false, error: PUBLIC_ERROR };

  const reasonParsed = parseCaseReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }
  const phrase = parseConfirmPhrase(
    options.confirmPhrase,
    RECOVER_PAYMENT_CREATE_ESIM_PHRASE
  );
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `recon-fund-fulfill:admin:${admin.id}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: FUND_FULFILL_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "fund_fulfill_recovery",
        failureCode: "rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many recovery attempts. Please wait and try again.",
    };
  }
  const caseRate = consumeRateLimit({
    key: `recon-fund-fulfill:case:${ids.sourceType}:${ids.attemptId}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!caseRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: FUND_FULFILL_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "fund_fulfill_recovery",
        failureCode: "case_rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many recovery attempts for this case. Please wait.",
    };
  }

  const bundle = await loadPurchaseAttemptBundle(ids.recordId);
  if (!bundle) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: FUND_FULFILL_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "fund_fulfill_recovery",
        failureCode: "missing_local_attempt",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  const localEligibility = eligibilityFromBundle(bundle, admin.id);
  if (!localEligibility.allowed) {
    const failureCode = localEligibility.blockers[0] ?? "blocked";
    await writeAuditLog({
      actorUserId: admin.id,
      action: FUND_FULFILL_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        paymentAttemptId: bundle.attempt.id,
        action: "fund_fulfill_recovery",
        failureCode,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: fundFulfillRecoveryBlockerLabel(failureCode) };
  }

  if (localEligibility.alreadyCompleted) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: FUND_FULFILL_RECOVERED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        purchaseId: ids.recordId,
        paymentAttemptId: bundle.attempt.id,
        action: "fund_fulfill_recovery",
        result: "already_completed",
        idempotent: true,
        orderId: bundle.purchase.orderId,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: true,
      idempotent: true,
      message: "Purchase already completed with a linked order.",
    };
  }

  const inquireFn = options.inquireFn ?? defaultInquire;
  const evidence = await confirmLiveSimpaisaPayment({
    attempt: bundle.attempt,
    inquireFn,
  });
  if (!evidence.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: FUND_FULFILL_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        paymentAttemptId: bundle.attempt.id,
        action: "fund_fulfill_recovery",
        failureCode: evidence.blocker,
        validationReason: evidence.detail ?? null,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: fundFulfillRecoveryBlockerLabel(evidence.blocker) };
  }

  const mode = localEligibility.mode;
  let fundedNow = false;

  if (mode === "fund_and_fulfill") {
    try {
      const cas = await prisma.$transaction(async (tx) => {
        const funded = await tx.walletEsimPurchase.updateMany({
          where: {
            id: ids.recordId,
            status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
            orderId: null,
            providerOrderId: null,
            refundTransactionId: null,
            reconciliationLockedByAdminId: admin.id,
            OR: [
              { failureCategory: "funding_finalize_failed" },
              { failureCode: "claim_failed" },
            ],
          },
          data: {
            status: WalletEsimPurchaseStatus.FUNDED,
            failureCategory: null,
            failureCode: null,
            reconciliationState: null,
          },
        });
        if (funded.count !== 1) {
          return { ok: false as const };
        }

        await tx.esimPurchasePaymentAttempt.updateMany({
          where: {
            id: bundle.attempt.id,
            purchaseId: ids.recordId,
          },
          data: {
            status: EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED,
            paymentConfirmedAt: new Date(),
            failedAt: null,
            failureCategory: null,
            failureCode: null,
            reconciliationState: null,
            // Leave webhookEventId unchanged to avoid unique conflicts with
            // a prior failure event id; purchase FUNDED is what fulfill needs.
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: admin.id,
            action: FUND_FULFILL_RECOVERED,
            targetType: ids.targetType,
            targetId: ids.recordId,
            metadata: {
              sourceType: ids.sourceType,
              attemptId: ids.attemptId,
              purchaseId: ids.recordId,
              paymentAttemptId: bundle.attempt.id,
              action: "fund_fulfill_recovery",
              result: "funded",
              mode: "fund_and_fulfill",
              gatewayPaymentRefPresent: true,
              reason: reasonParsed.reason.slice(0, 80),
            },
          },
        });

        return { ok: true as const };
      });

      if (!cas.ok) {
        await writeAuditLog({
          actorUserId: admin.id,
          action: FUND_FULFILL_BLOCKED,
          targetType: ids.targetType,
          targetId: ids.recordId,
          metadata: {
            sourceType: ids.sourceType,
            attemptId: ids.attemptId,
            paymentAttemptId: bundle.attempt.id,
            action: "fund_fulfill_recovery",
            failureCode: "fund_cas_failed",
            reason: reasonParsed.reason.slice(0, 80),
          },
        });
        return {
          ok: false,
          error: fundFulfillRecoveryBlockerLabel("fund_cas_failed"),
        };
      }
      fundedNow = true;
    } catch {
      await writeAuditLog({
        actorUserId: admin.id,
        action: FUND_FULFILL_BLOCKED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          paymentAttemptId: bundle.attempt.id,
          action: "fund_fulfill_recovery",
          failureCode: "transaction_failed",
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return { ok: false, error: PUBLIC_ERROR };
    }
  }

  const fulfill = options.fulfillFn ?? fulfillFundedEsimPurchase;
  let fulfillResult: Awaited<ReturnType<typeof fulfillFundedEsimPurchase>>;
  try {
    fulfillResult = await fulfill(ids.recordId);
  } catch {
    await writeAuditLog({
      actorUserId: admin.id,
      action: FUND_FULFILL_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        paymentAttemptId: bundle.attempt.id,
        action: "fund_fulfill_recovery",
        failureCode: "fulfill_failed",
        fundedNow,
        mode,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: fundFulfillRecoveryBlockerLabel("fulfill_failed"),
    };
  }

  if (!fulfillResult.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: FUND_FULFILL_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        paymentAttemptId: bundle.attempt.id,
        action: "fund_fulfill_recovery",
        failureCode: "fulfill_failed",
        fundedNow,
        mode,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: fundFulfillRecoveryBlockerLabel("fulfill_failed"),
    };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: FUND_FULFILL_RECOVERED,
    targetType: ids.targetType,
    targetId: ids.recordId,
    metadata: {
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      purchaseId: ids.recordId,
      paymentAttemptId: bundle.attempt.id,
      action: "fund_fulfill_recovery",
      result: "fulfilled",
      mode,
      fundedNow,
      idempotent: Boolean(fulfillResult.duplicate),
      orderId: fulfillResult.orderId ?? null,
      reason: reasonParsed.reason.slice(0, 80),
    },
  });

  return {
    ok: true,
    idempotent: Boolean(fulfillResult.duplicate),
    message: fulfillResult.duplicate
      ? "eSIM order already existed; recovery confirmed."
      : fundedNow
        ? "Payment recovered to FUNDED and eSIM fulfillment completed."
        : "eSIM fulfillment completed from FUNDED purchase.",
  };
}
