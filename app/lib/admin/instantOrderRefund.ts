/**
 * Admin Instant Order Refund — create/approve/execute refund in one admin action.
 * Reuses existing MAP Wallet / Partner wallet credit paths (never gateway requestRefund).
 * Idempotent: completed refunds short-circuit; open requests are reused.
 */
import "server-only";

import {
  OrderFundingSource,
  OrderStatus,
  PartnerEsimPurchaseStatus,
  PartnerRefundRequestReason,
  Prisma,
  RefundRequestReason,
  RefundRequestStatus,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import {
  REFUND_PARTNER_FUNDS_PHRASE,
} from "@/app/lib/admin/reconciliationCaseShared";
import {
  resolveInstantRefundPaymentMethodLabel,
  INSTANT_REFUND_REASON_MAX,
  type InstantOrderRefundButtonProps,
  type InstantRefundPaymentMethod,
} from "@/app/lib/admin/instantOrderRefundShared";
import { resolveAdminOrderPaymentMethodDisplay } from "@/app/lib/admin/orderPaymentMethodShared";
import {
  PARTNER_REFUND_AUDIT,
} from "@/app/lib/partner/partnerRefundRequestConstants";
import {
  executeAdminPartnerRefundRequest,
  PartnerRefundRequestExecutionError,
} from "@/app/lib/partner/partnerRefundRequestExecution";
import {
  REFUND_AUDIT,
  REFUND_CUSTOMER_WALLET_PHRASE,
} from "@/app/lib/refunds/refundRequestConstants";
import {
  CustomerRefundRequestExecutionError,
  executeAdminCustomerRefundRequest,
} from "@/app/lib/refunds/refundRequestExecution";
import { formatUsdCents } from "@/app/lib/wallet/display";

export const INSTANT_ORDER_REFUND_AUDIT = "admin.order_instant_refund" as const;

export class InstantOrderRefundError extends Error {
  readonly code:
    | "UNAVAILABLE"
    | "NOT_ELIGIBLE"
    | "ALREADY_REFUNDED"
    | "ORDER_UNAVAILABLE"
    | "INVALID_REASON"
    | "EXECUTION_FAILED";

  constructor(code: InstantOrderRefundError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "InstantOrderRefundError";
  }
}

export type ExecuteAdminInstantOrderRefundInput = {
  adminUserId: string;
  orderId: string;
  /** Optional admin reason (never an amount). */
  reason?: unknown;
  /** When set, prefer Partner purchase path for this id. */
  partnerPurchaseId?: unknown;
};

export type ExecuteAdminInstantOrderRefundResult = {
  orderId: string;
  requestId: string;
  path: "CUSTOMER_WALLET" | "PARTNER_WALLET";
  amountCents: number;
  amountLabel: string;
  idempotent: boolean;
  status: string;
};

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

function sanitizeReason(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\r\n\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, INSTANT_REFUND_REASON_MAX);
}

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
    throw new InstantOrderRefundError(
      "UNAVAILABLE",
      "Admin session is unavailable."
    );
  }
  return admin;
}

const OPEN_CUSTOMER_STATUSES: RefundRequestStatus[] = [
  RefundRequestStatus.REQUESTED,
  RefundRequestStatus.UNDER_REVIEW,
  RefundRequestStatus.APPROVED_PENDING_EXECUTION,
  RefundRequestStatus.EXECUTION_FAILED,
];

const OPEN_PARTNER_STATUSES: RefundRequestStatus[] = [
  RefundRequestStatus.REQUESTED,
  RefundRequestStatus.UNDER_REVIEW,
  RefundRequestStatus.APPROVED_PENDING_EXECUTION,
  RefundRequestStatus.EXECUTION_FAILED,
];

async function ensureExecutableCustomerRefundRequest(options: {
  adminId: string;
  orderId: string;
  customerUserId: string;
  purchaseId: string | null;
  refundAmountCents: number;
  currency: string;
  walletAppliedCents: number;
  gatewayAmountCents: number;
  fundingSource: OrderFundingSource | null;
  adminNote: string;
}): Promise<{ requestId: string; created: boolean }> {
  const existingOpen = await prisma.refundRequest.findFirst({
    where: {
      orderId: options.orderId,
      status: { in: OPEN_CUSTOMER_STATUSES },
    },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  if (existingOpen) {
    if (
      existingOpen.status === RefundRequestStatus.APPROVED_PENDING_EXECUTION ||
      existingOpen.status === RefundRequestStatus.EXECUTION_FAILED
    ) {
      return { requestId: existingOpen.id, created: false };
    }
    // Promote REQUESTED / UNDER_REVIEW → APPROVED_PENDING_EXECUTION
    const updated = await prisma.refundRequest.updateMany({
      where: {
        id: existingOpen.id,
        status: {
          in: [
            RefundRequestStatus.REQUESTED,
            RefundRequestStatus.UNDER_REVIEW,
          ],
        },
      },
      data: {
        status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
        decidedByAdminId: options.adminId,
        decidedAt: new Date(),
        reviewedByAdminId: options.adminId,
        reviewedAt: new Date(),
        adminDecisionNote:
          options.adminNote || "Instant admin refund (auto-approved).",
        openOrderKey: options.orderId,
      },
    });
    if (updated.count === 1) {
      await writeAuditLog({
        actorUserId: options.adminId,
        action: REFUND_AUDIT.APPROVED_PENDING,
        targetType: "RefundRequest",
        targetId: existingOpen.id,
        metadata: {
          orderId: options.orderId,
          instant: true,
          fromStatus: existingOpen.status,
        },
      });
    }
    return { requestId: existingOpen.id, created: false };
  }

  const completed = await prisma.refundRequest.findFirst({
    where: {
      orderId: options.orderId,
      status: RefundRequestStatus.COMPLETED,
    },
    select: { id: true },
  });
  if (completed) {
    throw new InstantOrderRefundError(
      "ALREADY_REFUNDED",
      "This order already has a completed refund."
    );
  }

  const now = new Date();
  try {
    const row = await prisma.refundRequest.create({
      data: {
        orderId: options.orderId,
        customerUserId: options.customerUserId,
        purchaseId: options.purchaseId,
        reason: RefundRequestReason.OTHER,
        customerNote: null,
        status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
        refundAmountCents: options.refundAmountCents,
        currency: options.currency,
        walletAppliedCents: options.walletAppliedCents,
        gatewayAmountCents: options.gatewayAmountCents,
        fundingSource: options.fundingSource,
        openOrderKey: options.orderId,
        adminDecisionNote:
          options.adminNote || "Instant admin refund (auto-approved).",
        decidedByAdminId: options.adminId,
        decidedAt: now,
        reviewedByAdminId: options.adminId,
        reviewedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
    await writeAuditLog({
      actorUserId: options.adminId,
      action: REFUND_AUDIT.CREATED,
      targetType: "RefundRequest",
      targetId: row.id,
      metadata: {
        orderId: options.orderId,
        instant: true,
        refundAmountCents: options.refundAmountCents,
        currency: options.currency,
      },
    });
    await writeAuditLog({
      actorUserId: options.adminId,
      action: REFUND_AUDIT.APPROVED_PENDING,
      targetType: "RefundRequest",
      targetId: row.id,
      metadata: { orderId: options.orderId, instant: true },
    });
    return { requestId: row.id, created: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.refundRequest.findFirst({
        where: {
          orderId: options.orderId,
          status: { in: OPEN_CUSTOMER_STATUSES },
        },
        select: { id: true },
      });
      if (raced) return { requestId: raced.id, created: false };
      const done = await prisma.refundRequest.findFirst({
        where: {
          orderId: options.orderId,
          status: RefundRequestStatus.COMPLETED,
        },
        select: { id: true },
      });
      if (done) {
        throw new InstantOrderRefundError(
          "ALREADY_REFUNDED",
          "This order already has a completed refund."
        );
      }
    }
    throw new InstantOrderRefundError(
      "UNAVAILABLE",
      "Instant refund is temporarily unavailable. Please try again shortly."
    );
  }
}

async function ensureExecutablePartnerRefundRequest(options: {
  adminId: string;
  partnerId: string;
  purchaseId: string;
  orderId: string | null;
  partnerChargeCents: number;
  retailPriceCents: number;
  currency: string;
  adminNote: string;
}): Promise<{ requestId: string; created: boolean }> {
  const existingOpen = await prisma.partnerRefundRequest.findFirst({
    where: {
      partnerEsimPurchaseId: options.purchaseId,
      status: { in: OPEN_PARTNER_STATUSES },
    },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  if (existingOpen) {
    if (
      existingOpen.status === RefundRequestStatus.APPROVED_PENDING_EXECUTION ||
      existingOpen.status === RefundRequestStatus.EXECUTION_FAILED
    ) {
      return { requestId: existingOpen.id, created: false };
    }
    const updated = await prisma.partnerRefundRequest.updateMany({
      where: {
        id: existingOpen.id,
        status: {
          in: [
            RefundRequestStatus.REQUESTED,
            RefundRequestStatus.UNDER_REVIEW,
          ],
        },
      },
      data: {
        status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
        adminDecisionNote:
          options.adminNote || "Instant admin refund (auto-approved).",
        reviewedAt: new Date(),
        openPurchaseKey: options.purchaseId,
      },
    });
    if (updated.count === 1) {
      await writeAuditLog({
        actorUserId: options.adminId,
        action: PARTNER_REFUND_AUDIT.APPROVED_PENDING,
        targetType: "PartnerRefundRequest",
        targetId: existingOpen.id,
        metadata: {
          purchaseId: options.purchaseId,
          orderId: options.orderId,
          instant: true,
          fromStatus: existingOpen.status,
        },
      });
    }
    return { requestId: existingOpen.id, created: false };
  }

  const completed = await prisma.partnerRefundRequest.findFirst({
    where: {
      partnerEsimPurchaseId: options.purchaseId,
      status: RefundRequestStatus.COMPLETED,
    },
    select: { id: true },
  });
  if (completed) {
    throw new InstantOrderRefundError(
      "ALREADY_REFUNDED",
      "This purchase already has a completed refund."
    );
  }

  const now = new Date();
  try {
    const row = await prisma.partnerRefundRequest.create({
      data: {
        partnerId: options.partnerId,
        partnerEsimPurchaseId: options.purchaseId,
        orderId: options.orderId,
        reason: PartnerRefundRequestReason.OTHER,
        partnerNote: null,
        status: RefundRequestStatus.APPROVED_PENDING_EXECUTION,
        partnerChargeCents: options.partnerChargeCents,
        retailPriceCents: options.retailPriceCents,
        currency: options.currency,
        openPurchaseKey: options.purchaseId,
        adminDecisionNote:
          options.adminNote || "Instant admin refund (auto-approved).",
        reviewedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
    await writeAuditLog({
      actorUserId: options.adminId,
      action: PARTNER_REFUND_AUDIT.CREATED,
      targetType: "PartnerRefundRequest",
      targetId: row.id,
      metadata: {
        partnerId: options.partnerId,
        purchaseId: options.purchaseId,
        orderId: options.orderId,
        instant: true,
        partnerChargeCents: options.partnerChargeCents,
      },
    });
    await writeAuditLog({
      actorUserId: options.adminId,
      action: PARTNER_REFUND_AUDIT.APPROVED_PENDING,
      targetType: "PartnerRefundRequest",
      targetId: row.id,
      metadata: {
        purchaseId: options.purchaseId,
        orderId: options.orderId,
        instant: true,
      },
    });
    return { requestId: row.id, created: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.partnerRefundRequest.findFirst({
        where: {
          partnerEsimPurchaseId: options.purchaseId,
          status: { in: OPEN_PARTNER_STATUSES },
        },
        select: { id: true },
      });
      if (raced) return { requestId: raced.id, created: false };
      const done = await prisma.partnerRefundRequest.findFirst({
        where: {
          partnerEsimPurchaseId: options.purchaseId,
          status: RefundRequestStatus.COMPLETED,
        },
        select: { id: true },
      });
      if (done) {
        throw new InstantOrderRefundError(
          "ALREADY_REFUNDED",
          "This purchase already has a completed refund."
        );
      }
    }
    throw new InstantOrderRefundError(
      "UNAVAILABLE",
      "Instant refund is temporarily unavailable. Please try again shortly."
    );
  }
}

/**
 * Execute an instant admin refund for an order (customer MAP Wallet or Partner wallet).
 * Double-click safe via refund-request openOrderKey uniqueness + execution idempotency keys.
 */
export async function executeAdminInstantOrderRefund(
  input: ExecuteAdminInstantOrderRefundInput
): Promise<ExecuteAdminInstantOrderRefundResult> {
  const admin = await requireAdminUser(input.adminUserId);
  const orderId = String(input.orderId ?? "").trim();
  const partnerPurchaseIdHint = String(input.partnerPurchaseId ?? "").trim();
  const adminNote = sanitizeReason(input.reason);

  if (!orderId || orderId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(orderId)) {
    throw new InstantOrderRefundError(
      "ORDER_UNAVAILABLE",
      "This order is unavailable for an instant refund."
    );
  }
  if (adminNote.length > INSTANT_REFUND_REASON_MAX) {
    throw new InstantOrderRefundError(
      "INVALID_REASON",
      `Keep the refund reason under ${INSTANT_REFUND_REASON_MAX} characters.`
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      userId: true,
      fundingSource: true,
      displayAmount: true,
      displayCurrency: true,
      paymentMethod: true,
      senderName: true,
      paymentProofUrl: true,
      providerOrderId: true,
      user: { select: { id: true, email: true, name: true, role: true } },
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
      partnerEsimPurchase: {
        select: {
          id: true,
          partnerId: true,
          orderId: true,
          status: true,
          fundingSource: true,
          partnerChargeCents: true,
          retailPriceCents: true,
          currency: true,
          debitTransactionId: true,
          refundTransactionId: true,
          partner: {
            select: {
              id: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
      adminPackageAssignment: { select: { id: true } },
      whatsAppCheckoutOrder: {
        select: {
          id: true,
          paymentMethod: true,
          senderName: true,
          paymentProofUrl: true,
        },
      },
      refundRequests: {
        where: { status: RefundRequestStatus.COMPLETED },
        select: { id: true, executedRefundTransactionId: true, refundAmountCents: true },
        take: 1,
      },
      partnerRefundRequests: {
        where: { status: RefundRequestStatus.COMPLETED },
        select: {
          id: true,
          executedRefundTransactionId: true,
          partnerChargeCents: true,
        },
        take: 1,
      },
    },
  });

  if (!order) {
    throw new InstantOrderRefundError(
      "ORDER_UNAVAILABLE",
      "This order is unavailable for an instant refund."
    );
  }

  const partnerPurchase =
    partnerPurchaseIdHint &&
    order.partnerEsimPurchase?.id === partnerPurchaseIdHint
      ? order.partnerEsimPurchase
      : order.partnerEsimPurchase;

  // Already refunded (idempotent short-circuit for completed requests / purchase flags)
  if (
    order.refundRequests.length > 0 ||
    order.partnerRefundRequests.length > 0 ||
    order.walletEsimPurchase?.status ===
      WalletEsimPurchaseStatus.FAILED_REFUNDED ||
    (order.walletEsimPurchase?.refundTransactionId ?? "").trim() ||
    partnerPurchase?.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED ||
    (partnerPurchase?.refundTransactionId ?? "").trim()
  ) {
    const completedCustomer = order.refundRequests[0];
    const completedPartner = order.partnerRefundRequests[0];
    const amountCents =
      completedCustomer?.refundAmountCents ??
      completedPartner?.partnerChargeCents ??
      0;
    return {
      orderId: order.id,
      requestId: completedCustomer?.id ?? completedPartner?.id ?? "already",
      path: completedPartner ? "PARTNER_WALLET" : "CUSTOMER_WALLET",
      amountCents,
      amountLabel: formatUsdCents(amountCents),
      idempotent: true,
      status: RefundRequestStatus.COMPLETED,
    };
  }

  // Partner balance-funded path
  if (
    partnerPurchase &&
    partnerPurchase.fundingSource === OrderFundingSource.PARTNER_BALANCE
  ) {
    if (
      !Number.isInteger(partnerPurchase.partnerChargeCents) ||
      partnerPurchase.partnerChargeCents <= 0 ||
      !(partnerPurchase.debitTransactionId ?? "").trim()
    ) {
      throw new InstantOrderRefundError(
        "NOT_ELIGIBLE",
        "A refundable Partner debit is not available for this purchase."
      );
    }
    if (
      partnerPurchase.status !== PartnerEsimPurchaseStatus.COMPLETED &&
      partnerPurchase.status !==
        PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED
    ) {
      throw new InstantOrderRefundError(
        "NOT_ELIGIBLE",
        "Only completed Partner purchases can be refunded instantly."
      );
    }

    const ensured = await ensureExecutablePartnerRefundRequest({
      adminId: admin.id,
      partnerId: partnerPurchase.partnerId,
      purchaseId: partnerPurchase.id,
      orderId: partnerPurchase.orderId ?? order.id,
      partnerChargeCents: partnerPurchase.partnerChargeCents,
      retailPriceCents: partnerPurchase.retailPriceCents,
      currency:
        (partnerPurchase.currency || "USD").trim().toUpperCase() || "USD",
      adminNote,
    });

    try {
      const result = await executeAdminPartnerRefundRequest({
        adminUserId: admin.id,
        requestId: ensured.requestId,
        confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
      });
      await writeAuditLog({
        actorUserId: admin.id,
        action: INSTANT_ORDER_REFUND_AUDIT,
        targetType: "Order",
        targetId: order.id,
        metadata: {
          path: "PARTNER_WALLET",
          requestId: result.requestId,
          purchaseId: partnerPurchase.id,
          amountCents: result.amountCents,
          idempotent: result.idempotent,
          reason: adminNote || null,
        },
      });
      return {
        orderId: order.id,
        requestId: result.requestId,
        path: "PARTNER_WALLET",
        amountCents: result.amountCents,
        amountLabel: formatUsdCents(result.amountCents),
        idempotent: result.idempotent,
        status: result.status,
      };
    } catch (error) {
      if (error instanceof PartnerRefundRequestExecutionError) {
        if (
          error.code === "ALREADY_REFUNDED" ||
          error.blocker === "ALREADY_REFUNDED"
        ) {
          throw new InstantOrderRefundError(
            "ALREADY_REFUNDED",
            "This purchase already has a completed refund."
          );
        }
        throw new InstantOrderRefundError(
          "EXECUTION_FAILED",
          error.message || "Partner refund execution failed."
        );
      }
      throw error;
    }
  }

  // Partner gateway / split without PARTNER_BALANCE — not supported by instant wallet credit
  if (partnerPurchase) {
    throw new InstantOrderRefundError(
      "NOT_ELIGIBLE",
      "This Partner purchase is not Partner-balance funded. Use reconciliation for gateway refunds."
    );
  }

  // Customer / retail MAP Wallet credit path
  const customerUserId = (order.userId ?? "").trim();
  if (!customerUserId || order.user?.role !== Role.CUSTOMER) {
    throw new InstantOrderRefundError(
      "NOT_ELIGIBLE",
      "Guest orders without a linked customer cannot receive a MAP Wallet refund."
    );
  }

  const purchase = order.walletEsimPurchase;
  if (
    order.status !== OrderStatus.COMPLETED &&
    purchase?.status !== WalletEsimPurchaseStatus.COMPLETED &&
    purchase?.status !== WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED
  ) {
    throw new InstantOrderRefundError(
      "NOT_ELIGIBLE",
      "Only paid/completed orders can be refunded instantly."
    );
  }

  const refundAmountCents =
    purchase && Number.isInteger(purchase.priceCents) && purchase.priceCents > 0
      ? purchase.priceCents
      : displayAmountToCents(order.displayAmount);
  if (refundAmountCents == null) {
    throw new InstantOrderRefundError(
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
    (purchase?.fundingSource as OrderFundingSource | null) ??
    (order.fundingSource as OrderFundingSource | null) ??
    null;
  const currency =
    (purchase?.currency || order.displayCurrency || "USD")
      .trim()
      .toUpperCase() || "USD";

  const ensured = await ensureExecutableCustomerRefundRequest({
    adminId: admin.id,
    orderId: order.id,
    customerUserId,
    purchaseId: purchase?.id ?? null,
    refundAmountCents,
    currency,
    walletAppliedCents,
    gatewayAmountCents,
    fundingSource,
    adminNote,
  });

  try {
    const result = await executeAdminCustomerRefundRequest({
      adminUserId: admin.id,
      requestId: ensured.requestId,
      confirmPhrase: REFUND_CUSTOMER_WALLET_PHRASE,
    });
    await writeAuditLog({
      actorUserId: admin.id,
      action: INSTANT_ORDER_REFUND_AUDIT,
      targetType: "Order",
      targetId: order.id,
      metadata: {
        path: "CUSTOMER_WALLET",
        requestId: result.requestId,
        amountCents: result.amountCents,
        idempotent: result.idempotent,
        reason: adminNote || null,
        paymentMethod: resolveInstantRefundPaymentMethodLabel({
          fundingSource,
          paymentMethodDisplay: resolveAdminOrderPaymentMethodDisplay({
            paymentMethod: order.paymentMethod,
            fundingSource,
            providerOrderId: order.providerOrderId,
            senderName: order.senderName,
            paymentProofUrl: order.paymentProofUrl,
            whatsappPaymentMethod: order.whatsAppCheckoutOrder?.paymentMethod,
            whatsappSenderName: order.whatsAppCheckoutOrder?.senderName,
            whatsappPaymentProofUrl: order.whatsAppCheckoutOrder?.paymentProofUrl,
            hasWhatsappCheckoutLink: Boolean(order.whatsAppCheckoutOrder),
            hasAdminPackageAssignment: Boolean(order.adminPackageAssignment),
          }),
        }),
      },
    });
    return {
      orderId: order.id,
      requestId: result.requestId,
      path: "CUSTOMER_WALLET",
      amountCents: result.amountCents,
      amountLabel: formatUsdCents(result.amountCents),
      idempotent: result.idempotent,
      status: result.status,
    };
  } catch (error) {
    if (error instanceof CustomerRefundRequestExecutionError) {
      if (
        error.code === "ALREADY_COMPLETED" ||
        error.blocker === "ALREADY_COMPLETED"
      ) {
        throw new InstantOrderRefundError(
          "ALREADY_REFUNDED",
          "This order already has a completed refund."
        );
      }
      throw new InstantOrderRefundError(
        "EXECUTION_FAILED",
        error.message || "Customer refund execution failed."
      );
    }
    throw error;
  }
}

/** Build list/detail button props from already-loaded order refund signals. */
export function buildInstantOrderRefundButtonProps(input: {
  orderId: string;
  amountLabel: string;
  partyLabel: string;
  fundingSource?: string | null;
  paymentMethodDisplay?: string | null;
  alreadyRefunded: boolean;
  refundEligible: boolean;
  ineligibleReason?: string | null;
  partnerPurchaseId?: string | null;
  compact?: boolean;
}): InstantOrderRefundButtonProps {
  return {
    orderId: input.orderId,
    partnerPurchaseId: input.partnerPurchaseId ?? null,
    amountLabel: input.amountLabel,
    paymentMethodLabel: resolveInstantRefundPaymentMethodLabel({
      fundingSource: input.fundingSource,
      paymentMethodDisplay: input.paymentMethodDisplay,
    }),
    partyLabel: input.partyLabel || "Not available",
    alreadyRefunded: input.alreadyRefunded,
    refundEligible: input.refundEligible && !input.alreadyRefunded,
    ineligibleReason: input.ineligibleReason ?? null,
    compact: input.compact,
  };
}

export function evaluateInstantRefundEligibility(input: {
  orderStatus: string | null | undefined;
  hasLinkedCustomer: boolean;
  hasCompletedRefund: boolean;
  walletPurchaseStatus?: string | null;
  partnerPurchaseStatus?: string | null;
  partnerFundingSource?: string | null;
  partnerDebitTransactionId?: string | null;
  partnerChargeCents?: number | null;
  refundAmountCents?: number | null;
}): {
  alreadyRefunded: boolean;
  refundEligible: boolean;
  ineligibleReason: string | null;
  path: "CUSTOMER_WALLET" | "PARTNER_WALLET" | null;
} {
  if (input.hasCompletedRefund) {
    return {
      alreadyRefunded: true,
      refundEligible: false,
      ineligibleReason: "Already refunded",
      path: null,
    };
  }
  if (
    input.walletPurchaseStatus === "FAILED_REFUNDED" ||
    input.partnerPurchaseStatus === "FAILED_REFUNDED"
  ) {
    return {
      alreadyRefunded: true,
      refundEligible: false,
      ineligibleReason: "Already refunded",
      path: null,
    };
  }

  const partnerFunding = String(input.partnerFundingSource ?? "")
    .trim()
    .toUpperCase();
  if (partnerFunding === "PARTNER_BALANCE") {
    const chargeOk =
      Number.isInteger(input.partnerChargeCents) &&
      (input.partnerChargeCents as number) > 0;
    const debitOk = Boolean(
      String(input.partnerDebitTransactionId ?? "").trim()
    );
    const statusOk =
      input.partnerPurchaseStatus === "COMPLETED" ||
      input.partnerPurchaseStatus === "RECONCILIATION_REQUIRED";
    if (chargeOk && debitOk && statusOk) {
      return {
        alreadyRefunded: false,
        refundEligible: true,
        ineligibleReason: null,
        path: "PARTNER_WALLET",
      };
    }
    return {
      alreadyRefunded: false,
      refundEligible: false,
      ineligibleReason: "Partner purchase is not refundable yet",
      path: null,
    };
  }
  if (partnerFunding === "PARTNER_SPLIT" || partnerFunding === "PARTNER_GATEWAY") {
    return {
      alreadyRefunded: false,
      refundEligible: false,
      ineligibleReason: "Use reconciliation for Partner gateway refunds",
      path: null,
    };
  }

  if (!input.hasLinkedCustomer) {
    return {
      alreadyRefunded: false,
      refundEligible: false,
      ineligibleReason: "Guest order — link a customer first",
      path: null,
    };
  }

  const paid =
    input.orderStatus === "COMPLETED" ||
    input.walletPurchaseStatus === "COMPLETED" ||
    input.walletPurchaseStatus === "RECONCILIATION_REQUIRED";
  if (!paid) {
    return {
      alreadyRefunded: false,
      refundEligible: false,
      ineligibleReason: "Order is unpaid or incomplete",
      path: null,
    };
  }

  if (
    input.refundAmountCents != null &&
    (!Number.isInteger(input.refundAmountCents) || input.refundAmountCents <= 0)
  ) {
    return {
      alreadyRefunded: false,
      refundEligible: false,
      ineligibleReason: "No refundable amount",
      path: null,
    };
  }

  return {
    alreadyRefunded: false,
    refundEligible: true,
    ineligibleReason: null,
    path: "CUSTOMER_WALLET",
  };
}

export type { InstantRefundPaymentMethod };
