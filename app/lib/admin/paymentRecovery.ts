/**
 * Admin Payment Recovery Queue loaders (customer + partner).
 * Never funds, never marks paid, never replays webhooks, never enables the gateway.
 */
import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  PaymentGatewayProvider,
  Prisma,
} from "@prisma/client";
import { maskAdminEmail } from "@/app/lib/admin/display";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import {
  ADMIN_PAYMENT_RECOVERY_PAGE_SIZE,
  PAYMENT_RECOVERY_INVESTIGATE_AUDIT_ACTIONS,
  buildAdminPaymentRecoveryHref,
  formatPaymentRecoveryAge,
  isPaymentRecoveryCandidate,
  normalizePaymentRecoveryDecision,
  parsePaymentRecoveryPage,
  parsePaymentRecoveryStaleMs,
  paymentRecoveryDecisionLabel,
  paymentRecoveryStaleCutoff,
  paymentRecoveryWebhookStatusLabel,
  suggestPaymentRecoverySafeAction,
  type PaymentRecoveryOwnerKind,
} from "@/app/lib/admin/paymentRecoveryShared";
import { listPaymentWebhookReceiptsForAttempt } from "@/app/lib/admin/paymentWebhookReceipts";
import type { AdminPaymentWebhookReceiptRow } from "@/app/lib/admin/paymentWebhookReceipts";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";

export type AdminPaymentRecoveryRow = {
  attemptId: string;
  purchaseId: string;
  ownerKind: PaymentRecoveryOwnerKind;
  ownerLabel: string;
  ownerHref: string | null;
  providerLabel: string;
  amountLabel: string;
  ageLabel: string;
  webhookStatusLabel: string;
  lastDecisionLabel: string;
  lastDecisionAtLabel: string | null;
  suggestedSafeAction: string;
  href: string;
  updatedAt: Date;
};

export type AdminPaymentRecoveryDetailExtras = {
  isRecoveryCandidate: boolean;
  ownerKind: PaymentRecoveryOwnerKind;
  lastDecisionLabel: string;
  lastDecisionAtLabel: string | null;
  suggestedSafeAction: string;
  receipts: AdminPaymentWebhookReceiptRow[];
  staleReleaseEligible: boolean;
  walletAppliedCents: number;
};

function ownerLabelFrom(user: {
  id: string;
  name: string | null;
  email: string | null;
} | null, kind: PaymentRecoveryOwnerKind): string {
  if (!user) return kind === "partner" ? "Partner unavailable" : "Not available";
  const name =
    (user.name ?? "").trim() || (kind === "partner" ? "Partner" : "Customer");
  return `${name} · ${maskAdminEmail(user.email)}`;
}

function recoveryAttemptStatusFilter(): EsimPurchasePaymentAttemptStatus[] {
  return [
    EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
    EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
    EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
  ];
}

function recoveryCandidateWhere(
  staleCutoff: Date
): Prisma.EsimPurchasePaymentAttemptWhereInput {
  return {
    status: { in: recoveryAttemptStatusFilter() },
    gatewayProvider: {
      in: [PaymentGatewayProvider.SIMPAISA, PaymentGatewayProvider.SAFEPAY],
    },
    AND: [
      { gatewayPaymentRef: { not: null } },
      { gatewayPaymentRef: { not: "" } },
    ],
    webhookEventId: null,
    updatedAt: { lte: staleCutoff },
  };
}

function partnerRecoveryCandidateWhere(
  staleCutoff: Date
): Prisma.PartnerEsimPurchasePaymentAttemptWhereInput {
  return {
    status: { in: recoveryAttemptStatusFilter() },
    gatewayProvider: {
      in: [PaymentGatewayProvider.SIMPAISA, PaymentGatewayProvider.SAFEPAY],
    },
    AND: [
      { gatewayPaymentRef: { not: null } },
      { gatewayPaymentRef: { not: "" } },
    ],
    webhookEventId: null,
    updatedAt: { lte: staleCutoff },
  };
}

export async function countPaymentRecoveryCandidates(
  nowMs: number = Date.now()
): Promise<number> {
  const staleMs = parsePaymentRecoveryStaleMs();
  const staleCutoff = paymentRecoveryStaleCutoff(nowMs, staleMs);
  const [customer, partner] = await Promise.all([
    prisma.esimPurchasePaymentAttempt.count({
      where: recoveryCandidateWhere(staleCutoff),
    }),
    prisma.partnerEsimPurchasePaymentAttempt.count({
      where: partnerRecoveryCandidateWhere(staleCutoff),
    }),
  ]);
  return customer + partner;
}

type AuditDecision = {
  decision: string | null;
  at: Date | null;
};

async function loadLatestInvestigateDecisions(
  attemptIds: string[],
  targetType: string
): Promise<Map<string, AuditDecision>> {
  const map = new Map<string, AuditDecision>();
  if (attemptIds.length === 0) return map;

  const rows = await prisma.auditLog.findMany({
    where: {
      targetType,
      targetId: { in: attemptIds },
      action: { in: [...PAYMENT_RECOVERY_INVESTIGATE_AUDIT_ACTIONS] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      targetId: true,
      createdAt: true,
      metadata: true,
    },
  });

  for (const row of rows) {
    const id = (row.targetId ?? "").trim();
    if (!id || map.has(id)) continue;
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
    const decision = normalizePaymentRecoveryDecision(meta?.decision);
    map.set(id, { decision, at: row.createdAt });
  }

  return map;
}

type MergedCandidate = {
  ownerKind: PaymentRecoveryOwnerKind;
  attemptId: string;
  purchaseId: string;
  status: string;
  gatewayProvider: string | null;
  gatewayPaymentRef: string | null;
  webhookEventId: string | null;
  gatewayAmountCents: number;
  currency: string;
  updatedAt: Date;
  ownerUser: { id: string; name: string | null; email: string | null } | null;
  ownerProfileId: string | null;
  walletAppliedCents: number;
};

export async function listPaymentRecoveryCandidates(input?: {
  page?: string | null;
  nowMs?: number;
}): Promise<{
  rows: AdminPaymentRecoveryRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  staleMinutes: number;
}> {
  const nowMs =
    typeof input?.nowMs === "number" && Number.isFinite(input.nowMs)
      ? input.nowMs
      : Date.now();
  const staleMs = parsePaymentRecoveryStaleMs();
  const staleCutoff = paymentRecoveryStaleCutoff(nowMs, staleMs);
  const page = parsePaymentRecoveryPage(input?.page);
  const take = ADMIN_PAYMENT_RECOVERY_PAGE_SIZE;
  const skip = (page - 1) * take;

  const [customerCount, partnerCount, customerRows, partnerRows] =
    await Promise.all([
      prisma.esimPurchasePaymentAttempt.count({
        where: recoveryCandidateWhere(staleCutoff),
      }),
      prisma.partnerEsimPurchasePaymentAttempt.count({
        where: partnerRecoveryCandidateWhere(staleCutoff),
      }),
      prisma.esimPurchasePaymentAttempt.findMany({
        where: recoveryCandidateWhere(staleCutoff),
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: take + skip,
        select: {
          id: true,
          purchaseId: true,
          status: true,
          gatewayProvider: true,
          gatewayAmountCents: true,
          currency: true,
          gatewayPaymentRef: true,
          webhookEventId: true,
          updatedAt: true,
          purchase: {
            select: {
              walletAppliedCents: true,
              customer: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      }),
      prisma.partnerEsimPurchasePaymentAttempt.findMany({
        where: partnerRecoveryCandidateWhere(staleCutoff),
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: take + skip,
        select: {
          id: true,
          purchaseId: true,
          status: true,
          gatewayProvider: true,
          gatewayAmountCents: true,
          currency: true,
          gatewayPaymentRef: true,
          webhookEventId: true,
          updatedAt: true,
          purchase: {
            select: {
              walletAppliedCents: true,
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

  const merged: MergedCandidate[] = [
    ...customerRows.map((row) => ({
      ownerKind: "customer" as const,
      attemptId: row.id,
      purchaseId: row.purchaseId,
      status: row.status,
      gatewayProvider: row.gatewayProvider,
      gatewayPaymentRef: row.gatewayPaymentRef,
      webhookEventId: row.webhookEventId,
      gatewayAmountCents: row.gatewayAmountCents,
      currency: row.currency,
      updatedAt: row.updatedAt,
      ownerUser: row.purchase.customer,
      ownerProfileId: row.purchase.customer?.id ?? null,
      walletAppliedCents: row.purchase.walletAppliedCents,
    })),
    ...partnerRows.map((row) => ({
      ownerKind: "partner" as const,
      attemptId: row.id,
      purchaseId: row.purchaseId,
      status: row.status,
      gatewayProvider: row.gatewayProvider,
      gatewayPaymentRef: row.gatewayPaymentRef,
      webhookEventId: row.webhookEventId,
      gatewayAmountCents: row.gatewayAmountCents,
      currency: row.currency,
      updatedAt: row.updatedAt,
      ownerUser: row.purchase.partner.user,
      ownerProfileId: row.purchase.partner.id,
      walletAppliedCents: row.purchase.walletAppliedCents,
    })),
  ]
    .filter((row) =>
      isPaymentRecoveryCandidate({
        status: row.status,
        gatewayProvider: row.gatewayProvider,
        gatewayPaymentRef: row.gatewayPaymentRef,
        webhookEventId: row.webhookEventId,
        updatedAt: row.updatedAt,
        nowMs,
        staleMs,
      })
    )
    .sort((a, b) => {
      const age = a.updatedAt.getTime() - b.updatedAt.getTime();
      if (age !== 0) return age;
      return a.attemptId.localeCompare(b.attemptId);
    });

  const totalCount = customerCount + partnerCount;
  const pageSlice = merged.slice(skip, skip + take);

  const customerIds = pageSlice
    .filter((r) => r.ownerKind === "customer")
    .map((r) => r.attemptId);
  const partnerIds = pageSlice
    .filter((r) => r.ownerKind === "partner")
    .map((r) => r.attemptId);

  const [customerDecisions, partnerDecisions] = await Promise.all([
    loadLatestInvestigateDecisions(customerIds, "EsimPurchasePaymentAttempt"),
    loadLatestInvestigateDecisions(
      partnerIds,
      "PartnerEsimPurchasePaymentAttempt"
    ),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / take));

  return {
    rows: pageSlice.map((row) => {
      const profileId = (row.ownerProfileId ?? "").trim();
      const audit =
        row.ownerKind === "customer"
          ? customerDecisions.get(row.attemptId)
          : partnerDecisions.get(row.attemptId);
      const decision = audit?.decision ?? null;
      return {
        attemptId: row.attemptId,
        purchaseId: row.purchaseId,
        ownerKind: row.ownerKind,
        ownerLabel: ownerLabelFrom(row.ownerUser, row.ownerKind),
        ownerHref:
          profileId && profileId.length <= 64
            ? row.ownerKind === "partner"
              ? `/admin/partners/${encodeURIComponent(profileId)}`
              : `/admin/customers/${encodeURIComponent(profileId)}`
            : null,
        providerLabel: row.gatewayProvider ?? "unknown",
        amountLabel: `${formatUsdCents(row.gatewayAmountCents)} ${row.currency}`,
        ageLabel: formatPaymentRecoveryAge(row.updatedAt, nowMs),
        webhookStatusLabel: paymentRecoveryWebhookStatusLabel(),
        lastDecisionLabel: paymentRecoveryDecisionLabel(decision),
        lastDecisionAtLabel: audit?.at
          ? formatUtcTimestamp(audit.at)
          : null,
        suggestedSafeAction: suggestPaymentRecoverySafeAction(decision, {
          ownerKind: row.ownerKind,
        }),
        href: `/admin/payments/${encodeURIComponent(row.attemptId)}?kind=${row.ownerKind}`,
        updatedAt: row.updatedAt,
      };
    }),
    page,
    pageSize: take,
    totalCount,
    totalPages,
    staleMinutes: Math.round(staleMs / 60_000),
  };
}

export async function getAdminPaymentRecoveryDetailExtras(
  paymentAttemptId: string,
  ownerKindHint?: PaymentRecoveryOwnerKind | null
): Promise<AdminPaymentRecoveryDetailExtras | null> {
  const id = (paymentAttemptId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) return null;

  const nowMs = Date.now();
  const staleMs = parsePaymentRecoveryStaleMs();

  async function fromCustomer(): Promise<AdminPaymentRecoveryDetailExtras | null> {
    const row = await prisma.esimPurchasePaymentAttempt.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        gatewayProvider: true,
        gatewayPaymentRef: true,
        webhookEventId: true,
        expiresAt: true,
        updatedAt: true,
        purchase: {
          select: {
            status: true,
            walletAppliedCents: true,
          },
        },
      },
    });
    if (!row) return null;

    const isCandidate = isPaymentRecoveryCandidate({
      status: row.status,
      gatewayProvider: row.gatewayProvider,
      gatewayPaymentRef: row.gatewayPaymentRef,
      webhookEventId: row.webhookEventId,
      updatedAt: row.updatedAt,
      nowMs,
      staleMs,
    });
    const decisions = await loadLatestInvestigateDecisions(
      [row.id],
      "EsimPurchasePaymentAttempt"
    );
    const audit = decisions.get(row.id);
    const decision = audit?.decision ?? null;
    const receipts = await listPaymentWebhookReceiptsForAttempt(row.id);
    const staleReleaseEligible =
      !row.webhookEventId &&
      (row.status === EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT ||
        row.status === EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING ||
        row.status === EsimPurchasePaymentAttemptStatus.DRAFT) &&
      row.purchase.status === "AWAITING_GATEWAY_PAYMENT" &&
      (Boolean(row.expiresAt && row.expiresAt.getTime() <= nowMs) ||
        row.updatedAt.getTime() <= nowMs - staleMs);

    return {
      isRecoveryCandidate: isCandidate,
      ownerKind: "customer",
      lastDecisionLabel: paymentRecoveryDecisionLabel(decision),
      lastDecisionAtLabel: audit?.at ? formatUtcTimestamp(audit.at) : null,
      suggestedSafeAction: suggestPaymentRecoverySafeAction(decision, {
        ownerKind: "customer",
      }),
      receipts,
      staleReleaseEligible,
      walletAppliedCents: row.purchase.walletAppliedCents,
    };
  }

  async function fromPartner(): Promise<AdminPaymentRecoveryDetailExtras | null> {
    const row = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        gatewayProvider: true,
        gatewayPaymentRef: true,
        webhookEventId: true,
        expiresAt: true,
        updatedAt: true,
        purchase: {
          select: {
            status: true,
            walletAppliedCents: true,
          },
        },
      },
    });
    if (!row) return null;

    const isCandidate = isPaymentRecoveryCandidate({
      status: row.status,
      gatewayProvider: row.gatewayProvider,
      gatewayPaymentRef: row.gatewayPaymentRef,
      webhookEventId: row.webhookEventId,
      updatedAt: row.updatedAt,
      nowMs,
      staleMs,
    });
    const decisions = await loadLatestInvestigateDecisions(
      [row.id],
      "PartnerEsimPurchasePaymentAttempt"
    );
    const audit = decisions.get(row.id);
    const decision = audit?.decision ?? null;
    const receipts = await listPaymentWebhookReceiptsForAttempt(row.id);
    const staleReleaseEligible =
      !row.webhookEventId &&
      (row.status === EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT ||
        row.status === EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING ||
        row.status === EsimPurchasePaymentAttemptStatus.DRAFT) &&
      row.purchase.status === "AWAITING_GATEWAY_PAYMENT" &&
      (Boolean(row.expiresAt && row.expiresAt.getTime() <= nowMs) ||
        row.updatedAt.getTime() <= nowMs - staleMs);

    return {
      isRecoveryCandidate: isCandidate,
      ownerKind: "partner",
      lastDecisionLabel: paymentRecoveryDecisionLabel(decision),
      lastDecisionAtLabel: audit?.at ? formatUtcTimestamp(audit.at) : null,
      suggestedSafeAction: suggestPaymentRecoverySafeAction(decision, {
        ownerKind: "partner",
      }),
      receipts,
      staleReleaseEligible,
      walletAppliedCents: row.purchase.walletAppliedCents,
    };
  }

  if (ownerKindHint === "partner") {
    return (await fromPartner()) ?? (await fromCustomer());
  }
  if (ownerKindHint === "customer") {
    return (await fromCustomer()) ?? (await fromPartner());
  }
  return (await fromCustomer()) ?? (await fromPartner());
}

// Re-export for callers that imported the href builder from this module historically.
export { buildAdminPaymentRecoveryHref };
