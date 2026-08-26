/**
 * Controlled confirmed-failure wallet refund recovery for reconciliation cases.
 * Reuses refundReservedFundsInTx after GET-only provider confirmation.
 * Never places/retries VeSIM orders, creates new debits, finalizes orders,
 * writes ICCID, unlocks/resolves cases, or accepts admin-supplied amounts.
 */
import "server-only";

import {
  OrderFundingSource,
  Prisma,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import {
  assertSameOriginAdminRequest,
  type CaseActionResult,
} from "@/app/lib/admin/reconciliationCaseManagement";
import {
  evaluateProviderRefundEvidence,
  evaluateWalletRefundLocalEligibility,
  isWalletRefundSourceType,
  normalizeCaseManagementSourceType,
  parseCaseReason,
  parseConfirmPhrase,
  REFUND_WALLET_FUNDS_PHRASE,
  walletRefundBlockerLabel,
  type CaseManagementSourceType,
  type WalletRefundEligibility,
  type WalletRefundSourceType,
} from "@/app/lib/admin/reconciliationCaseShared";
import { PROVIDER_REFRESH_STALE_CLAIM_MS } from "@/app/lib/admin/providerRefreshShared";
import {
  refundReservedFundsInTx,
  WalletEsimPurchaseError,
} from "@/app/lib/esim/walletPurchase";
import { syncCustomerRefundRequestsForPurchase } from "@/app/lib/refunds/refundRequestSync";
import { applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx } from "@/app/lib/rewards/rewardRefund";
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
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";

export const WALLET_REFUNDED = "reconciliation.wallet_refunded";
export const WALLET_REFUND_BLOCKED = "reconciliation.case_action_blocked";

const PUBLIC_ERROR =
  "Unable to refund wallet funds for this case right now.";

type JsonRecord = Record<string, unknown>;
type TxClient = Prisma.TransactionClient;

type ResolvedIds = {
  sourceType: WalletRefundSourceType;
  attemptId: string;
  recordId: string;
  targetType: string;
};

type PurchaseContext = {
  caseResolved: boolean;
  caseLocked: boolean;
  lockedByAdminId: string | null;
  providerRefreshInProgress: boolean;
  status: string;
  fundingSource: string;
  orderId: string | null;
  orderStatus: string | null;
  providerOrderId: string;
  offerId: string;
  customerUserId: string;
  adminUserId: string | null;
  priceCents: number;
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
  if (!isWalletRefundSourceType(sourceType)) return null;
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
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) return null;
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
  const row = await client.walletEsimPurchase.findUnique({
    where: { id: ids.recordId },
    select: {
      status: true,
      fundingSource: true,
      orderId: true,
      providerOrderId: true,
      offerId: true,
      customerUserId: true,
      adminUserId: true,
      priceCents: true,
      currency: true,
      debitTransactionId: true,
      refundTransactionId: true,
      reconciliationResolvedAt: true,
      reconciliationLockedAt: true,
      reconciliationLockedByAdminId: true,
      providerRefreshClaimedAt: true,
      providerRefreshCompletedAt: true,
      providerRefreshResult: true,
      debitTransaction: { select: { status: true, amountCents: true } },
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
    if (byProvider?.iccidHash || byProvider?.iccidCapturedAt) {
      fulfilmentIccidPresent = true;
    }
  }

  return {
    caseResolved: Boolean(row.reconciliationResolvedAt),
    caseLocked: Boolean(row.reconciliationLockedAt),
    lockedByAdminId: row.reconciliationLockedByAdminId,
    providerRefreshInProgress: isRefreshInProgress(row),
    status: row.status,
    fundingSource: row.fundingSource,
    orderId: row.orderId,
    orderStatus: row.order?.status ?? null,
    providerOrderId,
    offerId: row.offerId,
    customerUserId: row.customerUserId,
    adminUserId: row.adminUserId,
    priceCents: row.priceCents,
    currency: row.currency,
    debitTransactionId: row.debitTransactionId,
    debitAmountCents: row.debitTransaction?.amountCents ?? null,
    debitStatus: row.debitTransaction?.status ?? null,
    refundTransactionId: row.refundTransactionId,
    fulfilmentIccidPresent,
  };
}

function localEligibilityFromContext(
  ctx: PurchaseContext,
  currentAdminId: string
): WalletRefundEligibility {
  return evaluateWalletRefundLocalEligibility({
    sourceType: "wallet_purchase",
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
    customerUserId: ctx.customerUserId,
    priceCents: ctx.priceCents,
    debitAmountCents: ctx.debitAmountCents,
    debitStatus: ctx.debitStatus,
    debitTransactionId: ctx.debitTransactionId,
    refundTransactionId: ctx.refundTransactionId,
    fulfilmentIccidPresent: ctx.fulfilmentIccidPresent,
    providerRefreshInProgress: ctx.providerRefreshInProgress,
  });
}

async function confirmProviderFailure(options: {
  providerOrderId: string;
  expectedOfferId: string;
}): Promise<{ ok: true } | { ok: false; blocker: string }> {
  const providerOrderId = options.providerOrderId.trim();
  if (!providerOrderId || providerOrderId.length > 128) {
    return { ok: false, blocker: "missing_provider_reference" };
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(providerOrderId)) {
    return { ok: false, blocker: "missing_provider_reference" };
  }

  const observedAt = new Date();
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

    const baseUrl = getVesimBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      PROVIDER_LOOKUP_TIMEOUT_MS
    );
    try {
      const response = await fetch(
        `${baseUrl}/api/broker/orders/${encodeURIComponent(providerOrderId)}`,
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
    if (aborted) return { ok: false, blocker: "provider_uncertain" };
    return { ok: false, blocker: "provider_uncertain" };
  }

  const classified = classifyProviderOrderResponse({
    httpStatus,
    payload,
    requestedProviderOrderId: providerOrderId,
    expectedOfferId: options.expectedOfferId,
    observedAt,
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

export async function refundReconciliationWalletPurchase(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  confirmPhrase: string;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType || !isWalletRefundSourceType(sourceType)) {
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
    REFUND_WALLET_FUNDS_PHRASE
  );
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `recon-wallet-refund:admin:${admin.id}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: WALLET_REFUND_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "wallet_refund",
        failureCode: "rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many refund attempts. Please wait and try again.",
    };
  }
  const caseRate = consumeRateLimit({
    key: `recon-wallet-refund:case:${ids.sourceType}:${ids.attemptId}`,
    limit: 3,
    windowMs: 10 * 60 * 1000,
  });
  if (!caseRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: WALLET_REFUND_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "wallet_refund",
        failureCode: "case_rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many refund attempts for this case. Please wait.",
    };
  }

  const ctx = await loadPurchaseContext(ids);
  if (!ctx) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: WALLET_REFUND_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "wallet_refund",
        failureCode: "missing_local_attempt",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  const localEligibility = localEligibilityFromContext(ctx, admin.id);
  if (!localEligibility.allowed) {
    const failureCode = localEligibility.blockers[0] ?? "blocked";
    await writeAuditLog({
      actorUserId: admin.id,
      action: WALLET_REFUND_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "wallet_refund",
        failureCode,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: walletRefundBlockerLabel(failureCode) };
  }

  if (localEligibility.alreadyRefunded) {
    // Self-heal FULL reward effects + sync open RefundRequests (idempotent).
    const existingRefundId = ctx.refundTransactionId;
    if (existingRefundId) {
      try {
        await prisma.$transaction(async (tx) => {
          let creditedAmountCents = ctx.priceCents;
          const existingTx = await tx.walletTransaction.findUnique({
            where: { id: existingRefundId },
            select: { amountCents: true },
          });
          if (
            existingTx &&
            Number.isInteger(existingTx.amountCents) &&
            existingTx.amountCents > 0
          ) {
            creditedAmountCents = existingTx.amountCents;
          }
          await applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx(tx, {
            customerUserId: ctx.customerUserId,
            purchaseId: ids.recordId,
            purchasePriceCents: ctx.priceCents,
            refundedAmountCents: creditedAmountCents,
            actorUserId: admin.id,
          });
          await syncCustomerRefundRequestsForPurchase(tx, {
            purchaseId: ids.recordId,
            orderId: ctx.orderId,
            refundTransactionId: existingRefundId,
            creditedAmountCents,
            actorUserId: admin.id,
          });
        });
      } catch {
        // Idempotent path: never fail the already-refunded success response.
      }
    }
    await writeAuditLog({
      actorUserId: admin.id,
      action: WALLET_REFUNDED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        purchaseId: ids.recordId,
        refundTransactionId: ctx.refundTransactionId,
        action: "wallet_refund",
        result: "already_refunded",
        idempotent: true,
        amountCents: ctx.priceCents,
        currency: ctx.currency,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: true,
      idempotent: true,
      message: "Wallet funds were already refunded.",
    };
  }

  const providerOk = await confirmProviderFailure({
    providerOrderId: ctx.providerOrderId,
    expectedOfferId: ctx.offerId,
  });
  if (!providerOk.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: WALLET_REFUND_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "wallet_refund",
        failureCode: providerOk.blocker,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: walletRefundBlockerLabel(providerOk.blocker),
    };
  }

  let createdRefundTransactionId: string | null = null;
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
        const existingRefundId = fresh.refundTransactionId;
        let creditedAmountCents = fresh.priceCents;
        if (existingRefundId) {
          const existingTx = await tx.walletTransaction.findUnique({
            where: { id: existingRefundId },
            select: { amountCents: true },
          });
          if (
            existingTx &&
            Number.isInteger(existingTx.amountCents) &&
            existingTx.amountCents > 0
          ) {
            creditedAmountCents = existingTx.amountCents;
          }
          await applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx(tx, {
            customerUserId: fresh.customerUserId,
            purchaseId: ids.recordId,
            purchasePriceCents: fresh.priceCents,
            refundedAmountCents: creditedAmountCents,
            actorUserId: admin.id,
          });
          await syncCustomerRefundRequestsForPurchase(tx, {
            purchaseId: ids.recordId,
            orderId: fresh.orderId,
            refundTransactionId: existingRefundId,
            creditedAmountCents,
            actorUserId: admin.id,
          });
        }
        return {
          status: "idempotent" as const,
          refundTransactionId: existingRefundId,
          amountCents: creditedAmountCents,
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
      if (fresh.priceCents !== ctx.priceCents) {
        return {
          status: "blocked" as const,
          failureCode: "debit_amount_mismatch",
        };
      }
      if (fresh.fundingSource !== OrderFundingSource.CUSTOMER_WALLET) {
        return {
          status: "blocked" as const,
          failureCode: "not_customer_wallet_funded",
        };
      }

      const lockCas = await tx.walletEsimPurchase.updateMany({
        where: {
          id: ids.recordId,
          reconciliationResolvedAt: null,
          reconciliationLockedByAdminId: admin.id,
          NOT: { reconciliationLockedAt: null },
          status: {
            in: [
              WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED,
              WalletEsimPurchaseStatus.PROVIDER_PENDING,
              WalletEsimPurchaseStatus.FUNDS_RESERVED,
            ],
          },
          refundTransactionId: null,
        },
        data: {
          updatedAt: new Date(),
        },
      });
      if (lockCas.count === 0) {
        return { status: "blocked" as const, failureCode: "cas_conflict" };
      }

      const refund = await refundReservedFundsInTx(tx, {
        purchaseId: ids.recordId,
        customerUserId: fresh.customerUserId,
        actorUserId: admin.id,
        assisted: Boolean(fresh.adminUserId),
        priceCents: fresh.priceCents,
        currency: fresh.currency,
      });

      let creditedAmountCents = fresh.priceCents;
      if (refund.refundTransactionId) {
        const creditTx = await tx.walletTransaction.findUnique({
          where: { id: refund.refundTransactionId },
          select: { amountCents: true },
        });
        if (
          creditTx &&
          Number.isInteger(creditTx.amountCents) &&
          creditTx.amountCents > 0
        ) {
          creditedAmountCents = creditTx.amountCents;
        }
        await syncCustomerRefundRequestsForPurchase(tx, {
          purchaseId: ids.recordId,
          orderId: fresh.orderId,
          refundTransactionId: refund.refundTransactionId,
          creditedAmountCents,
          actorUserId: admin.id,
        });
      }

      return {
        status: "refunded" as const,
        outcome: refund.outcome,
        refundTransactionId: refund.refundTransactionId,
        amountCents: creditedAmountCents,
        currency: fresh.currency,
      };
    });

    if (result.status === "blocked") {
      await writeAuditLog({
        actorUserId: admin.id,
        action: WALLET_REFUND_BLOCKED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          action: "wallet_refund",
          failureCode: result.failureCode,
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return {
        ok: false,
        error: walletRefundBlockerLabel(result.failureCode),
      };
    }

    if (result.status === "idempotent") {
      await writeAuditLog({
        actorUserId: admin.id,
        action: WALLET_REFUNDED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          purchaseId: ids.recordId,
          refundTransactionId: result.refundTransactionId,
          action: "wallet_refund",
          result: "already_refunded",
          idempotent: true,
          amountCents: result.amountCents,
          currency: result.currency,
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return {
        ok: true,
        idempotent: true,
        message: "Wallet funds were already refunded.",
      };
    }

    const idempotent = result.outcome !== "created";
    if (result.outcome === "created" && result.refundTransactionId) {
      createdRefundTransactionId = result.refundTransactionId;
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: WALLET_REFUNDED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        purchaseId: ids.recordId,
        refundTransactionId: result.refundTransactionId,
        action: "wallet_refund",
        result: result.outcome,
        idempotent,
        amountCents: result.amountCents,
        currency: result.currency,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });

    if (createdRefundTransactionId) {
      scheduleWalletTransactionNotification(createdRefundTransactionId);
    }

    return {
      ok: true,
      idempotent,
      message: idempotent
        ? "Wallet funds were already refunded."
        : "Wallet funds refunded from confirmed provider failure evidence.",
    };
  } catch (error) {
    const failureCode =
      error instanceof WalletEsimPurchaseError
        ? "conflicting_refund"
        : "transaction_failed";
    await writeAuditLog({
      actorUserId: admin.id,
      action: WALLET_REFUND_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "wallet_refund",
        failureCode,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: PUBLIC_ERROR };
  }
}
