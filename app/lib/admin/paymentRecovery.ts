/**
 * Read-only Admin Payment Recovery Queue loaders.
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
} from "@/app/lib/admin/paymentRecoveryShared";
import { listPaymentWebhookReceiptsForAttempt } from "@/app/lib/admin/paymentWebhookReceipts";
import type { AdminPaymentWebhookReceiptRow } from "@/app/lib/admin/paymentWebhookReceipts";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { maskSafepayTrackerRef } from "@/app/lib/payments/safepayReporterParse";

export type AdminPaymentRecoveryRow = {
  attemptId: string;
  purchaseId: string;
  customerLabel: string;
  customerHref: string | null;
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
  lastDecisionLabel: string;
  lastDecisionAtLabel: string | null;
  suggestedSafeAction: string;
  receipts: AdminPaymentWebhookReceiptRow[];
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

function recoveryCandidateWhere(
  staleCutoff: Date
): Prisma.EsimPurchasePaymentAttemptWhereInput {
  return {
    status: {
      in: [
        EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
        EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
      ],
    },
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
  return prisma.esimPurchasePaymentAttempt.count({
    where: recoveryCandidateWhere(staleCutoff),
  });
}

type AuditDecision = {
  decision: string | null;
  at: Date | null;
};

async function loadLatestInvestigateDecisions(
  attemptIds: string[]
): Promise<Map<string, AuditDecision>> {
  const map = new Map<string, AuditDecision>();
  if (attemptIds.length === 0) return map;

  const rows = await prisma.auditLog.findMany({
    where: {
      targetType: "EsimPurchasePaymentAttempt",
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
  const where = recoveryCandidateWhere(staleCutoff);

  const [totalCount, rows] = await Promise.all([
    prisma.esimPurchasePaymentAttempt.count({ where }),
    prisma.esimPurchasePaymentAttempt.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      skip,
      take,
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
            customer: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    }),
  ]);

  // Defense in depth: drop empty-ref rows if DB allows whitespace-only.
  const eligible = rows.filter((row) =>
    isPaymentRecoveryCandidate({
      status: row.status,
      gatewayProvider: row.gatewayProvider,
      gatewayPaymentRef: row.gatewayPaymentRef,
      webhookEventId: row.webhookEventId,
      updatedAt: row.updatedAt,
      nowMs,
      staleMs,
    })
  );

  const decisions = await loadLatestInvestigateDecisions(
    eligible.map((r) => r.id)
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / take));

  return {
    rows: eligible.map((row) => {
      const customerId = (row.purchase.customer?.id ?? "").trim();
      const audit = decisions.get(row.id);
      const decision = audit?.decision ?? null;
      return {
        attemptId: row.id,
        purchaseId: row.purchaseId,
        customerLabel: customerLabelFrom(row.purchase.customer),
        customerHref:
          customerId && customerId.length <= 64
            ? `/admin/customers/${encodeURIComponent(customerId)}`
            : null,
        providerLabel: row.gatewayProvider ?? "unknown",
        amountLabel: `${formatUsdCents(row.gatewayAmountCents)} ${row.currency}`,
        ageLabel: formatPaymentRecoveryAge(row.updatedAt, nowMs),
        webhookStatusLabel: paymentRecoveryWebhookStatusLabel(),
        lastDecisionLabel: paymentRecoveryDecisionLabel(decision),
        lastDecisionAtLabel: audit?.at
          ? formatUtcTimestamp(audit.at)
          : null,
        suggestedSafeAction: suggestPaymentRecoverySafeAction(decision),
        href: `/admin/payments/${encodeURIComponent(row.id)}`,
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

/**
 * Server-side recovery extras for payment detail.
 * Banner eligibility uses durable candidate rules — never trusts query params.
 */
export async function getAdminPaymentRecoveryDetailExtras(
  paymentAttemptId: string,
  nowMs: number = Date.now()
): Promise<AdminPaymentRecoveryDetailExtras | null> {
  const id = (paymentAttemptId ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return null;
  }

  const row = await prisma.esimPurchasePaymentAttempt.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      webhookEventId: true,
      updatedAt: true,
    },
  });
  if (!row) return null;

  const staleMs = parsePaymentRecoveryStaleMs();
  const isCandidate = isPaymentRecoveryCandidate({
    status: row.status,
    gatewayProvider: row.gatewayProvider,
    gatewayPaymentRef: row.gatewayPaymentRef,
    webhookEventId: row.webhookEventId,
    updatedAt: row.updatedAt,
    nowMs,
    staleMs,
  });

  const decisions = await loadLatestInvestigateDecisions([row.id]);
  const audit = decisions.get(row.id);
  const decision = audit?.decision ?? null;
  const receipts = await listPaymentWebhookReceiptsForAttempt(row.id, 10);

  return {
    isRecoveryCandidate: isCandidate,
    lastDecisionLabel: paymentRecoveryDecisionLabel(decision),
    lastDecisionAtLabel: audit?.at ? formatUtcTimestamp(audit.at) : null,
    suggestedSafeAction: suggestPaymentRecoverySafeAction(decision),
    receipts,
  };
}

export { buildAdminPaymentRecoveryHref };
