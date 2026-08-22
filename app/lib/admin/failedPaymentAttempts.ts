/**
 * Read-only admin inbox of failed/cancelled eSIM payment attempts.
 * Never funds, never cancels, never calls VeSIM, never enables the gateway.
 */
import "server-only";

import { EsimPurchasePaymentAttemptStatus } from "@prisma/client";
import { maskAdminEmail } from "@/app/lib/admin/display";
import {
  FAILED_PAYMENT_ATTEMPTS_LIMIT,
  failedPaymentAttemptStatusLabel,
  failedPaymentOccurredAt,
  formatFailedPaymentReason,
} from "@/app/lib/admin/failedPaymentAttemptsShared";
import { prisma } from "@/app/lib/db";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import { formatUsdCents } from "@/app/lib/wallet/display";

export type FailedGatewayPaymentAttemptRow = {
  attemptId: string;
  purchaseId: string;
  customerLabel: string;
  customerHref: string | null;
  planLabel: string;
  amountLabel: string;
  statusLabel: string;
  failureReason: string;
  occurredAtLabel: string;
};

function customerLabelFrom(user: {
  id: string;
  name: string | null;
  email: string | null;
} | null): string {
  if (!user) return "Not available";
  const name = (user.name ?? "").trim() || "Customer";
  return `${name} · ${maskAdminEmail(user.email)}`;
}

function planLabelFrom(row: {
  planName: string | null;
  destinationName: string | null;
  destinationCode: string | null;
}): string {
  const plan = (row.planName ?? "").trim();
  const dest =
    (row.destinationName ?? "").trim() || (row.destinationCode ?? "").trim();
  if (plan && dest) return `${dest} — ${plan}`;
  if (plan) return plan;
  if (dest) return dest;
  return "Not available";
}

export async function listFailedGatewayPaymentAttempts(
  limit = 40
): Promise<FailedGatewayPaymentAttemptRow[]> {
  const take = Math.min(
    Math.max(limit, 1),
    FAILED_PAYMENT_ATTEMPTS_LIMIT
  );
  const rows = await prisma.esimPurchasePaymentAttempt.findMany({
    where: {
      status: {
        in: [
          EsimPurchasePaymentAttemptStatus.FAILED,
          EsimPurchasePaymentAttemptStatus.CANCELLED,
        ],
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      status: true,
      gatewayAmountCents: true,
      currency: true,
      failureCategory: true,
      failureCode: true,
      failedAt: true,
      cancelledAt: true,
      updatedAt: true,
      createdAt: true,
      purchaseId: true,
      purchase: {
        select: {
          planName: true,
          destinationName: true,
          destinationCode: true,
          customer: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const customerId = (row.purchase.customer?.id ?? "").trim();
    const occurred = failedPaymentOccurredAt({
      failedAt: row.failedAt,
      cancelledAt: row.cancelledAt,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    });
    return {
      attemptId: row.id,
      purchaseId: row.purchaseId,
      customerLabel: customerLabelFrom(row.purchase.customer),
      customerHref:
        customerId && customerId.length <= 64
          ? `/admin/customers/${encodeURIComponent(customerId)}`
          : null,
      planLabel: planLabelFrom(row.purchase),
      amountLabel: `${formatUsdCents(row.gatewayAmountCents)} ${row.currency}`,
      statusLabel: failedPaymentAttemptStatusLabel(row.status),
      failureReason: formatFailedPaymentReason(
        row.failureCategory,
        row.failureCode
      ),
      occurredAtLabel:
        occurred instanceof Date
          ? formatUtcTimestamp(occurred)
          : formatUtcTimestamp(
              occurred ? new Date(occurred) : row.updatedAt
            ),
    };
  });
}
