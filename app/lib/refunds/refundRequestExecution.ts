/**
 * Customer refund-request execution: credit MAP Wallet with refundAmountCents.
 * Never calls Simpaisa/gateway requestRefund. Never uses refundReservedFundsInTx
 * (that path is reservation-reversal only).
 */
import "server-only";

import {
  Prisma,
  RefundRequestStatus,
  Role,
  WalletCurrency,
  WalletDirection,
  WalletEsimPurchaseStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { parseConfirmPhrase } from "@/app/lib/admin/reconciliationCaseShared";
import { prisma } from "@/app/lib/db";
import {
  CUSTOMER_REFUND_REQUEST_REFERENCE_TYPE,
  REFUND_AUDIT,
  REFUND_CUSTOMER_WALLET_PHRASE,
  customerRefundRequestIdempotencyKey,
  isExecutableRefundStatus,
} from "@/app/lib/refunds/refundRequestConstants";
import {
  customerRefundExecutionBlockerLabel,
  evaluateCustomerRefundExecutionEligibility,
  sanitizeCustomerRefundExecutionFailureReason,
  type CustomerRefundExecutionBlocker,
} from "@/app/lib/refunds/refundRequestExecutionShared";
import { scheduleRefundStatusNotification } from "@/app/lib/refunds/refundRequestNotification";
import { syncCustomerRefundRequestsForOrder } from "@/app/lib/refunds/refundRequestSync";
import { applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx } from "@/app/lib/rewards/rewardRefund";
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";

/** Production DB / Accelerate latency needs more than Prisma's 5s default. */
const CUSTOMER_REFUND_EXECUTION_TX = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

export class CustomerRefundRequestExecutionError extends Error {
  readonly code:
    | CustomerRefundExecutionBlocker
    | "UNAVAILABLE"
    | "INVALID_PHRASE"
    | "EXECUTION_FAILED";
  readonly blocker: CustomerRefundExecutionBlocker | null;

  constructor(
    code: CustomerRefundRequestExecutionError["code"],
    message: string,
    blocker: CustomerRefundExecutionBlocker | null = null
  ) {
    super(message);
    this.code = code;
    this.blocker = blocker;
    this.name = "CustomerRefundRequestExecutionError";
  }
}

export type ExecuteAdminCustomerRefundRequestInput = {
  adminUserId: string;
  requestId: string;
  confirmPhrase?: unknown;
  amount?: unknown;
  amountCents?: unknown;
  refundAmountCents?: unknown;
  creditWallet?: unknown;
  executeRefund?: unknown;
  markCompleted?: unknown;
  requestRefund?: unknown;
};

export type ExecuteAdminCustomerRefundRequestResult = {
  requestId: string;
  status: RefundRequestStatus;
  refundTransactionId: string;
  amountCents: number;
  idempotent: boolean;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function throwBlocked(blocker: CustomerRefundExecutionBlocker): never {
  throw new CustomerRefundRequestExecutionError(
    blocker,
    customerRefundExecutionBlockerLabel(blocker),
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
    throw new CustomerRefundRequestExecutionError(
      "UNAVAILABLE",
      "Admin session is unavailable."
    );
  }
  return admin;
}

async function markExecutionFailed(options: {
  requestId: string;
  adminUserId: string;
  orderId: string;
  reason: string;
}): Promise<void> {
  const safeReason = options.reason.replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, 120);
  try {
    await prisma.refundRequest.updateMany({
      where: {
        id: options.requestId,
        status: {
          in: [
            RefundRequestStatus.APPROVED_PENDING_EXECUTION,
            RefundRequestStatus.EXECUTION_FAILED,
          ],
        },
      },
      data: {
        status: RefundRequestStatus.EXECUTION_FAILED,
        lastExecutionError: safeReason || "execution_failed",
        openOrderKey: options.orderId,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: options.adminUserId,
        action: REFUND_AUDIT.EXECUTION_FAILED,
        targetType: "RefundRequest",
        targetId: options.requestId,
        metadata: {
          orderId: options.orderId,
          reason: safeReason || "execution_failed",
          moneyMoved: false,
          gatewayRefundCalled: false,
        },
      },
    });
  } catch {
    // Never mask the original execution error.
  }
}

/**
 * Execute an approved customer refund request by crediting MAP Wallet.
 * Amount is always refundAmountCents stored on the request.
 */
export async function executeAdminCustomerRefundRequest(
  input: ExecuteAdminCustomerRefundRequestInput
): Promise<ExecuteAdminCustomerRefundRequestResult> {
  void input.amount;
  void input.amountCents;
  void input.refundAmountCents;
  void input.creditWallet;
  void input.executeRefund;
  void input.markCompleted;
  void input.requestRefund;

  const adminUserId = (input.adminUserId ?? "").trim();
  const requestId = (input.requestId ?? "").trim();
  if (!adminUserId || adminUserId.length > 64) {
    throw new CustomerRefundRequestExecutionError(
      "UNAVAILABLE",
      "Admin session is unavailable."
    );
  }
  if (!requestId || requestId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(requestId)) {
    throw new CustomerRefundRequestExecutionError(
      "UNAVAILABLE",
      "This refund request is unavailable."
    );
  }

  const admin = await requireAdminUser(adminUserId);
  const phrase = parseConfirmPhrase(
    String(input.confirmPhrase ?? ""),
    REFUND_CUSTOMER_WALLET_PHRASE
  );
  if (!phrase.ok) {
    throw new CustomerRefundRequestExecutionError(
      "INVALID_PHRASE",
      phrase.error
    );
  }

  const request = await prisma.refundRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      orderId: true,
      customerUserId: true,
      purchaseId: true,
      refundAmountCents: true,
      currency: true,
      executedRefundTransactionId: true,
      executedAmountCents: true,
      customer: {
        select: { id: true, role: true, deletedAt: true },
      },
    },
  });
  if (!request) {
    throw new CustomerRefundRequestExecutionError(
      "UNAVAILABLE",
      "This refund request is unavailable."
    );
  }

  if (
    request.status === RefundRequestStatus.COMPLETED &&
    request.executedRefundTransactionId &&
    Number.isInteger(request.executedAmountCents) &&
    (request.executedAmountCents ?? 0) > 0
  ) {
    return {
      requestId: request.id,
      status: RefundRequestStatus.COMPLETED,
      refundTransactionId: request.executedRefundTransactionId,
      amountCents: request.executedAmountCents!,
      idempotent: true,
    };
  }

  const eligibility = evaluateCustomerRefundExecutionEligibility({
    requestStatus: request.status,
    refundAmountCents: request.refundAmountCents,
    customerRole: request.customer?.role ?? null,
    customerDeleted: Boolean(request.customer?.deletedAt),
  });
  if (!eligibility.ok) {
    await prisma.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: REFUND_AUDIT.EXECUTION_BLOCKED,
        targetType: "RefundRequest",
        targetId: request.id,
        metadata: {
          orderId: request.orderId,
          blocker: eligibility.blocker,
          moneyMoved: false,
          gatewayRefundCalled: false,
        },
      },
    });
    throwBlocked(eligibility.blocker);
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: REFUND_AUDIT.EXECUTION_STARTED,
      targetType: "RefundRequest",
      targetId: request.id,
      metadata: {
        orderId: request.orderId,
        fromStatus: request.status,
        refundAmountCents: request.refundAmountCents,
        moneyMoved: false,
        gatewayRefundCalled: false,
      },
    },
  });

  const purchase = request.purchaseId
    ? await prisma.walletEsimPurchase.findUnique({
        where: { id: request.purchaseId },
        select: {
          id: true,
          customerUserId: true,
          orderId: true,
          status: true,
          refundTransactionId: true,
          priceCents: true,
          refundTransaction: {
            select: {
              id: true,
              amountCents: true,
              type: true,
              direction: true,
              status: true,
            },
          },
        },
      })
    : request.orderId
      ? await prisma.walletEsimPurchase.findFirst({
          where: { orderId: request.orderId },
          select: {
            id: true,
            customerUserId: true,
            orderId: true,
            status: true,
            refundTransactionId: true,
            priceCents: true,
            refundTransaction: {
              select: {
                id: true,
                amountCents: true,
                type: true,
                direction: true,
                status: true,
              },
            },
          },
        })
      : null;

  // Sync path: purchase already has a completed refund credit from recon/auto.
  if (
    purchase?.refundTransactionId &&
    purchase.refundTransaction &&
    purchase.refundTransaction.type === WalletTransactionType.REFUND_CREDIT &&
    purchase.refundTransaction.direction === WalletDirection.CREDIT &&
    purchase.refundTransaction.status === WalletTransactionStatus.COMPLETED &&
    purchase.refundTransaction.amountCents > 0
  ) {
    const credited = purchase.refundTransaction.amountCents;
    await prisma.$transaction(async (tx) => {
      // Authoritative reward finalization if money already moved without rewards
      // (idempotent via purchase-scoped restore/reversal keys).
      await applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx(tx, {
        customerUserId: purchase.customerUserId,
        purchaseId: purchase.id,
        purchasePriceCents: purchase.priceCents,
        refundedAmountCents: credited,
        refundRequestId: request.id,
        actorUserId: admin.id,
      });
      await syncCustomerRefundRequestsForOrder(tx, {
        orderId: request.orderId,
        refundTransactionId: purchase.refundTransactionId!,
        creditedAmountCents: credited,
        actorUserId: admin.id,
      });
      // Ensure this request is completed even if order sync missed (edge cases).
      await tx.refundRequest.updateMany({
        where: {
          id: request.id,
          status: {
            in: [
              RefundRequestStatus.REQUESTED,
              RefundRequestStatus.UNDER_REVIEW,
              RefundRequestStatus.APPROVED_PENDING_EXECUTION,
              RefundRequestStatus.EXECUTION_FAILED,
            ],
          },
        },
        data: {
          status: RefundRequestStatus.COMPLETED,
          executedRefundTransactionId: purchase.refundTransactionId,
          executedAmountCents: credited,
          executedAt: new Date(),
          executedByAdminId: admin.id,
          lastExecutionError: null,
          openOrderKey: null,
        },
      });
    }, CUSTOMER_REFUND_EXECUTION_TX);
    scheduleRefundStatusNotification(request.id, "completed");
    return {
      requestId: request.id,
      status: RefundRequestStatus.COMPLETED,
      refundTransactionId: purchase.refundTransactionId,
      amountCents: credited,
      idempotent: true,
    };
  }

  const idempotencyKey = customerRefundRequestIdempotencyKey(request.id);
  const amountCents = request.refundAmountCents;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.refundRequest.findUnique({
        where: { id: request.id },
        select: {
          id: true,
          status: true,
          orderId: true,
          customerUserId: true,
          purchaseId: true,
          refundAmountCents: true,
          executedRefundTransactionId: true,
          executedAmountCents: true,
          customer: {
            select: { id: true, role: true, deletedAt: true },
          },
        },
      });
      if (!fresh) {
        return {
          status: "blocked" as const,
          blocker: "FINANCIAL_STATE_MISMATCH" as const,
        };
      }

      if (
        fresh.status === RefundRequestStatus.COMPLETED &&
        fresh.executedRefundTransactionId &&
        (fresh.executedAmountCents ?? 0) > 0
      ) {
        return {
          status: "completed" as const,
          refundTransactionId: fresh.executedRefundTransactionId,
          amountCents: fresh.executedAmountCents!,
          created: false,
        };
      }

      const again = evaluateCustomerRefundExecutionEligibility({
        requestStatus: fresh.status,
        refundAmountCents: fresh.refundAmountCents,
        customerRole: fresh.customer?.role ?? null,
        customerDeleted: Boolean(fresh.customer?.deletedAt),
      });
      if (!again.ok) {
        return { status: "blocked" as const, blocker: again.blocker };
      }

      // CAS claim before credit — only executable statuses.
      const claimed = await tx.refundRequest.updateMany({
        where: {
          id: fresh.id,
          status: {
            in: [
              RefundRequestStatus.APPROVED_PENDING_EXECUTION,
              RefundRequestStatus.EXECUTION_FAILED,
            ],
          },
        },
        data: {
          updatedAt: new Date(),
          lastExecutionError: null,
        },
      });
      if (claimed.count !== 1) {
        const raced = await tx.refundRequest.findUnique({
          where: { id: fresh.id },
          select: {
            status: true,
            executedRefundTransactionId: true,
            executedAmountCents: true,
          },
        });
        if (
          raced?.status === RefundRequestStatus.COMPLETED &&
          raced.executedRefundTransactionId &&
          (raced.executedAmountCents ?? 0) > 0
        ) {
          return {
            status: "completed" as const,
            refundTransactionId: raced.executedRefundTransactionId,
            amountCents: raced.executedAmountCents!,
            created: false,
          };
        }
        return {
          status: "blocked" as const,
          blocker: "FINANCIAL_STATE_MISMATCH" as const,
        };
      }

      const existingTx = await tx.walletTransaction.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          amountCents: true,
          type: true,
          direction: true,
          status: true,
          wallet: { select: { userId: true } },
        },
      });

      let refundTransactionId: string;
      let created = false;

      if (existingTx) {
        if (
          existingTx.amountCents !== amountCents ||
          existingTx.type !== WalletTransactionType.REFUND_CREDIT ||
          existingTx.direction !== WalletDirection.CREDIT ||
          existingTx.status !== WalletTransactionStatus.COMPLETED ||
          existingTx.wallet.userId !== fresh.customerUserId
        ) {
          return {
            status: "blocked" as const,
            blocker: "FINANCIAL_STATE_MISMATCH" as const,
          };
        }
        refundTransactionId = existingTx.id;
      } else {
        let wallet = await tx.walletAccount.findUnique({
          where: { userId: fresh.customerUserId },
          select: { id: true, balanceCents: true },
        });
        if (!wallet) {
          wallet = await tx.walletAccount.create({
            data: {
              userId: fresh.customerUserId,
              currency: WalletCurrency.USD,
              balanceCents: 0,
              version: 0,
            },
            select: { id: true, balanceCents: true },
          });
        }

        const updatedWallet = await tx.walletAccount.update({
          where: { id: wallet.id },
          data: {
            balanceCents: { increment: amountCents },
            version: { increment: 1 },
          },
          select: { balanceCents: true },
        });

        const refundTx = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: WalletTransactionType.REFUND_CREDIT,
            direction: WalletDirection.CREDIT,
            status: WalletTransactionStatus.COMPLETED,
            amountCents,
            balanceBeforeCents: wallet.balanceCents,
            balanceAfterCents: updatedWallet.balanceCents,
            idempotencyKey,
            referenceType: CUSTOMER_REFUND_REQUEST_REFERENCE_TYPE,
            referenceId: fresh.id,
          },
          select: { id: true },
        });
        refundTransactionId = refundTx.id;
        created = true;
      }

      // Link purchase refund state when a purchase exists (do not overwrite a different credit).
      const purchaseId = (fresh.purchaseId || purchase?.id || "").trim();
      if (purchaseId) {
        const purchaseRow = await tx.walletEsimPurchase.findUnique({
          where: { id: purchaseId },
          select: {
            id: true,
            customerUserId: true,
            refundTransactionId: true,
            priceCents: true,
          },
        });
        if (
          purchaseRow &&
          purchaseRow.customerUserId === fresh.customerUserId
        ) {
          if (
            purchaseRow.refundTransactionId &&
            purchaseRow.refundTransactionId !== refundTransactionId
          ) {
            // Existing different credit — keep purchase link; request still completes with our tx.
          } else if (!purchaseRow.refundTransactionId) {
            await tx.walletEsimPurchase.updateMany({
              where: {
                id: purchaseRow.id,
                refundTransactionId: null,
              },
              data: {
                status: WalletEsimPurchaseStatus.FAILED_REFUNDED,
                refundTransactionId,
                failureCategory: "provider_declined",
                failureCode: "refunded",
              },
            });
          } else {
            await tx.walletEsimPurchase.updateMany({
              where: { id: purchaseRow.id },
              data: {
                status: WalletEsimPurchaseStatus.FAILED_REFUNDED,
                failureCategory: "provider_declined",
                failureCode: "refunded",
              },
            });
          }

          await applyCustomerRewardEffectsForEligibleFullPurchaseRefundInTx(tx, {
            customerUserId: fresh.customerUserId,
            purchaseId: purchaseRow.id,
            purchasePriceCents: purchaseRow.priceCents,
            refundedAmountCents: amountCents,
            refundRequestId: fresh.id,
            actorUserId: admin.id,
          });
        }
      }

      const completed = await tx.refundRequest.updateMany({
        where: {
          id: fresh.id,
          status: {
            in: [
              RefundRequestStatus.APPROVED_PENDING_EXECUTION,
              RefundRequestStatus.EXECUTION_FAILED,
            ],
          },
        },
        data: {
          status: RefundRequestStatus.COMPLETED,
          executedRefundTransactionId: refundTransactionId,
          executedAmountCents: amountCents,
          executedAt: new Date(),
          executedByAdminId: admin.id,
          lastExecutionError: null,
          openOrderKey: null,
        },
      });
      if (completed.count !== 1) {
        const raced = await tx.refundRequest.findUnique({
          where: { id: fresh.id },
          select: {
            status: true,
            executedRefundTransactionId: true,
            executedAmountCents: true,
          },
        });
        if (
          raced?.status === RefundRequestStatus.COMPLETED &&
          raced.executedRefundTransactionId
        ) {
          return {
            status: "completed" as const,
            refundTransactionId: raced.executedRefundTransactionId,
            amountCents: raced.executedAmountCents ?? amountCents,
            created: false,
          };
        }
        return {
          status: "blocked" as const,
          blocker: "FINANCIAL_STATE_MISMATCH" as const,
        };
      }

      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: REFUND_AUDIT.WALLET_CREDITED,
          targetType: "RefundRequest",
          targetId: fresh.id,
          metadata: {
            orderId: fresh.orderId,
            refundTransactionId,
            executedAmountCents: amountCents,
            moneyMoved: true,
            gatewayRefundCalled: false,
            providerRefundCalled: false,
            method: "map_wallet_credit",
            created,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: REFUND_AUDIT.REQUEST_COMPLETED,
          targetType: "RefundRequest",
          targetId: fresh.id,
          metadata: {
            orderId: fresh.orderId,
            toStatus: RefundRequestStatus.COMPLETED,
            refundTransactionId,
            executedAmountCents: amountCents,
            moneyMoved: true,
            gatewayRefundCalled: false,
          },
        },
      });

      return {
        status: "completed" as const,
        refundTransactionId,
        amountCents,
        created,
      };
    }, CUSTOMER_REFUND_EXECUTION_TX);

    if (result.status === "blocked") {
      await markExecutionFailed({
        requestId: request.id,
        adminUserId: admin.id,
        orderId: request.orderId,
        reason: result.blocker,
      });
      throwBlocked(result.blocker);
    }

    if (result.created) {
      scheduleWalletTransactionNotification(result.refundTransactionId);
    }
    scheduleRefundStatusNotification(request.id, "completed");

    return {
      requestId: request.id,
      status: RefundRequestStatus.COMPLETED,
      refundTransactionId: result.refundTransactionId,
      amountCents: result.amountCents,
      idempotent: !result.created,
    };
  } catch (error) {
    if (error instanceof CustomerRefundRequestExecutionError) throw error;
    if (isUniqueViolation(error)) {
      const existing = await prisma.walletTransaction.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          amountCents: true,
          type: true,
          direction: true,
          status: true,
          wallet: { select: { userId: true } },
        },
      });
      if (
        existing &&
        existing.amountCents === amountCents &&
        existing.type === WalletTransactionType.REFUND_CREDIT &&
        existing.direction === WalletDirection.CREDIT &&
        existing.status === WalletTransactionStatus.COMPLETED &&
        existing.wallet.userId === request.customerUserId
      ) {
        await prisma.refundRequest.updateMany({
          where: {
            id: request.id,
            status: {
              in: [
                RefundRequestStatus.APPROVED_PENDING_EXECUTION,
                RefundRequestStatus.EXECUTION_FAILED,
              ],
            },
          },
          data: {
            status: RefundRequestStatus.COMPLETED,
            executedRefundTransactionId: existing.id,
            executedAmountCents: existing.amountCents,
            executedAt: new Date(),
            executedByAdminId: admin.id,
            lastExecutionError: null,
            openOrderKey: null,
          },
        });
        scheduleRefundStatusNotification(request.id, "completed");
        return {
          requestId: request.id,
          status: RefundRequestStatus.COMPLETED,
          refundTransactionId: existing.id,
          amountCents: existing.amountCents,
          idempotent: true,
        };
      }
    }

    await markExecutionFailed({
      requestId: request.id,
      adminUserId: admin.id,
      orderId: request.orderId,
      reason: sanitizeCustomerRefundExecutionFailureReason(error),
    });
    throw new CustomerRefundRequestExecutionError(
      "EXECUTION_FAILED",
      "MAP Wallet credit failed. The request is marked execution-failed and can be retried."
    );
  }
}

export function assertExecutableStatus(status: string): boolean {
  return isExecutableRefundStatus(status);
}
