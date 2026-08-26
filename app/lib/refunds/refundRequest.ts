import "server-only";

import {
  OrderFundingSource,
  Prisma,
  RefundRequestReason,
  RefundRequestStatus,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import {
  REFUND_ADMIN_DECISION_NOTE_MAX,
  REFUND_AUDIT,
  REFUND_REQUEST_NOTE_MAX,
  isOpenRefundStatus,
  parseRefundRequestReason,
  type RefundRequestReasonCode,
} from "@/app/lib/refunds/refundRequestConstants";
import { scheduleRefundStatusNotification } from "@/app/lib/refunds/refundRequestNotification";

export class RefundRequestError extends Error {
  readonly code:
    | "CUSTOMER_UNAVAILABLE"
    | "ORDER_UNAVAILABLE"
    | "NOT_ELIGIBLE"
    | "DUPLICATE_OPEN"
    | "INVALID_REASON"
    | "INVALID_NOTE"
    | "REQUEST_UNAVAILABLE"
    | "INVALID_TRANSITION"
    | "UNAVAILABLE";

  constructor(code: RefundRequestError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "RefundRequestError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function displayAmountToCents(
  displayAmount: Prisma.Decimal | null | undefined
): number | null {
  if (displayAmount == null) return null;
  const n = Number(displayAmount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return cents;
}

export type CreateCustomerRefundRequestInput = {
  customerUserId: string;
  orderId: string;
  reason: unknown;
  customerNote?: unknown;
};

export type CreateCustomerRefundRequestResult = {
  requestId: string;
  status: RefundRequestStatus;
  refundAmountCents: number;
  duplicate: boolean;
};

/**
 * Create a customer refund request for an owned order.
 * Never accepts a browser refund amount. Never moves money.
 */
export async function createCustomerRefundRequest(
  input: CreateCustomerRefundRequestInput
): Promise<CreateCustomerRefundRequestResult> {
  const customerUserId = input.customerUserId.trim();
  const orderId = input.orderId.trim();
  const reason = parseRefundRequestReason(input.reason);
  const noteRaw = String(input.customerNote ?? "").trim();

  if (!customerUserId || customerUserId.length > 64) {
    throw new RefundRequestError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for refund requests."
    );
  }
  if (
    !orderId ||
    orderId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(orderId)
  ) {
    throw new RefundRequestError(
      "ORDER_UNAVAILABLE",
      "This order is unavailable for a refund request."
    );
  }
  if (!reason) {
    throw new RefundRequestError(
      "INVALID_REASON",
      "Select a valid refund reason."
    );
  }
  if (noteRaw.length > REFUND_REQUEST_NOTE_MAX) {
    throw new RefundRequestError(
      "INVALID_NOTE",
      `Keep your explanation under ${REFUND_REQUEST_NOTE_MAX} characters.`
    );
  }

  let customer;
  let order;
  try {
    customer = await prisma.user.findUnique({
      where: { id: customerUserId },
      select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
    });
  } catch {
    throw new RefundRequestError(
      "UNAVAILABLE",
      "Refund requests are temporarily unavailable. Please try again shortly."
    );
  }
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    throw new RefundRequestError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for refund requests."
    );
  }

  try {
    order = await prisma.order.findFirst({
      where: { id: orderId, userId: customer.id },
      select: {
        id: true,
        fundingSource: true,
        displayAmount: true,
        displayCurrency: true,
        walletEsimPurchase: {
          select: {
            id: true,
            status: true,
            priceCents: true,
            walletAppliedCents: true,
            gatewayAmountCents: true,
            fundingSource: true,
            currency: true,
            refundTransactionId: true,
          },
        },
      },
    });
  } catch {
    throw new RefundRequestError(
      "UNAVAILABLE",
      "Refund requests are temporarily unavailable. Please try again shortly."
    );
  }
  if (!order) {
    throw new RefundRequestError(
      "ORDER_UNAVAILABLE",
      "This order is unavailable for a refund request."
    );
  }

  const purchase = order.walletEsimPurchase;
  if (purchase?.status === WalletEsimPurchaseStatus.FAILED_REFUNDED) {
    throw new RefundRequestError(
      "NOT_ELIGIBLE",
      "This order already has a completed refund."
    );
  }
  if (purchase?.refundTransactionId) {
    throw new RefundRequestError(
      "NOT_ELIGIBLE",
      "This order already has a completed refund."
    );
  }

  const refundAmountCents =
    purchase && Number.isInteger(purchase.priceCents) && purchase.priceCents > 0
      ? purchase.priceCents
      : displayAmountToCents(order.displayAmount);
  if (refundAmountCents == null) {
    throw new RefundRequestError(
      "NOT_ELIGIBLE",
      "A refundable amount is not available for this order."
    );
  }

  const walletAppliedCents =
    purchase && Number.isInteger(purchase.walletAppliedCents)
      ? Math.max(0, purchase.walletAppliedCents)
      : 0;
  const gatewayAmountCents =
    purchase && Number.isInteger(purchase.gatewayAmountCents)
      ? Math.max(0, purchase.gatewayAmountCents)
      : 0;
  const fundingSource =
    purchase?.fundingSource ?? order.fundingSource ?? null;
  const currency = (
    purchase?.currency ||
    order.displayCurrency ||
    "USD"
  )
    .trim()
    .toUpperCase() || "USD";

  try {
    const existingOpen = await prisma.refundRequest.findFirst({
      where: {
        orderId: order.id,
        customerUserId: customer.id,
        status: {
          in: [
            RefundRequestStatus.REQUESTED,
            RefundRequestStatus.UNDER_REVIEW,
            RefundRequestStatus.APPROVED_PENDING_EXECUTION,
            RefundRequestStatus.EXECUTION_FAILED,
          ],
        },
      },
      select: {
        id: true,
        status: true,
        refundAmountCents: true,
      },
    });
    if (existingOpen) {
      throw new RefundRequestError(
        "DUPLICATE_OPEN",
        "A refund request is already open for this order."
      );
    }
  } catch (error) {
    if (error instanceof RefundRequestError) throw error;
    throw new RefundRequestError(
      "UNAVAILABLE",
      "Refund requests are temporarily unavailable. Please try again shortly."
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const row = await tx.refundRequest.create({
        data: {
          orderId: order.id,
          customerUserId: customer.id,
          purchaseId: purchase?.id ?? null,
          reason: reason as RefundRequestReason,
          customerNote: noteRaw || null,
          status: RefundRequestStatus.REQUESTED,
          refundAmountCents,
          currency,
          walletAppliedCents,
          gatewayAmountCents,
          fundingSource: fundingSource as OrderFundingSource | null,
          openOrderKey: order.id,
          // Explicit timestamps — migration column has no SQL default.
          createdAt: now,
          updatedAt: now,
        },
        select: {
          id: true,
          status: true,
          refundAmountCents: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: customer.id,
          action: REFUND_AUDIT.CREATED,
          targetType: "RefundRequest",
          targetId: row.id,
          metadata: {
            orderId: order.id,
            reason,
            refundAmountCents,
            currency,
            walletAppliedCents,
            gatewayAmountCents,
            fundingSource,
          },
        },
      });

      return row;
    });

    // After commit only — email failure must not undo the request.
    scheduleRefundStatusNotification(created.id, "received");

    return {
      requestId: created.id,
      status: created.status,
      refundAmountCents: created.refundAmountCents,
      duplicate: false,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new RefundRequestError(
        "DUPLICATE_OPEN",
        "A refund request is already open for this order."
      );
    }
    throw new RefundRequestError(
      "UNAVAILABLE",
      "Refund requests are temporarily unavailable. Please try again shortly."
    );
  }
}

export async function listCustomerRefundRequestsForOrder(options: {
  customerUserId: string;
  orderId: string;
}): Promise<
  Array<{
    id: string;
    status: RefundRequestStatus;
    reason: RefundRequestReason;
    refundAmountCents: number;
    createdAt: Date;
    decidedAt: Date | null;
    adminDecisionNote: string | null;
  }>
> {
  const customerUserId = options.customerUserId.trim();
  const orderId = options.orderId.trim();
  if (!customerUserId || !orderId) return [];

  return prisma.refundRequest.findMany({
    where: { customerUserId, orderId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
    select: {
      id: true,
      status: true,
      reason: true,
      refundAmountCents: true,
      createdAt: true,
      decidedAt: true,
      adminDecisionNote: true,
    },
  });
}

export type AdminRefundDecisionAction =
  | "mark_under_review"
  | "approve"
  | "reject";

/**
 * Admin review transitions only. Never credits wallet, calls gateway, or
 * marks COMPLETED.
 */
export async function applyAdminRefundRequestDecision(options: {
  adminUserId: string;
  requestId: string;
  action: AdminRefundDecisionAction;
  decisionNote?: unknown;
}): Promise<{
  requestId: string;
  status: RefundRequestStatus;
}> {
  const adminUserId = options.adminUserId.trim();
  const requestId = options.requestId.trim();
  const note = String(options.decisionNote ?? "").trim();

  if (!adminUserId || adminUserId.length > 64) {
    throw new RefundRequestError("UNAVAILABLE", "Admin session is unavailable.");
  }
  if (!requestId || requestId.length > 64) {
    throw new RefundRequestError(
      "REQUEST_UNAVAILABLE",
      "This refund request is unavailable."
    );
  }

  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) {
    throw new RefundRequestError("UNAVAILABLE", "Admin session is unavailable.");
  }

  if (options.action === "reject") {
    if (!note || note.length < 3) {
      throw new RefundRequestError(
        "INVALID_NOTE",
        "Add a short decision note before rejecting."
      );
    }
  }
  if (note.length > REFUND_ADMIN_DECISION_NOTE_MAX) {
    throw new RefundRequestError(
      "INVALID_NOTE",
      `Keep the decision note under ${REFUND_ADMIN_DECISION_NOTE_MAX} characters.`
    );
  }

  const current = await prisma.refundRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      orderId: true,
      refundAmountCents: true,
      openOrderKey: true,
    },
  });
  if (!current) {
    throw new RefundRequestError(
      "REQUEST_UNAVAILABLE",
      "This refund request is unavailable."
    );
  }

  if (options.action === "mark_under_review") {
    if (
      current.status !== RefundRequestStatus.REQUESTED &&
      current.status !== RefundRequestStatus.UNDER_REVIEW
    ) {
      throw new RefundRequestError(
        "INVALID_TRANSITION",
        "Only requested refunds can move to under review."
      );
    }
    const fromStatus = current.status;
    const updated = await prisma.refundRequest.updateMany({
      where: {
        id: current.id,
        status: {
          in: [RefundRequestStatus.REQUESTED, RefundRequestStatus.UNDER_REVIEW],
        },
      },
      data: {
        status: RefundRequestStatus.UNDER_REVIEW,
        reviewedByAdminId: admin.id,
        reviewedAt: new Date(),
        openOrderKey: current.orderId,
      },
    });
    if (updated.count !== 1) {
      throw new RefundRequestError(
        "INVALID_TRANSITION",
        "This refund request could not be updated."
      );
    }
    await writeAuditLog({
      actorUserId: admin.id,
      action: REFUND_AUDIT.UNDER_REVIEW,
      targetType: "RefundRequest",
      targetId: current.id,
      metadata: {
        orderId: current.orderId,
        fromStatus,
        toStatus: RefundRequestStatus.UNDER_REVIEW,
        refundAmountCents: current.refundAmountCents,
      },
    });
    // Email only on authoritative REQUESTED → UNDER_REVIEW (not idempotent re-mark).
    if (fromStatus === RefundRequestStatus.REQUESTED) {
      scheduleRefundStatusNotification(current.id, "under_review");
    }
    return {
      requestId: current.id,
      status: RefundRequestStatus.UNDER_REVIEW,
    };
  }

  if (options.action === "approve") {
    if (
      current.status !== RefundRequestStatus.REQUESTED &&
      current.status !== RefundRequestStatus.UNDER_REVIEW
    ) {
      throw new RefundRequestError(
        "INVALID_TRANSITION",
        "Only open refund requests can be approved for later execution."
      );
    }
    const updated = await prisma.refundRequest.updateMany({
      where: {
        id: current.id,
        status: {
          in: [RefundRequestStatus.REQUESTED, RefundRequestStatus.UNDER_REVIEW],
        },
      },
      data: {
        status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
        decidedByAdminId: admin.id,
        decidedAt: new Date(),
        reviewedByAdminId: admin.id,
        reviewedAt: new Date(),
        adminDecisionNote: note || null,
        openOrderKey: current.orderId,
      },
    });
    if (updated.count !== 1) {
      throw new RefundRequestError(
        "INVALID_TRANSITION",
        "This refund request could not be approved."
      );
    }
    await writeAuditLog({
      actorUserId: admin.id,
      action: REFUND_AUDIT.APPROVED_PENDING,
      targetType: "RefundRequest",
      targetId: current.id,
      metadata: {
        orderId: current.orderId,
        fromStatus: current.status,
        toStatus: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
        refundAmountCents: current.refundAmountCents,
        moneyMoved: false,
        gatewayRefundCalled: false,
        providerRefundCalled: false,
      },
    });
    // After successful approve CAS — email failure must not undo status.
    scheduleRefundStatusNotification(current.id, "approved_pending_execution");
    return {
      requestId: current.id,
      status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
    };
  }

  // reject
  if (
    current.status !== RefundRequestStatus.REQUESTED &&
    current.status !== RefundRequestStatus.UNDER_REVIEW &&
    current.status !== RefundRequestStatus.APPROVED_PENDING_EXECUTION &&
    current.status !== RefundRequestStatus.EXECUTION_FAILED
  ) {
    throw new RefundRequestError(
      "INVALID_TRANSITION",
      "This refund request can no longer be rejected."
    );
  }
  const updated = await prisma.refundRequest.updateMany({
    where: {
      id: current.id,
      status: {
        in: [
          RefundRequestStatus.REQUESTED,
          RefundRequestStatus.UNDER_REVIEW,
          RefundRequestStatus.APPROVED_PENDING_EXECUTION,
          RefundRequestStatus.EXECUTION_FAILED,
        ],
      },
    },
    data: {
      status: RefundRequestStatus.REJECTED,
      decidedByAdminId: admin.id,
      decidedAt: new Date(),
      adminDecisionNote: note,
      openOrderKey: null,
    },
  });
  if (updated.count !== 1) {
    throw new RefundRequestError(
      "INVALID_TRANSITION",
      "This refund request could not be rejected."
    );
  }
  await writeAuditLog({
    actorUserId: admin.id,
    action: REFUND_AUDIT.REJECTED,
    targetType: "RefundRequest",
    targetId: current.id,
    metadata: {
      orderId: current.orderId,
      fromStatus: current.status,
      toStatus: RefundRequestStatus.REJECTED,
      refundAmountCents: current.refundAmountCents,
      hasDecisionNote: true,
      moneyMoved: false,
    },
  });
  // After successful reject CAS — email failure must not undo status.
  scheduleRefundStatusNotification(current.id, "rejected");
  return { requestId: current.id, status: RefundRequestStatus.REJECTED };
}

export function assertReasonCode(
  reason: RefundRequestReasonCode
): RefundRequestReason {
  return reason as RefundRequestReason;
}

export { isOpenRefundStatus };
