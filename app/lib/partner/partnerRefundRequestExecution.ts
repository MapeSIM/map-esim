/**
 * Partner refund-request execution (customer-parity).
 * Credits only via refundPartnerPurchaseFundsInTx (exact Partner debit).
 * Never accepts a client amount. Never calls the provider. Never purchases.
 */
import "server-only";

import {
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  Prisma,
  RefundRequestStatus,
  Role,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  parseConfirmPhrase,
  REFUND_PARTNER_FUNDS_PHRASE,
} from "@/app/lib/admin/reconciliationCaseShared";
import { PARTNER_REFUND_AUDIT } from "@/app/lib/partner/partnerRefundRequestConstants";
import {
  evaluatePartnerRefundRequestExecutionEligibility,
  partnerRefundExecutionBlockerLabel,
  type PartnerRefundExecutionBlocker,
} from "@/app/lib/partner/partnerRefundRequestExecutionShared";
import { syncPartnerRefundRequestsForPurchase } from "@/app/lib/partner/partnerRefundRequestSync";
import {
  schedulePartnerRefundCompletedNotifications,
  schedulePartnerRefundStatusNotification,
} from "@/app/lib/partner/partnerRefundRequestNotification";
import {
  PartnerPurchaseWalletError,
  refundPartnerPurchaseFundsInTx,
} from "@/app/lib/partner/partnerPurchaseWallet";

/** Production DB latency — match customer refund tx budget. */
const PARTNER_REFUND_EXECUTION_TX = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

export class PartnerRefundRequestExecutionError extends Error {
  readonly code:
    | PartnerRefundExecutionBlocker
    | "UNAVAILABLE"
    | "INVALID_PHRASE";
  readonly blocker: PartnerRefundExecutionBlocker | null;

  constructor(
    code: PartnerRefundRequestExecutionError["code"],
    message: string,
    blocker: PartnerRefundExecutionBlocker | null = null
  ) {
    super(message);
    this.code = code;
    this.blocker = blocker;
    this.name = "PartnerRefundRequestExecutionError";
  }
}

export type ExecuteAdminPartnerRefundRequestInput = {
  adminUserId: string;
  requestId: string;
  confirmPhrase?: unknown;
  /** Ignored — kept for older form posts / QA seams. */
  forceEvidenceOverride?: unknown;
  amount?: unknown;
  amountCents?: unknown;
  partnerId?: unknown;
  walletTransactionId?: unknown;
  status?: unknown;
  execute?: unknown;
  providerResult?: unknown;
  /** @deprecated No longer used — provider GET removed from request execution. */
  confirmProviderFailureFn?: unknown;
};

export type ExecuteAdminPartnerRefundRequestResult = {
  requestId: string;
  status: RefundRequestStatus;
  refundTransactionId: string;
  amountCents: number;
  idempotent: boolean;
};

function throwBlocked(blocker: PartnerRefundExecutionBlocker): never {
  throw new PartnerRefundRequestExecutionError(
    blocker,
    partnerRefundExecutionBlockerLabel(blocker),
    blocker
  );
}

async function requireAdminUser(adminUserId: string) {
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
    throw new PartnerRefundRequestExecutionError(
      "UNAVAILABLE",
      "Admin session is unavailable."
    );
  }
  return admin;
}

async function audit(
  actorUserId: string,
  action: string,
  requestId: string,
  metadata: Prisma.InputJsonValue
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      targetType: "PartnerRefundRequest",
      targetId: requestId,
      metadata,
    },
  });
}

function evidenceFromPurchase(options: {
  requestStatus: string;
  requestPartnerId: string;
  requestPartnerChargeCents: number;
  purchase: {
    partnerId: string;
    status: string;
    fundingSource: string;
    partnerChargeCents: number;
    debitTransactionId: string | null;
    refundTransactionId: string | null;
    debitTransaction: { amountCents: number } | null;
  };
}) {
  return {
    requestStatus: options.requestStatus,
    requestPartnerId: options.requestPartnerId,
    requestPartnerChargeCents: options.requestPartnerChargeCents,
    purchasePartnerId: options.purchase.partnerId,
    purchaseStatus: options.purchase.status,
    fundingSource: options.purchase.fundingSource,
    purchasePartnerChargeCents: options.purchase.partnerChargeCents,
    debitTransactionId: options.purchase.debitTransactionId,
    debitAmountCents: options.purchase.debitTransaction?.amountCents ?? null,
    refundTransactionId: options.purchase.refundTransactionId,
  };
}

/**
 * Execute an approved Partner refund request by restoring the exact Partner debit.
 * Same shape as customer MAP Wallet credit: admin + confirm phrase + financial CAS.
 */
export async function executeAdminPartnerRefundRequest(
  input: ExecuteAdminPartnerRefundRequestInput
): Promise<ExecuteAdminPartnerRefundRequestResult> {
  void input.amount;
  void input.amountCents;
  void input.partnerId;
  void input.walletTransactionId;
  void input.status;
  void input.execute;
  void input.providerResult;
  void input.forceEvidenceOverride;
  void input.confirmProviderFailureFn;

  const adminUserId = (input.adminUserId ?? "").trim();
  const requestId = (input.requestId ?? "").trim();
  if (!adminUserId || adminUserId.length > 64) {
    throw new PartnerRefundRequestExecutionError(
      "UNAVAILABLE",
      "Admin session is unavailable."
    );
  }
  if (
    !requestId ||
    requestId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(requestId)
  ) {
    throw new PartnerRefundRequestExecutionError(
      "UNAVAILABLE",
      "This Partner refund request is unavailable."
    );
  }

  const admin = await requireAdminUser(adminUserId);
  const phrase = parseConfirmPhrase(
    String(input.confirmPhrase ?? ""),
    REFUND_PARTNER_FUNDS_PHRASE
  );
  if (!phrase.ok) {
    throw new PartnerRefundRequestExecutionError(
      "INVALID_PHRASE",
      phrase.error
    );
  }

  const request = await prisma.partnerRefundRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      partnerId: true,
      partnerEsimPurchaseId: true,
      orderId: true,
      partnerChargeCents: true,
      currency: true,
      executedRefundTransactionId: true,
    },
  });
  if (!request) {
    throw new PartnerRefundRequestExecutionError(
      "UNAVAILABLE",
      "This Partner refund request is unavailable."
    );
  }

  if (
    request.status === RefundRequestStatus.COMPLETED &&
    request.executedRefundTransactionId
  ) {
    return {
      requestId: request.id,
      status: RefundRequestStatus.COMPLETED,
      refundTransactionId: request.executedRefundTransactionId,
      amountCents: request.partnerChargeCents,
      idempotent: true,
    };
  }

  const purchase = await prisma.partnerEsimPurchase.findUnique({
    where: { id: request.partnerEsimPurchaseId },
    select: {
      id: true,
      partnerId: true,
      status: true,
      fundingSource: true,
      partnerChargeCents: true,
      debitTransactionId: true,
      refundTransactionId: true,
      debitTransaction: { select: { amountCents: true } },
    },
  });
  if (!purchase) {
    throwBlocked("FINANCIAL_STATE_MISMATCH");
  }

  const local = evaluatePartnerRefundRequestExecutionEligibility(
    evidenceFromPurchase({
      requestStatus: request.status,
      requestPartnerId: request.partnerId,
      requestPartnerChargeCents: request.partnerChargeCents,
      purchase,
    })
  );

  const baseMeta = {
    requestId: request.id,
    partnerId: request.partnerId,
    purchaseId: purchase.id,
    orderId: request.orderId,
    partnerChargeCents: request.partnerChargeCents,
    currency: request.currency,
    moneyMoved: false,
    providerRefundCalled: false,
  };

  if (!local.ok) {
    await audit(admin.id, PARTNER_REFUND_AUDIT.EXECUTION_BLOCKED, request.id, {
      ...baseMeta,
      blocker: local.blocker,
    });
    throwBlocked(local.blocker);
  }

  await audit(admin.id, PARTNER_REFUND_AUDIT.EXECUTION_STARTED, request.id, {
    ...baseMeta,
    fromStatus: request.status,
  });

  if (local.alreadyRefunded) {
    const refundTransactionId =
      purchase.refundTransactionId || request.executedRefundTransactionId;
    if (!refundTransactionId) {
      throwBlocked("FINANCIAL_STATE_MISMATCH");
    }
    const synced = await prisma.$transaction(async (tx) => {
      return syncPartnerRefundRequestsForPurchase(tx, {
        purchaseId: purchase.id,
        refundTransactionId,
        actorUserId: admin.id,
      });
    }, PARTNER_REFUND_EXECUTION_TX);
    const completedIds =
      synced.completedRequestIds.length > 0
        ? synced.completedRequestIds
        : [request.id];
    schedulePartnerRefundCompletedNotifications(completedIds);
    return {
      requestId: request.id,
      status: RefundRequestStatus.COMPLETED,
      refundTransactionId,
      amountCents: request.partnerChargeCents,
      idempotent: true,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const freshRequest = await tx.partnerRefundRequest.findUnique({
        where: { id: request.id },
        select: {
          status: true,
          partnerId: true,
          partnerChargeCents: true,
          executedRefundTransactionId: true,
        },
      });
      const freshPurchase = await tx.partnerEsimPurchase.findUnique({
        where: { id: purchase.id },
        select: {
          partnerId: true,
          status: true,
          fundingSource: true,
          partnerChargeCents: true,
          debitTransactionId: true,
          refundTransactionId: true,
          debitTransaction: { select: { amountCents: true } },
        },
      });
      if (!freshRequest || !freshPurchase) {
        return {
          status: "blocked" as const,
          blocker: "FINANCIAL_STATE_MISMATCH" as const,
        };
      }

      if (
        freshRequest.status === RefundRequestStatus.COMPLETED &&
        freshRequest.executedRefundTransactionId
      ) {
        return {
          status: "refunded" as const,
          refundTransactionId: freshRequest.executedRefundTransactionId,
          outcome: "already_applied" as const,
        };
      }

      const again = evaluatePartnerRefundRequestExecutionEligibility(
        evidenceFromPurchase({
          requestStatus: freshRequest.status,
          requestPartnerId: freshRequest.partnerId,
          requestPartnerChargeCents: freshRequest.partnerChargeCents,
          purchase: freshPurchase,
        })
      );
      if (!again.ok) {
        return { status: "blocked" as const, blocker: again.blocker };
      }

      let refundTransactionId = freshPurchase.refundTransactionId;
      let outcome: "created" | "already_applied" = "already_applied";

      if (!again.alreadyRefunded) {
        // CAS: claim unrefunded purchase before credit (status-agnostic like customer).
        const claim = await tx.partnerEsimPurchase.updateMany({
          where: {
            id: purchase.id,
            partnerId: request.partnerId,
            refundTransactionId: null,
            partnerChargeCents: request.partnerChargeCents,
            fundingSource: OrderFundingSource.PARTNER_BALANCE,
          },
          data: { updatedAt: new Date() },
        });
        if (claim.count !== 1) {
          const raced = await tx.partnerEsimPurchase.findUnique({
            where: { id: purchase.id },
            select: { refundTransactionId: true },
          });
          const racedRefundId = (raced?.refundTransactionId ?? "").trim();
          if (!racedRefundId) {
            return {
              status: "blocked" as const,
              blocker: "FINANCIAL_STATE_MISMATCH" as const,
            };
          }
          refundTransactionId = racedRefundId;
        } else {
          const refund = await refundPartnerPurchaseFundsInTx(tx, {
            partnerId: request.partnerId,
            partnerEsimPurchaseId: purchase.id,
            amountCents: request.partnerChargeCents,
          });
          refundTransactionId = refund.transactionId;
          outcome =
            refund.outcome === "created" ? "created" : "already_applied";
          const linked = await tx.partnerEsimPurchase.updateMany({
            where: {
              id: purchase.id,
              refundTransactionId: null,
              partnerChargeCents: request.partnerChargeCents,
            },
            data: {
              status: PartnerEsimPurchaseStatus.FAILED_REFUNDED,
              refundTransactionId: refund.transactionId,
              failureCategory: "admin_refund",
              failureCode: "refunded",
              reconciliationState: "refund_completed",
            },
          });
          if (linked.count !== 1) {
            const raced = await tx.partnerEsimPurchase.findUnique({
              where: { id: purchase.id },
              select: { refundTransactionId: true },
            });
            if (
              (raced?.refundTransactionId ?? "").trim() !== refund.transactionId
            ) {
              throw new PartnerPurchaseWalletError(
                "IDEMPOTENCY_CONFLICT",
                "Partner refund link changed concurrently."
              );
            }
            refundTransactionId = raced!.refundTransactionId;
            outcome = "already_applied";
          }
        }
      }

      if (!refundTransactionId) {
        return {
          status: "blocked" as const,
          blocker: "FINANCIAL_STATE_MISMATCH" as const,
        };
      }

      await syncPartnerRefundRequestsForPurchase(tx, {
        purchaseId: purchase.id,
        refundTransactionId,
        actorUserId: admin.id,
      });

      return {
        status: "refunded" as const,
        refundTransactionId,
        outcome,
      };
    }, PARTNER_REFUND_EXECUTION_TX);

    if (result.status === "blocked") {
      await audit(admin.id, PARTNER_REFUND_AUDIT.EXECUTION_BLOCKED, request.id, {
        ...baseMeta,
        blocker: result.blocker,
      });
      throwBlocked(result.blocker);
    }

    const idempotent = result.outcome !== "created";
    await audit(admin.id, PARTNER_REFUND_AUDIT.WALLET_REFUNDED, request.id, {
      ...baseMeta,
      refundTransactionId: result.refundTransactionId,
      idempotent,
      moneyMoved: !idempotent,
    });
    await audit(admin.id, PARTNER_REFUND_AUDIT.REQUEST_COMPLETED, request.id, {
      ...baseMeta,
      refundTransactionId: result.refundTransactionId,
      toStatus: RefundRequestStatus.COMPLETED,
      moneyMoved: !idempotent,
    });

    schedulePartnerRefundStatusNotification(request.id, "completed");

    return {
      requestId: request.id,
      status: RefundRequestStatus.COMPLETED,
      refundTransactionId: result.refundTransactionId,
      amountCents: request.partnerChargeCents,
      idempotent,
    };
  } catch (error) {
    if (error instanceof PartnerRefundRequestExecutionError) throw error;
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: unknown }).name === "PartnerRefundRequestExecutionError"
    ) {
      throw error;
    }
    if (error instanceof PartnerPurchaseWalletError) {
      const blocker: PartnerRefundExecutionBlocker =
        error.code === "PARTNER_UNAVAILABLE"
          ? "PARTNER_UNAVAILABLE"
          : "FINANCIAL_STATE_MISMATCH";
      await audit(admin.id, PARTNER_REFUND_AUDIT.EXECUTION_BLOCKED, request.id, {
        ...baseMeta,
        blocker,
      });
      throwBlocked(blocker);
    }
    console.error("partner_refund_execute_unexpected", {
      requestId,
      name: error instanceof Error ? error.name : typeof error,
      message:
        error instanceof Error
          ? error.message.slice(0, 500)
          : String(error).slice(0, 500),
    });
    throw new PartnerRefundRequestExecutionError(
      "UNAVAILABLE",
      "Partner refund execution is temporarily unavailable."
    );
  }
}
