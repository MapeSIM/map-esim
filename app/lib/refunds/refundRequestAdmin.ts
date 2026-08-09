import "server-only";

import { RefundRequestStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";
import {
  refundReasonLabel,
  refundStatusLabel,
} from "@/app/lib/refunds/refundRequestConstants";
import { shortCustomerOrderReference } from "@/app/lib/orders/customerOrderDisplay";

function formatDate(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function fundingCompositionLabel(input: {
  fundingSource: string | null;
  walletAppliedCents: number;
  gatewayAmountCents: number;
}): string {
  const wallet = input.walletAppliedCents;
  const gateway = input.gatewayAmountCents;
  if (wallet > 0 && gateway > 0) {
    return `Split · wallet ${formatUsdCents(wallet)} + card ${formatUsdCents(gateway)}`;
  }
  if (wallet > 0) return `Wallet · ${formatUsdCents(wallet)}`;
  if (gateway > 0) return `Card · ${formatUsdCents(gateway)}`;
  if (input.fundingSource === "COMPANY_FUNDED") return "Company funded";
  return "Not available";
}

export type AdminRefundRequestListRow = {
  id: string;
  orderId: string;
  orderReference: string;
  customerLabel: string;
  amountLabel: string;
  compositionLabel: string;
  reasonLabel: string;
  statusLabel: string;
  status: RefundRequestStatus;
  createdAtLabel: string;
};

export async function listAdminRefundRequests(
  limit = 50
): Promise<AdminRefundRequestListRow[]> {
  const take = Math.min(Math.max(1, limit), 100);
  const rows = await prisma.refundRequest.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      orderId: true,
      status: true,
      reason: true,
      refundAmountCents: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
      fundingSource: true,
      createdAt: true,
      customer: { select: { name: true, email: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    orderReference: shortCustomerOrderReference(row.orderId),
    customerLabel: row.customer.name?.trim() || row.customer.email,
    amountLabel: `${formatUsdCents(row.refundAmountCents)} USD`,
    compositionLabel: fundingCompositionLabel({
      fundingSource: row.fundingSource,
      walletAppliedCents: row.walletAppliedCents,
      gatewayAmountCents: row.gatewayAmountCents,
    }),
    reasonLabel: refundReasonLabel(row.reason),
    statusLabel: refundStatusLabel(row.status),
    status: row.status,
    createdAtLabel: formatDate(row.createdAt),
  }));
}

export type AdminRefundRequestDetail = {
  id: string;
  status: RefundRequestStatus;
  statusLabel: string;
  reasonLabel: string;
  customerNote: string | null;
  adminDecisionNote: string | null;
  amountLabel: string;
  compositionLabel: string;
  createdAtLabel: string;
  reviewedAtLabel: string | null;
  decidedAtLabel: string | null;
  customerLabel: string;
  customerEmail: string;
  orderId: string;
  orderReference: string;
  orderStatus: string;
  orderDestination: string;
  planName: string;
  purchaseStatus: string | null;
  paymentAttemptStatus: string | null;
  providerResultKind: string | null;
  safeProviderStatusCode: string | null;
  reconciliationState: string | null;
  iccidMasked: string;
  canMarkUnderReview: boolean;
  canApprove: boolean;
  canReject: boolean;
};

export async function getAdminRefundRequestDetail(
  requestId: string
): Promise<AdminRefundRequestDetail | null> {
  const id = requestId.trim();
  if (!id || id.length > 64) return null;

  const row = await prisma.refundRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      reason: true,
      customerNote: true,
      adminDecisionNote: true,
      refundAmountCents: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
      fundingSource: true,
      purchaseId: true,
      createdAt: true,
      reviewedAt: true,
      decidedAt: true,
      customer: { select: { name: true, email: true, role: true } },
      order: {
        select: {
          id: true,
          status: true,
          destination: true,
          planName: true,
          iccidLast4: true,
          walletEsimPurchase: {
            select: {
              status: true,
              providerResultKind: true,
              safeProviderStatusCode: true,
              reconciliationState: true,
              paymentAttempts: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { status: true },
              },
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  const purchase = row.order.walletEsimPurchase;
  const last4 = (row.order.iccidLast4 ?? "").replace(/\D+/g, "");
  const iccidMasked =
    last4.length === 4 ? `•••• ${last4}` : "Not available";

  const openForReview =
    row.status === RefundRequestStatus.REQUESTED ||
    row.status === RefundRequestStatus.UNDER_REVIEW;
  const openForReject =
    openForReview ||
    row.status === RefundRequestStatus.APPROVED_PENDING_EXECUTION;

  return {
    id: row.id,
    status: row.status,
    statusLabel: refundStatusLabel(row.status),
    reasonLabel: refundReasonLabel(row.reason),
    customerNote: row.customerNote,
    adminDecisionNote: row.adminDecisionNote,
    amountLabel: `${formatUsdCents(row.refundAmountCents)} USD`,
    compositionLabel: fundingCompositionLabel({
      fundingSource: row.fundingSource,
      walletAppliedCents: row.walletAppliedCents,
      gatewayAmountCents: row.gatewayAmountCents,
    }),
    createdAtLabel: formatDate(row.createdAt),
    reviewedAtLabel: row.reviewedAt ? formatDate(row.reviewedAt) : null,
    decidedAtLabel: row.decidedAt ? formatDate(row.decidedAt) : null,
    customerLabel: row.customer.name?.trim() || row.customer.email,
    customerEmail: row.customer.email,
    orderId: row.order.id,
    orderReference: shortCustomerOrderReference(row.order.id),
    orderStatus: row.order.status,
    orderDestination: (row.order.destination ?? "").trim() || "Not available",
    planName: (row.order.planName ?? "").trim() || "Not available",
    purchaseStatus: purchase?.status ?? null,
    paymentAttemptStatus: purchase?.paymentAttempts[0]?.status ?? null,
    providerResultKind: purchase?.providerResultKind ?? null,
    safeProviderStatusCode: purchase?.safeProviderStatusCode ?? null,
    reconciliationState: purchase?.reconciliationState ?? null,
    iccidMasked,
    canMarkUnderReview: openForReview,
    canApprove: openForReview,
    canReject: openForReject,
  };
}
