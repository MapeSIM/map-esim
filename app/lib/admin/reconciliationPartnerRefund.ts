/**
 * Controlled confirmed-failure Partner balance refund recovery.
 * Uses the immutable Partner charge snapshot after GET-only provider confirmation.
 * Never touches customer WalletAccount or accepts admin-supplied financial values.
 */
import "server-only";

import {
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import {
  assertSameOriginAdminRequest,
  type CaseActionResult,
} from "@/app/lib/admin/reconciliationCaseManagement";
import {
  evaluatePartnerRefundLocalEligibility,
  evaluateProviderRefundEvidence,
  isPartnerRefundSourceType,
  normalizeCaseManagementSourceType,
  parseCaseReason,
  parseConfirmPhrase,
  partnerRefundBlockerLabel,
  REFUND_PARTNER_FUNDS_PHRASE,
  type CaseManagementSourceType,
  type PartnerRefundEligibility,
  type PartnerRefundSourceType,
} from "@/app/lib/admin/reconciliationCaseShared";
import { PROVIDER_REFRESH_STALE_CLAIM_MS } from "@/app/lib/admin/providerRefreshShared";
import {
  PartnerPurchaseWalletError,
  refundPartnerPurchaseFundsInTx,
} from "@/app/lib/partner/partnerPurchaseWallet";
import { syncPartnerRefundRequestsForPurchase } from "@/app/lib/partner/partnerRefundRequestSync";
import { schedulePartnerRefundCompletedNotifications } from "@/app/lib/partner/partnerRefundRequestNotification";
import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import {
  classifyProviderOrderResponse,
  PROVIDER_LOOKUP_TIMEOUT_MS,
} from "@/app/lib/vesim/providerOrderStatus";
import {
  getBrokerToken,
  getVesimBaseUrl,
  readJsonSafe,
} from "@/app/lib/vesim/server";

export const PARTNER_WALLET_REFUNDED =
  "reconciliation.partner_wallet_refunded";
export const PARTNER_REFUND_BLOCKED = "reconciliation.case_action_blocked";

const PUBLIC_ERROR =
  "Unable to refund Partner funds for this case right now.";

type JsonRecord = Record<string, unknown>;
type TxClient = Prisma.TransactionClient;

type ResolvedIds = {
  sourceType: PartnerRefundSourceType;
  attemptId: string;
  recordId: string;
  targetType: "PartnerEsimPurchase";
};

type PurchaseContext = {
  caseResolved: boolean;
  caseLocked: boolean;
  lockedByAdminId: string | null;
  providerRefreshInProgress: boolean;
  providerInstallDataPresent: boolean;
  status: string;
  fundingSource: string;
  orderId: string | null;
  orderStatus: string | null;
  providerOrderId: string;
  offerId: string;
  partnerId: string;
  partnerChargeCents: number;
  currency: string;
  debitTransactionId: string | null;
  debitAmountCents: number | null;
  debitStatus: string | null;
  refundTransactionId: string | null;
  fulfilmentIccidPresent: boolean;
};

function resolveIds(
  sourceType: CaseManagementSourceType,
  attemptIdRaw: string
): ResolvedIds | null {
  if (!isPartnerRefundSourceType(sourceType)) return null;
  const attemptId = (attemptIdRaw ?? "").trim();
  if (!attemptId || attemptId.length > 64) return null;
  return {
    sourceType,
    attemptId,
    recordId: attemptId,
    targetType: "PartnerEsimPurchase",
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

async function loadPurchaseContext(
  ids: ResolvedIds,
  client: typeof prisma | TxClient = prisma
): Promise<PurchaseContext | null> {
  const row = await client.partnerEsimPurchase.findUnique({
    where: { id: ids.recordId },
    select: {
      status: true,
      fundingSource: true,
      partnerId: true,
      orderId: true,
      providerOrderId: true,
      offerId: true,
      partnerChargeCents: true,
      currency: true,
      debitTransactionId: true,
      refundTransactionId: true,
      reconciliationResolvedAt: true,
      reconciliationLockedAt: true,
      reconciliationLockedByAdminId: true,
      providerRefreshClaimedAt: true,
      providerRefreshCompletedAt: true,
      providerRefreshResult: true,
      providerRefreshInstallData: true,
      debitTransaction: { select: { amountCents: true } },
      order: {
        select: {
          status: true,
          iccidHash: true,
          iccidCapturedAt: true,
        },
      },
    },
  });
  if (!row) return null;

  const providerOrderId = (row.providerOrderId ?? "").trim();
  let fulfilmentIccidPresent = Boolean(
    row.order?.iccidHash || row.order?.iccidCapturedAt
  );
  if (!fulfilmentIccidPresent && providerOrderId) {
    const byProvider = await client.order.findUnique({
      where: { providerOrderId },
      select: { iccidHash: true, iccidCapturedAt: true },
    });
    fulfilmentIccidPresent = Boolean(
      byProvider?.iccidHash || byProvider?.iccidCapturedAt
    );
  }

  return {
    caseResolved: Boolean(row.reconciliationResolvedAt),
    caseLocked: Boolean(row.reconciliationLockedAt),
    lockedByAdminId: row.reconciliationLockedByAdminId,
    providerRefreshInProgress: isRefreshInProgress(row),
    providerInstallDataPresent:
      (row.providerRefreshInstallData ?? "").trim().toLowerCase() === "yes",
    status: row.status,
    fundingSource: row.fundingSource,
    orderId: row.orderId,
    orderStatus: row.order?.status ?? null,
    providerOrderId,
    offerId: row.offerId,
    partnerId: row.partnerId,
    partnerChargeCents: row.partnerChargeCents,
    currency: row.currency,
    debitTransactionId: row.debitTransactionId,
    debitAmountCents: row.debitTransaction?.amountCents ?? null,
    debitStatus: row.debitTransaction ? "COMPLETED" : null,
    refundTransactionId: row.refundTransactionId,
    fulfilmentIccidPresent,
  };
}

function localEligibilityFromContext(
  ctx: PurchaseContext,
  currentAdminId: string
): PartnerRefundEligibility {
  return evaluatePartnerRefundLocalEligibility({
    sourceType: "partner_purchase",
    alreadyResolved: ctx.caseResolved,
    locked: ctx.caseLocked,
    lockedByAdminId: ctx.lockedByAdminId,
    currentAdminId,
    status: ctx.status,
    fundingSource: ctx.fundingSource,
    orderId: ctx.orderId,
    orderStatus: ctx.orderStatus,
    providerOrderId: ctx.providerOrderId,
    offerId: ctx.offerId,
    partnerId: ctx.partnerId,
    partnerChargeCents: ctx.partnerChargeCents,
    debitAmountCents: ctx.debitAmountCents,
    debitStatus: ctx.debitStatus,
    debitTransactionId: ctx.debitTransactionId,
    refundTransactionId: ctx.refundTransactionId,
    fulfilmentIccidPresent: ctx.fulfilmentIccidPresent,
    providerInstallDataPresent: ctx.providerInstallDataPresent,
    providerRefreshInProgress: ctx.providerRefreshInProgress,
  });
}

export async function confirmProviderFailure(options: {
  providerOrderId: string;
  expectedOfferId: string;
}): Promise<{ ok: true } | { ok: false; blocker: string }> {
  const providerOrderId = options.providerOrderId.trim();
  if (
    !providerOrderId ||
    providerOrderId.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(providerOrderId)
  ) {
    return { ok: false, blocker: "missing_provider_reference" };
  }

  let httpStatus = 0;
  let payload: JsonRecord = {};
  try {
    getVesimBaseUrl();
  } catch (error) {
    if (error instanceof VesimEnvironmentError) {
      return { ok: false, blocker: "provider_environment_blocked" };
    }
    return { ok: false, blocker: "provider_environment_blocked" };
  }

  try {
    let token: { tokenType: string; accessToken: string };
    try {
      token = await getBrokerToken();
    } catch (error) {
      if (error instanceof VesimEnvironmentError) {
        return { ok: false, blocker: "provider_environment_blocked" };
      }
      return { ok: false, blocker: "provider_auth_failure" };
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      PROVIDER_LOOKUP_TIMEOUT_MS
    );
    try {
      const response = await fetch(
        `${getVesimBaseUrl()}/api/broker/orders/${encodeURIComponent(providerOrderId)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `${token.tokenType} ${token.accessToken}`,
          },
          cache: "no-store",
          signal: controller.signal,
        }
      );
      httpStatus = response.status;
      payload = (await readJsonSafe(response)) ?? {};
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const aborted =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name: string }).name === "AbortError");
    return {
      ok: false,
      blocker: aborted ? "provider_uncertain" : "provider_uncertain",
    };
  }

  const classified = classifyProviderOrderResponse({
    httpStatus,
    payload,
    requestedProviderOrderId: providerOrderId,
    expectedOfferId: options.expectedOfferId,
    observedAt: new Date(),
  });
  payload = {};

  return evaluateProviderRefundEvidence({
    lookupKind: classified.kind,
    orderExists: classified.orderExists,
    offerMatch: classified.offerMatch,
    installDataPresent: classified.installDataPresent,
    safeProviderState: classified.safeProviderState,
    hasExpectedOfferId: Boolean(options.expectedOfferId.trim()),
  });
}

async function auditBlocked(options: {
  adminId: string;
  ids: ResolvedIds;
  failureCode: string;
  reason: string;
}): Promise<void> {
  await writeAuditLog({
    actorUserId: options.adminId,
    action: PARTNER_REFUND_BLOCKED,
    targetType: options.ids.targetType,
    targetId: options.ids.recordId,
    metadata: {
      sourceType: options.ids.sourceType,
      attemptId: options.ids.attemptId,
      action: "partner_wallet_refund",
      failureCode: options.failureCode,
      reason: options.reason.slice(0, 80),
    },
  });
}

export async function refundReconciliationPartnerPurchase(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  confirmPhrase: string;
  /** Test seam only — defaults to GET-only provider failure confirmation. */
  confirmProviderFailureFn?: typeof confirmProviderFailure;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType || !isPartnerRefundSourceType(sourceType)) {
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
    REFUND_PARTNER_FUNDS_PHRASE
  );
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `recon-partner-refund:admin:${admin.id}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  const caseRate = consumeRateLimit({
    key: `recon-partner-refund:case:${ids.attemptId}`,
    limit: 3,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok || !caseRate.ok) {
    await auditBlocked({
      adminId: admin.id,
      ids,
      failureCode: adminRate.ok ? "case_rate_limited" : "rate_limited",
      reason: reasonParsed.reason,
    });
    return {
      ok: false,
      error: adminRate.ok
        ? "Too many refund attempts for this case. Please wait."
        : "Too many refund attempts. Please wait and try again.",
    };
  }

  const ctx = await loadPurchaseContext(ids);
  if (!ctx) {
    await auditBlocked({
      adminId: admin.id,
      ids,
      failureCode: "missing_local_attempt",
      reason: reasonParsed.reason,
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  const localEligibility = localEligibilityFromContext(ctx, admin.id);
  if (!localEligibility.allowed) {
    const failureCode = localEligibility.blockers[0] ?? "blocked";
    await auditBlocked({
      adminId: admin.id,
      ids,
      failureCode,
      reason: reasonParsed.reason,
    });
    return { ok: false, error: partnerRefundBlockerLabel(failureCode) };
  }

  if (localEligibility.alreadyRefunded) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: PARTNER_WALLET_REFUNDED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        purchaseId: ids.recordId,
        refundTransactionId: ctx.refundTransactionId,
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
        action: "partner_wallet_refund",
        result: "already_refunded",
        idempotent: true,
        amountCents: ctx.partnerChargeCents,
        currency: ctx.currency,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    if (ctx.refundTransactionId) {
      try {
        const synced = await syncPartnerRefundRequestsForPurchase(prisma, {
          purchaseId: ids.recordId,
          refundTransactionId: ctx.refundTransactionId,
          actorUserId: admin.id,
        });
        schedulePartnerRefundCompletedNotifications(synced.completedRequestIds);
      } catch {
        // Money already settled; request sync can complete on the next execute.
      }
    }
    return {
      ok: true,
      idempotent: true,
      message: "Partner funds were already refunded.",
    };
  }

  const confirmFn =
    options.confirmProviderFailureFn ?? confirmProviderFailure;
  const providerOk = await confirmFn({
    providerOrderId: ctx.providerOrderId,
    expectedOfferId: ctx.offerId,
  });
  if (!providerOk.ok) {
    await auditBlocked({
      adminId: admin.id,
      ids,
      failureCode: providerOk.blocker,
      reason: reasonParsed.reason,
    });
    return { ok: false, error: partnerRefundBlockerLabel(providerOk.blocker) };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await loadPurchaseContext(ids, tx);
      if (!fresh) {
        return {
          status: "blocked" as const,
          failureCode: "missing_local_attempt",
        };
      }
      const again = localEligibilityFromContext(fresh, admin.id);
      if (!again.allowed) {
        return {
          status: "blocked" as const,
          failureCode: again.blockers[0] ?? "blocked",
        };
      }
      if (again.alreadyRefunded) {
        return {
          status: "idempotent" as const,
          refundTransactionId: fresh.refundTransactionId,
          amountCents: fresh.partnerChargeCents,
          currency: fresh.currency,
        };
      }
      if (
        fresh.providerOrderId.toUpperCase() !==
        ctx.providerOrderId.toUpperCase()
      ) {
        return {
          status: "blocked" as const,
          failureCode: "provider_reference_mismatch",
        };
      }
      // Immutable amount assertion: both reads must match the persisted snapshot.
      if (
        fresh.partnerChargeCents !== ctx.partnerChargeCents ||
        fresh.debitAmountCents !== fresh.partnerChargeCents
      ) {
        return {
          status: "blocked" as const,
          failureCode: "debit_amount_mismatch",
        };
      }
      if (fresh.fundingSource !== OrderFundingSource.PARTNER_BALANCE) {
        return {
          status: "blocked" as const,
          failureCode: "not_partner_balance_funded",
        };
      }

      const lockCas = await tx.partnerEsimPurchase.updateMany({
        where: {
          id: ids.recordId,
          reconciliationResolvedAt: null,
          reconciliationLockedByAdminId: admin.id,
          NOT: { reconciliationLockedAt: null },
          status: {
            in: [
              PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
              PartnerEsimPurchaseStatus.PROVIDER_PENDING,
              PartnerEsimPurchaseStatus.FUNDS_RESERVED,
            ],
          },
          refundTransactionId: null,
          partnerChargeCents: fresh.partnerChargeCents,
          fundingSource: OrderFundingSource.PARTNER_BALANCE,
        },
        data: { updatedAt: new Date() },
      });
      if (lockCas.count !== 1) {
        return { status: "blocked" as const, failureCode: "cas_conflict" };
      }

      const refund = await refundPartnerPurchaseFundsInTx(tx, {
        partnerId: fresh.partnerId,
        partnerEsimPurchaseId: ids.recordId,
        amountCents: fresh.partnerChargeCents,
      });

      const linked = await tx.partnerEsimPurchase.updateMany({
        where: {
          id: ids.recordId,
          refundTransactionId: null,
          partnerChargeCents: fresh.partnerChargeCents,
        },
        data: {
          status: PartnerEsimPurchaseStatus.FAILED_REFUNDED,
          refundTransactionId: refund.transactionId,
          failureCategory: "provider_declined",
          failureCode: "refunded",
          reconciliationState: "refund_completed",
        },
      });
      if (linked.count !== 1) {
        throw new PartnerPurchaseWalletError(
          "IDEMPOTENCY_CONFLICT",
          "Partner refund link changed concurrently."
        );
      }

      return {
        status: "refunded" as const,
        outcome: refund.outcome,
        refundTransactionId: refund.transactionId,
        amountCents: fresh.partnerChargeCents,
        currency: fresh.currency,
      };
    });

    if (result.status === "blocked") {
      await auditBlocked({
        adminId: admin.id,
        ids,
        failureCode: result.failureCode,
        reason: reasonParsed.reason,
      });
      return {
        ok: false,
        error: partnerRefundBlockerLabel(result.failureCode),
      };
    }

    if (result.status === "idempotent") {
      await writeAuditLog({
        actorUserId: admin.id,
        action: PARTNER_WALLET_REFUNDED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          purchaseId: ids.recordId,
          refundTransactionId: result.refundTransactionId,
          fundingSource: OrderFundingSource.PARTNER_BALANCE,
          action: "partner_wallet_refund",
          result: "already_refunded",
          idempotent: true,
          amountCents: result.amountCents,
          currency: result.currency,
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      if (result.refundTransactionId) {
        try {
          const synced = await syncPartnerRefundRequestsForPurchase(prisma, {
            purchaseId: ids.recordId,
            refundTransactionId: result.refundTransactionId,
            actorUserId: admin.id,
          });
          schedulePartnerRefundCompletedNotifications(synced.completedRequestIds);
        } catch {
          // Money already settled; request sync can complete on the next execute.
        }
      }
      return {
        ok: true,
        idempotent: true,
        message: "Partner funds were already refunded.",
      };
    }

    const idempotent = result.outcome !== "created";
    await writeAuditLog({
      actorUserId: admin.id,
      action: PARTNER_WALLET_REFUNDED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        purchaseId: ids.recordId,
        refundTransactionId: result.refundTransactionId,
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
        action: "partner_wallet_refund",
        result: result.outcome,
        idempotent,
        amountCents: result.amountCents,
        currency: result.currency,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    if (result.refundTransactionId) {
      try {
        const synced = await syncPartnerRefundRequestsForPurchase(prisma, {
          purchaseId: ids.recordId,
          refundTransactionId: result.refundTransactionId,
          actorUserId: admin.id,
        });
        schedulePartnerRefundCompletedNotifications(synced.completedRequestIds);
      } catch {
        // Money already settled; request sync can complete on the next execute.
      }
    }
    return {
      ok: true,
      idempotent,
      message: idempotent
        ? "Partner funds were already refunded."
        : "Partner funds refunded from confirmed provider failure evidence.",
    };
  } catch (error) {
    const failureCode =
      error instanceof PartnerPurchaseWalletError
        ? "conflicting_refund"
        : "transaction_failed";
    await auditBlocked({
      adminId: admin.id,
      ids,
      failureCode,
      reason: reasonParsed.reason,
    });
    return { ok: false, error: PUBLIC_ERROR };
  }
}
