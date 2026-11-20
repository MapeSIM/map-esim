/**
 * Order Support Ticket ("Raise issue") — create + read.
 * Never credits a wallet on create. Refund subjects need Admin Approve.
 */
import "server-only";

import {
  OrderSupportTicketActor,
  OrderSupportTicketStatus,
  OrderSupportTicketSubject,
  PartnerEsimPurchaseStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import { resolveOrderIccidPlaintext } from "@/app/lib/orders/orderIccidResolve";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
  isOrderSupportTicketOpenStatus,
  isOrderSupportTicketSubject,
  ORDER_SUPPORT_AUDIT,
  ORDER_SUPPORT_DETAILS_MAX,
  orderSupportStatusLabel,
  orderSupportSubjectLabel,
} from "@/app/lib/support/orderSupportTicketConstants";
import { formatWalletDateTime } from "@/app/lib/wallet/display";

export class OrderSupportTicketError extends Error {
  readonly code:
    | "UNAVAILABLE"
    | "FORBIDDEN"
    | "ORDER_UNAVAILABLE"
    | "INVALID_SUBJECT"
    | "INVALID_DETAILS"
    | "ALREADY_OPEN";

  constructor(code: OrderSupportTicketError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "OrderSupportTicketError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function sanitizeDetails(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) {
    throw new OrderSupportTicketError(
      "INVALID_DETAILS",
      "Please describe the issue in the details field."
    );
  }
  if (text.length > ORDER_SUPPORT_DETAILS_MAX) {
    throw new OrderSupportTicketError(
      "INVALID_DETAILS",
      `Details must be ${ORDER_SUPPORT_DETAILS_MAX} characters or fewer.`
    );
  }
  return text;
}

export type OrderSupportTicketSummary = {
  id: string;
  orderId: string;
  subject: OrderSupportTicketSubject;
  subjectLabel: string;
  status: OrderSupportTicketStatus;
  statusLabel: string;
  createdAtLabel: string;
  details: string;
  planName: string | null;
  iccid: string | null;
  adminResolutionNote: string | null;
  isOpen: boolean;
  isRefundSubject: boolean;
};

export function toOrderSupportTicketSummary(row: {
  id: string;
  orderId: string;
  subject: OrderSupportTicketSubject;
  status: OrderSupportTicketStatus;
  createdAt: Date;
  details: string;
  planName: string | null;
  iccid: string | null;
  adminResolutionNote: string | null;
}): OrderSupportTicketSummary {
  const isOpen = isOrderSupportTicketOpenStatus(row.status);
  return {
    id: row.id,
    orderId: row.orderId,
    subject: row.subject,
    subjectLabel: orderSupportSubjectLabel(row.subject),
    status: row.status,
    statusLabel: orderSupportStatusLabel(row.status),
    createdAtLabel: formatWalletDateTime(row.createdAt),
    details: row.details,
    planName: row.planName,
    iccid: row.iccid,
    adminResolutionNote: row.adminResolutionNote,
    isOpen,
    isRefundSubject: row.subject === OrderSupportTicketSubject.REFUND_REQUEST,
  };
}

async function resolveCustomerRefundAmountCents(
  orderId: string
): Promise<number | null> {
  const purchase = await prisma.walletEsimPurchase.findFirst({
    where: { orderId },
    select: { priceCents: true },
    orderBy: { createdAt: "desc" },
  });
  if (purchase && Number.isInteger(purchase.priceCents) && purchase.priceCents > 0) {
    return purchase.priceCents;
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { displayAmount: true },
  });
  if (order?.displayAmount != null) {
    const cents = Math.round(Number(order.displayAmount) * 100);
    return Number.isFinite(cents) && cents > 0 ? cents : null;
  }
  return null;
}

export async function createCustomerOrderSupportTicket(input: {
  customerUserId: string;
  orderId: string;
  subject: unknown;
  details: unknown;
}): Promise<{ ticketId: string; duplicate: boolean; summary: OrderSupportTicketSummary }> {
  if (!isOrderSupportTicketSubject(input.subject)) {
    throw new OrderSupportTicketError(
      "INVALID_SUBJECT",
      "Please select a valid subject."
    );
  }
  const details = sanitizeDetails(input.details);
  const orderId = String(input.orderId ?? "").trim();
  if (!orderId) {
    throw new OrderSupportTicketError("ORDER_UNAVAILABLE", "Order not found.");
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: input.customerUserId },
    select: {
      id: true,
      planName: true,
      partnerEsimPurchase: { select: { id: true } },
    },
  });
  if (!order || order.partnerEsimPurchase) {
    throw new OrderSupportTicketError(
      "ORDER_UNAVAILABLE",
      "This order is unavailable for a support ticket."
    );
  }

  const existing = await prisma.orderSupportTicket.findFirst({
    where: {
      orderId,
      status: {
        in: [
          OrderSupportTicketStatus.OPEN,
          OrderSupportTicketStatus.PENDING_REVIEW,
          OrderSupportTicketStatus.IN_REVIEW,
          OrderSupportTicketStatus.INFO_REQUIRED,
        ],
      },
    },
  });
  if (existing) {
    return {
      ticketId: existing.id,
      duplicate: true,
      summary: toOrderSupportTicketSummary(existing),
    };
  }

  const iccid = await resolveOrderIccidPlaintext(orderId).catch(() => null);
  const isRefund = input.subject === "REFUND_REQUEST";
  const refundAmountCents = isRefund
    ? await resolveCustomerRefundAmountCents(orderId)
    : null;
  const status = isRefund
    ? OrderSupportTicketStatus.PENDING_REVIEW
    : OrderSupportTicketStatus.OPEN;

  try {
    const created = await prisma.orderSupportTicket.create({
      data: {
        actorType: OrderSupportTicketActor.CUSTOMER,
        subject: input.subject,
        status,
        orderId,
        submittedByUserId: input.customerUserId,
        planName: order.planName,
        iccid,
        details,
        refundAmountCents,
        openOrderKey: orderId,
      },
    });
    await writeAuditLog({
      actorUserId: input.customerUserId,
      action: ORDER_SUPPORT_AUDIT.create,
      targetType: "OrderSupportTicket",
      targetId: created.id,
      metadata: {
        actorType: "CUSTOMER",
        subject: input.subject,
        orderId,
      },
    }).catch(() => null);
    return {
      ticketId: created.id,
      duplicate: false,
      summary: toOrderSupportTicketSummary(created),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = await prisma.orderSupportTicket.findFirst({
        where: {
          orderId,
          status: {
            in: [
              OrderSupportTicketStatus.OPEN,
              OrderSupportTicketStatus.PENDING_REVIEW,
              OrderSupportTicketStatus.IN_REVIEW,
              OrderSupportTicketStatus.INFO_REQUIRED,
            ],
          },
        },
      });
      if (again) {
        return {
          ticketId: again.id,
          duplicate: true,
          summary: toOrderSupportTicketSummary(again),
        };
      }
    }
    throw new OrderSupportTicketError(
      "UNAVAILABLE",
      "Unable to submit the support ticket right now."
    );
  }
}

export async function createPartnerOrderSupportTicket(input: {
  partnerUserId: string;
  orderId: string;
  subject: unknown;
  details: unknown;
}): Promise<{ ticketId: string; duplicate: boolean; summary: OrderSupportTicketSummary }> {
  if (!isOrderSupportTicketSubject(input.subject)) {
    throw new OrderSupportTicketError(
      "INVALID_SUBJECT",
      "Please select a valid subject."
    );
  }
  const details = sanitizeDetails(input.details);
  const orderId = String(input.orderId ?? "").trim();
  if (!orderId) {
    throw new OrderSupportTicketError("ORDER_UNAVAILABLE", "Order not found.");
  }

  const actor = await requireActivePartnerActor(input.partnerUserId);
  if (!actor) {
    throw new OrderSupportTicketError(
      "FORBIDDEN",
      "Partner access is unavailable."
    );
  }

  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: {
      partnerId: actor.partnerId,
      orderId,
      status: PartnerEsimPurchaseStatus.COMPLETED,
    },
    select: {
      id: true,
      partnerChargeCents: true,
      planName: true,
      order: { select: { id: true, planName: true } },
    },
  });
  if (!purchase?.order) {
    throw new OrderSupportTicketError(
      "ORDER_UNAVAILABLE",
      "This Partner order is unavailable for a support ticket."
    );
  }

  const existing = await prisma.orderSupportTicket.findFirst({
    where: {
      orderId,
      status: {
        in: [
          OrderSupportTicketStatus.OPEN,
          OrderSupportTicketStatus.PENDING_REVIEW,
          OrderSupportTicketStatus.IN_REVIEW,
          OrderSupportTicketStatus.INFO_REQUIRED,
        ],
      },
    },
  });
  if (existing) {
    return {
      ticketId: existing.id,
      duplicate: true,
      summary: toOrderSupportTicketSummary(existing),
    };
  }

  const iccid = await resolveOrderIccidPlaintext(orderId).catch(() => null);
  const isRefund = input.subject === "REFUND_REQUEST";
  const refundAmountCents =
    isRefund && purchase.partnerChargeCents > 0
      ? purchase.partnerChargeCents
      : null;
  const status = isRefund
    ? OrderSupportTicketStatus.PENDING_REVIEW
    : OrderSupportTicketStatus.OPEN;

  try {
    const created = await prisma.orderSupportTicket.create({
      data: {
        actorType: OrderSupportTicketActor.PARTNER,
        subject: input.subject,
        status,
        orderId,
        submittedByUserId: input.partnerUserId,
        partnerId: actor.partnerId,
        planName: purchase.planName || purchase.order.planName,
        iccid,
        details,
        refundAmountCents,
        openOrderKey: orderId,
      },
    });
    await writeAuditLog({
      actorUserId: input.partnerUserId,
      action: ORDER_SUPPORT_AUDIT.create,
      targetType: "OrderSupportTicket",
      targetId: created.id,
      metadata: {
        actorType: "PARTNER",
        subject: input.subject,
        orderId,
        partnerId: actor.partnerId,
      },
    }).catch(() => null);
    return {
      ticketId: created.id,
      duplicate: false,
      summary: toOrderSupportTicketSummary(created),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = await prisma.orderSupportTicket.findFirst({
        where: {
          orderId,
          status: {
            in: [
              OrderSupportTicketStatus.OPEN,
              OrderSupportTicketStatus.PENDING_REVIEW,
              OrderSupportTicketStatus.IN_REVIEW,
              OrderSupportTicketStatus.INFO_REQUIRED,
            ],
          },
        },
      });
      if (again) {
        return {
          ticketId: again.id,
          duplicate: true,
          summary: toOrderSupportTicketSummary(again),
        };
      }
    }
    throw new OrderSupportTicketError(
      "UNAVAILABLE",
      "Unable to submit the support ticket right now."
    );
  }
}

export async function getLatestOrderSupportTicketForOrder(
  orderId: string
): Promise<OrderSupportTicketSummary | null> {
  const row = await prisma.orderSupportTicket.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  return row ? toOrderSupportTicketSummary(row) : null;
}

/** Latest ticket per orderId (one query). */
export async function mapLatestOrderSupportTicketsByOrderIds(
  orderIds: string[]
): Promise<Record<string, OrderSupportTicketSummary>> {
  const ids = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};
  const rows = await prisma.orderSupportTicket.findMany({
    where: { orderId: { in: ids } },
    orderBy: { createdAt: "desc" },
  });
  const out: Record<string, OrderSupportTicketSummary> = {};
  for (const row of rows) {
    if (out[row.orderId]) continue;
    out[row.orderId] = toOrderSupportTicketSummary(row);
  }
  return out;
}

export async function assertUserCanAccessOrderForSupport(options: {
  userId: string;
  role: Role;
  orderId: string;
}): Promise<{
  orderId: string;
  planName: string | null;
  iccid: string | null;
  actor: "CUSTOMER" | "PARTNER";
}> {
  if (options.role === Role.PARTNER) {
    const actor = await requireActivePartnerActor(options.userId);
    if (!actor) {
      throw new OrderSupportTicketError("FORBIDDEN", "Partner access denied.");
    }
    const purchase = await prisma.partnerEsimPurchase.findFirst({
      where: { partnerId: actor.partnerId, orderId: options.orderId },
      select: {
        planName: true,
        order: { select: { id: true, planName: true } },
      },
    });
    if (!purchase?.order) {
      throw new OrderSupportTicketError("ORDER_UNAVAILABLE", "Order not found.");
    }
    const iccid = await resolveOrderIccidPlaintext(options.orderId).catch(
      () => null
    );
    return {
      orderId: options.orderId,
      planName: purchase.planName || purchase.order.planName,
      iccid,
      actor: "PARTNER",
    };
  }

  if (options.role === Role.CUSTOMER) {
    const order = await prisma.order.findFirst({
      where: { id: options.orderId, userId: options.userId },
      select: {
        id: true,
        planName: true,
        partnerEsimPurchase: { select: { id: true } },
      },
    });
    if (!order || order.partnerEsimPurchase) {
      throw new OrderSupportTicketError("ORDER_UNAVAILABLE", "Order not found.");
    }
    const iccid = await resolveOrderIccidPlaintext(options.orderId).catch(
      () => null
    );
    return {
      orderId: order.id,
      planName: order.planName,
      iccid,
      actor: "CUSTOMER",
    };
  }

  throw new OrderSupportTicketError("FORBIDDEN", "Access denied.");
}
