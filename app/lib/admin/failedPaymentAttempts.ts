/**
 * Read-only admin inbox of failed/cancelled eSIM payment attempts.
 * Customer + partner display. Never funds, cancels, or enables the gateway.
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
import { paymentDashboardAttemptHref } from "@/app/lib/admin/paymentDashboardShared";
import { prisma } from "@/app/lib/db";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import { formatUsdCents } from "@/app/lib/wallet/display";

export type FailedGatewayPaymentAttemptRow = {
  attemptId: string;
  purchaseId: string;
  ownerKind: "customer" | "partner";
  ownerLabel: string;
  /** Customer or partner display name · masked email. */
  partyLabel: string;
  partyHref: string | null;
  /** @deprecated Prefer partyLabel — kept for QA/page compatibility. */
  customerLabel: string;
  customerHref: string | null;
  planLabel: string;
  amountLabel: string;
  providerLabel: string;
  statusLabel: string;
  failureReason: string;
  createdAtLabel: string;
  occurredAtLabel: string;
  detailHref: string;
};

function partyLabelFrom(
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null,
  kind: "customer" | "partner"
): string {
  if (!user) {
    return kind === "partner" ? "Partner unavailable" : "Not available";
  }
  const name =
    (user.name ?? "").trim() || (kind === "partner" ? "Partner" : "Customer");
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

function providerLabelFrom(provider: string | null | undefined): string {
  const value = (provider ?? "").trim();
  return value || "unknown";
}

export async function listFailedGatewayPaymentAttempts(
  limit = 40
): Promise<FailedGatewayPaymentAttemptRow[]> {
  const take = Math.min(
    Math.max(limit, 1),
    FAILED_PAYMENT_ATTEMPTS_LIMIT
  );
  const statusFilter = {
    in: [
      EsimPurchasePaymentAttemptStatus.FAILED,
      EsimPurchasePaymentAttemptStatus.CANCELLED,
    ],
  } as const;

  const [customerRows, partnerRows] = await Promise.all([
    prisma.esimPurchasePaymentAttempt.findMany({
      where: { status: statusFilter },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        status: true,
        gatewayProvider: true,
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
    }),
    prisma.partnerEsimPurchasePaymentAttempt.findMany({
      where: { status: statusFilter },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        status: true,
        gatewayProvider: true,
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
            partner: {
              select: {
                id: true,
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  type Merged = {
    ownerKind: "customer" | "partner";
    attemptId: string;
    purchaseId: string;
    status: string;
    gatewayProvider: string | null;
    gatewayAmountCents: number;
    currency: string;
    failureCategory: string | null;
    failureCode: string | null;
    failedAt: Date | null;
    cancelledAt: Date | null;
    updatedAt: Date;
    createdAt: Date;
    plan: {
      planName: string | null;
      destinationName: string | null;
      destinationCode: string | null;
    };
    partyUser: { id: string; name: string | null; email: string | null } | null;
    partyProfileId: string | null;
  };

  const merged: Merged[] = [
    ...customerRows.map((row) => {
      const purchase = row.purchase ?? null;
      return {
        ownerKind: "customer" as const,
        attemptId: row.id,
        purchaseId: row.purchaseId,
        status: row.status,
        gatewayProvider: row.gatewayProvider,
        gatewayAmountCents: row.gatewayAmountCents,
        currency: row.currency,
        failureCategory: row.failureCategory,
        failureCode: row.failureCode,
        failedAt: row.failedAt,
        cancelledAt: row.cancelledAt,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
        plan: {
          planName: purchase?.planName ?? null,
          destinationName: purchase?.destinationName ?? null,
          destinationCode: purchase?.destinationCode ?? null,
        },
        partyUser: purchase?.customer ?? null,
        partyProfileId: purchase?.customer?.id ?? null,
      };
    }),
    ...partnerRows.map((row) => {
      const partner = row.purchase?.partner ?? null;
      return {
        ownerKind: "partner" as const,
        attemptId: row.id,
        purchaseId: row.purchaseId,
        status: row.status,
        gatewayProvider: row.gatewayProvider,
        gatewayAmountCents: row.gatewayAmountCents,
        currency: row.currency,
        failureCategory: row.failureCategory,
        failureCode: row.failureCode,
        failedAt: row.failedAt,
        cancelledAt: row.cancelledAt,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
        plan: {
          planName: row.purchase?.planName ?? null,
          destinationName: row.purchase?.destinationName ?? null,
          destinationCode: row.purchase?.destinationCode ?? null,
        },
        partyUser: partner?.user ?? null,
        partyProfileId: partner?.id ?? null,
      };
    }),
  ]
    .sort((a, b) => {
      const byUpdated = b.updatedAt.getTime() - a.updatedAt.getTime();
      if (byUpdated !== 0) return byUpdated;
      return b.attemptId.localeCompare(a.attemptId);
    })
    .slice(0, take);

  return merged.map((row) => {
    const profileId = (row.partyProfileId ?? "").trim();
    const partyLabel = partyLabelFrom(row.partyUser, row.ownerKind);
    const partyHref =
      profileId && profileId.length <= 64
        ? row.ownerKind === "partner"
          ? `/admin/partners/${encodeURIComponent(profileId)}`
          : `/admin/customers/${encodeURIComponent(profileId)}`
        : null;
    const occurred = failedPaymentOccurredAt({
      failedAt: row.failedAt,
      cancelledAt: row.cancelledAt,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    });
    return {
      attemptId: row.attemptId,
      purchaseId: row.purchaseId,
      ownerKind: row.ownerKind,
      ownerLabel: row.ownerKind === "partner" ? "Partner" : "Customer",
      partyLabel,
      partyHref,
      customerLabel: partyLabel,
      customerHref: partyHref,
      planLabel: planLabelFrom(row.plan),
      amountLabel: `${formatUsdCents(row.gatewayAmountCents)} ${row.currency}`,
      providerLabel: providerLabelFrom(row.gatewayProvider),
      statusLabel: failedPaymentAttemptStatusLabel(row.status),
      failureReason: formatFailedPaymentReason(
        row.failureCategory,
        row.failureCode
      ),
      createdAtLabel: formatUtcTimestamp(row.createdAt),
      occurredAtLabel:
        occurred instanceof Date
          ? formatUtcTimestamp(occurred)
          : formatUtcTimestamp(
              occurred ? new Date(occurred) : row.updatedAt
            ),
      detailHref: paymentDashboardAttemptHref(row.attemptId, row.ownerKind),
    };
  });
}
