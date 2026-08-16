/**
 * Evidence-gated Partner refund-request execution.
 * Credits only via refundPartnerPurchaseFundsInTx (exact Partner debit).
 * Never accepts a client amount. Never purchases from the provider.
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
import { parseConfirmPhrase, REFUND_PARTNER_FUNDS_PHRASE } from "@/app/lib/admin/reconciliationCaseShared";
import { confirmProviderFailure } from "@/app/lib/admin/reconciliationPartnerRefund";
import {
  PARTNER_REFUND_AUDIT,
} from "@/app/lib/partner/partnerRefundRequestConstants";
import {
  evaluatePartnerRefundRequestExecutionEligibility,
  mapProviderEvidenceBlocker,
  partnerRefundExecutionBlockerLabel,
  type PartnerRefundExecutionBlocker,
} from "@/app/lib/partner/partnerRefundRequestExecutionShared";
import { syncPartnerRefundRequestsForPurchase } from "@/app/lib/partner/partnerRefundRequestSync";
import {
  PartnerPurchaseWalletError,
  refundPartnerPurchaseFundsInTx,
} from "@/app/lib/partner/partnerPurchaseWallet";

export class PartnerRefundRequestExecutionError extends Error {
  readonly code: PartnerRefundExecutionBlocker | "UNAVAILABLE" | "INVALID_PHRASE";
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
  amount?: unknown;
  amountCents?: unknown;
  partnerId?: unknown;
  walletTransactionId?: unknown;
  status?: unknown;
  execute?: unknown;
  providerResult?: unknown;
  confirmProviderFailureFn?: typeof confirmProviderFailure;
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

/**
 * Execute an approved Partner refund request after fail-closed evidence checks.
 * Amount is always the stored Partner debit snapshot.
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

  const adminUserId = (input.adminUserId ?? "").trim();
  const requestId = (input.requestId ?? "").trim();
  if (!adminUserId || adminUserId.length > 64) {
    throw new PartnerRefundRequestExecutionError(
      "UNAVAILABLE",
      "Admin session is unavailable."
    );
  }
  if (!requestId || requestId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(requestId)) {
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
      reason: true,
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

  if (request.status === RefundRequestStatus.COMPLETED && request.executedRefundTransactionId) {
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
      offerId: true,
      providerOrderId: true,
      debitTransactionId: true,
      refundTransactionId: true,
      providerRefreshInstallData: true,
      debitTransaction: { select: { amountCents: true } },
      order: {
        select: {
          id: true,
          status: true,
          iccidLast4: true,
          iccidHash: true,
          iccidCapturedAt: true,
        },
      },
    },
  });
  if (!purchase) {
    throwBlocked("FINANCIAL_STATE_MISMATCH");
  }

  const last4 = (purchase.order?.iccidLast4 ?? "").replace(/\D+/g, "");
  const iccidPresent = Boolean(
    last4.length === 4 ||
      (purchase.order?.iccidHash ?? "").trim() ||
      purchase.order?.iccidCapturedAt
  );
  const installEvidencePresent =
    (purchase.providerRefreshInstallData ?? "").trim().toLowerCase() === "yes";

  const local = evaluatePartnerRefundRequestExecutionEligibility({
    requestStatus: request.status,
    requestReason: request.reason,
    requestPartnerId: request.partnerId,
    requestPartnerChargeCents: request.partnerChargeCents,
    purchasePartnerId: purchase.partnerId,
    purchaseStatus: purchase.status,
    fundingSource: purchase.fundingSource,
    purchasePartnerChargeCents: purchase.partnerChargeCents,
    debitTransactionId: purchase.debitTransactionId,
    debitAmountCents: purchase.debitTransaction?.amountCents ?? null,
    refundTransactionId: purchase.refundTransactionId,
    orderId: purchase.order?.id ?? request.orderId,
    orderStatus: purchase.order?.status ?? null,
    iccidPresent,
    installEvidencePresent,
  });

  const baseMeta = {
    requestId: request.id,
    partnerId: request.partnerId,
    purchaseId: purchase.id,
    orderId: request.orderId,
    partnerChargeCents: request.partnerChargeCents,
    currency: request.currency,
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
    await prisma.$transaction(async (tx) => {
      await syncPartnerRefundRequestsForPurchase(tx, {
        purchaseId: purchase.id,
        refundTransactionId,
        actorUserId: admin.id,
      });
    });
    return {
      requestId: request.id,
      status: RefundRequestStatus.COMPLETED,
      refundTransactionId,
      amountCents: request.partnerChargeCents,
      idempotent: true,
    };
  }

  const confirmFn = input.confirmProviderFailureFn ?? confirmProviderFailure;
  const providerOk = await confirmFn({
    providerOrderId: (purchase.providerOrderId ?? "").trim(),
    expectedOfferId: purchase.offerId,
  });
  if (!providerOk.ok) {
    const blocker = mapProviderEvidenceBlocker(providerOk.blocker);
    await audit(admin.id, PARTNER_REFUND_AUDIT.EXECUTION_BLOCKED, request.id, {
      ...baseMeta,
      blocker,
      providerBlocker: providerOk.blocker,
    });
    throwBlocked(blocker);
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
          providerRefreshInstallData: true,
          debitTransaction: { select: { amountCents: true } },
          order: {
            select: {
              id: true,
              status: true,
              iccidLast4: true,
              iccidHash: true,
              iccidCapturedAt: true,
            },
          },
        },
      });
      if (!freshRequest || !freshPurchase) {
        return { status: "blocked" as const, blocker: "FINANCIAL_STATE_MISMATCH" as const };
      }

      const freshLast4 = (freshPurchase.order?.iccidLast4 ?? "").replace(/\D+/g, "");
      const again = evaluatePartnerRefundRequestExecutionEligibility({
        requestStatus: freshRequest.status,
        requestReason: request.reason,
        requestPartnerId: freshRequest.partnerId,
        requestPartnerChargeCents: freshRequest.partnerChargeCents,
        purchasePartnerId: freshPurchase.partnerId,
        purchaseStatus: freshPurchase.status,
        fundingSource: freshPurchase.fundingSource,
        purchasePartnerChargeCents: freshPurchase.partnerChargeCents,
        debitTransactionId: freshPurchase.debitTransactionId,
        debitAmountCents: freshPurchase.debitTransaction?.amountCents ?? null,
        refundTransactionId: freshPurchase.refundTransactionId,
        orderId: freshPurchase.order?.id ?? request.orderId,
        orderStatus: freshPurchase.order?.status ?? null,
        iccidPresent: Boolean(
          freshLast4.length === 4 ||
            (freshPurchase.order?.iccidHash ?? "").trim() ||
            freshPurchase.order?.iccidCapturedAt
        ),
        installEvidencePresent:
          (freshPurchase.providerRefreshInstallData ?? "").trim().toLowerCase() ===
          "yes",
      });
      if (!again.ok) {
        return { status: "blocked" as const, blocker: again.blocker };
      }

      let refundTransactionId = freshPurchase.refundTransactionId;
      let outcome: "created" | "already_applied" = "already_applied";

      if (!again.alreadyRefunded) {
        const claim = await tx.partnerEsimPurchase.updateMany({
          where: {
            id: purchase.id,
            partnerId: request.partnerId,
            refundTransactionId: null,
            partnerChargeCents: request.partnerChargeCents,
            fundingSource: OrderFundingSource.PARTNER_BALANCE,
            status: {
              in: [
                PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
                PartnerEsimPurchaseStatus.PROVIDER_PENDING,
                PartnerEsimPurchaseStatus.FUNDS_RESERVED,
              ],
            },
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
          outcome = refund.outcome;
          const linked = await tx.partnerEsimPurchase.updateMany({
            where: {
              id: purchase.id,
              refundTransactionId: null,
              partnerChargeCents: request.partnerChargeCents,
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
            const raced = await tx.partnerEsimPurchase.findUnique({
              where: { id: purchase.id },
              select: { refundTransactionId: true },
            });
            if ((raced?.refundTransactionId ?? "").trim() !== refund.transactionId) {
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
        return { status: "blocked" as const, blocker: "FINANCIAL_STATE_MISMATCH" as const };
      }

      await syncPartnerRefundRequestsForPurchase(tx, {
        purchaseId: purchase.id,
        refundTransactionId,
      });

      return {
        status: "refunded" as const,
        refundTransactionId,
        outcome,
      };
    });

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
    });
    await audit(admin.id, PARTNER_REFUND_AUDIT.REQUEST_COMPLETED, request.id, {
      ...baseMeta,
      refundTransactionId: result.refundTransactionId,
      toStatus: RefundRequestStatus.COMPLETED,
    });

    return {
      requestId: request.id,
      status: RefundRequestStatus.COMPLETED,
      refundTransactionId: result.refundTransactionId,
      amountCents: request.partnerChargeCents,
      idempotent,
    };
  } catch (error) {
    if (error instanceof PartnerRefundRequestExecutionError) throw error;
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
    throw new PartnerRefundRequestExecutionError(
      "UNAVAILABLE",
      "Partner refund execution is temporarily unavailable."
    );
  }
}
