/**
 * Admin review for Order Support Tickets.
 * Refund Approve credits wallet once via existing refund-request execution (idempotent).
 */
import "server-only";

import {
  OrderSupportTicketActor,
  OrderSupportTicketStatus,
  OrderSupportTicketSubject,
  PartnerRefundRequestReason,
  Prisma,
  RefundRequestReason,
  RefundRequestStatus,
  Role,
} from "@prisma/client";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import {
  executeAdminPartnerRefundRequest,
} from "@/app/lib/partner/partnerRefundRequestExecution";
import { createPartnerRefundRequest } from "@/app/lib/partner/partnerRefundRequest";
import {
  createCustomerRefundRequest,
} from "@/app/lib/refunds/refundRequest";
import {
  executeAdminCustomerRefundRequest,
} from "@/app/lib/refunds/refundRequestExecution";
import {
  ORDER_SUPPORT_AUDIT,
  ORDER_SUPPORT_DETAILS_MAX,
  orderSupportStatusLabel,
  orderSupportSubjectLabel,
} from "@/app/lib/support/orderSupportTicketConstants";
import { formatUsdCents, formatWalletDateTime } from "@/app/lib/wallet/display";
import {
  REFUND_CUSTOMER_WALLET_PHRASE,
} from "@/app/lib/refunds/refundRequestConstants";
import { REFUND_PARTNER_FUNDS_PHRASE } from "@/app/lib/admin/reconciliationCaseShared";

export class OrderSupportTicketAdminError extends Error {
  readonly code:
    | "UNAVAILABLE"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "INVALID_NOTE"
    | "NOT_REFUND"
    | "EXECUTION_FAILED";

  constructor(code: OrderSupportTicketAdminError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "OrderSupportTicketAdminError";
  }
}

function sanitizeNote(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (text.length > ORDER_SUPPORT_DETAILS_MAX) {
    throw new OrderSupportTicketAdminError(
      "INVALID_NOTE",
      `Resolution notes must be ${ORDER_SUPPORT_DETAILS_MAX} characters or fewer.`
    );
  }
  return text;
}

export type AdminSupportTicketListRow = {
  id: string;
  actorType: OrderSupportTicketActor;
  actorLabel: string;
  subject: OrderSupportTicketSubject;
  subjectLabel: string;
  status: OrderSupportTicketStatus;
  statusLabel: string;
  orderId: string;
  planName: string | null;
  iccid: string | null;
  details: string;
  refundAmountLabel: string | null;
  submitterEmail: string | null;
  createdAtLabel: string;
  adminResolutionNote: string | null;
  href: string;
};

export async function listAdminOrderSupportTickets(options: {
  actor?: "all" | "customer" | "partner";
  subject?: string | null;
  status?: string | null;
  limit?: number;
}): Promise<AdminSupportTicketListRow[]> {
  const where: Prisma.OrderSupportTicketWhereInput = {};
  if (options.actor === "customer") {
    where.actorType = OrderSupportTicketActor.CUSTOMER;
  } else if (options.actor === "partner") {
    where.actorType = OrderSupportTicketActor.PARTNER;
  }
  if (
    options.subject &&
    Object.values(OrderSupportTicketSubject).includes(
      options.subject as OrderSupportTicketSubject
    )
  ) {
    where.subject = options.subject as OrderSupportTicketSubject;
  }
  if (
    options.status &&
    Object.values(OrderSupportTicketStatus).includes(
      options.status as OrderSupportTicketStatus
    )
  ) {
    where.status = options.status as OrderSupportTicketStatus;
  }

  const rows = await prisma.orderSupportTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, options.limit ?? 50)),
    include: {
      submittedBy: { select: { email: true, name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    actorType: row.actorType,
    actorLabel: row.actorType === "PARTNER" ? "Partner" : "Customer",
    subject: row.subject,
    subjectLabel: orderSupportSubjectLabel(row.subject),
    status: row.status,
    statusLabel: orderSupportStatusLabel(row.status),
    orderId: row.orderId,
    planName: row.planName,
    iccid: row.iccid,
    details: row.details,
    refundAmountLabel:
      row.refundAmountCents != null && row.refundAmountCents > 0
        ? `${formatUsdCents(row.refundAmountCents)} USD`
        : null,
    submitterEmail: row.submittedBy.email,
    createdAtLabel: formatWalletDateTime(row.createdAt),
    adminResolutionNote: row.adminResolutionNote,
    href: `/admin/support-tickets/${encodeURIComponent(row.id)}`,
  }));
}

export async function getAdminOrderSupportTicketDetail(ticketId: string) {
  const row = await prisma.orderSupportTicket.findUnique({
    where: { id: ticketId },
    include: {
      submittedBy: { select: { id: true, email: true, name: true } },
      order: {
        select: {
          id: true,
          planName: true,
          destination: true,
          partnerEsimPurchase: { select: { id: true, partnerChargeCents: true } },
          walletEsimPurchase: { select: { id: true, priceCents: true } },
        },
      },
    },
  });
  if (!row) return null;
  return {
    ...row,
    subjectLabel: orderSupportSubjectLabel(row.subject),
    statusLabel: orderSupportStatusLabel(row.status),
    actorLabel: row.actorType === "PARTNER" ? "Partner" : "Customer",
    refundAmountLabel:
      row.refundAmountCents != null && row.refundAmountCents > 0
        ? `${formatUsdCents(row.refundAmountCents)} USD`
        : null,
    createdAtLabel: formatWalletDateTime(row.createdAt),
    isOpen:
      row.status === OrderSupportTicketStatus.OPEN ||
      row.status === OrderSupportTicketStatus.PENDING_REVIEW,
    isRefundSubject: row.subject === OrderSupportTicketSubject.REFUND_REQUEST,
  };
}

async function requireAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (
    !admin ||
    admin.role !== Role.ADMIN ||
    admin.deletedAt ||
    admin.adminDisabledAt
  ) {
    throw new OrderSupportTicketAdminError("UNAVAILABLE", "Admin access denied.");
  }
  return admin;
}

export async function resolveOrderSupportTicket(input: {
  adminUserId: string;
  ticketId: string;
  note?: unknown;
}) {
  await requireAdmin(input.adminUserId);
  const note = sanitizeNote(input.note);
  const ticket = await prisma.orderSupportTicket.findUnique({
    where: { id: input.ticketId },
  });
  if (!ticket) {
    throw new OrderSupportTicketAdminError("NOT_FOUND", "Ticket not found.");
  }
  if (
    ticket.status !== OrderSupportTicketStatus.OPEN &&
    ticket.status !== OrderSupportTicketStatus.PENDING_REVIEW
  ) {
    throw new OrderSupportTicketAdminError(
      "INVALID_STATE",
      "This ticket is already closed."
    );
  }
  if (ticket.subject === OrderSupportTicketSubject.REFUND_REQUEST) {
    throw new OrderSupportTicketAdminError(
      "NOT_REFUND",
      "Refund tickets must be Approved or Rejected — use Resolve only for non-refund issues."
    );
  }

  const updated = await prisma.orderSupportTicket.update({
    where: { id: ticket.id },
    data: {
      status: OrderSupportTicketStatus.RESOLVED,
      adminResolutionNote: note,
      reviewedByAdminId: input.adminUserId,
      reviewedAt: new Date(),
      openOrderKey: null,
    },
  });
  await writeAuditLog({
    actorUserId: input.adminUserId,
    action: ORDER_SUPPORT_AUDIT.resolve,
    targetType: "OrderSupportTicket",
    targetId: ticket.id,
    metadata: { orderId: ticket.orderId },
  }).catch(() => null);
  return updated;
}

export async function rejectOrderSupportTicket(input: {
  adminUserId: string;
  ticketId: string;
  note?: unknown;
}) {
  await requireAdmin(input.adminUserId);
  const note = sanitizeNote(input.note);
  const ticket = await prisma.orderSupportTicket.findUnique({
    where: { id: input.ticketId },
  });
  if (!ticket) {
    throw new OrderSupportTicketAdminError("NOT_FOUND", "Ticket not found.");
  }
  if (
    ticket.status !== OrderSupportTicketStatus.OPEN &&
    ticket.status !== OrderSupportTicketStatus.PENDING_REVIEW
  ) {
    throw new OrderSupportTicketAdminError(
      "INVALID_STATE",
      "This ticket is already closed."
    );
  }

  const updated = await prisma.orderSupportTicket.update({
    where: { id: ticket.id },
    data: {
      status: OrderSupportTicketStatus.REJECTED,
      adminResolutionNote: note,
      reviewedByAdminId: input.adminUserId,
      reviewedAt: new Date(),
      openOrderKey: null,
    },
  });
  await writeAuditLog({
    actorUserId: input.adminUserId,
    action: ORDER_SUPPORT_AUDIT.reject,
    targetType: "OrderSupportTicket",
    targetId: ticket.id,
    metadata: { orderId: ticket.orderId, subject: ticket.subject },
  }).catch(() => null);
  return updated;
}

/**
 * Approve a REFUND_REQUEST ticket: create/reuse legacy refund request, execute
 * wallet credit once (idempotent), mark ticket REFUNDED. Never double-credits.
 */
export async function approveOrderSupportTicketRefund(input: {
  adminUserId: string;
  ticketId: string;
  note?: unknown;
}) {
  await requireAdmin(input.adminUserId);
  const note = sanitizeNote(input.note);
  const ticket = await prisma.orderSupportTicket.findUnique({
    where: { id: input.ticketId },
  });
  if (!ticket) {
    throw new OrderSupportTicketAdminError("NOT_FOUND", "Ticket not found.");
  }
  if (ticket.subject !== OrderSupportTicketSubject.REFUND_REQUEST) {
    throw new OrderSupportTicketAdminError(
      "NOT_REFUND",
      "Only Refund request tickets can be approved for wallet credit."
    );
  }
  if (ticket.status === OrderSupportTicketStatus.REFUNDED) {
    return { ticketId: ticket.id, idempotent: true as const };
  }
  if (
    ticket.status !== OrderSupportTicketStatus.OPEN &&
    ticket.status !== OrderSupportTicketStatus.PENDING_REVIEW
  ) {
    throw new OrderSupportTicketAdminError(
      "INVALID_STATE",
      "This ticket cannot be approved for refund."
    );
  }

  try {
    if (ticket.actorType === OrderSupportTicketActor.PARTNER) {
      const purchase = await prisma.partnerEsimPurchase.findFirst({
        where: { orderId: ticket.orderId, partnerId: ticket.partnerId ?? undefined },
        select: { id: true },
      });
      if (!purchase) {
        throw new OrderSupportTicketAdminError(
          "EXECUTION_FAILED",
          "Partner purchase not found for refund."
        );
      }

      let requestId = ticket.partnerRefundRequestId;
      if (!requestId) {
        const open = await prisma.partnerRefundRequest.findFirst({
          where: {
            partnerEsimPurchaseId: purchase.id,
            status: {
              in: [
                RefundRequestStatus.REQUESTED,
                RefundRequestStatus.UNDER_REVIEW,
                RefundRequestStatus.APPROVED_PENDING_EXECUTION,
              ],
            },
          },
          select: { id: true },
        });
        if (open) {
          requestId = open.id;
        } else {
          const created = await createPartnerRefundRequest({
            partnerUserId: ticket.submittedByUserId,
            purchaseId: purchase.id,
            reason: PartnerRefundRequestReason.OTHER,
            partnerNote: ticket.details.slice(0, 500),
          });
          requestId = created.requestId;
        }
      }

      const partnerReq = await prisma.partnerRefundRequest.findUnique({
        where: { id: requestId },
        select: { status: true },
      });
      if (
        partnerReq &&
        (partnerReq.status === RefundRequestStatus.REQUESTED ||
          partnerReq.status === RefundRequestStatus.UNDER_REVIEW)
      ) {
        await prisma.partnerRefundRequest.update({
          where: { id: requestId },
          data: {
            status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
            adminDecisionNote: note ?? "Approved via support ticket",
            reviewedAt: new Date(),
          },
        });
      }

      const executed = await executeAdminPartnerRefundRequest({
        adminUserId: input.adminUserId,
        requestId,
        confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
      });

      await prisma.orderSupportTicket.update({
        where: { id: ticket.id },
        data: {
          status: OrderSupportTicketStatus.REFUNDED,
          adminResolutionNote: note,
          reviewedByAdminId: input.adminUserId,
          reviewedAt: new Date(),
          openOrderKey: null,
          partnerRefundRequestId: requestId,
          executedRefundTransactionId: executed.refundTransactionId,
        },
      });

      await writeAuditLog({
        actorUserId: input.adminUserId,
        action: ORDER_SUPPORT_AUDIT.approveRefund,
        targetType: "OrderSupportTicket",
        targetId: ticket.id,
        metadata: {
          orderId: ticket.orderId,
          requestId,
          amountCents: executed.amountCents,
          idempotent: executed.idempotent,
        },
      }).catch(() => null);

      return {
        ticketId: ticket.id,
        idempotent: executed.idempotent,
        amountCents: executed.amountCents,
      };
    }

    // Customer path
    let requestId = ticket.customerRefundRequestId;
    if (!requestId) {
      const open = await prisma.refundRequest.findFirst({
        where: {
          orderId: ticket.orderId,
          status: {
            in: [
              RefundRequestStatus.REQUESTED,
              RefundRequestStatus.UNDER_REVIEW,
              RefundRequestStatus.APPROVED_PENDING_EXECUTION,
              RefundRequestStatus.EXECUTION_FAILED,
            ],
          },
        },
        select: { id: true },
      });
      if (open) {
        requestId = open.id;
      } else {
        const created = await createCustomerRefundRequest({
          customerUserId: ticket.submittedByUserId,
          orderId: ticket.orderId,
          reason: RefundRequestReason.OTHER,
          customerNote: ticket.details.slice(0, 500),
        });
        requestId = created.requestId;
      }
    }

    // Approve step if still REQUESTED / UNDER_REVIEW
    const current = await prisma.refundRequest.findUnique({
      where: { id: requestId },
      select: { status: true },
    });
    if (
      current &&
      (current.status === RefundRequestStatus.REQUESTED ||
        current.status === RefundRequestStatus.UNDER_REVIEW)
    ) {
      await prisma.refundRequest.update({
        where: { id: requestId },
        data: {
          status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
          adminDecisionNote: note ?? "Approved via support ticket",
          decidedByAdminId: input.adminUserId,
          decidedAt: new Date(),
          reviewedByAdminId: input.adminUserId,
          reviewedAt: new Date(),
        },
      });
    }

    const executed = await executeAdminCustomerRefundRequest({
      adminUserId: input.adminUserId,
      requestId,
      confirmPhrase: REFUND_CUSTOMER_WALLET_PHRASE,
    });

    await prisma.orderSupportTicket.update({
      where: { id: ticket.id },
      data: {
        status: OrderSupportTicketStatus.REFUNDED,
        adminResolutionNote: note,
        reviewedByAdminId: input.adminUserId,
        reviewedAt: new Date(),
        openOrderKey: null,
        customerRefundRequestId: requestId,
        executedRefundTransactionId: executed.refundTransactionId,
      },
    });

    await writeAuditLog({
      actorUserId: input.adminUserId,
      action: ORDER_SUPPORT_AUDIT.approveRefund,
      targetType: "OrderSupportTicket",
      targetId: ticket.id,
      metadata: {
        orderId: ticket.orderId,
        requestId,
        amountCents: executed.amountCents,
        idempotent: executed.idempotent,
      },
    }).catch(() => null);

    return {
      ticketId: ticket.id,
      idempotent: executed.idempotent,
      amountCents: executed.amountCents,
    };
  } catch (error) {
    if (error instanceof OrderSupportTicketAdminError) throw error;
    const message =
      error instanceof Error ? error.message : "Refund execution failed.";
    throw new OrderSupportTicketAdminError("EXECUTION_FAILED", message);
  }
}
