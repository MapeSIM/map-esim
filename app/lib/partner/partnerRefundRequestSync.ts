/**
 * Synchronize PartnerRefundRequest rows after an exact-once wallet refund.
 * Used by request execution and reconciliation so only one credit exists.
 */
import "server-only";

import { Prisma, RefundRequestStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { PARTNER_REFUND_AUDIT } from "@/app/lib/partner/partnerRefundRequestConstants";

type DbClient = Prisma.TransactionClient | typeof prisma;

const OPEN_FOR_SYNC: RefundRequestStatus[] = [
  RefundRequestStatus.REQUESTED,
  RefundRequestStatus.UNDER_REVIEW,
  RefundRequestStatus.APPROVED_PENDING_EXECUTION,
];

export type SyncPartnerRefundRequestsResult = {
  count: number;
  completedRequestIds: string[];
};

export async function syncPartnerRefundRequestsForPurchase(
  client: DbClient,
  options: {
    purchaseId: string;
    refundTransactionId: string;
    actorUserId?: string | null;
  }
): Promise<SyncPartnerRefundRequestsResult> {
  const purchaseId = options.purchaseId.trim();
  const refundTransactionId = options.refundTransactionId.trim();
  if (!purchaseId || !refundTransactionId) {
    return { count: 0, completedRequestIds: [] };
  }

  const now = new Date();
  let updated: { count: number };
  try {
    updated = await client.partnerRefundRequest.updateMany({
      where: {
        partnerEsimPurchaseId: purchaseId,
        status: { in: OPEN_FOR_SYNC },
      },
      data: {
        status: RefundRequestStatus.COMPLETED,
        executedRefundTransactionId: refundTransactionId,
        completedAt: now,
        openPurchaseKey: null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    ) {
      return { count: 0, completedRequestIds: [] };
    }
    throw error;
  }

  if (updated.count === 0) {
    return { count: 0, completedRequestIds: [] };
  }

  const rows = await client.partnerRefundRequest.findMany({
    where: {
      partnerEsimPurchaseId: purchaseId,
      status: RefundRequestStatus.COMPLETED,
      executedRefundTransactionId: refundTransactionId,
    },
    select: {
      id: true,
      partnerId: true,
      orderId: true,
      partnerChargeCents: true,
      currency: true,
    },
    take: 5,
  });

  if (options.actorUserId) {
    for (const row of rows) {
      await client.auditLog.create({
        data: {
          actorUserId: options.actorUserId,
          action: PARTNER_REFUND_AUDIT.REQUEST_COMPLETED,
          targetType: "PartnerRefundRequest",
          targetId: row.id,
          metadata: {
            requestId: row.id,
            partnerId: row.partnerId,
            purchaseId,
            orderId: row.orderId,
            partnerChargeCents: row.partnerChargeCents,
            currency: row.currency,
            refundTransactionId,
            syncedFrom: "purchase_refund",
          },
        },
      });
    }
  }

  return {
    count: updated.count,
    completedRequestIds: rows.map((row) => row.id),
  };
}
