/**
 * Read-only admin reconciliation queries. Local DB only — never calls VeSIM.
 */
import "server-only";

import {
  AdminPackageAssignmentStatus,
  OrderStatus,
  PartnerEsimPurchaseStatus,
  Role,
  WalletEsimPurchaseStatus,
  WalletTopupStatus,
  WalletTransactionStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  maskAdminEmail,
  maskProviderOrderRef,
} from "@/app/lib/admin/display";
import {
  RECONCILIATION_STUCK_AGE_MS,
  categoryLabel,
  categoryMatchesFilter,
  classifyReconciliationCase,
  filterLabel,
  isFailedEmailDelivery,
  isFailedWalletNotification,
  isInboxStaleSendingEmailDelivery,
  isNotConfiguredOrderEmailDelivery,
  isOrderEmailInboxMatch,
  isStaleSendingEmailDelivery,
  isStuckAttemptAge,
  isValidReconciliationSourceType,
  orderEmailInboxStatusOr,
  parseReconciliationFilter,
  type ReconciliationCategory,
  type ReconciliationFilter,
  type ReconciliationPurchaseType,
  type ReconciliationSourceType,
} from "@/app/lib/admin/reconciliationClassify";
import { ORDER_EMAIL_NOT_CONFIGURED_LABEL } from "@/app/lib/admin/reconciliationCaseShared";
import { redirect } from "next/navigation";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { requireRole } from "@/app/lib/auth/session";

export const RECONCILIATION_LIST_LIMIT = 100;

export type ReconciliationListRow = {
  sourceType: ReconciliationSourceType;
  attemptId: string;
  href: string;
  customerLabel: string;
  customerHref: string | null;
  purchaseType: ReconciliationPurchaseType;
  destinationPackage: string;
  amountLabel: string;
  walletDebitRefundLabel: string;
  providerResultKindLabel: string;
  providerRefMasked: string;
  hasProviderRef: boolean;
  localOrderLabel: string;
  localOrderHref: string | null;
  failureLabel: string;
  category: ReconciliationCategory;
  categoryLabel: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  resolutionLabel: string;
  locked: boolean;
  escalated: boolean;
};

export type ReconciliationTimelineEvent = {
  label: string;
  state: "done" | "pending" | "failed" | "unknown";
  detail: string;
};

export type ReconciliationDetail = {
  sourceType: ReconciliationSourceType;
  attemptId: string;
  purchaseType: ReconciliationPurchaseType;
  category: ReconciliationCategory;
  categoryLabel: string;
  customerLabel: string;
  customerHref: string | null;
  destinationPackage: string;
  amountLabel: string;
  walletDebitRefundLabel: string;
  providerResultKindLabel: string;
  providerRefMasked: string;
  hasProviderRef: boolean;
  localOrderLabel: string;
  localOrderHref: string | null;
  failureLabel: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  resolutionLabel: string;
  locked: boolean;
  escalated: boolean;
  timeline: ReconciliationTimelineEvent[];
  relatedLinks: { label: string; href: string }[];
};

function formatTs(value: Date | null | undefined): string {
  if (!value) return "—";
  try {
    return value.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return "—";
  }
}

function customerLabelFrom(user: {
  id: string;
  name: string | null;
  email: string | null;
} | null): string {
  if (!user) return "Not available";
  const name = (user.name ?? "").trim() || "Customer";
  return `${name} · ${maskAdminEmail(user.email)}`;
}

function providerResultLabel(kind: string | null | undefined): string {
  const v = (kind ?? "").trim().toLowerCase();
  if (v === "success") return "success";
  if (v === "declined") return "declined";
  if (v === "uncertain") return "uncertain";
  if (v === "none") return "none";
  return "—";
}

function destinationPackageLabel(row: {
  destinationName?: string | null;
  destinationCode?: string | null;
  planName?: string | null;
  dataAllowance?: string | null;
  validity?: string | null;
}): string {
  const dest =
    (row.destinationName ?? "").trim() ||
    (row.destinationCode ?? "").trim() ||
    "—";
  const plan = (row.planName ?? "").trim();
  const data = (row.dataAllowance ?? "").trim();
  const validity = (row.validity ?? "").trim();
  const packageBits = [plan, data, validity].filter(Boolean).join(" · ");
  return packageBits ? `${dest} — ${packageBits}` : dest;
}

function walletDebitRefundLabel(options: {
  debitStatus?: string | null;
  refundStatus?: string | null;
  hasDebit?: boolean;
  hasRefund?: boolean;
}): string {
  if (!options.hasDebit) return "No wallet debit";
  const debit = (options.debitStatus ?? "").trim() || "unknown";
  if (options.hasRefund) {
    const refund = (options.refundStatus ?? "").trim() || "unknown";
    return `Debit ${debit} · Refund ${refund}`;
  }
  return `Debit ${debit} · Refund none`;
}

function failureLabel(
  category: string | null | undefined,
  code: string | null | undefined
): string {
  const c = (category ?? "").trim();
  const codeV = (code ?? "").trim();
  if (c && codeV) return `${c} / ${codeV}`;
  if (c) return c;
  if (codeV) return codeV;
  return "—";
}

function emailDeliveryFailureLabel(
  status: string | null | undefined
): string {
  const v = (status ?? "").trim().toLowerCase();
  if (v === "sending") return "email / sending (uncertain)";
  if (v === "not_configured") return ORDER_EMAIL_NOT_CONFIGURED_LABEL;
  if (!v) return "email / unknown";
  return `email / ${v}`.slice(0, 80);
}

function orderEmailTimelineState(
  status: string | null | undefined,
  updatedAt: Date,
  now: Date
): ReconciliationTimelineEvent["state"] {
  if (isFailedEmailDelivery(status) || isNotConfiguredOrderEmailDelivery(status)) {
    return "failed";
  }
  if (isStaleSendingEmailDelivery(status, updatedAt, now)) return "unknown";
  if ((status ?? "").trim().toLowerCase() === "sending") return "pending";
  if (status) return "done";
  return "unknown";
}

function resolutionLabel(options: {
  resolvedAt?: Date | null;
  lockedAt?: Date | null;
  escalatedAt?: Date | null;
  escalationPriority?: string | null;
  reason?: string | null;
}): string {
  if (options.resolvedAt) {
    const reason = (options.reason ?? "").trim();
    return reason
      ? `Resolved ${formatTs(options.resolvedAt)} · ${reason.slice(0, 80)}`
      : `Resolved ${formatTs(options.resolvedAt)}`;
  }
  const bits: string[] = [];
  if (options.lockedAt) {
    bits.push(`Locked ${formatTs(options.lockedAt)}`);
  }
  if (options.escalatedAt) {
    const p = (options.escalationPriority ?? "").trim();
    bits.push(p ? `Escalated ${p}` : "Escalated");
  }
  if (bits.length) return bits.join(" · ");
  return "Open";
}

/**
 * ADMIN gate with active-admin DB verification (role + not deleted).
 */
export async function requireActiveAdminForReconciliation() {
  const sessionUser = await requireRole("ADMIN");
  const admin = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
      name: true,
      email: true,
    },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) {
    // Generic denial — do not leak inactive-admin details.
    redirect("/signin");
  }
  return { sessionUser, admin: admin! };
}

export async function getReconciliationListPage(options: {
  filter?: string | null;
}): Promise<{
  filter: ReconciliationFilter;
  filterLabel: string;
  rows: ReconciliationListRow[];
  unavailable: boolean;
}> {
  const filter = parseReconciliationFilter(options.filter);
  const now = new Date();
  const stuckBefore = new Date(now.getTime() - RECONCILIATION_STUCK_AGE_MS);

  try {
    const [
      purchases,
      partnerPurchases,
      assignments,
      topups,
      emailPurchases,
      emailAssignments,
      walletEmailTxs,
      iccidOrders,
    ] = await Promise.all([
      prisma.walletEsimPurchase.findMany({
        where: {
          OR: [
            { status: WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED },
            {
              status: {
                in: [
                  WalletEsimPurchaseStatus.FUNDS_RESERVED,
                  WalletEsimPurchaseStatus.PROVIDER_PENDING,
                ],
              },
              updatedAt: { lte: stuckBefore },
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: RECONCILIATION_LIST_LIMIT,
        select: {
          id: true,
          adminUserId: true,
          status: true,
          providerOrderId: true,
          providerResultKind: true,
          failureCategory: true,
          failureCode: true,
          debitTransactionId: true,
          refundTransactionId: true,
          orderId: true,
          emailDeliveryStatus: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
          reconciliationEscalatedAt: true,
          reconciliationEscalationPriority: true,
          reconciliationResolutionReason: true,
          destinationName: true,
          destinationCode: true,
          planName: true,
          dataAllowance: true,
          validity: true,
          priceCents: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, name: true, email: true } },
          debitTransaction: { select: { status: true } },
          refundTransaction: { select: { status: true } },
        },
      }),
      prisma.partnerEsimPurchase.findMany({
        where: {
          OR: [
            { status: PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED },
            {
              status: PartnerEsimPurchaseStatus.PROVIDER_PENDING,
              updatedAt: { lte: stuckBefore },
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: RECONCILIATION_LIST_LIMIT,
        select: {
          id: true,
          status: true,
          providerOrderId: true,
          providerResultKind: true,
          failureCategory: true,
          failureCode: true,
          debitTransactionId: true,
          refundTransactionId: true,
          orderId: true,
          emailDeliveryStatus: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
          reconciliationEscalatedAt: true,
          reconciliationEscalationPriority: true,
          reconciliationResolutionReason: true,
          destinationName: true,
          destinationCode: true,
          planName: true,
          dataAllowance: true,
          validity: true,
          retailPriceCents: true,
          partnerChargeCents: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          partner: {
            select: {
              id: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
          debitTransaction: { select: { id: true } },
          refundTransaction: { select: { id: true } },
        },
      }),
      prisma.adminPackageAssignment.findMany({
        where: {
          OR: [
            { status: AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED },
            {
              status: AdminPackageAssignmentStatus.PROVIDER_PENDING,
              updatedAt: { lte: stuckBefore },
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: RECONCILIATION_LIST_LIMIT,
        select: {
          id: true,
          status: true,
          providerOrderId: true,
          providerResultKind: true,
          failureCategory: true,
          failureCode: true,
          orderId: true,
          emailDeliveryStatus: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
          reconciliationEscalatedAt: true,
          reconciliationEscalationPriority: true,
          reconciliationResolutionReason: true,
          destinationName: true,
          destinationCode: true,
          planName: true,
          dataAllowance: true,
          validity: true,
          providerCostCents: true,
          providerCurrency: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.walletTopup.findMany({
        where: { status: WalletTopupStatus.RECONCILIATION_REQUIRED },
        orderBy: { updatedAt: "desc" },
        take: RECONCILIATION_LIST_LIMIT,
        select: {
          id: true,
          status: true,
          failureCategory: true,
          failureCode: true,
          creditAmountCents: true,
          walletTransactionId: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
          reconciliationEscalatedAt: true,
          reconciliationEscalationPriority: true,
          reconciliationResolutionReason: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.walletEsimPurchase.findMany({
        where: {
          status: WalletEsimPurchaseStatus.COMPLETED,
          OR: orderEmailInboxStatusOr(now),
        },
        orderBy: { updatedAt: "desc" },
        take: RECONCILIATION_LIST_LIMIT,
        select: {
          id: true,
          adminUserId: true,
          status: true,
          providerOrderId: true,
          providerResultKind: true,
          failureCategory: true,
          failureCode: true,
          orderId: true,
          emailDeliveryStatus: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
          reconciliationEscalatedAt: true,
          reconciliationEscalationPriority: true,
          reconciliationResolutionReason: true,
          destinationName: true,
          destinationCode: true,
          planName: true,
          dataAllowance: true,
          validity: true,
          priceCents: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.adminPackageAssignment.findMany({
        where: {
          status: AdminPackageAssignmentStatus.COMPLETED,
          OR: orderEmailInboxStatusOr(now),
        },
        orderBy: { updatedAt: "desc" },
        take: RECONCILIATION_LIST_LIMIT,
        select: {
          id: true,
          status: true,
          providerOrderId: true,
          providerResultKind: true,
          failureCategory: true,
          failureCode: true,
          orderId: true,
          emailDeliveryStatus: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
          reconciliationEscalatedAt: true,
          reconciliationEscalationPriority: true,
          reconciliationResolutionReason: true,
          destinationName: true,
          destinationCode: true,
          planName: true,
          dataAllowance: true,
          validity: true,
          providerCostCents: true,
          providerCurrency: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.walletTransaction.findMany({
        where: {
          status: WalletTransactionStatus.COMPLETED,
          emailNotificationStatus: { in: ["failed", "not_configured"] },
        },
        orderBy: { updatedAt: "desc" },
        take: RECONCILIATION_LIST_LIMIT,
        select: {
          id: true,
          type: true,
          amountCents: true,
          emailNotificationStatus: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
          reconciliationEscalatedAt: true,
          reconciliationEscalationPriority: true,
          reconciliationResolutionReason: true,
          createdAt: true,
          updatedAt: true,
          wallet: {
            select: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.order.findMany({
        where: {
          status: OrderStatus.COMPLETED,
          iccidHash: null,
          iccidCapturedAt: null,
          providerOrderId: { not: "" },
        },
        orderBy: { updatedAt: "desc" },
        take: RECONCILIATION_LIST_LIMIT,
        select: {
          id: true,
          providerOrderId: true,
          destination: true,
          planName: true,
          dataAllowance: true,
          validity: true,
          displayAmount: true,
          displayCurrency: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
          reconciliationEscalatedAt: true,
          reconciliationEscalationPriority: true,
          reconciliationResolutionReason: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    const rows: ReconciliationListRow[] = [];

    for (const row of purchases) {
      const category = classifyReconciliationCase({
        sourceType: "wallet_purchase",
        status: row.status,
        providerOrderId: row.providerOrderId,
        providerResultKind: row.providerResultKind,
        failureCategory: row.failureCategory,
        failureCode: row.failureCode,
        debitTransactionId: row.debitTransactionId,
        refundTransactionId: row.refundTransactionId,
        orderId: row.orderId,
        emailDeliveryStatus: row.emailDeliveryStatus,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
        updatedAt: row.updatedAt,
        now,
      });
      if (!categoryMatchesFilter(category, filter, { locked: Boolean(row.reconciliationLockedAt), escalated: Boolean(row.reconciliationEscalatedAt) })) continue;
      const purchaseType: ReconciliationPurchaseType = row.adminUserId
        ? "Admin-assisted wallet"
        : "Self-service wallet";
      rows.push({
        sourceType: "wallet_purchase",
        attemptId: row.id,
        href: `/admin/reconciliation/wallet_purchase/${row.id}`,
        customerLabel: customerLabelFrom(row.customer),
        customerHref: row.customer
          ? `/admin/customers/${row.customer.id}`
          : null,
        purchaseType,
        destinationPackage: destinationPackageLabel(row),
        amountLabel: `${formatUsdCents(row.priceCents)} ${row.currency || "USD"}`,
        walletDebitRefundLabel: walletDebitRefundLabel({
          hasDebit: Boolean(row.debitTransactionId),
          hasRefund: Boolean(row.refundTransactionId),
          debitStatus: row.debitTransaction?.status,
          refundStatus: row.refundTransaction?.status,
        }),
        providerResultKindLabel: providerResultLabel(row.providerResultKind),
        providerRefMasked: maskProviderOrderRef(row.providerOrderId),
        hasProviderRef: Boolean((row.providerOrderId ?? "").trim()),
        localOrderLabel: row.orderId || "—",
        localOrderHref: row.orderId ? `/admin/orders/${row.orderId}` : null,
        failureLabel: failureLabel(row.failureCategory, row.failureCode),
        category,
        categoryLabel: categoryLabel(category),
        createdAtLabel: formatTs(row.createdAt),
        updatedAtLabel: formatTs(row.updatedAt),
        resolutionLabel: resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        }),
        locked: Boolean(row.reconciliationLockedAt),
        escalated: Boolean(row.reconciliationEscalatedAt),
      });
    }

    for (const row of partnerPurchases) {
      const category = classifyReconciliationCase({
        sourceType: "partner_purchase",
        status: row.status,
        providerOrderId: row.providerOrderId,
        providerResultKind: row.providerResultKind,
        failureCategory: row.failureCategory,
        failureCode: row.failureCode,
        debitTransactionId: row.debitTransactionId,
        refundTransactionId: row.refundTransactionId,
        orderId: row.orderId,
        emailDeliveryStatus: row.emailDeliveryStatus,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
        updatedAt: row.updatedAt,
        now,
      });
      if (
        !categoryMatchesFilter(category, filter, {
          locked: Boolean(row.reconciliationLockedAt),
          escalated: Boolean(row.reconciliationEscalatedAt),
        })
      ) {
        continue;
      }
      const partnerUser = row.partner?.user ?? null;
      rows.push({
        sourceType: "partner_purchase",
        attemptId: row.id,
        href: `/admin/reconciliation/partner_purchase/${row.id}`,
        customerLabel: customerLabelFrom(partnerUser),
        customerHref: partnerUser
          ? `/admin/customers/${partnerUser.id}`
          : null,
        purchaseType: "Partner balance",
        destinationPackage: destinationPackageLabel(row),
        amountLabel: `Partner debit ${formatUsdCents(row.partnerChargeCents)} (retail ${formatUsdCents(row.retailPriceCents)}) ${row.currency || "USD"}`,
        walletDebitRefundLabel: walletDebitRefundLabel({
          hasDebit: Boolean(row.debitTransactionId),
          hasRefund: Boolean(row.refundTransactionId),
          debitStatus: row.debitTransaction ? "COMPLETED" : undefined,
          refundStatus: row.refundTransaction ? "COMPLETED" : undefined,
        }),
        providerResultKindLabel: providerResultLabel(row.providerResultKind),
        providerRefMasked: maskProviderOrderRef(row.providerOrderId),
        hasProviderRef: Boolean((row.providerOrderId ?? "").trim()),
        localOrderLabel: row.orderId || "—",
        localOrderHref: row.orderId ? `/admin/orders/${row.orderId}` : null,
        failureLabel: failureLabel(row.failureCategory, row.failureCode),
        category,
        categoryLabel: categoryLabel(category),
        createdAtLabel: formatTs(row.createdAt),
        updatedAtLabel: formatTs(row.updatedAt),
        resolutionLabel: resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        }),
        locked: Boolean(row.reconciliationLockedAt),
        escalated: Boolean(row.reconciliationEscalatedAt),
      });
    }

    for (const row of assignments) {
      const category = classifyReconciliationCase({
        sourceType: "assignment",
        status: row.status,
        providerOrderId: row.providerOrderId,
        providerResultKind: row.providerResultKind,
        failureCategory: row.failureCategory,
        failureCode: row.failureCode,
        orderId: row.orderId,
        emailDeliveryStatus: row.emailDeliveryStatus,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
        updatedAt: row.updatedAt,
        now,
      });
      if (!categoryMatchesFilter(category, filter, { locked: Boolean(row.reconciliationLockedAt), escalated: Boolean(row.reconciliationEscalatedAt) })) continue;
      rows.push({
        sourceType: "assignment",
        attemptId: row.id,
        href: `/admin/reconciliation/assignment/${row.id}`,
        customerLabel: customerLabelFrom(row.customer),
        customerHref: row.customer
          ? `/admin/customers/${row.customer.id}`
          : null,
        purchaseType: "Company-funded",
        destinationPackage: destinationPackageLabel(row),
        amountLabel:
          row.providerCostCents != null
            ? `${formatUsdCents(row.providerCostCents)} ${row.providerCurrency || "USD"}`
            : "—",
        walletDebitRefundLabel: "Company-funded (no wallet debit)",
        providerResultKindLabel: providerResultLabel(row.providerResultKind),
        providerRefMasked: maskProviderOrderRef(row.providerOrderId),
        hasProviderRef: Boolean((row.providerOrderId ?? "").trim()),
        localOrderLabel: row.orderId || "—",
        localOrderHref: row.orderId ? `/admin/orders/${row.orderId}` : null,
        failureLabel: failureLabel(row.failureCategory, row.failureCode),
        category,
        categoryLabel: categoryLabel(category),
        createdAtLabel: formatTs(row.createdAt),
        updatedAtLabel: formatTs(row.updatedAt),
        resolutionLabel: resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        }),
        locked: Boolean(row.reconciliationLockedAt),
        escalated: Boolean(row.reconciliationEscalatedAt),
      });
    }

    for (const row of topups) {
      const category = classifyReconciliationCase({
        sourceType: "topup",
        status: row.status,
        failureCategory: row.failureCategory,
        failureCode: row.failureCode,
        updatedAt: row.updatedAt,
        now,
      });
      if (!categoryMatchesFilter(category, filter, { locked: Boolean(row.reconciliationLockedAt), escalated: Boolean(row.reconciliationEscalatedAt) })) continue;
      rows.push({
        sourceType: "topup",
        attemptId: row.id,
        href: `/admin/reconciliation/topup/${row.id}`,
        customerLabel: customerLabelFrom(row.customer),
        customerHref: row.customer
          ? `/admin/customers/${row.customer.id}`
          : null,
        purchaseType: "Top-up",
        destinationPackage: "Wallet top-up",
        amountLabel: `${formatUsdCents(row.creditAmountCents)} USD`,
        walletDebitRefundLabel: row.walletTransactionId
          ? "Credit linked"
          : "Credit pending",
        providerResultKindLabel: "—",
        providerRefMasked: "Not available",
        hasProviderRef: false,
        localOrderLabel: "—",
        localOrderHref: null,
        failureLabel: failureLabel(row.failureCategory, row.failureCode),
        category,
        categoryLabel: categoryLabel(category),
        createdAtLabel: formatTs(row.createdAt),
        updatedAtLabel: formatTs(row.updatedAt),
        resolutionLabel: resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        }),
        locked: Boolean(row.reconciliationLockedAt),
        escalated: Boolean(row.reconciliationEscalatedAt),
      });
    }

    for (const row of emailPurchases) {
      if (
        !isOrderEmailInboxMatch(row.emailDeliveryStatus, row.updatedAt, {
          status: row.status,
          reconciliationResolvedAt: row.reconciliationResolvedAt,
          now,
        })
      ) {
        continue;
      }
      const category = classifyReconciliationCase({
        sourceType: "order_email",
        status: row.status,
        providerOrderId: row.providerOrderId,
        emailDeliveryStatus: row.emailDeliveryStatus,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
        updatedAt: row.updatedAt,
        now,
      });
      if (!categoryMatchesFilter(category, filter, { locked: Boolean(row.reconciliationLockedAt), escalated: Boolean(row.reconciliationEscalatedAt) })) continue;
      rows.push({
        sourceType: "order_email",
        attemptId: row.id,
        href: `/admin/reconciliation/order_email/${row.id}`,
        customerLabel: customerLabelFrom(row.customer),
        customerHref: row.customer
          ? `/admin/customers/${row.customer.id}`
          : null,
        purchaseType: "Email issue",
        destinationPackage: destinationPackageLabel(row),
        amountLabel: `${formatUsdCents(row.priceCents)} ${row.currency || "USD"}`,
        walletDebitRefundLabel: "—",
        providerResultKindLabel: providerResultLabel(row.providerResultKind),
        providerRefMasked: maskProviderOrderRef(row.providerOrderId),
        hasProviderRef: Boolean((row.providerOrderId ?? "").trim()),
        localOrderLabel: row.orderId || "—",
        localOrderHref: row.orderId ? `/admin/orders/${row.orderId}` : null,
        failureLabel: emailDeliveryFailureLabel(row.emailDeliveryStatus),
        category,
        categoryLabel: categoryLabel(category),
        createdAtLabel: formatTs(row.createdAt),
        updatedAtLabel: formatTs(row.updatedAt),
        resolutionLabel: resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        }),
        locked: Boolean(row.reconciliationLockedAt),
        escalated: Boolean(row.reconciliationEscalatedAt),
      });
    }

    for (const row of emailAssignments) {
      if (
        !isOrderEmailInboxMatch(row.emailDeliveryStatus, row.updatedAt, {
          status: row.status,
          reconciliationResolvedAt: row.reconciliationResolvedAt,
          now,
        })
      ) {
        continue;
      }
      const category = classifyReconciliationCase({
        sourceType: "order_email",
        status: row.status,
        providerOrderId: row.providerOrderId,
        emailDeliveryStatus: row.emailDeliveryStatus,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
        updatedAt: row.updatedAt,
        now,
      });
      if (!categoryMatchesFilter(category, filter, { locked: Boolean(row.reconciliationLockedAt), escalated: Boolean(row.reconciliationEscalatedAt) })) continue;
      rows.push({
        sourceType: "order_email",
        attemptId: `assignment:${row.id}`,
        href: `/admin/reconciliation/order_email/assignment:${row.id}`,
        customerLabel: customerLabelFrom(row.customer),
        customerHref: row.customer
          ? `/admin/customers/${row.customer.id}`
          : null,
        purchaseType: "Email issue",
        destinationPackage: destinationPackageLabel(row),
        amountLabel:
          row.providerCostCents != null
            ? `${formatUsdCents(row.providerCostCents)} ${row.providerCurrency || "USD"}`
            : "—",
        walletDebitRefundLabel: "Company-funded (no wallet debit)",
        providerResultKindLabel: providerResultLabel(row.providerResultKind),
        providerRefMasked: maskProviderOrderRef(row.providerOrderId),
        hasProviderRef: Boolean((row.providerOrderId ?? "").trim()),
        localOrderLabel: row.orderId || "—",
        localOrderHref: row.orderId ? `/admin/orders/${row.orderId}` : null,
        failureLabel: emailDeliveryFailureLabel(row.emailDeliveryStatus),
        category,
        categoryLabel: categoryLabel(category),
        createdAtLabel: formatTs(row.createdAt),
        updatedAtLabel: formatTs(row.updatedAt),
        resolutionLabel: resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        }),
        locked: Boolean(row.reconciliationLockedAt),
        escalated: Boolean(row.reconciliationEscalatedAt),
      });
    }

    for (const row of walletEmailTxs) {
      if (!isFailedWalletNotification(row.emailNotificationStatus)) continue;
      const category = classifyReconciliationCase({
        sourceType: "wallet_email",
        status: "COMPLETED",
        emailNotificationStatus: row.emailNotificationStatus,
        updatedAt: row.updatedAt,
        now,
      });
      if (!categoryMatchesFilter(category, filter, { locked: Boolean(row.reconciliationLockedAt), escalated: Boolean(row.reconciliationEscalatedAt) })) continue;
      const user = row.wallet.user;
      rows.push({
        sourceType: "wallet_email",
        attemptId: row.id,
        href: `/admin/reconciliation/wallet_email/${row.id}`,
        customerLabel: customerLabelFrom(user),
        customerHref: user ? `/admin/customers/${user.id}` : null,
        purchaseType: "Email issue",
        destinationPackage: `Wallet ${row.type}`,
        amountLabel: `${formatUsdCents(row.amountCents)} USD`,
        walletDebitRefundLabel: "Completed ledger entry",
        providerResultKindLabel: "—",
        providerRefMasked: "Not available",
        hasProviderRef: false,
        localOrderLabel: "—",
        localOrderHref: null,
        failureLabel: `wallet_email / ${row.emailNotificationStatus}`,
        category,
        categoryLabel: categoryLabel(category),
        createdAtLabel: formatTs(row.createdAt),
        updatedAtLabel: formatTs(row.updatedAt),
        resolutionLabel: resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        }),
        locked: Boolean(row.reconciliationLockedAt),
        escalated: Boolean(row.reconciliationEscalatedAt),
      });
    }

    for (const row of iccidOrders) {
      const category = classifyReconciliationCase({
        sourceType: "iccid",
        status: "COMPLETED",
        providerOrderId: row.providerOrderId,
        iccidHash: null,
        iccidCapturedAt: null,
        updatedAt: row.updatedAt,
        now,
      });
      if (!categoryMatchesFilter(category, filter, { locked: Boolean(row.reconciliationLockedAt), escalated: Boolean(row.reconciliationEscalatedAt) })) continue;
      rows.push({
        sourceType: "iccid",
        attemptId: row.id,
        href: `/admin/reconciliation/iccid/${row.id}`,
        customerLabel: customerLabelFrom(row.user),
        customerHref: row.user ? `/admin/customers/${row.user.id}` : null,
        purchaseType: "ICCID issue",
        destinationPackage: destinationPackageLabel({
          destinationName: row.destination,
          planName: row.planName,
          dataAllowance: row.dataAllowance,
          validity: row.validity,
        }),
        amountLabel:
          row.displayAmount != null
            ? `${row.displayAmount} ${row.displayCurrency || "USD"}`
            : "—",
        walletDebitRefundLabel: "—",
        providerResultKindLabel: "—",
        providerRefMasked: maskProviderOrderRef(row.providerOrderId),
        hasProviderRef: Boolean((row.providerOrderId ?? "").trim()),
        localOrderLabel: row.id,
        localOrderHref: `/admin/orders/${row.id}`,
        failureLabel: "iccid / pending_capture",
        category,
        categoryLabel: categoryLabel(category),
        createdAtLabel: formatTs(row.createdAt),
        updatedAtLabel: formatTs(row.updatedAt),
        resolutionLabel: resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        }),
        locked: Boolean(row.reconciliationLockedAt),
        escalated: Boolean(row.reconciliationEscalatedAt),
      });
    }

    rows.sort(
      (a, b) =>
        Date.parse(b.updatedAtLabel) - Date.parse(a.updatedAtLabel) ||
        a.attemptId.localeCompare(b.attemptId)
    );

    return {
      filter,
      filterLabel: filterLabel(filter),
      rows: rows.slice(0, RECONCILIATION_LIST_LIMIT),
      unavailable: false,
    };
  } catch {
    return {
      filter,
      filterLabel: filterLabel(filter),
      rows: [],
      unavailable: true,
    };
  }
}

function timelineEvent(
  label: string,
  state: ReconciliationTimelineEvent["state"],
  detail: string
): ReconciliationTimelineEvent {
  return { label, state, detail };
}

export async function getReconciliationDetail(
  sourceTypeRaw: string,
  attemptIdRaw: string
): Promise<ReconciliationDetail | null> {
  if (!isValidReconciliationSourceType(sourceTypeRaw)) return null;
  const sourceType = sourceTypeRaw;
  const attemptId = (attemptIdRaw ?? "").trim();
  if (!attemptId || attemptId.length > 96) return null;

  if (sourceType === "partner_purchase") {
    const row = await prisma.partnerEsimPurchase.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        providerOrderId: true,
        providerResultKind: true,
        providerObservedAt: true,
        safeProviderStatusCode: true,
        failureCategory: true,
        failureCode: true,
        debitTransactionId: true,
        refundTransactionId: true,
        orderId: true,
        emailDeliveryStatus: true,
        reconciliationState: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        reconciliationResolutionReason: true,
        destinationName: true,
        destinationCode: true,
        planName: true,
        dataAllowance: true,
        validity: true,
        retailPriceCents: true,
        partnerChargeCents: true,
        providerCostCents: true,
        discountBps: true,
        discountVersion: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        partner: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        debitTransaction: { select: { id: true } },
        refundTransaction: { select: { id: true } },
        order: {
          select: {
            id: true,
            iccidHash: true,
            iccidCapturedAt: true,
            fundingSource: true,
          },
        },
      },
    });
    if (!row) return null;

    const isStuck =
      row.status === PartnerEsimPurchaseStatus.PROVIDER_PENDING &&
      isStuckAttemptAge(row.updatedAt);
    const isRecon =
      row.status === PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED;
    if (!isRecon && !isStuck && !row.reconciliationResolvedAt) {
      return null;
    }

    const category = classifyReconciliationCase({
      sourceType: "partner_purchase",
      status: row.status,
      providerOrderId: row.providerOrderId,
      providerResultKind: row.providerResultKind,
      failureCategory: row.failureCategory,
      failureCode: row.failureCode,
      debitTransactionId: row.debitTransactionId,
      refundTransactionId: row.refundTransactionId,
      orderId: row.orderId,
      emailDeliveryStatus: row.emailDeliveryStatus,
      reconciliationResolvedAt: row.reconciliationResolvedAt,
      updatedAt: row.updatedAt,
    });

    const partnerUser = row.partner?.user ?? null;
    const hasProvider = Boolean((row.providerOrderId ?? "").trim());
    const timeline: ReconciliationTimelineEvent[] = [
      timelineEvent("Attempt prepared", "done", formatTs(row.createdAt)),
      timelineEvent(
        "Partner funds reserved",
        row.debitTransactionId ? "done" : "pending",
        row.debitTransactionId
          ? `Debit linked (${formatUsdCents(row.partnerChargeCents)})`
          : "No debit yet"
      ),
      timelineEvent(
        "Provider call initiated",
        row.status === PartnerEsimPurchaseStatus.READY ? "pending" : "done",
        row.status
      ),
      timelineEvent(
        "Provider result observed",
        row.providerObservedAt || row.providerResultKind ? "done" : "unknown",
        providerResultLabel(row.providerResultKind)
      ),
      timelineEvent(
        hasProvider ? "Provider reference stored" : "Provider reference missing",
        hasProvider ? "done" : "failed",
        hasProvider
          ? maskProviderOrderRef(row.providerOrderId)
          : "Not stored"
      ),
      timelineEvent(
        row.status === PartnerEsimPurchaseStatus.COMPLETED
          ? "Local finalization completed"
          : row.failureCategory === "local_finalize_failed"
            ? "Local finalization failed"
            : "Local finalization pending",
        row.status === PartnerEsimPurchaseStatus.COMPLETED
          ? "done"
          : row.failureCategory === "local_finalize_failed"
            ? "failed"
            : "pending",
        row.orderId ? `Order ${row.orderId}` : "No local order"
      ),
      timelineEvent(
        row.refundTransactionId ? "Partner refund completed" : "Partner refund missing",
        row.refundTransactionId
          ? "done"
          : row.debitTransactionId &&
              row.status !== PartnerEsimPurchaseStatus.COMPLETED
            ? "pending"
            : "unknown",
        row.refundTransactionId
          ? `Refund ${row.refundTransactionId}`
          : "—"
      ),
    ];

    return {
      sourceType: "partner_purchase",
      attemptId: row.id,
      purchaseType: "Partner balance",
      category,
      categoryLabel: categoryLabel(category),
      customerLabel: customerLabelFrom(partnerUser),
      customerHref: partnerUser ? `/admin/customers/${partnerUser.id}` : null,
      destinationPackage: destinationPackageLabel(row),
      amountLabel: `Partner debit ${formatUsdCents(row.partnerChargeCents)} (retail ${formatUsdCents(row.retailPriceCents)}, provider cost ${formatUsdCents(row.providerCostCents)}, discount ${row.discountBps} bps v${row.discountVersion}) ${row.currency || "USD"}`,
      walletDebitRefundLabel: walletDebitRefundLabel({
        hasDebit: Boolean(row.debitTransactionId),
        hasRefund: Boolean(row.refundTransactionId),
        debitStatus: row.debitTransaction ? "COMPLETED" : undefined,
        refundStatus: row.refundTransaction ? "COMPLETED" : undefined,
      }),
      providerResultKindLabel: providerResultLabel(row.providerResultKind),
      providerRefMasked: maskProviderOrderRef(row.providerOrderId),
      hasProviderRef: hasProvider,
      localOrderLabel: row.orderId || "—",
      localOrderHref: row.orderId ? `/admin/orders/${row.orderId}` : null,
      failureLabel: failureLabel(row.failureCategory, row.failureCode),
      createdAtLabel: formatTs(row.createdAt),
      updatedAtLabel: formatTs(row.updatedAt),
      resolutionLabel: resolutionLabel({
        resolvedAt: row.reconciliationResolvedAt,
        lockedAt: row.reconciliationLockedAt,
        escalatedAt: row.reconciliationEscalatedAt,
        escalationPriority: row.reconciliationEscalationPriority,
        reason: row.reconciliationResolutionReason,
      }),
      locked: Boolean(row.reconciliationLockedAt),
      escalated: Boolean(row.reconciliationEscalatedAt),
      timeline,
      relatedLinks: [
        ...(partnerUser
          ? [{ label: "Partner user", href: `/admin/customers/${partnerUser.id}` }]
          : []),
        ...(row.orderId
          ? [{ label: "Order", href: `/admin/orders/${row.orderId}` }]
          : []),
        { label: "Audit logs", href: "/admin/audit-logs" },
      ],
    };
  }

  if (sourceType === "wallet_purchase" || sourceType === "order_email") {
    const id =
      sourceType === "order_email" && attemptId.startsWith("assignment:")
        ? null
        : attemptId;
    if (!id) {
      // Handled below via assignment email path.
    } else {
      const row = await prisma.walletEsimPurchase.findUnique({
        where: { id },
        select: {
          id: true,
          adminUserId: true,
          status: true,
          providerOrderId: true,
          providerResultKind: true,
          providerObservedAt: true,
          safeProviderStatusCode: true,
          failureCategory: true,
          failureCode: true,
          debitTransactionId: true,
          refundTransactionId: true,
          orderId: true,
          emailDeliveryStatus: true,
          reconciliationState: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
          reconciliationEscalatedAt: true,
          reconciliationEscalationPriority: true,
          reconciliationResolutionReason: true,
          destinationName: true,
          destinationCode: true,
          planName: true,
          dataAllowance: true,
          validity: true,
          priceCents: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          customer: { select: { id: true, name: true, email: true } },
          debitTransaction: {
            select: { id: true, status: true, emailNotificationStatus: true },
          },
          refundTransaction: { select: { id: true, status: true } },
          order: {
            select: {
              id: true,
              iccidHash: true,
              iccidCapturedAt: true,
            },
          },
        },
      });
      if (!row) return null;

      const isStuck =
        (row.status === WalletEsimPurchaseStatus.FUNDS_RESERVED ||
          row.status === WalletEsimPurchaseStatus.PROVIDER_PENDING) &&
        isStuckAttemptAge(row.updatedAt);
      const isRecon =
        row.status === WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED;

      if (sourceType === "order_email") {
        const isStaleSendingCase = isInboxStaleSendingEmailDelivery(
          row.emailDeliveryStatus,
          row.updatedAt,
          {
            status: row.status,
            reconciliationResolvedAt: row.reconciliationResolvedAt,
          }
        );
        const sending =
          (row.emailDeliveryStatus ?? "").trim().toLowerCase() === "sending";
        if (sending && !isStaleSendingCase) return null;
        const isInboxEmailCase = isOrderEmailInboxMatch(
          row.emailDeliveryStatus,
          row.updatedAt,
          {
            status: row.status,
            reconciliationResolvedAt: row.reconciliationResolvedAt,
          }
        );
        if (!isInboxEmailCase && !row.reconciliationResolvedAt) {
          return null;
        }
      }
      if (sourceType === "wallet_purchase" && !isRecon && !isStuck && !row.reconciliationResolvedAt) {
        return null;
      }

      const category = classifyReconciliationCase({
        sourceType:
          sourceType === "order_email" ? "order_email" : "wallet_purchase",
        status: row.status,
        providerOrderId: row.providerOrderId,
        providerResultKind: row.providerResultKind,
        failureCategory: row.failureCategory,
        failureCode: row.failureCode,
        debitTransactionId: row.debitTransactionId,
        refundTransactionId: row.refundTransactionId,
        orderId: row.orderId,
        emailDeliveryStatus: row.emailDeliveryStatus,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
        updatedAt: row.updatedAt,
      });

      const purchaseType: ReconciliationPurchaseType = row.adminUserId
        ? "Admin-assisted wallet"
        : "Self-service wallet";

      const hasProvider = Boolean((row.providerOrderId ?? "").trim());
      const timeline: ReconciliationTimelineEvent[] = [
        timelineEvent("Attempt prepared", "done", formatTs(row.createdAt)),
        timelineEvent(
          "Funds reserved",
          row.debitTransactionId ? "done" : "pending",
          row.debitTransactionId
            ? `Debit ${row.debitTransaction?.status || "linked"}`
            : "No debit yet"
        ),
        timelineEvent(
          "Provider call initiated",
          row.status === WalletEsimPurchaseStatus.READY ? "pending" : "done",
          row.status
        ),
        timelineEvent(
          "Provider result observed",
          row.providerObservedAt || row.providerResultKind ? "done" : "unknown",
          providerResultLabel(row.providerResultKind)
        ),
        timelineEvent(
          hasProvider
            ? "Provider reference stored"
            : "Provider reference missing",
          hasProvider ? "done" : "failed",
          hasProvider
            ? maskProviderOrderRef(row.providerOrderId)
            : "Not stored"
        ),
        timelineEvent(
          row.status === WalletEsimPurchaseStatus.COMPLETED
            ? "Local finalization completed"
            : row.failureCategory === "local_finalize_failed"
              ? "Local finalization failed"
              : "Local finalization pending",
          row.status === WalletEsimPurchaseStatus.COMPLETED
            ? "done"
            : row.failureCategory === "local_finalize_failed"
              ? "failed"
              : "pending",
          row.orderId ? `Order ${row.orderId}` : "No local order"
        ),
        timelineEvent(
          row.refundTransactionId
            ? "Refund completed"
            : "Refund missing",
          row.refundTransactionId
            ? "done"
            : row.debitTransactionId &&
                row.status !== WalletEsimPurchaseStatus.COMPLETED
              ? "pending"
              : "unknown",
          row.refundTransaction
            ? `Refund ${row.refundTransaction.status}`
            : "—"
        ),
        timelineEvent(
          "Order email state",
          orderEmailTimelineState(row.emailDeliveryStatus, row.updatedAt, new Date()),
          emailDeliveryFailureLabel(row.emailDeliveryStatus).replace(/^email \/ /, "")
        ),
        timelineEvent(
          "Wallet notification state",
          isFailedWalletNotification(
            row.debitTransaction?.emailNotificationStatus
          )
            ? "failed"
            : row.debitTransaction?.emailNotificationStatus
              ? "done"
              : "unknown",
          (
            row.debitTransaction?.emailNotificationStatus ?? "—"
          ).slice(0, 40)
        ),
        timelineEvent(
          "ICCID capture state",
          row.order?.iccidCapturedAt || row.order?.iccidHash
            ? "done"
            : row.order
              ? "pending"
              : "unknown",
          row.order?.iccidCapturedAt
            ? "Captured"
            : row.order
              ? "Pending from provider"
              : "No order"
        ),
        timelineEvent(
          row.reconciliationResolvedAt
            ? "Reconciliation resolved"
            : row.reconciliationLockedAt
              ? "Reconciliation locked"
              : "Reconciliation marked",
          row.reconciliationResolvedAt
            ? "done"
            : row.status === WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED
              ? "pending"
              : "unknown",
          resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        })
        ),
      ];

      const relatedLinks: { label: string; href: string }[] = [];
      if (row.customer) {
        relatedLinks.push({
          label: "Customer",
          href: `/admin/customers/${row.customer.id}`,
        });
      }
      if (row.orderId) {
        relatedLinks.push({
          label: "Order",
          href: `/admin/orders/${row.orderId}`,
        });
      }
      if (row.debitTransactionId && row.customer) {
        relatedLinks.push({
          label: "Debit transaction",
          href: `/admin/customers/${row.customer.id}`,
        });
      }
      if (row.refundTransactionId && row.customer) {
        relatedLinks.push({
          label: "Refund transaction",
          href: `/admin/customers/${row.customer.id}`,
        });
      }
      relatedLinks.push({
        label: "Audit logs",
        href: `/admin/audit-logs`,
      });

      return {
        sourceType,
        attemptId: row.id,
        purchaseType:
          sourceType === "order_email" ? "Email issue" : purchaseType,
        category,
        categoryLabel: categoryLabel(category),
        customerLabel: customerLabelFrom(row.customer),
        customerHref: row.customer
          ? `/admin/customers/${row.customer.id}`
          : null,
        destinationPackage: destinationPackageLabel(row),
        amountLabel: `${formatUsdCents(row.priceCents)} ${row.currency || "USD"}`,
        walletDebitRefundLabel: walletDebitRefundLabel({
          hasDebit: Boolean(row.debitTransactionId),
          hasRefund: Boolean(row.refundTransactionId),
          debitStatus: row.debitTransaction?.status,
          refundStatus: row.refundTransaction?.status,
        }),
        providerResultKindLabel: providerResultLabel(row.providerResultKind),
        providerRefMasked: maskProviderOrderRef(row.providerOrderId),
        hasProviderRef: hasProvider,
        localOrderLabel: row.orderId || "—",
        localOrderHref: row.orderId ? `/admin/orders/${row.orderId}` : null,
        failureLabel:
          sourceType === "order_email"
            ? emailDeliveryFailureLabel(row.emailDeliveryStatus)
            : failureLabel(row.failureCategory, row.failureCode),
        createdAtLabel: formatTs(row.createdAt),
        updatedAtLabel: formatTs(row.updatedAt),
        resolutionLabel: resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        }),
        locked: Boolean(row.reconciliationLockedAt),
        escalated: Boolean(row.reconciliationEscalatedAt),
        timeline,
        relatedLinks,
      };
    }
  }

  if (
    sourceType === "order_email" &&
    attemptId.startsWith("assignment:")
  ) {
    const assignmentId = attemptId.slice("assignment:".length);
    return getAssignmentDetail(assignmentId, "order_email");
  }

  if (sourceType === "assignment") {
    return getAssignmentDetail(attemptId, "assignment");
  }

  if (sourceType === "topup") {
    const row = await prisma.walletTopup.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        failureCategory: true,
        failureCode: true,
        creditAmountCents: true,
        walletTransactionId: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        reconciliationResolutionReason: true,
        createdAt: true,
        updatedAt: true,
        paymentConfirmedAt: true,
        walletCreditedAt: true,
        customer: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) return null;
    if (
      row.status !== WalletTopupStatus.RECONCILIATION_REQUIRED &&
      !row.reconciliationResolvedAt
    ) {
      return null;
    }
    const category = classifyReconciliationCase({
      sourceType: "topup",
      status: row.status,
      failureCategory: row.failureCategory,
      failureCode: row.failureCode,
      reconciliationResolvedAt: row.reconciliationResolvedAt,
      updatedAt: row.updatedAt,
    });
    return {
      sourceType: "topup",
      attemptId: row.id,
      purchaseType: "Top-up",
      category,
      categoryLabel: categoryLabel(category),
      customerLabel: customerLabelFrom(row.customer),
      customerHref: row.customer
        ? `/admin/customers/${row.customer.id}`
        : null,
      destinationPackage: "Wallet top-up",
      amountLabel: `${formatUsdCents(row.creditAmountCents)} USD`,
      walletDebitRefundLabel: row.walletTransactionId
        ? "Credit linked"
        : "Credit pending",
      providerResultKindLabel: "—",
      providerRefMasked: "Not available",
      hasProviderRef: false,
      localOrderLabel: "—",
      localOrderHref: null,
      failureLabel: failureLabel(row.failureCategory, row.failureCode),
      createdAtLabel: formatTs(row.createdAt),
      updatedAtLabel: formatTs(row.updatedAt),
      resolutionLabel: resolutionLabel({
        resolvedAt: row.reconciliationResolvedAt,
        lockedAt: row.reconciliationLockedAt,
        escalatedAt: row.reconciliationEscalatedAt,
        escalationPriority: row.reconciliationEscalationPriority,
        reason: row.reconciliationResolutionReason,
      }),
      locked: Boolean(row.reconciliationLockedAt),
      escalated: Boolean(row.reconciliationEscalatedAt),
      timeline: [
        timelineEvent("Attempt prepared", "done", formatTs(row.createdAt)),
        timelineEvent(
          "Payment confirmed",
          row.paymentConfirmedAt ? "done" : "pending",
          formatTs(row.paymentConfirmedAt)
        ),
        timelineEvent(
          "Wallet credited",
          row.walletCreditedAt ? "done" : "pending",
          formatTs(row.walletCreditedAt)
        ),
        timelineEvent(
          "Reconciliation marked",
          row.reconciliationResolvedAt ? "done" : "pending",
          row.status
        ),
      ],
      relatedLinks: [
        ...(row.customer
          ? [
              {
                label: "Customer",
                href: `/admin/customers/${row.customer.id}`,
              },
            ]
          : []),
        { label: "Top-up record", href: `/admin/wallet-topups/${row.id}` },
        { label: "Audit logs", href: "/admin/audit-logs" },
      ],
    };
  }

  if (sourceType === "wallet_email") {
    const row = await prisma.walletTransaction.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        type: true,
        status: true,
        amountCents: true,
        emailNotificationStatus: true,
        emailNotifiedAt: true,
        reconciliationResolvedAt: true,
        reconciliationLockedAt: true,
        reconciliationEscalatedAt: true,
        reconciliationEscalationPriority: true,
        reconciliationResolutionReason: true,
        createdAt: true,
        updatedAt: true,
        wallet: {
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!row) return null;
    if (
      row.status !== WalletTransactionStatus.COMPLETED ||
      (!isFailedWalletNotification(row.emailNotificationStatus) &&
        !row.reconciliationResolvedAt)
    ) {
      return null;
    }
    const user = row.wallet.user;
    const category = classifyReconciliationCase({
      sourceType: "wallet_email",
      status: "COMPLETED",
      emailNotificationStatus: row.emailNotificationStatus,
      reconciliationResolvedAt: row.reconciliationResolvedAt,
      updatedAt: row.updatedAt,
    });
    return {
      sourceType: "wallet_email",
      attemptId: row.id,
      purchaseType: "Email issue",
      category,
      categoryLabel: categoryLabel(category),
      customerLabel: customerLabelFrom(user),
      customerHref: user ? `/admin/customers/${user.id}` : null,
      destinationPackage: `Wallet ${row.type}`,
      amountLabel: `${formatUsdCents(row.amountCents)} USD`,
      walletDebitRefundLabel: "Completed ledger entry",
      providerResultKindLabel: "—",
      providerRefMasked: "Not available",
      hasProviderRef: false,
      localOrderLabel: "—",
      localOrderHref: null,
      failureLabel: `wallet_email / ${row.emailNotificationStatus}`,
      createdAtLabel: formatTs(row.createdAt),
      updatedAtLabel: formatTs(row.updatedAt),
      resolutionLabel: resolutionLabel({
        resolvedAt: row.reconciliationResolvedAt,
        lockedAt: row.reconciliationLockedAt,
        escalatedAt: row.reconciliationEscalatedAt,
        escalationPriority: row.reconciliationEscalationPriority,
        reason: row.reconciliationResolutionReason,
      }),
      locked: Boolean(row.reconciliationLockedAt),
      escalated: Boolean(row.reconciliationEscalatedAt),
      timeline: [
        timelineEvent("Ledger completed", "done", formatTs(row.createdAt)),
        timelineEvent(
          "Wallet notification state",
          isFailedWalletNotification(row.emailNotificationStatus)
            ? "failed"
            : "done",
          (row.emailNotificationStatus ?? "—").slice(0, 40)
        ),
      ],
      relatedLinks: [
        ...(user
          ? [{ label: "Customer", href: `/admin/customers/${user.id}` }]
          : []),
        { label: "Audit logs", href: "/admin/audit-logs" },
      ],
    };
  }

  if (sourceType === "iccid") {
    const row = await prisma.order.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        providerOrderId: true,
        destination: true,
        planName: true,
        dataAllowance: true,
        validity: true,
        displayAmount: true,
        displayCurrency: true,
        iccidHash: true,
        iccidCapturedAt: true,
          reconciliationResolvedAt: true,
          reconciliationLockedAt: true,
          reconciliationEscalatedAt: true,
          reconciliationEscalationPriority: true,
          reconciliationResolutionReason: true,
          createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) return null;
    if (row.status !== OrderStatus.COMPLETED) return null;
    const iccidPending = !row.iccidHash && !row.iccidCapturedAt;
    if (!iccidPending && !row.reconciliationResolvedAt) return null;
    const category = classifyReconciliationCase({
      sourceType: "iccid",
      status: "COMPLETED",
      providerOrderId: row.providerOrderId,
      iccidHash: row.iccidHash,
      iccidCapturedAt: row.iccidCapturedAt,
      reconciliationResolvedAt: row.reconciliationResolvedAt,
      updatedAt: row.updatedAt,
    });
    return {
      sourceType: "iccid",
      attemptId: row.id,
      purchaseType: "ICCID issue",
      category,
      categoryLabel: categoryLabel(category),
      customerLabel: customerLabelFrom(row.user),
      customerHref: row.user ? `/admin/customers/${row.user.id}` : null,
      destinationPackage: destinationPackageLabel({
        destinationName: row.destination,
        planName: row.planName,
        dataAllowance: row.dataAllowance,
        validity: row.validity,
      }),
      amountLabel:
        row.displayAmount != null
          ? `${row.displayAmount} ${row.displayCurrency || "USD"}`
          : "—",
      walletDebitRefundLabel: "—",
      providerResultKindLabel: "—",
      providerRefMasked: maskProviderOrderRef(row.providerOrderId),
      hasProviderRef: Boolean((row.providerOrderId ?? "").trim()),
      localOrderLabel: row.id,
      localOrderHref: `/admin/orders/${row.id}`,
      failureLabel: "iccid / pending_capture",
      createdAtLabel: formatTs(row.createdAt),
      updatedAtLabel: formatTs(row.updatedAt),
      resolutionLabel: resolutionLabel({
        resolvedAt: row.reconciliationResolvedAt,
        lockedAt: row.reconciliationLockedAt,
        escalatedAt: row.reconciliationEscalatedAt,
        escalationPriority: row.reconciliationEscalationPriority,
        reason: row.reconciliationResolutionReason,
      }),
      locked: Boolean(row.reconciliationLockedAt),
      escalated: Boolean(row.reconciliationEscalatedAt),
      timeline: [
        timelineEvent("Order completed", "done", formatTs(row.createdAt)),
        timelineEvent(
          "Provider reference stored",
          "done",
          maskProviderOrderRef(row.providerOrderId)
        ),
        timelineEvent(
          "ICCID capture state",
          row.iccidHash || row.iccidCapturedAt ? "done" : "pending",
          row.iccidHash || row.iccidCapturedAt ? "Captured" : "Pending from provider"
        ),
      ],
      relatedLinks: [
        ...(row.user
          ? [{ label: "Customer", href: `/admin/customers/${row.user.id}` }]
          : []),
        { label: "Order", href: `/admin/orders/${row.id}` },
        { label: "Audit logs", href: "/admin/audit-logs" },
      ],
    };
  }

  return null;
}

async function getAssignmentDetail(
  assignmentId: string,
  sourceType: "assignment" | "order_email"
): Promise<ReconciliationDetail | null> {
  const row = await prisma.adminPackageAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      status: true,
      providerOrderId: true,
      providerResultKind: true,
      providerObservedAt: true,
      failureCategory: true,
      failureCode: true,
      orderId: true,
      emailDeliveryStatus: true,
      reconciliationResolvedAt: true,
      reconciliationLockedAt: true,
      reconciliationEscalatedAt: true,
      reconciliationEscalationPriority: true,
      reconciliationResolutionReason: true,
      destinationName: true,
      destinationCode: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      providerCostCents: true,
      providerCurrency: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      customer: { select: { id: true, name: true, email: true } },
      order: {
        select: { id: true, iccidHash: true, iccidCapturedAt: true },
      },
    },
  });
  if (!row) return null;

  if (sourceType === "order_email") {
    const isStaleSendingCase = isInboxStaleSendingEmailDelivery(
      row.emailDeliveryStatus,
      row.updatedAt,
      {
        status: row.status,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
      }
    );
    const sending =
      (row.emailDeliveryStatus ?? "").trim().toLowerCase() === "sending";
    if (sending && !isStaleSendingCase) return null;
    const isInboxEmailCase = isOrderEmailInboxMatch(
      row.emailDeliveryStatus,
      row.updatedAt,
      {
        status: row.status,
        reconciliationResolvedAt: row.reconciliationResolvedAt,
      }
    );
    if (!isInboxEmailCase && !row.reconciliationResolvedAt) {
      return null;
    }
  } else {
    const stuck =
      row.status === AdminPackageAssignmentStatus.PROVIDER_PENDING &&
      isStuckAttemptAge(row.updatedAt);
    if (
      row.status !== AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED &&
      !stuck &&
      !row.reconciliationResolvedAt
    ) {
      return null;
    }
  }

  const category = classifyReconciliationCase({
    sourceType,
    status: row.status,
    providerOrderId: row.providerOrderId,
    providerResultKind: row.providerResultKind,
    failureCategory: row.failureCategory,
    failureCode: row.failureCode,
    orderId: row.orderId,
    emailDeliveryStatus: row.emailDeliveryStatus,
    reconciliationResolvedAt: row.reconciliationResolvedAt,
    updatedAt: row.updatedAt,
  });

  const hasProvider = Boolean((row.providerOrderId ?? "").trim());
  const timeline: ReconciliationTimelineEvent[] = [
    timelineEvent("Attempt prepared", "done", formatTs(row.createdAt)),
    timelineEvent("Funds reserved", "unknown", "Company-funded (no wallet)"),
    timelineEvent(
      "Provider call initiated",
      row.status === AdminPackageAssignmentStatus.READY ? "pending" : "done",
      row.status
    ),
    timelineEvent(
      "Provider result observed",
      row.providerObservedAt || row.providerResultKind ? "done" : "unknown",
      providerResultLabel(row.providerResultKind)
    ),
    timelineEvent(
      hasProvider ? "Provider reference stored" : "Provider reference missing",
      hasProvider ? "done" : "failed",
      hasProvider ? maskProviderOrderRef(row.providerOrderId) : "Not stored"
    ),
    timelineEvent(
      row.status === AdminPackageAssignmentStatus.COMPLETED
        ? "Local finalization completed"
        : row.failureCategory === "local_finalize_failed"
          ? "Local finalization failed"
          : "Local finalization pending",
      row.status === AdminPackageAssignmentStatus.COMPLETED
        ? "done"
        : row.failureCategory === "local_finalize_failed"
          ? "failed"
          : "pending",
      row.orderId ? `Order ${row.orderId}` : "No local order"
    ),
    timelineEvent("Refund completed or missing", "unknown", "N/A (company-funded)"),
    timelineEvent(
      "Order email state",
      orderEmailTimelineState(row.emailDeliveryStatus, row.updatedAt, new Date()),
      emailDeliveryFailureLabel(row.emailDeliveryStatus).replace(/^email \/ /, "")
    ),
    timelineEvent("Wallet notification state", "unknown", "N/A"),
    timelineEvent(
      "ICCID capture state",
      row.order?.iccidCapturedAt || row.order?.iccidHash
        ? "done"
        : row.order
          ? "pending"
          : "unknown",
      row.order?.iccidCapturedAt
        ? "Captured"
        : row.order
          ? "Pending from provider"
          : "No order"
    ),
    timelineEvent(
      row.reconciliationResolvedAt
        ? "Reconciliation resolved"
        : row.reconciliationLockedAt
          ? "Reconciliation locked"
          : "Reconciliation marked",
      row.reconciliationResolvedAt
        ? "done"
        : row.status === AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED
          ? "pending"
          : "unknown",
      resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        })
    ),
  ];

  return {
    sourceType,
    attemptId: sourceType === "order_email" ? `assignment:${row.id}` : row.id,
    purchaseType:
      sourceType === "order_email" ? "Email issue" : "Company-funded",
    category,
    categoryLabel: categoryLabel(category),
    customerLabel: customerLabelFrom(row.customer),
    customerHref: row.customer
      ? `/admin/customers/${row.customer.id}`
      : null,
    destinationPackage: destinationPackageLabel(row),
    amountLabel:
      row.providerCostCents != null
        ? `${formatUsdCents(row.providerCostCents)} ${row.providerCurrency || "USD"}`
        : "—",
    walletDebitRefundLabel: "Company-funded (no wallet debit)",
    providerResultKindLabel: providerResultLabel(row.providerResultKind),
    providerRefMasked: maskProviderOrderRef(row.providerOrderId),
    hasProviderRef: hasProvider,
    localOrderLabel: row.orderId || "—",
    localOrderHref: row.orderId ? `/admin/orders/${row.orderId}` : null,
    failureLabel:
      sourceType === "order_email"
        ? emailDeliveryFailureLabel(row.emailDeliveryStatus)
        : failureLabel(row.failureCategory, row.failureCode),
    createdAtLabel: formatTs(row.createdAt),
    updatedAtLabel: formatTs(row.updatedAt),
    resolutionLabel: resolutionLabel({
          resolvedAt: row.reconciliationResolvedAt,
          lockedAt: row.reconciliationLockedAt,
          escalatedAt: row.reconciliationEscalatedAt,
          escalationPriority: row.reconciliationEscalationPriority,
          reason: row.reconciliationResolutionReason,
        }),
    locked: Boolean(row.reconciliationLockedAt),
    escalated: Boolean(row.reconciliationEscalatedAt),
    timeline,
    relatedLinks: [
      ...(row.customer
        ? [
            {
              label: "Customer",
              href: `/admin/customers/${row.customer.id}`,
            },
          ]
        : []),
      ...(row.orderId
        ? [{ label: "Order", href: `/admin/orders/${row.orderId}` }]
        : []),
      { label: "Audit logs", href: "/admin/audit-logs" },
    ],
  };
}
