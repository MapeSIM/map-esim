/**
 * Partner Public API order cancel / refund request.
 * Never credits Partner wallet automatically. Creates an OrderSupportTicket
 * (Refund request / PENDING) for Admin review in /admin/support-tickets.
 * Wallet credit happens only when an Admin Approves that ticket.
 */
import "server-only";

import {
  OrderFundingSource,
  OrderSupportTicketStatus,
  PartnerEsimPurchaseStatus,
} from "@prisma/client";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import { getPartnerOwnedOrderUsage } from "@/app/lib/partner/partnerOrderInstall";
import {
  createPartnerOrderSupportTicket,
  OrderSupportTicketError,
} from "@/app/lib/support/orderSupportTicket";
import { orderSupportStatusLabel } from "@/app/lib/support/orderSupportTicketConstants";
import {
  classifyProviderLifecycleStatus,
} from "@/app/lib/orders/providerLifecycleShared";
import {
  normalizePartnerApiCancelReason,
  type PartnerApiActor,
  type PartnerApiCancelReasonCode,
} from "@/app/lib/partnerApiAuth";

export const PARTNER_API_CANCEL_AUDIT =
  "partner_api.order_refund_request_submitted" as const;

/** Public API status string for open refund-request tickets. */
export const PARTNER_API_REFUND_PENDING_STATUS = "PENDING" as const;

export type PartnerApiCancelResult =
  | {
      ok: true;
      orderId: string;
      purchaseId: string;
      ticketId: string;
      /** Always PENDING while awaiting Admin Approve / Reject. */
      status: typeof PARTNER_API_REFUND_PENDING_STATUS;
      statusLabel: string;
      subject: "Refund request";
      message: string;
      reason: PartnerApiCancelReasonCode;
      idempotent: boolean;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID" | "NOT_ELIGIBLE" | "UNAVAILABLE";
      error: string;
    };

function notesOk(raw: unknown): string | null {
  if (raw == null || raw === "") return "";
  if (typeof raw !== "string") return null;
  const notes = raw.replace(/[\r\n\u0000-\u001f]/g, " ").trim();
  if (notes.length > 500) return null;
  return notes;
}

function isUnusedEligible(usage: {
  isActivated: boolean | null;
  isExpired: boolean | null;
  usedDataGB: number | null;
  remainingDataGB: number | null;
  initialDataGB: number | null;
  status?: string | null;
  statusLabel?: string | null;
  isUnlimited?: boolean;
}): boolean {
  const lifecycle = classifyProviderLifecycleStatus({
    status: usage.status,
    statusLabel: usage.statusLabel,
    isActivated: usage.isActivated,
    isExpired: usage.isExpired,
    remainingDataGB: usage.remainingDataGB,
    isUnlimited: usage.isUnlimited,
  });
  if (
    lifecycle === "ACTIVE" ||
    lifecycle === "DEPLETED" ||
    lifecycle === "EXPIRED" ||
    lifecycle === "CANCELLED"
  ) {
    return false;
  }
  if (usage.isActivated === true) return false;
  if (usage.isExpired === true) return false;
  if (
    typeof usage.usedDataGB === "number" &&
    Number.isFinite(usage.usedDataGB) &&
    usage.usedDataGB > 0.01
  ) {
    return false;
  }
  return lifecycle === "NOT_ACTIVE" || lifecycle === "UNKNOWN";
}

function buildTicketDetails(input: {
  reason: PartnerApiCancelReasonCode;
  notes: string;
}): string {
  const lines = [
    `Partner API refund/cancel request.`,
    `Reason: ${input.reason}`,
  ];
  if (input.notes) {
    lines.push(`Notes: ${input.notes}`);
  }
  lines.push(
    "Submitted via POST /api/v1/partner/orders/{id}/cancel. No wallet credit until Admin Approve."
  );
  return lines.join("\n");
}

/**
 * Submit a Partner API cancel/refund request for Admin review.
 * Never calls refundPartnerPurchaseFundsInTx / never marks purchase refunded.
 */
export async function cancelPartnerApiOrder(options: {
  actor: PartnerApiActor;
  orderId: string;
  reason: unknown;
  notes?: unknown;
}): Promise<PartnerApiCancelResult> {
  const orderId = String(options.orderId ?? "").trim();
  if (!orderId || orderId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(orderId)) {
    return { ok: false, code: "NOT_FOUND", error: "Order not found." };
  }

  const reason = normalizePartnerApiCancelReason(options.reason);
  if (!reason) {
    return {
      ok: false,
      code: "INVALID",
      error: "Invalid cancel reason. Use a CANCEL_REASON_CODES value.",
    };
  }
  const notes = notesOk(options.notes);
  if (notes == null) {
    return {
      ok: false,
      code: "INVALID",
      error: "notes must be a string of at most 500 characters.",
    };
  }

  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: {
      partnerId: options.actor.partnerId,
      orderId,
    },
    select: {
      id: true,
      partnerId: true,
      orderId: true,
      status: true,
      fundingSource: true,
      partnerChargeCents: true,
      debitTransactionId: true,
      refundTransactionId: true,
      debitTransaction: { select: { amountCents: true } },
    },
  });

  if (!purchase) {
    return { ok: false, code: "NOT_FOUND", error: "Order not found." };
  }

  if (
    purchase.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED ||
    (purchase.refundTransactionId ?? "").trim()
  ) {
    return {
      ok: false,
      code: "NOT_ELIGIBLE",
      error: "This order has already been refunded.",
    };
  }

  if (purchase.status !== PartnerEsimPurchaseStatus.COMPLETED) {
    return {
      ok: false,
      code: "NOT_ELIGIBLE",
      error: "Only completed Partner orders can request a refund via API.",
    };
  }
  if (purchase.fundingSource !== OrderFundingSource.PARTNER_BALANCE) {
    return {
      ok: false,
      code: "NOT_ELIGIBLE",
      error:
        "Only Partner-balance funded orders can request a refund via API.",
    };
  }
  if (
    !Number.isInteger(purchase.partnerChargeCents) ||
    purchase.partnerChargeCents <= 0 ||
    !(purchase.debitTransactionId ?? "").trim() ||
    purchase.debitTransaction?.amountCents !== purchase.partnerChargeCents
  ) {
    return {
      ok: false,
      code: "NOT_ELIGIBLE",
      error: "A refundable Partner debit is not available for this order.",
    };
  }

  const usageRes = await getPartnerOwnedOrderUsage(
    options.actor.userId,
    orderId
  );
  if (!usageRes.ok) {
    if (usageRes.code === "NOT_FOUND") {
      return { ok: false, code: "NOT_FOUND", error: "Order not found." };
    }
    if (
      usageRes.code !== "NO_ICCID" &&
      usageRes.code !== "USAGE_UNAVAILABLE"
    ) {
      return {
        ok: false,
        code: "UNAVAILABLE",
        error:
          "Unable to verify eSIM usage for cancellation. Try again shortly.",
      };
    }
  } else if (!isUnusedEligible(usageRes.usage)) {
    return {
      ok: false,
      code: "NOT_ELIGIBLE",
      error:
        "This eSIM has been activated or used and cannot be cancelled via API.",
    };
  }

  // Existing open ticket → idempotent PENDING response (no second ticket).
  const existingOpen = await prisma.orderSupportTicket.findFirst({
    where: {
      orderId,
      partnerId: options.actor.partnerId,
      status: {
        in: [
          OrderSupportTicketStatus.OPEN,
          OrderSupportTicketStatus.PENDING_REVIEW,
          OrderSupportTicketStatus.IN_REVIEW,
          OrderSupportTicketStatus.INFO_REQUIRED,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, subject: true },
  });
  if (existingOpen) {
    await writeAuditLog({
      actorUserId: options.actor.userId,
      action: PARTNER_API_CANCEL_AUDIT,
      targetType: "OrderSupportTicket",
      targetId: existingOpen.id,
      metadata: {
        orderId,
        purchaseId: purchase.id,
        reason,
        notes: notes || null,
        idempotent: true,
        apiKeyId: options.actor.apiKeyId,
      },
    }).catch(() => null);

    return {
      ok: true,
      orderId,
      purchaseId: purchase.id,
      ticketId: existingOpen.id,
      status: PARTNER_API_REFUND_PENDING_STATUS,
      statusLabel: orderSupportStatusLabel(existingOpen.status),
      subject: "Refund request",
      message:
        "A refund request for this order is already pending admin review. No wallet credit has been applied.",
      reason,
      idempotent: true,
    };
  }

  try {
    const created = await createPartnerOrderSupportTicket({
      partnerUserId: options.actor.userId,
      orderId,
      subject: "REFUND_REQUEST",
      details: buildTicketDetails({ reason, notes }),
    });

    await writeAuditLog({
      actorUserId: options.actor.userId,
      action: PARTNER_API_CANCEL_AUDIT,
      targetType: "OrderSupportTicket",
      targetId: created.ticketId,
      metadata: {
        orderId,
        purchaseId: purchase.id,
        reason,
        notes: notes || null,
        idempotent: created.duplicate,
        apiKeyId: options.actor.apiKeyId,
      },
    }).catch(() => null);

    return {
      ok: true,
      orderId,
      purchaseId: purchase.id,
      ticketId: created.ticketId,
      status: PARTNER_API_REFUND_PENDING_STATUS,
      statusLabel: created.summary.statusLabel,
      subject: "Refund request",
      message:
        "Refund request submitted for admin review. Wallet credit occurs only after an admin approves the ticket in Support tickets.",
      reason,
      idempotent: created.duplicate,
    };
  } catch (error) {
    if (error instanceof OrderSupportTicketError) {
      if (error.code === "ALREADY_OPEN" || error.code === "ORDER_UNAVAILABLE") {
        return { ok: false, code: "NOT_ELIGIBLE", error: error.message };
      }
      if (error.code === "FORBIDDEN") {
        return { ok: false, code: "NOT_FOUND", error: "Order not found." };
      }
      return { ok: false, code: "INVALID", error: error.message };
    }
    return {
      ok: false,
      code: "UNAVAILABLE",
      error:
        "Refund request is temporarily unavailable. Please try again shortly.",
    };
  }
}
