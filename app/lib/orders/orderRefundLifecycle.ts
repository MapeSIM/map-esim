/**
 * After a completed refund, release local ICCID/lifecycle sync pressure so
 * background polling and reconciliation do not keep warning on provider-missing
 * ICCID (VeSIM unbound/cancelled) or require manual clear.
 */
import "server-only";

import type { Prisma } from "@prisma/client";
import {
  PartnerEsimPurchaseStatus,
  RefundRequestStatus,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";

/** Stored on Order.reconciliationResolutionReason when refund auto-clears ICCID recon. */
export const ORDER_REFUND_LIFECYCLE_RESOLUTION_REASON =
  "REFUND_COMPLETED_LIFECYCLE_RELEASED";

/** Terminal cached VeSIM line state after refund (Order.providerLifecycleStatus). */
export const ORDER_REFUND_LIFECYCLE_STATUS = "CANCELLED";

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Mark a local order’s lifecycle as released after refund completion.
 * Idempotent. Does not delete stored ICCID (audit); stops Active sync warnings
 * and auto-resolves open ICCID reconciliation on the Order row.
 */
export async function releaseOrderLifecycleAfterCompletedRefund(
  client: DbClient,
  options: {
    orderId: string | null | undefined;
    actorUserId?: string | null;
  }
): Promise<void> {
  const orderId = (options.orderId ?? "").trim();
  if (!orderId || orderId.length > 64) return;

  const now = new Date();
  const actor =
    typeof options.actorUserId === "string" && options.actorUserId.trim()
      ? options.actorUserId.trim().slice(0, 64)
      : null;

  // Always advance lifecycle cache so usage sync stops treating the line as Active.
  await client.order.updateMany({
    where: { id: orderId },
    data: {
      providerLifecycleStatus: ORDER_REFUND_LIFECYCLE_STATUS,
      providerUsageSyncedAt: now,
      lifecycleUsageCheckedAt: now,
    },
  });

  // Auto-clear stuck ICCID / recon warnings — only when not already resolved.
  await client.order.updateMany({
    where: { id: orderId, reconciliationResolvedAt: null },
    data: {
      reconciliationResolvedAt: now,
      reconciliationResolvedByAdminId: actor,
      reconciliationResolutionReason: ORDER_REFUND_LIFECYCLE_RESOLUTION_REASON,
      reconciliationLockedAt: null,
      reconciliationLockedByAdminId: null,
      reconciliationEscalatedAt: null,
      reconciliationEscalationPriority: null,
      reconciliationEscalatedByAdminId: null,
    },
  });
}

/** Prisma where fragment: order is not covered by a completed customer/partner refund. */
export function orderNotCompletedRefundWhere(): Prisma.OrderWhereInput {
  return {
    AND: [
      {
        refundRequests: {
          none: { status: RefundRequestStatus.COMPLETED },
        },
      },
      {
        partnerRefundRequests: {
          none: { status: RefundRequestStatus.COMPLETED },
        },
      },
      {
        OR: [
          { walletEsimPurchase: null },
          {
            walletEsimPurchase: {
              status: { not: WalletEsimPurchaseStatus.FAILED_REFUNDED },
            },
          },
        ],
      },
      {
        OR: [
          { partnerEsimPurchase: null },
          {
            partnerEsimPurchase: {
              status: { not: PartnerEsimPurchaseStatus.FAILED_REFUNDED },
            },
          },
        ],
      },
    ],
  };
}

/**
 * True when the order already has a completed refund signal (customer or partner).
 * Used by lifecycle runner when VeSIM returns ICCID/usage not found.
 */
export async function orderHasCompletedRefundSignal(
  orderId: string
): Promise<boolean> {
  const id = (orderId ?? "").trim();
  if (!id || id.length > 64) return false;

  const row = await prisma.order.findUnique({
    where: { id },
    select: {
      refundRequests: {
        where: { status: RefundRequestStatus.COMPLETED },
        select: { id: true },
        take: 1,
      },
      partnerRefundRequests: {
        where: { status: RefundRequestStatus.COMPLETED },
        select: { id: true },
        take: 1,
      },
      walletEsimPurchase: { select: { status: true } },
      partnerEsimPurchase: { select: { status: true } },
    },
  });
  if (!row) return false;
  if (row.refundRequests.length > 0 || row.partnerRefundRequests.length > 0) {
    return true;
  }
  if (
    row.walletEsimPurchase?.status === WalletEsimPurchaseStatus.FAILED_REFUNDED
  ) {
    return true;
  }
  if (
    row.partnerEsimPurchase?.status ===
    PartnerEsimPurchaseStatus.FAILED_REFUNDED
  ) {
    return true;
  }
  return false;
}
