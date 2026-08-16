/**
 * Admin review of Partner refund REQUESTS.
 * Slice 2: status transitions only. Never credits a wallet, never sets
 * refundTransactionId, never calls the provider, never executes a refund.
 */
import "server-only";

import {
  PartnerEsimPurchaseStatus,
  PartnerRefundRequestReason,
  RefundRequestStatus,
  Role,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { isStuckAttemptAge } from "@/app/lib/admin/reconciliationClassify";
import {
  PARTNER_REFUND_AUDIT,
  partnerRefundReasonLabel,
  sanitizePartnerRefundNote,
} from "@/app/lib/partner/partnerRefundRequestConstants";
import {
  shortPartnerOrderReference,
  shortPartnerPurchaseReference,
} from "@/app/lib/partner/partnerOrdersDisplay";
import { REFUND_ADMIN_DECISION_NOTE_MAX, refundStatusLabel } from "@/app/lib/refunds/refundRequestConstants";
import { formatUsdCents } from "@/app/lib/wallet/display";

export class PartnerRefundRequestAdminError extends Error {
  readonly code:
    | "UNAVAILABLE"
    | "REQUEST_UNAVAILABLE"
    | "INVALID_TRANSITION"
    | "INVALID_NOTE";

  constructor(code: PartnerRefundRequestAdminError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "PartnerRefundRequestAdminError";
  }
}

export type AdminPartnerRefundDecisionAction =
  | "mark_under_review"
  | "approve"
  | "reject";

function formatDate(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function moneyLabel(cents: number, currency: string): string {
  const code = (currency || "USD").trim().toUpperCase() || "USD";
  return `${formatUsdCents(cents)} ${code}`;
}

export type AdminPartnerRefundRequestListRow = {
  id: string;
  href: string;
  partnerLabel: string;
  partnerEmail: string;
  destinationLabel: string;
  planLabel: string;
  orderRefLabel: string;
  debitLabel: string;
  retailLabel: string;
  reasonLabel: string;
  status: RefundRequestStatus;
  statusLabel: string;
  createdAt: Date;
  createdAtLabel: string;
};

export async function listAdminPartnerRefundRequests(
  limit = 50
): Promise<AdminPartnerRefundRequestListRow[]> {
  const take = Math.min(Math.max(1, limit), 100);
  const rows = await prisma.partnerRefundRequest.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      status: true,
      reason: true,
      partnerChargeCents: true,
      retailPriceCents: true,
      currency: true,
      createdAt: true,
      partner: {
        select: {
          user: { select: { name: true, email: true } },
        },
      },
      purchase: {
        select: {
          id: true,
          destinationName: true,
          planName: true,
          order: {
            select: {
              id: true,
              destination: true,
              planName: true,
            },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const partnerName = row.partner.user.name?.trim() || row.partner.user.email;
    const destination =
      (row.purchase.destinationName ?? "").trim() ||
      (row.purchase.order?.destination ?? "").trim() ||
      "Not available";
    const plan =
      (row.purchase.planName ?? "").trim() ||
      (row.purchase.order?.planName ?? "").trim() ||
      "Not available";
    const orderId = row.purchase.order?.id ?? null;
    return {
      id: row.id,
      href: `/admin/refund-requests/partner/${encodeURIComponent(row.id)}`,
      partnerLabel: partnerName,
      partnerEmail: row.partner.user.email,
      destinationLabel: destination,
      planLabel: plan,
      orderRefLabel: orderId
        ? shortPartnerOrderReference(orderId)
        : shortPartnerPurchaseReference(row.purchase.id),
      debitLabel: moneyLabel(row.partnerChargeCents, row.currency),
      retailLabel: moneyLabel(row.retailPriceCents, row.currency),
      reasonLabel: partnerRefundReasonLabel(row.reason),
      status: row.status,
      statusLabel: refundStatusLabel(row.status),
      createdAt: row.createdAt,
      createdAtLabel: formatDate(row.createdAt),
    };
  });
}

export type AdminPartnerRefundRequestDetail = {
  id: string;
  status: RefundRequestStatus;
  statusLabel: string;
  reason: PartnerRefundRequestReason;
  reasonLabel: string;
  partnerLabel: string;
  partnerEmail: string;
  orderId: string | null;
  orderRefLabel: string;
  purchaseRefLabel: string;
  destinationLabel: string;
  planLabel: string;
  retailLabel: string;
  debitLabel: string;
  refundBasisLabel: string;
  currency: string;
  partnerChargeCents: number;
  partnerNote: string | null;
  adminDecisionNote: string | null;
  createdAtLabel: string;
  reviewedAtLabel: string | null;
  appearsProvisioned: boolean;
  hasReconciliationCase: boolean;
  reconciliationHref: string | null;
  canMarkUnderReview: boolean;
  canApprove: boolean;
  canReject: boolean;
};

function hasReconciliationCase(purchase: {
  status: PartnerEsimPurchaseStatus;
  updatedAt: Date;
  reconciliationResolvedAt: Date | null;
}): boolean {
  if (purchase.status === PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED) {
    return true;
  }
  if (
    purchase.status === PartnerEsimPurchaseStatus.PROVIDER_PENDING &&
    isStuckAttemptAge(purchase.updatedAt)
  ) {
    return true;
  }
  return Boolean(purchase.reconciliationResolvedAt);
}

export async function getAdminPartnerRefundRequestDetail(
  requestId: string
): Promise<AdminPartnerRefundRequestDetail | null> {
  const id = requestId.trim();
  if (!id || id.length > 64) return null;

  const row = await prisma.partnerRefundRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      reason: true,
      partnerNote: true,
      adminDecisionNote: true,
      partnerChargeCents: true,
      retailPriceCents: true,
      currency: true,
      createdAt: true,
      reviewedAt: true,
      partner: {
        select: {
          user: { select: { name: true, email: true } },
        },
      },
      purchase: {
        select: {
          id: true,
          status: true,
          destinationName: true,
          planName: true,
          updatedAt: true,
          reconciliationResolvedAt: true,
          providerRefreshInstallData: true,
          order: {
            select: {
              id: true,
              destination: true,
              planName: true,
              iccidLast4: true,
              iccidHash: true,
              iccidCapturedAt: true,
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  const order = row.purchase.order;
  const destination =
    (row.purchase.destinationName ?? "").trim() ||
    (order?.destination ?? "").trim() ||
    "Not available";
  const plan =
    (row.purchase.planName ?? "").trim() ||
    (order?.planName ?? "").trim() ||
    "Not available";
  const last4 = (order?.iccidLast4 ?? "").replace(/\D+/g, "");
  const appearsProvisioned = Boolean(
    last4.length === 4 ||
      (order?.iccidHash ?? "").trim() ||
      order?.iccidCapturedAt ||
      (row.purchase.providerRefreshInstallData ?? "").trim().toLowerCase() ===
        "yes"
  );
  const recon = hasReconciliationCase(row.purchase);
  const currency = row.currency;
  const debitLabel = moneyLabel(row.partnerChargeCents, currency);

  return {
    id: row.id,
    status: row.status,
    statusLabel: refundStatusLabel(row.status),
    reason: row.reason,
    reasonLabel: partnerRefundReasonLabel(row.reason),
    partnerLabel: row.partner.user.name?.trim() || row.partner.user.email,
    partnerEmail: row.partner.user.email,
    orderId: order?.id ?? null,
    orderRefLabel: order?.id
      ? shortPartnerOrderReference(order.id)
      : "Not available",
    purchaseRefLabel: shortPartnerPurchaseReference(row.purchase.id),
    destinationLabel: destination,
    planLabel: plan,
    retailLabel: moneyLabel(row.retailPriceCents, currency),
    debitLabel,
    refundBasisLabel: debitLabel,
    currency,
    partnerChargeCents: row.partnerChargeCents,
    partnerNote: row.partnerNote,
    adminDecisionNote: row.adminDecisionNote,
    createdAtLabel: formatDate(row.createdAt),
    reviewedAtLabel: row.reviewedAt ? formatDate(row.reviewedAt) : null,
    appearsProvisioned,
    hasReconciliationCase: recon,
    reconciliationHref: recon
      ? `/admin/reconciliation/partner_purchase/${encodeURIComponent(row.purchase.id)}`
      : null,
    canMarkUnderReview: row.status === RefundRequestStatus.REQUESTED,
    canApprove: row.status === RefundRequestStatus.UNDER_REVIEW,
    canReject: row.status === RefundRequestStatus.UNDER_REVIEW,
  };
}

export type ApplyAdminPartnerRefundRequestDecisionInput = {
  adminUserId: string;
  requestId: string;
  action: AdminPartnerRefundDecisionAction;
  decisionNote?: unknown;
  amount?: unknown;
  amountCents?: unknown;
  partnerId?: unknown;
  creditWallet?: unknown;
  executeRefund?: unknown;
  targetStatus?: unknown;
};

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
    throw new PartnerRefundRequestAdminError(
      "UNAVAILABLE",
      "Admin session is unavailable."
    );
  }
  return admin;
}

/**
 * Review-only Partner refund transitions.
 * Ignores any client amount, partner id, or execute/credit flags.
 */
export async function applyAdminPartnerRefundRequestDecision(
  input: ApplyAdminPartnerRefundRequestDecisionInput
): Promise<{ requestId: string; status: RefundRequestStatus; idempotent: boolean }> {
  void input.amount;
  void input.amountCents;
  void input.partnerId;
  void input.creditWallet;
  void input.executeRefund;
  void input.targetStatus;

  const adminUserId = (input.adminUserId ?? "").trim();
  const requestId = (input.requestId ?? "").trim();
  const note = sanitizePartnerRefundNote(input.decisionNote);

  if (!adminUserId || adminUserId.length > 64) {
    throw new PartnerRefundRequestAdminError(
      "UNAVAILABLE",
      "Admin session is unavailable."
    );
  }
  if (!requestId || requestId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(requestId)) {
    throw new PartnerRefundRequestAdminError(
      "REQUEST_UNAVAILABLE",
      "This Partner refund request is unavailable."
    );
  }

  const admin = await requireAdminUser(adminUserId);

  if (note.length > REFUND_ADMIN_DECISION_NOTE_MAX) {
    throw new PartnerRefundRequestAdminError(
      "INVALID_NOTE",
      `Keep the decision note under ${REFUND_ADMIN_DECISION_NOTE_MAX} characters.`
    );
  }

  const current = await prisma.partnerRefundRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      partnerId: true,
      partnerEsimPurchaseId: true,
      orderId: true,
      partnerChargeCents: true,
      currency: true,
      openPurchaseKey: true,
    },
  });
  if (!current) {
    throw new PartnerRefundRequestAdminError(
      "REQUEST_UNAVAILABLE",
      "This Partner refund request is unavailable."
    );
  }

  if (input.action === "mark_under_review") {
    if (current.status === RefundRequestStatus.UNDER_REVIEW) {
      return {
        requestId: current.id,
        status: RefundRequestStatus.UNDER_REVIEW,
        idempotent: true,
      };
    }
    if (current.status !== RefundRequestStatus.REQUESTED) {
      throw new PartnerRefundRequestAdminError(
        "INVALID_TRANSITION",
        "Only requested Partner refunds can move to under review."
      );
    }
    const updated = await prisma.partnerRefundRequest.updateMany({
      where: {
        id: current.id,
        status: RefundRequestStatus.REQUESTED,
      },
      data: {
        status: RefundRequestStatus.UNDER_REVIEW,
        reviewedAt: new Date(),
        openPurchaseKey: current.partnerEsimPurchaseId,
      },
    });
    if (updated.count !== 1) {
      const raced = await prisma.partnerRefundRequest.findUnique({
        where: { id: current.id },
        select: { status: true },
      });
      if (raced?.status === RefundRequestStatus.UNDER_REVIEW) {
        return {
          requestId: current.id,
          status: RefundRequestStatus.UNDER_REVIEW,
          idempotent: true,
        };
      }
      throw new PartnerRefundRequestAdminError(
        "INVALID_TRANSITION",
        "This Partner refund request could not be updated."
      );
    }
    await prisma.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: PARTNER_REFUND_AUDIT.REVIEW_STARTED,
        targetType: "PartnerRefundRequest",
        targetId: current.id,
        metadata: {
          requestId: current.id,
          partnerId: current.partnerId,
          purchaseId: current.partnerEsimPurchaseId,
          orderId: current.orderId,
          partnerChargeCents: current.partnerChargeCents,
          currency: current.currency,
          fromStatus: RefundRequestStatus.REQUESTED,
          toStatus: RefundRequestStatus.UNDER_REVIEW,
        },
      },
    });
    return {
      requestId: current.id,
      status: RefundRequestStatus.UNDER_REVIEW,
      idempotent: false,
    };
  }

  if (input.action === "approve") {
    if (current.status === RefundRequestStatus.APPROVED_PENDING_EXECUTION) {
      return {
        requestId: current.id,
        status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
        idempotent: true,
      };
    }
    if (current.status !== RefundRequestStatus.UNDER_REVIEW) {
      throw new PartnerRefundRequestAdminError(
        "INVALID_TRANSITION",
        "Only Partner refunds under review can be approved for later execution."
      );
    }
    const now = new Date();
    const updated = await prisma.partnerRefundRequest.updateMany({
      where: {
        id: current.id,
        status: RefundRequestStatus.UNDER_REVIEW,
      },
      data: {
        status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
        reviewedAt: now,
        adminDecisionNote: note || null,
        openPurchaseKey: current.partnerEsimPurchaseId,
      },
    });
    if (updated.count !== 1) {
      const raced = await prisma.partnerRefundRequest.findUnique({
        where: { id: current.id },
        select: { status: true },
      });
      if (raced?.status === RefundRequestStatus.APPROVED_PENDING_EXECUTION) {
        return {
          requestId: current.id,
          status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
          idempotent: true,
        };
      }
      throw new PartnerRefundRequestAdminError(
        "INVALID_TRANSITION",
        "This Partner refund request could not be approved."
      );
    }
    await prisma.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: PARTNER_REFUND_AUDIT.APPROVED_PENDING,
        targetType: "PartnerRefundRequest",
        targetId: current.id,
        metadata: {
          requestId: current.id,
          partnerId: current.partnerId,
          purchaseId: current.partnerEsimPurchaseId,
          orderId: current.orderId,
          partnerChargeCents: current.partnerChargeCents,
          currency: current.currency,
          fromStatus: RefundRequestStatus.UNDER_REVIEW,
          toStatus: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
        },
      },
    });
    return {
      requestId: current.id,
      status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
      idempotent: false,
    };
  }

  if (current.status === RefundRequestStatus.REJECTED) {
    return {
      requestId: current.id,
      status: RefundRequestStatus.REJECTED,
      idempotent: true,
    };
  }
  if (current.status !== RefundRequestStatus.UNDER_REVIEW) {
    throw new PartnerRefundRequestAdminError(
      "INVALID_TRANSITION",
      "Only Partner refunds under review can be rejected."
    );
  }
  if (!note || note.length < 3) {
    throw new PartnerRefundRequestAdminError(
      "INVALID_NOTE",
      "Add a short decision note before rejecting."
    );
  }

  const updated = await prisma.partnerRefundRequest.updateMany({
    where: {
      id: current.id,
      status: RefundRequestStatus.UNDER_REVIEW,
    },
    data: {
      status: RefundRequestStatus.REJECTED,
      reviewedAt: new Date(),
      adminDecisionNote: note,
      openPurchaseKey: null,
    },
  });
  if (updated.count !== 1) {
    const raced = await prisma.partnerRefundRequest.findUnique({
      where: { id: current.id },
      select: { status: true },
    });
    if (raced?.status === RefundRequestStatus.REJECTED) {
      return {
        requestId: current.id,
        status: RefundRequestStatus.REJECTED,
        idempotent: true,
      };
    }
    throw new PartnerRefundRequestAdminError(
      "INVALID_TRANSITION",
      "This Partner refund request could not be rejected."
    );
  }
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: PARTNER_REFUND_AUDIT.REJECTED,
      targetType: "PartnerRefundRequest",
      targetId: current.id,
      metadata: {
        requestId: current.id,
        partnerId: current.partnerId,
        purchaseId: current.partnerEsimPurchaseId,
        orderId: current.orderId,
        partnerChargeCents: current.partnerChargeCents,
        currency: current.currency,
        fromStatus: RefundRequestStatus.UNDER_REVIEW,
        toStatus: RefundRequestStatus.REJECTED,
      },
    },
  });
  return {
    requestId: current.id,
    status: RefundRequestStatus.REJECTED,
    idempotent: false,
  };
}
