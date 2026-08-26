/**
 * Synchronize customer RefundRequest rows after a MAP Wallet refund credit
 * already exists on the purchase (recon / auto failure paths).
 */
import "server-only";

import { Prisma, RefundRequestStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { REFUND_AUDIT } from "@/app/lib/refunds/refundRequestConstants";

type DbClient = Prisma.TransactionClient | typeof prisma;

const OPEN_FOR_SYNC: RefundRequestStatus[] = [
  RefundRequestStatus.REQUESTED,
  RefundRequestStatus.UNDER_REVIEW,
  RefundRequestStatus.APPROVED_PENDING_EXECUTION,
  RefundRequestStatus.EXECUTION_FAILED,
];

export async function syncCustomerRefundRequestsForPurchase(
  client: DbClient,
  options: {
    purchaseId: string;
    orderId?: string | null;
    refundTransactionId: string;
    creditedAmountCents: number;
    actorUserId?: string | null;
  }
): Promise<number> {
  const purchaseId = options.purchaseId.trim();
  const refundTransactionId = options.refundTransactionId.trim();
  const amountCents = options.creditedAmountCents;
  if (
    !purchaseId ||
    !refundTransactionId ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0
  ) {
    return 0;
  }

  const now = new Date();
  const orFilters: Prisma.RefundRequestWhereInput[] = [
    { purchaseId },
  ];
  const orderId = (options.orderId ?? "").trim();
  if (orderId) {
    orFilters.push({ orderId });
  }

  let updated: { count: number };
  try {
    updated = await client.refundRequest.updateMany({
      where: {
        status: { in: OPEN_FOR_SYNC },
        OR: orFilters,
      },
      data: {
        status: RefundRequestStatus.COMPLETED,
        executedRefundTransactionId: refundTransactionId,
        executedAmountCents: amountCents,
        executedAt: now,
        executedByAdminId: options.actorUserId ?? null,
        lastExecutionError: null,
        openOrderKey: null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    ) {
      return 0;
    }
    throw error;
  }

  if (updated.count > 0 && options.actorUserId) {
    const rows = await client.refundRequest.findMany({
      where: {
        status: RefundRequestStatus.COMPLETED,
        executedRefundTransactionId: refundTransactionId,
        OR: orFilters,
      },
      select: {
        id: true,
        orderId: true,
        refundAmountCents: true,
        executedAmountCents: true,
      },
      take: 10,
    });
    for (const row of rows) {
      await client.auditLog.create({
        data: {
          actorUserId: options.actorUserId,
          action: REFUND_AUDIT.REQUEST_SYNCED,
          targetType: "RefundRequest",
          targetId: row.id,
          metadata: {
            orderId: row.orderId,
            purchaseId,
            refundTransactionId,
            executedAmountCents: row.executedAmountCents,
            refundAmountCents: row.refundAmountCents,
            moneyMoved: true,
            gatewayRefundCalled: false,
            syncedFromExistingCredit: true,
          },
        },
      });
    }
  }

  return updated.count;
}

export async function syncCustomerRefundRequestsForOrder(
  client: DbClient,
  options: {
    orderId: string;
    refundTransactionId: string;
    creditedAmountCents: number;
    actorUserId?: string | null;
  }
): Promise<number> {
  const orderId = options.orderId.trim();
  const refundTransactionId = options.refundTransactionId.trim();
  const amountCents = options.creditedAmountCents;
  if (
    !orderId ||
    !refundTransactionId ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0
  ) {
    return 0;
  }

  const now = new Date();
  const updated = await client.refundRequest.updateMany({
    where: {
      orderId,
      status: { in: OPEN_FOR_SYNC },
    },
    data: {
      status: RefundRequestStatus.COMPLETED,
      executedRefundTransactionId: refundTransactionId,
      executedAmountCents: amountCents,
      executedAt: now,
      executedByAdminId: options.actorUserId ?? null,
      lastExecutionError: null,
      openOrderKey: null,
    },
  });

  return updated.count;
}
